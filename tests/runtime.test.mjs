import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require(process.env.MINIFLARE_MODULE||'miniflare');
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,cf:false,scriptPath:new URL('../worker.js',import.meta.url).pathname,compatibilityDate:'2026-10-29',bindings:{RESEND_API_KEY:'TEST',BOOKING_NOTIFICATION_FROM:'test@example.invalid',TURNSTILE_SECRET_KEY:'TEST'}}));
test('actual Workers runtime rejects honeypot without upstream access',async()=>{const r=await mf.dispatchFetch('https://mexpress-mass.com/api/ride-request',{method:'POST',headers:{Origin:'https://mexpress-mass.com','Content-Type':'application/json'},body:JSON.stringify({website:'TEST ONLY'})});assert.equal(r.status,400);assert.equal((await r.json()).code,'FORM_CHECK');});
test('actual Workers runtime rejects wrong origin',async()=>{const r=await mf.dispatchFetch('https://mexpress-mass.com/api/ride-request',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);});
test('actual Workers runtime rejects missing fields',async()=>{const r=await mf.dispatchFetch('https://mexpress-mass.com/api/ride-request',{method:'POST',headers:{Origin:'https://mexpress-mass.com','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,400);assert.equal((await r.json()).code,'FIELDS');});
test.after(()=>mf.dispose());
const valid={passenger_name:'TEST ONLY',passenger_phone:'2025550142',pickup_address:'TEST A',dropoff_address:'TEST B',ride_date:'2026-11-20',pickup_time:'12:00',turnstile_token:'TEST TOKEN'};
async function upstreamTest(providerStatus=200,challengeStatus=200) {
 const calls=[];
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,cf:false,scriptPath:new URL('../worker.js',import.meta.url).pathname,compatibilityDate:'2026-10-29',bindings:{RESEND_API_KEY:'TEST',BOOKING_NOTIFICATION_FROM:'test@example.invalid',TURNSTILE_SECRET_KEY:'TEST'},outboundService:async req=>{
  calls.push({url:req.url,key:req.headers.get('Idempotency-Key'),body:await req.text()});
  const challenge=req.url==='https://challenges.cloudflare.com/turnstile/v0/siteverify';
  if(!challenge&&req.url!=='https://api.resend.com/emails')throw Error('Unexpected network target');
  const status=challenge?challengeStatus:providerStatus;
  return new Response(JSON.stringify(challenge?{success:true,hostname:'mexpress-mass.com'}:{id:'12345678-1234-1234-1234-123456789abc'}),{status,headers:{'Content-Type':'application/json',...(status>=300&&status<400?{Location:'https://foreign.invalid/collect'}:{})}});
 }}));
 try{const res=await runtime.dispatchFetch('https://mexpress-mass.com/api/ride-request',{method:'POST',headers:{Origin:'https://mexpress-mass.com','Content-Type':'application/json'},body:JSON.stringify(valid)});return{status:res.status,body:await res.json(),calls};}finally{await runtime.dispose();}
}
test('Workers runtime validates a real outbound Request through Turnstile and Resend',async()=>{const r=await upstreamTest();assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.ok,true);assert.equal(r.calls.length,2);assert.ok(r.calls[1].key.startsWith('booking/'));});
for(const status of [301,302,303,307,308])test('Workers runtime never forwards provider credentials on redirect '+status,async()=>{const r=await upstreamTest(status);assert.equal(r.status,502);assert.equal(r.calls.length,2);assert.ok(r.calls.every(x=>!x.url.includes('foreign.invalid')));});
test('Workers runtime rejects Turnstile redirect before sending email',async()=>{const r=await upstreamTest(200,302);assert.equal(r.status,403);assert.equal(r.calls.length,1);});
test('Workers runtime retries provider 503 with same body/key and returns failure',async()=>{const r=await upstreamTest(503);assert.equal(r.status,502);assert.equal(r.calls.length,3);assert.equal(r.calls[1].key,r.calls[2].key);assert.equal(r.calls[1].body,r.calls[2].body);});
