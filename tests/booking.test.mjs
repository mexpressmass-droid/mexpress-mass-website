import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const source = await readFile(new URL('../worker.js', import.meta.url), 'utf8');
const worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
const env = { RESEND_API_KEY:'TEST-SECRET-RESEND', BOOKING_NOTIFICATION_FROM:'test@example.invalid', TURNSTILE_SECRET_KEY:'TEST-SECRET-TURNSTILE', ASSETS:{fetch:async()=>new Response('asset')} };
const payload = { passenger_name:'SYNTHETIC PASSENGER', passenger_phone:'2025550142', pickup_address:'TEST PICKUP',dropoff_address:'TEST DROPOFF',ride_date:'2026-11-20',pickup_time:'12:00',notes:'PRIVATE TEST NOTE',website:'',turnstile_token:'TEST-TOKEN' };
const emailId='12345678-1234-1234-1234-123456789abc';
const headers={Origin:'https://mexpress-mass.com','Content-Type':'application/json'};
const request=(data=payload,changes={})=>new Request('https://mexpress-mass.com/api/ride-request',{method:'POST',headers,body:JSON.stringify(data),...changes});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
async function run(req=request(),options={}) {
 const original=globalThis.fetch, oldLog=console.log;const calls=[],logs=[];let sends=0;
 globalThis.fetch=async(url,init)=>{calls.push({url,init});if(url.includes('siteverify'))return options.challenge ? options.challenge(url,init) : json({success:true,hostname:'mexpress-mass.com'});sends++;return options.provider ? options.provider(sends,url,init) : json({id:emailId});};
 console.log=value=>logs.push(value);
 try { const res=await worker.fetch(req,options.env||env);const text=await res.text();let body;try{body=JSON.parse(text)}catch{}return{res,body,text,calls,logs,sends}; }
 finally{globalThis.fetch=original;console.log=oldLog;}
}
test('baseline reproduced: honeypot used to return success without invoking provider',async()=>{
 const old=execFileSync('git',['show','edbed3c1c35d463d82affff4a86602a91964a8ff:worker.js'],{encoding:'utf8'});
 const baseline=(await import('data:text/javascript;base64,'+Buffer.from(old).toString('base64'))).default;
 const original=globalThis.fetch;let calls=0;globalThis.fetch=()=>{calls++;throw Error('must not send')};
 try{const res=await baseline.fetch(request({website:'autofilled.example'}),env);assert.equal(res.status,200);assert.deepEqual(await res.json(),{ok:true});assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
test('honeypot returns explicit error and never sends',async()=>{const r=await run(request({...payload,website:'autofilled.example'}));assert.equal(r.res.status,400);assert.equal(r.body.ok,false);assert.equal(r.calls.length,0);});
test('valid request requires provider ID; reference appears in email and acceptance log',async()=>{const r=await run();assert.equal(r.res.status,200);assert.equal(r.body.status,'accepted');assert.equal(r.sends,1);assert.match(r.calls[1].init.body,new RegExp(r.body.request_id));assert.equal(JSON.parse(r.logs.at(-1)).email_id,emailId);assert.equal(r.res.headers.get('cache-control'),'no-store');});
for(const [name,req,status] of [
 ['wrong origin',()=>request(payload,{headers:{...headers,Origin:'https://evil.invalid'}}),403],
 ['missing origin',()=>request(payload,{headers:{'Content-Type':'application/json'}}),403],
 ['wrong content type',()=>request(payload,{headers:{...headers,'Content-Type':'text/plain'}}),415],
 ['misleading content type',()=>request(payload,{headers:{...headers,'Content-Type':'notapplication/json'}}),415],
 ['invalid JSON',()=>request(payload,{body:'{'}),400],['array JSON',()=>request([]),400],
 ['missing name',()=>request({...payload,passenger_name:''}),400],
 ['invalid optional type',()=>request({...payload,notes:{secret:'value'}}),400],
 ['oversized notes',()=>request({...payload,notes:'x'.repeat(5001)}),400],
 ['invalid time',()=>request({...payload,pickup_time:'24:00'}),400],
 ['missing token',()=>request({...payload,turnstile_token:''}),400],
 ['oversized token',()=>request({...payload,turnstile_token:'x'.repeat(2049)}),400],
 ['oversize without length',()=>request(payload,{body:' '.repeat(12001)}),413],
 ['oversize declared length',()=>request(payload,{headers:{...headers,'Content-Length':'12001'}}),413],
 ['non POST',()=>new Request('https://mexpress-mass.com/api/ride-request'),405],
])test(name,async()=>{const r=await run(req());assert.equal(r.res.status,status);assert.equal(r.body.ok,false);assert.equal(r.calls.length,0);});
test('missing secret fails without exposing binding values',async()=>{const r=await run(request(),{env:{...env,RESEND_API_KEY:''}});assert.equal(r.res.status,503);assert.equal(r.calls.length,0);});
for(const [name,challenge] of [
 ['Turnstile rejection',()=>json({success:false,hostname:'mexpress-mass.com'})],
 ['Turnstile wrong hostname',()=>json({success:true,hostname:'evil.invalid'})],
 ['Turnstile non-boolean success',()=>json({success:'true',hostname:'mexpress-mass.com'})],
 ['Turnstile HTTP failure',()=>json({success:true,hostname:'mexpress-mass.com'},500)],
 ['Turnstile invalid JSON',()=>new Response('bad')],
 ['Turnstile network failure',()=>{throw Error('PRIVATE UPSTREAM ERROR')}],
])test(name,async()=>{const r=await run(request(),{challenge});assert.equal(r.body.ok,false);assert.equal(r.sends,0);assert.ok([403,502].includes(r.res.status));});
for(const status of [400,401,403,422])test('provider permanent '+status,async()=>{const r=await run(request(),{provider:()=>json({error:'PRIVATE UPSTREAM ERROR'},status)});assert.equal(r.res.status,502);assert.equal(r.sends,1);assert.equal(r.body.ok,false);});
for(const [name,first] of [
 ['500',()=>json({},500)],['429',()=>json({},429)],['network',()=>{throw Error('network')}],
 ['missing id',()=>json({})],['invalid id',()=>json({id:'not-an-email-id'})],['invalid JSON',()=>new Response('<html>ok</html>')],
])test('bounded retry recovers '+name+' with identical idempotency key/body',async()=>{const r=await run(request(),{provider:n=>n===1?first():json({id:emailId})});assert.equal(r.res.status,200);assert.equal(r.sends,2);assert.equal(r.calls[1].init.headers['Idempotency-Key'],r.calls[2].init.headers['Idempotency-Key']);assert.equal(r.calls[1].init.body,r.calls[2].init.body);});
test('provider outage is bounded and never success',async()=>{const r=await run(request(),{provider:()=>json({},503)});assert.equal(r.res.status,502);assert.equal(r.sends,2);assert.equal(r.body.ok,false);});
test('invalid 2xx never becomes success after retry',async()=>{const r=await run(request(),{provider:()=>json({})});assert.equal(r.res.status,502);assert.equal(r.sends,2);});
test('HTML escaped and all booking fields retained',async()=>{const r=await run(request({...payload,notes:'<script>alert(1)</script>',passenger_email:'synthetic@example.invalid',trip_type:'Round trip',wheelchair_passenger:'Yes'}));const m=JSON.parse(r.calls[1].init.body);assert.deepEqual(m.to,['mexpress.mass@gmail.com']);assert.match(m.html,/&lt;script&gt;/);assert.ok(!m.html.includes('<script>'));for(const s of ['synthetic@example.invalid','Round trip','Yes','Time (Boston)','2026-11-20','12:00'])assert.ok(m.html.includes(s));});
test('logs and errors contain no passenger data, secret, token, or upstream error body',async()=>{const r=await run(request(),{provider:()=>{throw Error('PRIVATE UPSTREAM ERROR')}});const emitted=JSON.stringify([r.logs,r.body]);for(const v of ['SYNTHETIC PASSENGER','2025550142','TEST PICKUP','PRIVATE TEST NOTE','TEST-SECRET','TEST-TOKEN','PRIVATE UPSTREAM ERROR'])assert.ok(!emitted.includes(v));});
test('network requests reject redirects and have timeout signals',async()=>{const r=await run();for(const c of r.calls){assert.equal(c.init.redirect,'manual');assert.ok(c.init.signal instanceof AbortSignal);}});
test('assets remain delegated unchanged',async()=>{const r=await run(new Request('https://mexpress-mass.com/'));assert.equal(r.text,'asset');assert.equal(r.calls.length,0);});
