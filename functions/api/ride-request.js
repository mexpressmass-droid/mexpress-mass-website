// Cloudflare Pages Function: POST /api/ride-request
// Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as server-side environment variables.
// Keep the service role key out of browser code and GitHub.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
export async function onRequestPost({request,env}){
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY) return json({error:"Booking service is not configured"},503);
  const origin=request.headers.get("Origin");
  const allowed=new URL(request.url).origin;
  if(origin&&origin!==allowed) return json({error:"Origin not allowed"},403);
  const contentType=request.headers.get("content-type")||"";
  if(!contentType.includes("application/json")) return json({error:"JSON required"},415);
  let input;
  try {input=await request.json()} catch {return json({error:"Invalid JSON"},400)}
  if(input.website) return json({ok:true}); // honeypot
  const required=["passenger_name","passenger_phone","pickup_address","dropoff_address","ride_date","pickup_time"];
  if(required.some(k=>typeof input[k]!=="string"||!input[k].trim())) return json({error:"Missing required fields"},400);
  for(const k of required) if(input[k].length>500) return json({error:"Field too long"},400);
  if(input.notes&&String(input.notes).length>3000) return json({error:"Notes too long"},400);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.ride_date)||!/^\d{2}:\d{2}$/.test(input.pickup_time)) return json({error:"Invalid date or time"},400);
  // Massachusetts ride times: explicit offset avoids interpreting local pickup as UTC.
  // DST offset must be resolved by a timezone-aware service before production.
  const pickupAt=input.ride_date+"T"+input.pickup_time+":00-04:00";
  const tripTypes={ "One-way":"one_way","Round trip":"round_trip","Wait and return":"wait_and_return"};
  const record={passenger_name:input.passenger_name.trim(),passenger_phone:input.passenger_phone.trim(),passenger_email:input.passenger_email?.trim()||null,pickup_address:input.pickup_address.trim(),dropoff_address:input.dropoff_address.trim(),pickup_at:pickupAt,wheelchair_required:input.wheelchair==="Yes",trip_type:tripTypes[input.trip_type]||"one_way",notes:input.notes?.trim()||null,status:"pending",source:"website"};
  const endpoint=env.SUPABASE_URL.replace(/\/$/,"")+"/rest/v1/trips";
  let response;
  try {response=await fetch(endpoint,{method:"POST",headers:{"apikey":env.SUPABASE_SERVICE_ROLE_KEY,"Authorization":"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify(record)})} catch {return json({error:"Booking service unavailable"},502)}
  if(!response.ok) return json({error:"Unable to save request"},502);
  return json({ok:true},201);
}
