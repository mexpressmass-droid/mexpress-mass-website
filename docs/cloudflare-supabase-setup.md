# Cloudflare Pages → Supabase setup

Supabase project URL: `https://mmdolkwclsctvwtxnqtc.supabase.co`

## Server-only Cloudflare variables
In Cloudflare dashboard → Workers & Pages → M Express Pages project → Settings → Variables and Secrets, add:
- `SUPABASE_URL`: `https://mmdolkwclsctvwtxnqtc.supabase.co` (plain text)
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase legacy service_role key (encrypted Secret), or adapt server endpoint to use the new secret API key before using `sb_secret_...`.

Never put privileged keys in GitHub, HTML, JS browser bundles, or chat.

## Deployment status
The API handler exists on feature/dispatch-foundation only. The public website form still uses FormSubmit and has NOT been switched to /api/ride-request.

## Before activating the endpoint
1. Configure Cloudflare Turnstile server-side verification and rate limiting for public intake.
2. Verify trip insert with a test request in preview deployment.
3. Add admin authentication and read-only dispatch view before production switch.
4. Switch the website form to the protected endpoint and keep user-facing success/error feedback.
5. Validate time zones, email notification requirements and duplicate submission handling.
6. Only then merge the feature branch to main.
