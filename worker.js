// M Express booking endpoint. Keep RESEND_API_KEY in Cloudflare secrets only.
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname!=="/api/ride-request")return env.ASSETS.fetch(request);
  if(request.method!=="POST")return response({error:"Method not allowed"},405);
  if(!env.RESEND_API_KEY||!env.BOOKING_NOTIFICATION_FROM||!env.TURNSTILE_SECRET_KEY)return response({error:"Booking email is not configured",missing:["RESEND_API_KEY","BOOKING_NOTIFICATION_FROM","TURNSTILE_SECRET_KEY"].filter(key=>!env[key])},503);
  if(request.headers.get("Origin")!==url.origin)return response({error:"Invalid origin"},403);
  if(!(request.headers.get("content-type")||"").includes("application/json"))return response({error:"JSON required"},415);
  if(Number(request.headers.get("content-length")||0)>12000)return response({error:"Request too large"},413);
  let data;try{data=await request.json()}catch{return response({error:"Invalid request"},400)}
  if(!data||typeof data!=="object"||Array.isArray(data))return response({error:"Invalid request"},400);
  if(data.website)return response({ok:true});
  const keys=["passenger_name","passenger_phone","pickup_address","dropoff_address","ride_date","pickup_time"];
  if(keys.some(k=>typeof data[k]!=="string"||!data[k].trim()||data[k].length>350))return response({error:"Please complete required fields"},400);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(data.ride_date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.pickup_time))return response({error:"Invalid date/time"},400);
  if(typeof data.turnstile_token!=="string"||!data.turnstile_token)return response({error:"Security verification required"},400);
  const challenge=new FormData();challenge.set("secret",env.TURNSTILE_SECRET_KEY);challenge.set("response",data.turnstile_token);challenge.set("remoteip",request.headers.get("CF-Connecting-IP")||"");
  let check;try{const r=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:challenge});check=await r.json()}catch{return response({error:"Security verification unavailable"},502)}
  if(!check.success||check.hostname!==url.hostname)return response({error:"Security verification failed"},403);
  const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  // Include booking addresses, but no diagnoses, wheelchair details or free-text medical notes in regular email.
  const rows=[["Passenger",data.passenger_name],["Phone",data.passenger_phone],["Email",data.passenger_email],["Pickup address",data.pickup_address],["Drop-off address",data.dropoff_address],["Date",data.ride_date],["Time (Boston)",data.pickup_time],["Trip type",data.trip_type]];
  const html="<h2>New M Express booking request</h2><table>"+rows.map(([k,v])=>"<tr><th align='left'>"+safe(k)+"</th><td>"+safe(v)+"</td></tr>").join("")+"</table>";
  let sent;try{sent=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({from:env.BOOKING_NOTIFICATION_FROM,to:["mexpress.mass@gmail.com"],subject:"New M Express ride request",html})})}catch{return response({error:"Email service unavailable"},502)}
  if(!sent.ok)return response({error:"Email service rejected request"},502);
  return response({ok:true},200);
 }
};