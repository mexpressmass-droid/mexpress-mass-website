// Browser only receives the Supabase publishable key; service-role credentials stay in Cloudflare.
const BASE="https://mmdolkwclsctvwtxnqtc.supabase.co";
const KEY="sb_publishable_Ha7bHx3pq6b342tU_VNnTw_a0hefysO";
let token=null,drivers=[],refreshing=false,userId=null;
const $=id=>document.getElementById(id);
const msg=(s,bad=false)=>{const el=$("notice");el.textContent=s;el.className=bad?"error":"success"};
async function api(path,opts={}){const r=await fetch(BASE+path,{...opts,headers:{"apikey":KEY,...(token?{"Authorization":"Bearer "+token}:{}),...(opts.body?{"Content-Type":"application/json"}:{}),...(opts.headers||{})},cache:"no-store"});if(!r.ok){let info;try{info=await r.json()}catch{}throw Error(info?.message||info?.error_description||info?.error||"Request failed ("+r.status+")")}if(r.status===204)return null;return r.json()}
function el(tag,txt){const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;return e}
function td(row,child){const cell=el("td");cell.append(child);row.append(cell);return cell}
function select(options,value){const s=el("select");for(const [v,label] of options){const o=el("option",label);o.value=v;s.append(o)}s.value=value||"";return s}
function reset(){token=null;userId=null;drivers=[];$("dashboard").classList.add("hidden");$("logout").classList.add("hidden");$("login-panel").classList.remove("hidden");$("password").value="";$("trips").replaceChildren()}
$("login-form").addEventListener("submit",async e=>{e.preventDefault();$("login-error").textContent="";$("login-button").disabled=true;try{const r=await api("/auth/v1/token?grant_type=password",{method:"POST",body:JSON.stringify({email:$("email").value.trim(),password:$("password").value})});token=r.access_token;userId=r.user.id;const profile=await api("/rest/v1/driver_profiles?select=role&id=eq."+encodeURIComponent(r.user.id));if(!["admin","dispatcher"].includes(profile[0]?.role))throw Error("This account is not authorized for dispatch.");$("login-panel").classList.add("hidden");$("dashboard").classList.remove("hidden");$("logout").classList.remove("hidden");$("password").value="";await load()}catch(err){reset();$("login-error").textContent=err.message}finally{$("login-button").disabled=false}});
$("logout").addEventListener("click",reset);$("refresh").addEventListener("click",load);
$("refresh-my-rides").addEventListener("click",loadMyRides);
for(const [tab,panel,other] of [["tab-dispatch","dispatch-panel","my-rides-panel"],["tab-my-rides","my-rides-panel","dispatch-panel"]]){
  $(tab).addEventListener("click",()=>{$(panel).classList.remove("hidden");$(other).classList.add("hidden");$("tab-dispatch").classList.toggle("active",tab==="tab-dispatch");$("tab-my-rides").classList.toggle("active",tab==="tab-my-rides");if(tab==="tab-my-rides")loadMyRides()});
}
async function loadMyRides(){
  const note=$("my-rides-notice"),list=$("my-rides-list");
  note.textContent="Loading...";
  try{
    const trips=await api("/rest/v1/rpc/dispatch_get_trips",{method:"POST",body:"{}"});
    const mine=trips.filter(t=>t.assigned_driver_id===userId).sort((a,b)=>new Date(a.pickup_at)-new Date(b.pickup_at));
    list.replaceChildren();
    for(const trip of mine){
      const card=el("article");card.className="ride-card";
      card.append(el("h3",trip.passenger_name),el("p","Pickup: "+new Date(trip.pickup_at).toLocaleString("en-US",{timeZone:"America/New_York",dateStyle:"medium",timeStyle:"short"})),el("p","Phone: "+(trip.passenger_phone||"Not provided")),el("p","From: "+trip.pickup_address),el("p","To: "+trip.dropoff_address),el("p","Status: "+trip.status.replaceAll("_"," ")));
      if(trip.notes)card.append(el("p","Driver notes: "+trip.notes));
      for(const [label,address] of [["Pickup map",trip.pickup_address],["Drop-off map",trip.dropoff_address]]){
        const link=el("a",label);link.href="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(address);link.target="_blank";link.rel="noopener noreferrer";card.append(link,document.createTextNode("  "));
      }
      const steps=["assigned","on_the_way","arrived","boarded","completed"],i=steps.indexOf(trip.status);
      if(i>=0&&i<steps.length-1){
        const next=steps[i+1],button=el("button","Mark "+next.replaceAll("_"," "));
        button.addEventListener("click",async()=>{button.disabled=true;try{await api("/rest/v1/rpc/driver_update_trip_status",{method:"POST",body:JSON.stringify({p_trip_id:trip.id,p_new_status:next})});await loadMyRides()}catch(e){note.textContent=e.message;button.disabled=false}});
        card.append(button);
      }
      list.append(card);
    }
    note.textContent=mine.length+" ride(s) assigned to you.";
  }catch(e){note.textContent=e.message}
}
async function load(){if(refreshing)return;refreshing=true;msg("Loading...");try{drivers=await api("/rest/v1/driver_profiles?select=id,username,display_name,role&role=in.(admin,dispatcher,driver)&order=display_name.asc");const trips=(await api("/rest/v1/rpc/dispatch_get_trips",{method:"POST",body:"{}"})).sort((a,b)=>new Date(b.pickup_at)-new Date(a.pickup_at)).slice(0,200);const body=$("trips");body.replaceChildren();for(const trip of trips){const row=el("tr");const date=el("span",new Date(trip.pickup_at).toLocaleString("en-US",{timeZone:"America/New_York",dateStyle:"medium",timeStyle:"short"}));td(row,date);const passenger=el("div");passenger.append(el("strong",trip.passenger_name),el("small",trip.passenger_phone));if(trip.passenger_email)passenger.append(el("small",trip.passenger_email));td(row,passenger);const route=el("div");route.append(el("div",trip.pickup_address),el("small","→ "+trip.dropoff_address));td(row,route);const details=el("div",trip.trip_type.replaceAll("_"," "));details.append(el("small",trip.wheelchair_required?"Wheelchair":"No wheelchair"));if(trip.notes)details.append(el("small",trip.notes));td(row,details);
const statuses=["pending","confirmed","assigned","on_the_way","arrived","boarded","completed","cancelled"];const status=select([...new Set([trip.status,...statuses])].map(v=>[v,v.replaceAll("_"," ")]),trip.status);td(row,status);
const price=el("input");price.type="number";price.min="0";price.step="0.01";price.value=trip.price_cents==null?"":(trip.price_cents/100).toFixed(2);price.placeholder="Not set";td(row,price);
const driver=select([["","Unassigned"],...drivers.map(d=>[d.id,d.display_name+" ("+d.role+", "+d.username+")"])],trip.assigned_driver_id||"");td(row,driver);
const save=el("button","Save");save.addEventListener("click",async()=>{save.disabled=true;try{const cents=price.value.trim()===""?null:Math.round(Number(price.value)*100);if(cents!==null&&(!Number.isSafeInteger(cents)||cents<0))throw Error("Invalid price");await api("/rest/v1/trips?id=eq."+encodeURIComponent(trip.id),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({status:status.value,price_cents:cents,assigned_driver_id:driver.value||null,updated_at:new Date().toISOString()})});msg("Ride updated.");}catch(err){msg(err.message,true)}finally{save.disabled=false}});td(row,save);body.append(row)}msg(trips.length+" ride(s) loaded.");}catch(err){msg(err.message,true)}finally{refreshing=false}}
