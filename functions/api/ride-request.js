// Cloudflare Pages Function: POST /api/ride-request
// Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as server-side environment variables.
// Keep the service role key out of browser code and GitHub.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
export async function onRequestPost({request,env}){
  if(!env.RESEND_API_KEY||!env.BOOKING_NOTIFICATION_FROM||!env.TURNSTILE_SECRET_KEY) return json({error:"Booking service is not configured"},503);
  const origin=request.headers.get("Origin");
  const allowed=new URL(request.url).origin;
  if(origin&&origin!==allowed) return json({error:"Origin not allowed"},403);
  const contentType=request.headers.get("content-type")||"";
  if(!contentType.includes("application/json")) return json({error:"JSON required"},415);
  let input;
  try {input=await request.json()} catch {return json({error:"Invalid JSON"},400)}
  if(input.website) return json({ok:true}); // honeypot
  if(typeof input.turnstile_token!=="string"||!input.turnstile_token) return json({error:"Verification required"},400);
  let verification;
  try {
    const body=new FormData();body.set("secret",env.TURNSTILE_SECRET_KEY);body.set("response",input.turnstile_token);
    body.set("remoteip",request.headers.get("CF-Connecting-IP")||"");
    const check=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body});
    verification=await check.json();
  } catch {return json({error:"Verification unavailable"},502)}
  if(!verification.success||verification.hostname!==new URL(request.url).hostname) return json({error:"Verification failed"},403);
  const required=["passenger_name","passenger_phone","pickup_address","dropoff_address","ride_date","pickup_time"];
  if(required.some(k=>typeof input[k]!=="string"||!input[k].trim())) return json({error:"Missing required fields"},400);
  for(const k of required) if(input[k].length>500) return json({error:"Field too long"},400);
  if(input.notes&&String(input.notes).length>3000) return json({error:"Notes too long"},400);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.ride_date)||!/^\d{2}:\d{2}$/.test(input.pickup_time)) return json({error:"Invalid date or time"},400);
  // Resolve America/New_York local time, including daylight saving time.
  const local=input.ride_date+"T"+input.pickup_time+":00";
  const [y,m,d]=input.ride_date.split("-").map(Number);
  const [hh,mm]=input.pickup_time.split(":").map(Number);
  const wall=Date.UTC(y,m-1,d,hh,mm);
  if(new Date(wall).toISOString().slice(0,16)!==local.slice(0,16)) return json({error:"Invalid date/time"},400);
  const zone="America/New_York";
  const fmt=new Intl.DateTimeFormat("en-US",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  const matches=[];
  for(const offset of [-5,-4]){
    const candidate=wall-offset*3600000;
    const parts=Object.fromEntries(fmt.formatToParts(new Date(candidate)).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
    if(+parts.year===y&&+parts.month===m&&+parts.day===d&&+parts.hour===hh&&+parts.minute===mm) matches.push(candidate);
  }
  if(matches.length!==1) return json({error:"Pickup time is invalid or ambiguous due to daylight saving time. Please contact dispatch."},400);
  const pickupAt=new Date(matches[0]).toISOString();
  const tripTypes={ "One-way":"one_way","Round trip":"round_trip","Wait and return":"wait_and_return"};
  // Email-first staging: no Supabase dependency. Avoid including medical notes or addresses in ordinary email.
  const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const details=[["Passenger",input.passenger_name],["Phone",input.passenger_phone],["Email",input.passenger_email],["Requested pickup (Boston time)",input.ride_date+" "+input.pickup_time],["Trip type",input.trip_type]];
  const html="<h2>New M Express ride request</h2><p>Contact the passenger to confirm pickup/drop-off details. Do not reply with medical details.</p><table>"+details.map(([k,v])=>"<tr><th align='left'>"+safe(k)+"</th><td>"+safe(v)+"</td></tr>").join("")+"</table>";
  let response;
  try {
    response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({from:env.BOOKING_NOTIFICATION_FROM,to:["mexpress.mass@gmail.com"],subject:"New M Express ride request",html})});
  } catch {return json({error:"Email service unavailable"},502)}
  if(!response.ok) return json({error:"Unable to email request"},502);
  return json({ok:true},200);
}
