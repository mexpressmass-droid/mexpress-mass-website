const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','dispatch.js'),'utf8');
const contact=source.slice(source.indexOf('function contactAction('),source.indexOf('passenger.append(contactAction'));
// Install jsdom@26.1.0 in a separate QA runtime and set JSDOM_MODULE to its path.
function fixture(reject=false){
 const {JSDOM}=require(process.env.JSDOM_MODULE);
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only'}),w=dom.window,calls=[];
 w.trip={id:'TEST ONLY',updated_at:'2026-10-31T20:00:00.123456Z'};
 w.employeeAdminRequest=async request=>{calls.push(request);if(reject)throw Error('Ride changed; no changes saved');};
 w.msg=message=>{w.notice=message;};w.load=async()=>{};
 w.eval('function el(tag,txt){const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;return e}');
 w.eval(contact);
 const trigger=w.contactAction('passenger_phone','Cell','202-555-0101');w.document.body.append(trigger);
 return {dom,w,trigger,calls};
}
for(const activation of ['dblclick','Enter',' '])test(`contact editor opens using ${JSON.stringify(activation)}`,{skip:!process.env.JSDOM_MODULE},()=>{
 const {dom,w,trigger}=fixture();try{
 assert.equal(trigger.getAttribute('role'),'button');assert.equal(trigger.tabIndex,0);
 trigger.dispatchEvent(activation==='dblclick'?new w.MouseEvent('dblclick',{bubbles:true}):new w.KeyboardEvent('keydown',{key:activation,bubbles:true}));
 assert.equal(w.document.querySelector('input').value,'202-555-0101');
 assert.equal(w.document.activeElement,w.document.querySelector('input'));
 }finally{dom.window.close();}
});
for(const reject of [false,true])test(`contact editor ${reject?'retains conflicting draft':'sends the displayed revision and closes after save'}`,{skip:!process.env.JSDOM_MODULE},async()=>{
 const {dom,w,trigger,calls}=fixture(reject);try{
 trigger.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 const input=w.document.querySelector('input');input.value='202-555-0102';
 input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.length,1);assert.equal(calls[0].expected_updated_at,w.trip.updated_at);
 assert.equal(calls[0].value,'202-555-0102');
 assert.equal(!!w.document.querySelector('.contact-action-popover'),reject);
 assert.equal(trigger.textContent,reject?'202-555-0101':'202-555-0102');
 if(reject){assert.equal(input.value,'202-555-0102');assert.match(w.notice,/no changes saved/);}
 }finally{dom.window.close();}
});
