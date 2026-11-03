const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
// Install @electric-sql/pglite@0.5.14 in an isolated test prefix, then set PGLITE_MODULE.
const modulePath=process.env.PGLITE_MODULE;
test('chat security migration on isolated PostgreSQL', {skip:!modulePath},async()=>{
 const {PGlite}=require(modulePath);const db=new PGlite();
 try{
  await db.exec(fs.readFileSync('qa-tests/chat-security.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261031193954_dispatch_active_chat_review.sql','utf8'));
  const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const as=async n=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);
  const open=n=>db.query('select public.open_private_chat($1) as id',[uid(n)]);
  await as(1);let r=await db.query('select * from public.chat_employee_directory()');assert.deepEqual(r.rows.map(x=>x.id).sort(),[uid(2),uid(4)]);
  const first=(await open(2)).rows[0].id;assert.equal((await open(2)).rows[0].id,first);
  await assert.rejects(open(3),/Employee not found/);await assert.rejects(open(5),/Employee not found/);await assert.rejects(open(1),/Invalid chat participants/);
  await as(2);r=await db.query('select * from public.chat_employee_directory()');assert.deepEqual(r.rows.map(x=>x.id),[uid(1)]);await assert.rejects(open(4),/Driver-to-driver/);assert.equal((await open(1)).rows[0].id,first);
  await as(3);assert.equal((await db.query('select * from public.chat_employee_directory()')).rows.length,0);await assert.rejects(open(1),/Employee not found/);
  await as(5);await assert.rejects(open(1),/Employee not found/);
  await db.query("select set_config('request.jwt.claim.sub','',false)");await assert.rejects(open(1),/Invalid chat participants/);
  assert.equal((await db.query('select count(*)::int as n from public.chat_conversations')).rows[0].n,1);
  r=await db.query("select has_function_privilege('anon','public.open_private_chat(uuid)','execute') as anon,has_function_privilege('authenticated','public.open_private_chat(uuid)','execute') as authenticated");assert.deepEqual(r.rows[0],{anon:false,authenticated:true});
 }finally{await db.close()}
});
