const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
test('database trigger advances every revision and stale writes affect zero rows',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_MODULE);const db=new PGlite();try{
 await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE public.trips(id int PRIMARY KEY, notes text, updated_at timestamptz NOT NULL); INSERT INTO public.trips VALUES(1,'TEST ONLY','2099-01-01T00:00:00Z');");
 await db.exec(fs.readFileSync('supabase/migrations/20261031194540_dispatch_trip_revision_guard_review.sql','utf8'));
 let r=await db.query("UPDATE public.trips SET notes='TEST ONLY changed',updated_at='2000-01-01' WHERE id=1 RETURNING updated_at::text as revision");assert.equal(r.rows[0].revision,'2099-01-01 00:00:00.000001+00');
 r=await db.query("UPDATE public.trips SET notes='TEST ONLY stale' WHERE id=1 AND updated_at='2099-01-01T00:00:00Z' RETURNING id");assert.equal(r.rows.length,0);
 r=await db.query("UPDATE public.trips SET notes=notes WHERE id=1 RETURNING updated_at::text as revision");assert.equal(r.rows[0].revision,'2099-01-01 00:00:00.000002+00');
 }finally{await db.close()}
});
