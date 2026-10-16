import { onRequestPost } from "./functions/api/ride-request.js";
const SUPABASE="https://mmdolkwclsctvwtxnqtc.supabase.co";
async function staffLogin(request,env){
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
 if(request.method!=="POST")return reply({error:"Method not allowed"},405);
 if(!env.SUPABASE_SERVICE_ROLE_KEY)return reply({error:"Authentication unavailable"},503);
 const data=await request.json().catch(()=>null);
 const login=data?.login?.trim()?.toLowerCase(),password=data?.password;
 if(typeof login!=="string"||login.length>150||typeof password!=="string"||!password)return reply({error:"Invalid credentials"},401);
 let email=login;
 if(!login.includes("@")){
  if(!/^[a-z][a-z0-9._-]{2,31}$/.test(login))return reply({error:"Invalid credentials"},401);
  const key=env.SUPABASE_SERVICE_ROLE_KEY;
  const result=await fetch(SUPABASE+"/rest/v1/driver_profiles?select=id&is_active=eq.true&username=eq."+encodeURIComponent(login)+"&limit=1",{headers:{"apikey":key,"Authorization":"Bearer "+key}});
  if(!result.ok)return reply({error:"Authentication unavailable"},503);
  const profiles=await result.json();
  if(!profiles.length)return reply({error:"Invalid credentials"},401);
  const user=await fetch(SUPABASE+"/auth/v1/admin/users/"+encodeURIComponent(profiles[0].id),{headers:{"apikey":key,"Authorization":"Bearer "+key}});
  if(!user.ok)return reply({error:"Invalid credentials"},401);
  email=(await user.json()).email;
  if(!email)return reply({error:"Invalid credentials"},401);
 }
 const response=await fetch(SUPABASE+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"apikey":"sb_publishable_Ha7bHx3pq6b342tU_VNnTw_a0hefysO","Content-Type":"application/json"},body:JSON.stringify({email,password})});
 if(!response.ok)return reply({error:"Invalid credentials"},401);
 return reply(await response.json());
}
async function logEmployeeEvent(env,user,role,action,target,details){
 const key=env.SUPABASE_SERVICE_ROLE_KEY;
 try{
  const r=await fetch(SUPABASE+"/rest/v1/employee_audit_log",{method:"POST",headers:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({actor_id:user.id,actor_role:role,action,target_id:target,details:{source:"web",...details}})});
  if(!r.ok)console.error("Employee audit insert failed",r.status);
 }catch(e){console.error("Employee audit insert failed")}
}
async function employeeAdmin(request,env){
 const headers={"Content-Type":"application/json","Cache-Control":"no-store"};
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(request.method!=="POST")return reply({error:"Method not allowed"},405);
 const bearer=request.headers.get("Authorization")||"";
 if(!/^Bearer\s+\S+$/.test(bearer))return reply({error:"Sign in required"},401);
 if(!env.SUPABASE_SERVICE_ROLE_KEY)return reply({error:"Server secret is not configured"},503);
 const serviceHeaders={"apikey":env.SUPABASE_SERVICE_ROLE_KEY,"Authorization":"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY};
 try{
  const auth=await fetch(SUPABASE+"/auth/v1/user",{headers:{"apikey":env.SUPABASE_SERVICE_ROLE_KEY,"Authorization":bearer},cache:"no-store"});
  if(!auth.ok)return reply({error:"Invalid or expired session"},401);
  const user=await auth.json();
  if(!user.id)return reply({error:"Invalid session"},401);
  const profile=await fetch(SUPABASE+"/rest/v1/driver_profiles?select=role,is_active&id=eq."+encodeURIComponent(user.id)+"&limit=1",{headers:serviceHeaders});
  if(!profile.ok)return reply({error:"Authorization lookup failed"},502);
  const rows=await profile.json();
  const staffRole=rows[0]?.is_active===true?rows[0]?.role:null;
  if(!["admin","dispatcher"].includes(staffRole))return reply({error:"Staff access required"},403);
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=="object")return reply({error:"Invalid request"},400);
  if(body.action==="list"){
   const result=await fetch(SUPABASE+"/rest/v1/driver_profiles?select=id,username,display_name,role,is_active&is_active=eq.true&order=role.asc,username.asc",{headers:serviceHeaders});
   if(!result.ok)return reply({error:"Unable to load employees"},502);
   return reply({employees:(await result.json()).filter(p=>staffRole==="admin"||p.role==="driver")});
  }
  if(body.action==="audit_log"){
   if(staffRole!=="admin")return reply({error:"Administrator access required"},403);
   const limit=Math.min(500,Math.max(1,Number(body.limit)||200));
   const params=new URLSearchParams({select:"id,created_at,actor_id,actor_role,action,target_id,details",order:"created_at.desc",limit:String(limit)});
   if(typeof body.actor_id==="string"&&/^[0-9a-f-]{36}$/i.test(body.actor_id))params.set("actor_id","eq."+body.actor_id);
   if(["admin","dispatcher","driver"].includes(body.actor_role))params.set("actor_role","eq."+body.actor_role);
   if(typeof body.action_filter==="string"&&/^[a-z_]{2,60}$/.test(body.action_filter))params.set("action","eq."+body.action_filter);
   if(typeof body.from==="string"&&!isNaN(Date.parse(body.from)))params.set("created_at","gte."+new Date(body.from).toISOString());
   if(typeof body.to==="string"&&!isNaN(Date.parse(body.to)))params.append("created_at","lte."+new Date(body.to).toISOString());
   const events=await fetch(SUPABASE+"/rest/v1/employee_audit_log?"+params.toString(),{headers:serviceHeaders});
   if(!events.ok)return reply({error:"Activity log table is not configured yet"},503);
   return reply({events:await events.json()});
  }
  if(body.action==="record_activity"){
   const allowed=["view_ride","open_ride","view_messages","send_message","open_employee","login","logout","ride_status_click","ride_save_click","ride_bulk_click"];
   if(!allowed.includes(body.event))return reply({error:"Invalid activity"},400);
   await logEmployeeEvent(env,user,staffRole,body.event,user.id,{source:"web",...((body.context&&typeof body.context==="object")?{context:String(body.context.value||"").slice(0,120)}:{})});
   return reply({success:true});
  }
  if(body.action==="archive_list"){
   const res=await fetch(SUPABASE+"/rest/v1/trips?select=id,passenger_name,pickup_at,pickup_address,dropoff_address,status,assigned_driver_id,price_cents,archived_at,archive_source&archived_at=not.is.null&order=pickup_at.desc&limit=1000",{headers:serviceHeaders});
   if(!res.ok)return reply({error:"Unable to load archive"},502);
   return reply({rides:await res.json()});
  }
  if(body.action==="delete_rides"){
   if(staffRole!=="admin")return reply({error:"Only administrators may permanently delete rides"},403);
   if(body.confirmation!=="DELETE PERMANENTLY")return reply({error:"Deletion confirmation required"},400);
   if(!Array.isArray(body.ride_ids)||body.ride_ids.length<1||body.ride_ids.length>100||new Set(body.ride_ids).size!==body.ride_ids.length||body.ride_ids.some(id=>typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id)))return reply({error:"Invalid ride selection"},400);
   const ids=body.ride_ids.join(",");
   const lookup=await fetch(SUPABASE+"/rest/v1/trips?select=id&id=in.("+ids+")",{headers:serviceHeaders});
   if(!lookup.ok)return reply({error:"Could not verify selected rides"},502);
   const existing=await lookup.json();
   if(existing.length!==body.ride_ids.length)return reply({error:"One or more selected rides no longer exist. Refresh and try again."},409);
   const deletion=await fetch(SUPABASE+"/rest/v1/trips?id=in.("+ids+")",{method:"DELETE",headers:{...serviceHeaders,"Prefer":"return=representation"}});
   if(!deletion.ok)return reply({error:"Database refused deletion; no deletion was confirmed. Check related table constraints."},502);
   const deleted=await deletion.json();
   return reply({success:true,count:deleted.length,requested:body.ride_ids.length});
  }
  if(body.action==="archive_rides"){
   if(!Array.isArray(body.ride_ids)||body.ride_ids.length<1||body.ride_ids.length>200||new Set(body.ride_ids).size!==body.ride_ids.length||body.ride_ids.some(id=>typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id)))return reply({error:"Invalid ride selection"},400);
   const ids=body.ride_ids.join(",");
   const lookup=await fetch(SUPABASE+"/rest/v1/trips?select=id,status,archived_at&id=in.("+ids+")",{headers:serviceHeaders});
   if(!lookup.ok)return reply({error:"Unable to validate selected rides. Apply the archive database migration first."},502);
   const rows=await lookup.json();
   if(rows.length!==body.ride_ids.length||rows.some(t=>!["completed","cancelled"].includes(t.status)||t.archived_at!==null))return reply({error:"Only existing, non-archived Completed or Cancelled rides can be archived"},400);
   const result=await fetch(SUPABASE+"/rest/v1/trips?id=in.("+ids+")&status=in.(completed,cancelled)&archived_at=is.null",{method:"PATCH",headers:{...serviceHeaders,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify({archived_at:new Date().toISOString(),archive_source:"manual"})});
   if(!result.ok)return reply({error:"Unable to archive rides"},502);
   const archived=await result.json();
   await logEmployeeEvent(env,user,staffRole,"archive_rides",user.id,{count:archived.length,ride_ids:body.ride_ids});
   return reply({success:true,count:archived.length,requested:body.ride_ids.length});
  }
  if(body.action==="bulk_assign_driver"){
   if(!Array.isArray(body.ride_ids)||body.ride_ids.length<1||body.ride_ids.length>200||new Set(body.ride_ids).size!==body.ride_ids.length||body.ride_ids.some(id=>typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id)))return reply({error:"Invalid ride selection"},400);
   const driverId=body.assigned_driver_id;
   if(typeof driverId!=="string"||!/^[0-9a-f-]{36}$/i.test(driverId))return reply({error:"Select a valid driver"},400);
   const driverResponse=await fetch(SUPABASE+"/rest/v1/driver_profiles?select=id&id=eq."+encodeURIComponent(driverId)+"&role=eq.driver&is_active=eq.true&limit=1",{headers:serviceHeaders});
   if(!driverResponse.ok||!(await driverResponse.json()).length)return reply({error:"Only active drivers can be assigned"},400);
   const ids=body.ride_ids.join(",");
   const existingResponse=await fetch(SUPABASE+"/rest/v1/trips?select=id,status,archived_at&id=in.("+ids+")",{headers:serviceHeaders});
   if(!existingResponse.ok)return reply({error:"Unable to check selected rides"},502);
   const existing=await existingResponse.json();
   if(existing.length!==body.ride_ids.length||existing.some(t=>t.archived_at!==null))return reply({error:"One or more rides are missing or archived. Refresh and retry."},409);
   if(existing.some(t=>t.status==="pending"))return reply({error:"Pending rides must be confirmed before assigning a driver. No rides were changed."},409);
   const now=new Date().toISOString();
   let updatedCount=0;
   for(const group of [existing.filter(t=>["confirmed","assigned"].includes(t.status)),existing.filter(t=>!["confirmed","assigned"].includes(t.status))]){
    if(!group.length)continue;
    const patch={assigned_driver_id:driverId,updated_at:now};
    if(["pending","confirmed","assigned"].includes(group[0].status))patch.status="assigned";
    const response=await fetch(SUPABASE+"/rest/v1/trips?id=in.("+group.map(t=>t.id).join(",")+")&archived_at=is.null",{method:"PATCH",headers:{...serviceHeaders,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(patch)});
    if(!response.ok){console.error("Bulk assign failed",response.status,await response.text());return reply({error:"Unable to assign all selected rides. Refresh to review."},502)}
    updatedCount+=(await response.json()).length;
   }
   await logEmployeeEvent(env,user,staffRole,"bulk_assign_driver",user.id,{count:updatedCount,driver_id:driverId,ride_ids:body.ride_ids});
   return reply({success:true,count:updatedCount,requested:body.ride_ids.length});
  }
  if(body.action==="bulk_update_status"){
   const allowed=["pending","confirmed","assigned","on_the_way","arrived","boarded","completed","cancelled"];
   if(!allowed.includes(body.status))return reply({error:"Invalid status"},400);
   if(!Array.isArray(body.ride_ids)||body.ride_ids.length<1||body.ride_ids.length>200||new Set(body.ride_ids).size!==body.ride_ids.length||body.ride_ids.some(id=>typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id)))return reply({error:"Invalid ride selection"},400);
   const ids=body.ride_ids.join(",");
   if(body.status==="assigned"){const check=await fetch(SUPABASE+"/rest/v1/trips?select=id,assigned_driver_id&id=in.("+ids+")",{headers:serviceHeaders});if(!check.ok)return reply({error:"Unable to validate drivers"},502);const rides=await check.json();if(rides.length!==body.ride_ids.length||rides.some(t=>!t.assigned_driver_id))return reply({error:"Select a driver for every selected ride before saving Assigned status."},409)}
   const patch={status:body.status,updated_at:new Date().toISOString()};
   if(body.status==="pending")patch.assigned_driver_id=null;
   const response=await fetch(SUPABASE+"/rest/v1/trips?id=in.("+ids+")",{method:"PATCH",headers:{...serviceHeaders,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(patch)});
   if(!response.ok){console.error("Bulk status failed",response.status,await response.text());return reply({error:"Unable to update selected rides"},502)}
   const updated=await response.json();
   await logEmployeeEvent(env,user,staffRole,"bulk_update_status",user.id,{count:updated.length,status:body.status,ride_ids:body.ride_ids});
   return reply({success:true,count:updated.length,requested:body.ride_ids.length});
  }
  if(body.action==="update_ride"){
   if(typeof body.ride_id!=="string"||!/^[0-9a-f-]{36}$/i.test(body.ride_id))return reply({error:"Invalid ride"},400);
   const currentResponse=await fetch(SUPABASE+"/rest/v1/trips?select=id,status,assigned_driver_id,pickup_at,dropoff_at,pickup_address,dropoff_address,price_cents,internal_notes,notes&id=eq."+encodeURIComponent(body.ride_id)+"&limit=1",{headers:serviceHeaders});
   if(!currentResponse.ok)return reply({error:"Unable to load ride"},502);
   const current=(await currentResponse.json())[0];
   if(!current)return reply({error:"Ride not found"},404);
   if(!["pending","confirmed","assigned","on_the_way","arrived","boarded","completed","cancelled"].includes(body.status))return reply({error:"Invalid status"},400);
   for(const field of ["pickup_address","dropoff_address"])if(typeof body[field]!=="string"||!body[field].trim()||body[field].length>500)return reply({error:"Valid pickup and drop-off addresses are required"},400);
   if(body.price_cents!==null&&(!Number.isSafeInteger(body.price_cents)||body.price_cents<0))return reply({error:"Invalid price"},400);
   if(body.internal_notes!==null&&(typeof body.internal_notes!=="string"||body.internal_notes.length>4000))return reply({error:"Invalid internal notes"},400);
   if(body.notes!==null&&(typeof body.notes!=="string"||body.notes.length>4000))return reply({error:"Invalid driver notes"},400);
   const parseTime=v=>typeof v==="string"&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
   const pickupTime=parseTime(body.pickup_at);
   const dropoffTime=body.dropoff_at===null?null:parseTime(body.dropoff_at);
   if(!pickupTime||(body.dropoff_at!==null&&!dropoffTime))return reply({error:"Invalid pickup or drop-off time"},400);
   const timeChanged=pickupTime!==new Date(current.pickup_at).toISOString()||dropoffTime!==(current.dropoff_at?new Date(current.dropoff_at).toISOString():null);
   if(timeChanged&&["completed","cancelled"].includes(current.status))return reply({error:"Time cannot be changed after a ride is Completed or Cancelled."},409);
   const driverId=body.assigned_driver_id||null;
   if(driverId!==null&&(typeof driverId!=="string"||!/^[0-9a-f-]{36}$/i.test(driverId)))return reply({error:"Invalid driver"},400);
   
   if(current.status==="pending"&&driverId!==null)return reply({error:"Confirm this ride first, then assign a driver."},409);
   if(driverId!==null&&driverId!==current.assigned_driver_id){
    const driverResponse=await fetch(SUPABASE+"/rest/v1/driver_profiles?select=id&id=eq."+encodeURIComponent(driverId)+"&role=eq.driver&is_active=eq.true&limit=1",{headers:serviceHeaders});
    if(!driverResponse.ok||!(await driverResponse.json()).length)return reply({error:"Only active drivers can be assigned"},400);
   }
   if(body.status==="assigned"&&!driverId)return reply({error:"Select a driver before saving Assigned status."},409);
   const nextStatus=driverId!==null&&["confirmed","assigned"].includes(body.status)?"assigned":body.status;
   const changes={status:nextStatus,pickup_at:pickupTime,dropoff_at:dropoffTime,pickup_address:body.pickup_address.trim(),dropoff_address:body.dropoff_address.trim(),price_cents:body.price_cents,assigned_driver_id:driverId,notes:body.notes,internal_notes:body.internal_notes,updated_at:new Date().toISOString()};
   const saved=await fetch(SUPABASE+"/rest/v1/trips?id=eq."+encodeURIComponent(body.ride_id),{method:"PATCH",headers:{...serviceHeaders,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(changes)});
   if(!saved.ok)return reply({error:"Unable to save ride changes"},502);
   const auditChanges={};
   for(const field of ["status","pickup_at","dropoff_at","pickup_address","dropoff_address","price_cents","assigned_driver_id","notes","internal_notes"]){
    const before=current[field]??null,after=changes[field]??null;
    if(String(before)!==String(after))auditChanges[field]={before,after};
   }
   if(Object.keys(auditChanges).length)await logEmployeeEvent(env,user,staffRole,"update_ride",body.ride_id,{ride_id:body.ride_id,changes:auditChanges});

   return reply({success:true});
  }
  if(body.action==="seed_demo_50_rides"){
   if(staffRole!=="admin")return reply({error:"Administrator access required"},403);
   const tag="MEXPRESS_DEMO_50_OCT2026";
   const existing=await fetch(SUPABASE+"/rest/v1/trips?select=id&notes=like.*"+tag+"*&limit=1",{headers:serviceHeaders});
   if(!existing.ok)return reply({error:"Unable to check existing demo rides"},502);
   if((await existing.json()).length)return reply({error:"These 50 demo rides were already created. No duplicates added."},409);
   const names=["Olivia Parker","James Wilson","Sophia Bennett","Daniel Foster","Emma Mitchell","Noah Turner","Ava Collins","Liam Brooks","Mia Peterson","Ethan Reed","Charlotte Hayes","Lucas Morgan","Amelia Cooper","Henry Sullivan","Harper Jenkins","Benjamin Price","Isabella Ross","Alexander Gray","Evelyn Murphy","William Carter","Grace Phillips","Jack Edwards","Chloe Richardson","Oliver Bailey","Ella Hughes","Mason Ward","Lily Sanders","Logan Perry","Zoe Coleman","Samuel Rivera"];
   const places=["Burlington, MA","Woburn, MA","Lexington, MA","Waltham, MA","Newton, MA","Cambridge, MA","Medford, MA","Arlington, MA","Brookline, MA","Boston, MA"];
   const todayBoston=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
   const base=new Date(todayBoston+"T12:00:00Z");
   function dateAt(day){const d=new Date(base);d.setUTCDate(d.getUTCDate()+day);return d.toISOString().slice(0,10)}
   function localBostonIso(day,hhmm){const date=dateAt(day),utcGuess=new Date(date+"T"+hhmm+":00Z");const offsetName=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",timeZoneName:"shortOffset"}).formatToParts(utcGuess).find(p=>p.type==="timeZoneName")?.value||"GMT-4";const match=offsetName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);const offset=match?(match[1]==="-"?-1:1)*(Number(match[2])*60+Number(match[3]||0)):-240;return new Date(utcGuess.getTime()-offset*60000).toISOString()}
   const records=[];
   for(let i=0;i<30;i++){
    const day=1+(i*7)%30,origin=places[i%places.length],destination=places[(i+3)%places.length],name=names[i];
    const departure=["08:00","09:00","10:00","11:00","12:00"][i%5];
    const returnTime=["12:30","13:30","14:30","15:30","16:30"][i%5];
    const instructions=["Escort accompanies passenger; call escort at pickup.","Passenger uses a walker; allow extra time for boarding.","Pickup at main lobby/front desk; driver must check in.","Passenger uses a wheelchair; door-to-door assistance required.","Family member will meet driver at destination.","Escort will be waiting in the lobby; please call on arrival.","Walker folds for transport; assist passenger to vehicle.","Pickup at rehabilitation center front desk; ask staff for passenger.","Passenger travels with one escort; confirm both are ready.","Call passenger five minutes before arrival; pickup at building entrance."];
    const instruction=instructions[i%instructions.length];
    const pair=i<20,group=pair?"PAIR-"+String(i+1).padStart(2,"0"):"SINGLE-"+String(i-19).padStart(2,"0");
    const baseRide={passenger_name:"TEST — "+name,passenger_phone:"202-555-"+String(100+i).padStart(4,"0"),wheelchair_required:i%10===3,trip_type:"one_way",status:"pending",source:"dispatch",assigned_driver_id:null,price_cents:9288+(i%6)*1250};
    records.push({...baseRide,pickup_address:"TEST ONLY — "+origin,dropoff_address:"TEST ONLY — "+destination,pickup_at:localBostonIso(day,departure),dropoff_at:localBostonIso(day,["08:45","09:50","11:00","12:05","13:15"][i%5]),notes:tag+" | "+group+" | OUTBOUND | "+instruction+" | TEST DATA, NOT A REAL BOOKING"});
    if(pair)records.push({...baseRide,pickup_address:"TEST ONLY — "+destination,dropoff_address:"TEST ONLY — "+origin,pickup_at:localBostonIso(day,returnTime),dropoff_at:localBostonIso(day,"00:00"),notes:tag+" | "+group+" | RETURN | "+instruction+" Return pickup: confirm passenger is ready at lobby or front desk. | TEST DATA, NOT A REAL BOOKING"});
   }
   const inserted=await fetch(SUPABASE+"/rest/v1/trips",{method:"POST",headers:{...serviceHeaders,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(records)});
   if(!inserted.ok){const details=await inserted.text();console.error("50 demo seed failed",inserted.status,details);let parsed={};try{parsed=JSON.parse(details)}catch{}const reason=String(parsed.message||parsed.details||"Database rejected demo rides").slice(0,300);return reply({error:"Unable to create 50 demo rides: "+reason},502)}
   const created=await inserted.json();
   await logEmployeeEvent(env,user,staffRole,"seed_demo_50_rides",user.id,{count:created.length,tag});
   return reply({success:true,count:created.length,pairs:20,singles:10});
  }
  if(body.action==="seed_demo_rides"){
   if(staffRole!=="admin")return reply({error:"Administrator access required"},403);
   const tag="MEXPRESS_DEMO_OCT2026";
   const existing=await fetch(SUPABASE+"/rest/v1/trips?select=id&notes=like.*"+tag+"*&limit=1",{headers:serviceHeaders});
   if(!existing.ok)return reply({error:"Unable to check existing demo rides"},502);
   if((await existing.json()).length)return reply({error:"Demo rides already exist. No duplicates were created."},409);
   const places=["Burlington, MA","Woburn, MA","Lexington, MA","Waltham, MA","Cambridge, MA","Boston, MA","Newton, MA","Medford, MA","Arlington, MA","Brookline, MA"];
   const times=["09:00","10:30","12:15","14:00","15:45"];
   const dates=[];
   for(let i=0;i<30;i++){const d=new Date(Date.UTC(2026,9,19+i));if(d.getUTCDay()!==0&&d.getUTCDay()!==6)dates.push(d.toISOString().slice(0,10))}
   const records=Array.from({length:25},(_,i)=>{
    const date=dates[Math.floor(i*dates.length/25)];
    const time=times[i%times.length];
    const pickup=places[i%places.length],dropoff=places[(i+3)%places.length];
    return {passenger_name:"DEMO Passenger "+String(i+1).padStart(2,"0"),passenger_phone:"000-000-0000",pickup_address:"TEST ONLY — "+pickup,dropoff_address:"TEST ONLY — "+dropoff,pickup_at:date+"T"+time+":00"+(date<"2026-11-01"?"-04:00":"-05:00"),wheelchair_required:i%3===0,trip_type:"one_way",status:"pending",source:"dispatch",assigned_driver_id:null,notes:tag+" — TEST DATA, NOT A REAL BOOKING",price_cents:9288+(i%4)*1000};
   });
   const inserted=await fetch(SUPABASE+"/rest/v1/trips",{method:"POST",headers:{...serviceHeaders,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(records)});
   if(!inserted.ok){console.error("Demo seed failed",inserted.status,await inserted.text());return reply({error:"Unable to create demo rides"},502)}
   const created=await inserted.json();
   await logEmployeeEvent(env,user,staffRole,"seed_demo_rides",user.id,{count:created.length,tag});
   return reply({success:true,count:created.length});
  }
  if(body.action==="create_ride"){
   const fields=["passenger_name","passenger_phone","pickup_address","dropoff_address","pickup_at"];
   if(fields.some(k=>typeof body[k]!=="string"||!body[k].trim()||body[k].length>500))return reply({error:"Passenger, phone, addresses and pickup time are required"},400);
   const pickupDate=new Date(body.pickup_at);
   if(!Number.isFinite(pickupDate.getTime()))return reply({error:"Invalid pickup time"},400);
   const record={passenger_name:body.passenger_name.trim(),passenger_phone:body.passenger_phone.trim(),passenger_email:typeof body.passenger_email==="string"?body.passenger_email.trim()||null:null,pickup_address:body.pickup_address.trim(),dropoff_address:body.dropoff_address.trim(),pickup_at:pickupDate.toISOString(),wheelchair_required:body.wheelchair_required===true,trip_type:["one_way","round_trip"].includes(body.trip_type)?body.trip_type:"one_way",notes:typeof body.notes==="string"?body.notes.slice(0,3000).trim()||null:null,status:"pending",source:"dispatch"};
   if(body.assigned_driver_id){
    return reply({error:"Pending rides cannot be assigned to a driver. Create the ride first, then change its status."},400);
    if(typeof body.assigned_driver_id!=="string"||!/^[0-9a-f-]{36}$/i.test(body.assigned_driver_id))return reply({error:"Invalid driver"},400);
    const driver=await fetch(SUPABASE+"/rest/v1/driver_profiles?select=id&id=eq."+encodeURIComponent(body.assigned_driver_id)+"&is_active=eq.true&role=eq.driver&limit=1",{headers:serviceHeaders});
    if(!driver.ok||!(await driver.json()).length)return reply({error:"Driver not found"},400);
    record.assigned_driver_id=body.assigned_driver_id;
    record.status="assigned";
   }
   const created=await fetch(SUPABASE+"/rest/v1/trips",{method:"POST",headers:{...serviceHeaders,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(record)});
   if(!created.ok){console.error("Ride creation failed",created.status,await created.text());return reply({error:"Unable to create ride"},502)}
   const rides=await created.json();
   await logEmployeeEvent(env,user,staffRole,"create_ride",user.id,{source:"web",ride_id:rides[0]?.id,assigned_driver_id:record.assigned_driver_id||null});
   return reply({success:true,ride_id:rides[0]?.id},201);
  }
  if(body.action==="create_employee"||body.action==="create_driver"){
   const role=body.action==="create_driver"?"driver":body.role;
   if(!["driver","dispatcher"].includes(role))return reply({error:"Invalid employee role"},400);
   if(role==="dispatcher"&&staffRole!=="admin")return reply({error:"Only administrators can create dispatchers"},403);
   const username=body.username,displayName=body.display_name,password=body.password;
   if(typeof username!=="string"||!/^[a-z][a-z0-9._-]{2,31}$/.test(username))return reply({error:"Invalid username"},400);
   if(typeof displayName!=="string"||!displayName.trim()||displayName.length>100)return reply({error:"Invalid employee name"},400);
   if(typeof password!=="string"||password.length<12||password.length>128)return reply({error:"Password must contain 12–128 characters"},400);
   const existing=await fetch(SUPABASE+"/rest/v1/driver_profiles?select=id&username=eq."+encodeURIComponent(username)+"&limit=1",{headers:serviceHeaders});
   if(!existing.ok)return reply({error:"Username check failed"},502);
   if((await existing.json()).length)return reply({error:"Username already in use"},409);
   const created=await fetch(SUPABASE+"/auth/v1/admin/users",{method:"POST",headers:{...serviceHeaders,"Content-Type":"application/json"},body:JSON.stringify({email:username+"@auth.mexpress-mass.com",password,email_confirm:true})});
   if(!created.ok)return reply({error:"Could not create authentication account (username may be taken)"},502);
   const newUser=await created.json();
   const inserted=await fetch(SUPABASE+"/rest/v1/driver_profiles",{method:"POST",headers:{...serviceHeaders,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify({id:newUser.id,username,display_name:displayName.trim(),role})});
   if(!inserted.ok){
    await fetch(SUPABASE+"/auth/v1/admin/users/"+encodeURIComponent(newUser.id),{method:"DELETE",headers:serviceHeaders});
    return reply({error:"Could not create driver profile; authentication account cleanup attempted"},502);
   }
   await logEmployeeEvent(env,user,staffRole,"create_"+role,newUser.id,{username,display_name:displayName.trim(),role});
   return reply({success:true,user_id:newUser.id});
  }
  if(body.action==="delete_employee"){
   const target=body.user_id;
   if(typeof target!=="string"||!/^[0-9a-f-]{36}$/i.test(target))return reply({error:"Select an employee"},400);
   if(target===user.id)return reply({error:"You cannot delete your own account"},403);
   const targetRes=await fetch(SUPABASE+"/rest/v1/driver_profiles?select=id,username,display_name,role,is_active&id=eq."+encodeURIComponent(target)+"&limit=1",{headers:serviceHeaders});
   if(!targetRes.ok)return reply({error:"Employee lookup failed"},502);
   const targetRows=await targetRes.json(),employee=targetRows[0];
   if(!employee||!employee.is_active)return reply({error:"Active employee not found"},404);
   if(employee.role==="admin")return reply({error:"Administrator accounts cannot be deleted"},403);
   if(staffRole!=="admin"&&employee.role!=="driver")return reply({error:"Dispatchers can only delete drivers"},403);
   if(body.confirm_username!==employee.username)return reply({error:"Username confirmation does not match"},400);
   const authCheck=await fetch(SUPABASE+"/auth/v1/admin/users/"+encodeURIComponent(target),{headers:serviceHeaders});
   if(!authCheck.ok)return reply({error:"Authentication account not found; no changes made"},409);
   const original=await authCheck.json();
   if(!String(original.email||"").toLowerCase().endsWith("@auth.mexpress-mass.com"))return reply({error:"This login is not a managed employee account"},403);
   const deactivate=await fetch(SUPABASE+"/rest/v1/driver_profiles?id=eq."+encodeURIComponent(target),{method:"PATCH",headers:{...serviceHeaders,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify({is_active:false})});
   if(!deactivate.ok)return reply({error:"Unable to lock employee account"},502);
   const locked=await deactivate.json();
   if(locked.length!==1)return reply({error:"Unable to verify account lock"},502);
   const deleted=await fetch(SUPABASE+"/auth/v1/admin/users/"+encodeURIComponent(target),{method:"DELETE",headers:serviceHeaders});
   if(!deleted.ok){
    await fetch(SUPABASE+"/rest/v1/driver_profiles?id=eq."+encodeURIComponent(target),{method:"PATCH",headers:{...serviceHeaders,"Content-Type":"application/json"},body:JSON.stringify({is_active:true})});
    return reply({error:"Authentication deletion failed. Account restoration attempted; contact administrator."},502);
   }
   const archiveUsername="archived_"+target.replace(/-/g,"").slice(0,24);
   const renamed=await fetch(SUPABASE+"/rest/v1/driver_profiles?id=eq."+encodeURIComponent(target),{method:"PATCH",headers:{...serviceHeaders,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify({username:archiveUsername})});
   if(!renamed.ok)return reply({error:"Login deleted and history preserved, but username release failed. Contact administrator.",account_deleted:true},502);
   await logEmployeeEvent(env,user,staffRole,"delete_employee",target,{username:employee.username,display_name:employee.display_name,role:employee.role});
   return reply({success:true});
  }
  if(body.action==="change_username"){
   const target=body.user_id,username=body.username;
   if(typeof target!=="string"||!/^[0-9a-f-]{36}$/i.test(target))return reply({error:"Select an employee"},400);
   if(target===user.id)return reply({error:"Changing your own login is not supported here"},400);
   if(typeof username!=="string"||!/^[a-z][a-z0-9._-]{2,31}$/.test(username))return reply({error:"Use 3–32 lowercase letters, numbers, dots, underscores or hyphens; start with a letter"},400);
   const targetUrl=SUPABASE+"/rest/v1/driver_profiles?select=id,username,role&id=eq."+encodeURIComponent(target)+"&limit=1";
   const targetRes=await fetch(targetUrl,{headers:serviceHeaders});
   if(!targetRes.ok)return reply({error:"Employee lookup failed"},502);
   const targetRows=await targetRes.json();if(!targetRows.length)return reply({error:"Employee not found"},404);
   if(staffRole!=="admin"&&targetRows[0].role!=="driver")return reply({error:"Dispatchers can only edit drivers"},403);
   const duplicates=await fetch(SUPABASE+"/rest/v1/driver_profiles?select=id&username=eq."+encodeURIComponent(username)+"&limit=1",{headers:serviceHeaders});
   if(!duplicates.ok)return reply({error:"Username check failed"},502);
   if((await duplicates.json()).some(p=>p.id!==target))return reply({error:"Username already in use"},409);
   const authUserRes=await fetch(SUPABASE+"/auth/v1/admin/users/"+encodeURIComponent(target),{headers:serviceHeaders});
   if(!authUserRes.ok)return reply({error:"Authentication account not found"},404);
   const authUser=await authUserRes.json();
   const oldEmail=authUser.email||"";
   if(!/^[a-z][a-z0-9._-]*@auth\.mexpress-mass\.com$/i.test(oldEmail))return reply({error:"This account does not use a managed username login. Contact administrator."},400);
   const nextEmail=username+"@auth.mexpress-mass.com";
   if(oldEmail.toLowerCase()===nextEmail.toLowerCase())return reply({success:true});
   const updateAuth=await fetch(SUPABASE+"/auth/v1/admin/users/"+encodeURIComponent(target),{method:"PUT",headers:{...serviceHeaders,"Content-Type":"application/json"},body:JSON.stringify({email:nextEmail,email_confirm:true})});
   if(!updateAuth.ok)return reply({error:"Could not update authentication login"},502);
   const updateProfile=await fetch(SUPABASE+"/rest/v1/driver_profiles?id=eq."+encodeURIComponent(target),{method:"PATCH",headers:{...serviceHeaders,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify({username})});
   if(!updateProfile.ok){
    await fetch(SUPABASE+"/auth/v1/admin/users/"+encodeURIComponent(target),{method:"PUT",headers:{...serviceHeaders,"Content-Type":"application/json"},body:JSON.stringify({email:oldEmail,email_confirm:true})});
    return reply({error:"Username update failed; login rollback attempted. Check employee before retrying."},502);
   }
   await logEmployeeEvent(env,user,staffRole,"change_username",target,{old_username:targetRows[0].username,new_username:username});
   return reply({success:true});
  }
  if(body.action!=="reset_password")return reply({error:"Unknown action"},400);
  const target=body.user_id,pass=body.password;
  if(typeof target!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target))return reply({error:"Select an employee"},400);
  if(target===user.id)return reply({error:"Use account recovery to change your own password"},400);
  if(typeof pass!=="string"||pass.length<12||pass.length>128)return reply({error:"Password must contain 12–128 characters"},400);
  const targetProfile=await fetch(SUPABASE+"/rest/v1/driver_profiles?select=id,role&id=eq."+encodeURIComponent(target)+"&limit=1",{headers:serviceHeaders});
  if(!targetProfile.ok)return reply({error:"Employee lookup failed"},502);
  const targetProfiles=await targetProfile.json();if(!targetProfiles.length)return reply({error:"Employee not found"},404);
  if(staffRole!=="admin"&&targetProfiles[0].role!=="driver")return reply({error:"Dispatchers can only edit drivers"},403);
  const changed=await fetch(SUPABASE+"/auth/v1/admin/users/"+encodeURIComponent(target),{method:"PUT",headers:{...serviceHeaders,"Content-Type":"application/json"},body:JSON.stringify({password:pass})});
  if(!changed.ok)return reply({error:"Password could not be updated"},502);
  await logEmployeeEvent(env,user,staffRole,"reset_password",target,{});
  return reply({success:true});
 }catch(e){return reply({error:"Unable to complete request"},500)}
}
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==="/api/dispatch/login")return staffLogin(request,env);
    if(url.pathname==="/api/dispatch/admin/employees")return employeeAdmin(request,env);
    if(url.pathname==="/api/ride-request"){
      if(request.method!=="POST") return new Response("Method not allowed",{status:405,headers:{Allow:"POST"}});
      return onRequestPost({request,env,ctx});
    }
    return env.ASSETS.fetch(request);
  }
};
