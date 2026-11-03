const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('worker.js','utf8');
const id='00000000-0000-4000-8000-000000000001';
const secret='TEST ONLY PRIVATE PASSENGER phone token internal note';
const ride={trip_num:'TEST_001',passenger_name:'TEST ONLY',passenger_phone:'202-555-0100',pickup_address:'TEST ONLY A',dropoff_address:'TEST ONLY B',pickup_at:'2026-11-04T15:00:00Z',price_cents:100,miles:1,notes:'TEST ONLY'};
for(const action of ['create_ride','bulk_assign_driver','bulk_update_status','seed_demo_100_rides','seed_demo_50_rides','seed_demo_rides','list_sfrt_imports','import_sfrt_csv']){
 test(action+' does not expose upstream error bodies',async()=>{
  const logs=[];
  const context={Request,Response,URL,URLSearchParams,console:{error:(...args)=>logs.push(args)},fetch:async(url,options={})=>{
   if(url.endsWith('/auth/v1/user'))return Response.json({id});
   if(url.includes('driver_profiles'))return Response.json([{id,role:'admin',is_active:true}]);
   if(url.includes('employee_audit_log'))return Response.json([]);
   if(options.method==='POST'||options.method==='PATCH'||action==='list_sfrt_imports'||action==='import_sfrt_csv')return Response.json({message:secret,details:secret,hint:secret},{status:400});
   if(action.startsWith('bulk_'))return Response.json([{id,status:'confirmed',assigned_driver_id:id,archived_at:null,updated_at:'2026-11-03T00:00:00Z'}]);
   return Response.json([]);
  }};
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('const SUPABASE='),source.indexOf('export default')),context);
  const body={...ride,action,ride_ids:[id],assigned_driver_id:action==='create_ride'?null:id,status:'assigned',rides:[ride]};
  const response=await context.employeeAdmin(new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify(body)}),{SUPABASE_SERVICE_ROLE_KEY:'synthetic'});
  const text=await response.text();assert.ok(logs.length,'failure path must be exercised');
  assert.equal(JSON.stringify(logs).includes(secret),false);assert.equal(text.includes(secret),false);
  assert.ok(response.status===502||(action==='import_sfrt_csv'&&response.status===200));
 });
}
test('upstream outage fails closed without logging exception details',async()=>{
 const logs=[];const c={Request,Response,URL,URLSearchParams,console:{error:(...args)=>logs.push(args)},fetch:async()=>{throw Error(secret)}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('const SUPABASE='),source.indexOf('export default')),c);
 const r=await c.employeeAdmin(new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer test'},body:'{"action":"list"}'}),{SUPABASE_SERVICE_ROLE_KEY:'synthetic'});
 assert.equal(r.status,500);assert.equal((await r.text()).includes(secret),false);assert.equal(JSON.stringify(logs).includes(secret),false);
});
