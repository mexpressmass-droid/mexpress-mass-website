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
  const result=await fetch(SUPABASE+"/rest/v1/driver_profiles?select=id&username=eq."+encodeURIComponent(login)+"&limit=1",{headers:{"apikey":key,"Authorization":"Bearer "+key}});
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
  const r=await fetch(SUPABASE+"/rest/v1/employee_audit_log",{method:"POST",headers:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({actor_id:user.id,actor_role:role,action,target_id:target,details})});
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
  const profile=await fetch(SUPABASE+"/rest/v1/driver_profiles?select=role&id=eq."+encodeURIComponent(user.id)+"&limit=1",{headers:serviceHeaders});
  if(!profile.ok)return reply({error:"Authorization lookup failed"},502);
  const rows=await profile.json();
  const staffRole=rows[0]?.role;
  if(!["admin","dispatcher"].includes(staffRole))return reply({error:"Staff access required"},403);
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=="object")return reply({error:"Invalid request"},400);
  if(body.action==="list"){
   if(staffRole!=="admin")return reply({error:"Administrator access required"},403);
   const result=await fetch(SUPABASE+"/rest/v1/driver_profiles?select=id,username,display_name,role&order=role.asc,username.asc",{headers:serviceHeaders});
   if(!result.ok)return reply({error:"Unable to load employees"},502);
   return reply({employees:await result.json()});
  }
  if(body.action==="audit_log"){
   if(staffRole!=="admin")return reply({error:"Administrator access required"},403);
   const events=await fetch(SUPABASE+"/rest/v1/employee_audit_log?select=created_at,actor_id,actor_role,action,target_id,details&order=created_at.desc&limit=100",{headers:serviceHeaders});
   if(!events.ok)return reply({error:"Activity log table is not configured yet"},503);
   return reply({events:await events.json()});
  }
  if(body.action==="create_driver"){
   const username=body.username,displayName=body.display_name,password=body.password;
   if(typeof username!=="string"||!/^[a-z][a-z0-9._-]{2,31}$/.test(username))return reply({error:"Invalid username"},400);
   if(typeof displayName!=="string"||!displayName.trim()||displayName.length>100)return reply({error:"Invalid driver name"},400);
   if(typeof password!=="string"||password.length<12||password.length>128)return reply({error:"Password must contain 12–128 characters"},400);
   const existing=await fetch(SUPABASE+"/rest/v1/driver_profiles?select=id&username=eq."+encodeURIComponent(username)+"&limit=1",{headers:serviceHeaders});
   if(!existing.ok)return reply({error:"Username check failed"},502);
   if((await existing.json()).length)return reply({error:"Username already in use"},409);
   const created=await fetch(SUPABASE+"/auth/v1/admin/users",{method:"POST",headers:{...serviceHeaders,"Content-Type":"application/json"},body:JSON.stringify({email:username+"@auth.mexpress-mass.com",password,email_confirm:true})});
   if(!created.ok)return reply({error:"Could not create authentication account (username may be taken)"},502);
   const newUser=await created.json();
   const inserted=await fetch(SUPABASE+"/rest/v1/driver_profiles",{method:"POST",headers:{...serviceHeaders,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify({id:newUser.id,username,display_name:displayName.trim(),role:"driver"})});
   if(!inserted.ok){
    await fetch(SUPABASE+"/auth/v1/admin/users/"+encodeURIComponent(newUser.id),{method:"DELETE",headers:serviceHeaders});
    return reply({error:"Could not create driver profile; authentication account cleanup attempted"},502);
   }
   await logEmployeeEvent(env,user,staffRole,"create_driver",newUser.id,{username,display_name:displayName.trim()});
   return reply({success:true,user_id:newUser.id});
  }
  if(staffRole!=="admin")return reply({error:"Administrator access required"},403);
  if(body.action==="change_username"){
   const target=body.user_id,username=body.username;
   if(typeof target!=="string"||!/^[0-9a-f-]{36}$/i.test(target))return reply({error:"Select an employee"},400);
   if(target===user.id)return reply({error:"Changing your own login is not supported here"},400);
   if(typeof username!=="string"||!/^[a-z][a-z0-9._-]{2,31}$/.test(username))return reply({error:"Use 3–32 lowercase letters, numbers, dots, underscores or hyphens; start with a letter"},400);
   const targetUrl=SUPABASE+"/rest/v1/driver_profiles?select=id,username&id=eq."+encodeURIComponent(target)+"&limit=1";
   const targetRes=await fetch(targetUrl,{headers:serviceHeaders});
   if(!targetRes.ok)return reply({error:"Employee lookup failed"},502);
   const targetRows=await targetRes.json();if(!targetRows.length)return reply({error:"Employee not found"},404);
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
  const targetProfile=await fetch(SUPABASE+"/rest/v1/driver_profiles?select=id&id=eq."+encodeURIComponent(target)+"&limit=1",{headers:serviceHeaders});
  if(!targetProfile.ok||!(await targetProfile.json()).length)return reply({error:"Employee not found"},404);
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
