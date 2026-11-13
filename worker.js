// Booking delivery: never acknowledge a request that was not accepted by Resend.
// Credentials stay in Worker secrets; logs contain only opaque IDs and status codes.
const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const log = (requestId, event, details = {}) => console.log(JSON.stringify({
  component: 'booking', request_id: requestId, event, ...details,
}));

// The timeout covers both the response headers and body, not just fetch().
async function fetchJson(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const result = await fetch(url, { ...options, signal: controller.signal, redirect: 'error' });
    let body;
    try { body = await result.json(); } catch { body = null; }
    return { ok: result.ok, status: result.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/ride-request') return env.ASSETS.fetch(request);
    const requestId = crypto.randomUUID();
    const fail = (status, code, error) => {
      log(requestId, 'rejected', { code, http_status: status });
      return response({ ok: false, error, code, request_id: requestId }, status);
    };
    if (request.method !== 'POST') return fail(405, 'METHOD', 'Method not allowed');
    if (!env.RESEND_API_KEY || !env.BOOKING_NOTIFICATION_FROM || !env.TURNSTILE_SECRET_KEY) {
      return fail(503, 'CONFIGURATION', 'Booking email is temporarily unavailable. Please call 617-251-7049.');
    }
    if (request.headers.get('Origin') !== url.origin) return fail(403, 'ORIGIN', 'Invalid origin');
    if ((request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
      return fail(415, 'CONTENT_TYPE', 'JSON required');
    }
    if (Number(request.headers.get('content-length') || 0) > 12000) return fail(413, 'SIZE', 'Request too large');
    let data;
    try {
      // Enforce the byte limit even when Content-Length is absent or inaccurate.
      const reader = request.body?.getReader();
      if (!reader) return fail(400, 'JSON', 'Invalid request');
      const chunks = [];
      let size = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 12000) { await reader.cancel(); return fail(413, 'SIZE', 'Request too large'); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch { return fail(400, 'JSON', 'Invalid request'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fail(400, 'JSON', 'Invalid request');
    // A honeypot rejection must never look like a successful booking to a human.
    if (data.website) return fail(400, 'FORM_CHECK', 'Form verification failed. Please reload the page or call 617-251-7049.');
    const required = ['passenger_name', 'passenger_phone', 'pickup_address', 'dropoff_address', 'ride_date', 'pickup_time'];
    if (required.some(key => typeof data[key] !== 'string' || !data[key].trim() || data[key].length > 350)) {
      return fail(400, 'FIELDS', 'Please complete required fields');
    }
    const optional = ['passenger_email', 'trip_type', 'wheelchair_passenger', 'notes'];
    if (optional.some(key => data[key] != null && (typeof data[key] !== 'string' || data[key].length > (key === 'notes' ? 5000 : 350)))) {
      return fail(400, 'FIELDS', 'Please shorten the optional fields');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.ride_date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.pickup_time)) {
      return fail(400, 'DATE_TIME', 'Invalid date/time');
    }
    if (typeof data.turnstile_token !== 'string' || !data.turnstile_token || data.turnstile_token.length > 2048) {
      return fail(400, 'VERIFICATION_REQUIRED', 'Security verification required');
    }
    const challenge = new FormData();
    challenge.set('secret', env.TURNSTILE_SECRET_KEY);
    challenge.set('response', data.turnstile_token);
    challenge.set('remoteip', request.headers.get('CF-Connecting-IP') || '');
    let check;
    try {
      check = await fetchJson('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: challenge });
    } catch { return fail(502, 'VERIFICATION_UNAVAILABLE', 'Security verification unavailable'); }
    if (!check.ok || check.body?.success !== true || check.body.hostname !== url.hostname) {
      return fail(403, 'VERIFICATION_FAILED', 'Security verification failed');
    }
    const rows = [
      ['Passenger', data.passenger_name], ['Phone', data.passenger_phone], ['Email', data.passenger_email],
      ['Pickup address', data.pickup_address], ['Drop-off address', data.dropoff_address],
      ['Date', data.ride_date], ['Time (Boston)', data.pickup_time], ['Trip type', data.trip_type],
      ['Wheelchair passenger', data.wheelchair_passenger], ['Notes / special instructions', data.notes],
      ['Request reference', requestId],
    ];
    const html = '<h2>New M Express booking request</h2><table>' + rows.map(([key, value]) =>
      "<tr><th align='left'>" + safe(key) + '</th><td>' + safe(value) + '</td></tr>'
    ).join('') + '</table>';
    const mail = JSON.stringify({ from: env.BOOKING_NOTIFICATION_FROM, to: ['mexpress.mass@gmail.com'],
      subject: 'New M Express ride request', html });
    // One bounded retry for transient/ambiguous failures. The same idempotency key
    // and byte-identical body prevent duplicate sends within this request (24h at Resend).
    for (let attempt = 1; attempt <= 2; attempt++) {
      let sent;
      try {
        sent = await fetchJson('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY,
            'Content-Type': 'application/json', 'Idempotency-Key': 'booking/' + requestId }, body: mail,
        });
      } catch {
        log(requestId, 'provider_unavailable', { attempt });
      }
      if (sent?.ok && typeof sent.body?.id === 'string' && uuid.test(sent.body.id)) {
        log(requestId, 'provider_accepted', { attempt, email_id: sent.body.id, http_status: sent.status });
        // Acceptance is not proof of inbox delivery. Confirm delivery in Resend/Gmail.
        return response({ ok: true, status: 'accepted', request_id: requestId }, 200);
      }
      if (sent) log(requestId, 'provider_rejected', { attempt, http_status: sent.status });
      const retryable = !sent || sent.status === 429 || sent.status >= 500 || sent.ok;
      if (!retryable || attempt === 2) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return fail(502, 'DELIVERY_UNCONFIRMED', 'Email delivery could not be confirmed. Please call 617-251-7049 before submitting again. Reference: ' + requestId);
  },
};
