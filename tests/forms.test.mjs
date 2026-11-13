import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {JSDOM}=require(process.env.JSDOM_MODULE || 'jsdom');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const script=await readFile(new URL('../script.js',import.meta.url),'utf8');
const selectors=['#booking form','form.ride-form'];
async function exercise(index,result,throws=false) {
 const dom=new JSDOM(html,{url:'https://mexpress-mass.com/',runScripts:'outside-only'});
 const w=dom.window;const calls=[];let release;
 w.fetch=(...args)=>{calls.push(args);return new Promise((resolve,reject)=>{release=()=>throws?reject(new Error('offline')):resolve({ok:result.http<400,json:async()=>result.body});});};
 let resets=0;w.turnstile={reset:()=>resets++};w.eval(script);
 const form=w.document.querySelectorAll('form.ride-form')[index];
 const fields={'Passenger name':'TEST SYNTHETIC','Phone':'2025550142','Email':'synthetic@example.invalid','Pickup address':'TEST PICKUP','Drop-off address':'TEST DROPOFF','Ride date':'2026-11-20','Pickup time':'12:00','Notes':'TEST ONLY'};
 for(const [name,value] of Object.entries(fields))form.elements.namedItem(name).value=value;
 const token=w.document.createElement('input');token.name='cf-turnstile-response';token.value='TEST TOKEN';form.append(token);
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(form.querySelector('[type=submit]').disabled,true);
 assert.equal(calls.length,1);assert.equal(calls[0][0],'/api/ride-request');
 const payload=JSON.parse(calls[0][1].body);assert.equal(payload.passenger_name,fields['Passenger name']);assert.equal(payload.passenger_phone,fields.Phone);assert.equal(payload.notes,fields.Notes);assert.equal(payload.website,'');assert.equal(payload.turnstile_token,'TEST TOKEN');
 release();await new Promise(r=>setImmediate(r));
 const feedback=form.querySelector('.booking-feedback').textContent;
 assert.equal(form.querySelector('[type=submit]').disabled,false);assert.equal(resets,1);
 return{dom,form,feedback};
}
for(const index of [0,1]) {
 test('form '+index+' acknowledged email clears submitted values',async()=>{const r=await exercise(index,{http:200,body:{ok:true,status:'accepted',request_id:'test-id'}});assert.match(r.feedback,/Your request was sent/);assert.equal(r.form.elements.namedItem('Passenger name').value,'');r.dom.window.close();});
 for(const [name,result,throws] of [
  ['honeypot rejection',{http:400,body:{ok:false,error:'Form verification failed'}},false],
  ['provider failure',{http:502,body:{ok:false,error:'Email delivery could not be confirmed'}},false],
  ['invalid acknowledgement',{http:200,body:{}},false],
  ['network failure',{http:0,body:{}},true],
 ])test('form '+index+' '+name+' preserves input and offers phone fallback',async()=>{const r=await exercise(index,result,throws);assert.match(r.feedback,/617-251-7049/);assert.ok(!r.feedback.includes('Your request was sent'));assert.equal(r.form.elements.namedItem('Passenger name').value,'TEST SYNTHETIC');assert.equal(r.form.elements.namedItem('Notes').value,'TEST ONLY');r.dom.window.close();});
}
