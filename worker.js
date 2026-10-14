import { onRequestPost } from "./functions/api/ride-request.js";
const SUPABASE="https://mmdolkwclsctvwtxnqtc.supabase.co";
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
  if(rows[0]?.role!=="admin")return reply({error:"Administrator access required"},403);
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=="object")return reply({error:"Invalid request"},400);
  if(body.action==="list"){
   const result=await fetch(SUPABASE+"/rest/v1/driver_profiles?select=id,username,display_name,role&order=role.asc,username.asc",{headers:serviceHeaders});
   if(!result.ok)return reply({error:"Unable to load employees"},502);
   return reply({employees:await result.json()});
  }
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
  return reply({success:true});
 }catch(e){return reply({error:"Unable to complete request"},500)}
}
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==="/api/dispatch/admin/employees")return employeeAdmin(request,env);
    if(url.pathname==="/api/ride-request"){
      if(request.method!=="POST") return new Response("Method not allowed",{status:405,headers:{Allow:"POST"}});
      return onRequestPost({request,env,ctx});
    }
    return env.ASSETS.fetch(request);
  }
};
