// Browser only receives the Supabase publishable key; service-role credentials stay in Cloudflare.
const BASE="https://mmdolkwclsctvwtxnqtc.supabase.co";
const KEY="sb_publishable_Ha7bHx3pq6b342tU_VNnTw_a0hefysO";
let token=null,drivers=[],refreshing=false,userId=null,myRidesTab="active",selectedTripIds=new Set(),visibleTripIds=[];
const $=id=>document.getElementById(id);
const msg=(s,bad=false)=>{const el=$("notice");el.textContent=s;el.className=bad?"error":"success"};
async function api(path,opts={}){const r=await fetch(BASE+path,{...opts,headers:{"apikey":KEY,...(token?{"Authorization":"Bearer "+token}:{}),...(opts.body?{"Content-Type":"application/json"}:{}),...(opts.headers||{})},cache:"no-store"});if(!r.ok){let info;try{info=await r.json()}catch{}throw Error(info?.message||info?.error_description||info?.error||"Request failed ("+r.status+")")}if(r.status===204)return null;return r.json()}
function el(tag,txt){const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;return e}
function td(row,child){const cell=el("td");cell.append(child);row.append(cell);return cell}
function select(options,value){const s=el("select");for(const [v,label] of options){const o=el("option",label);o.value=v;s.append(o)}s.value=value||"";return s}
function reset(){selectedTripIds.clear();token=null;userId=null;drivers=[];$("dashboard").classList.add("hidden");$("logout").classList.add("hidden");$("login-panel").classList.remove("hidden");$("password").value="";$("trips").replaceChildren()}
$("login-form").addEventListener("submit",async e=>{e.preventDefault();$("login-error").textContent="";$("login-button").disabled=true;try{const r=await api("/auth/v1/token?grant_type=password",{method:"POST",body:JSON.stringify({email:$("email").value.trim(),password:$("password").value})});token=r.access_token;userId=r.user.id;const profile=await api("/rest/v1/driver_profiles?select=role&id=eq."+encodeURIComponent(r.user.id));if(!["admin","dispatcher"].includes(profile[0]?.role))throw Error("This account is not authorized for dispatch.");$("login-panel").classList.add("hidden");$("dashboard").classList.remove("hidden");$("logout").classList.remove("hidden");$("password").value="";await load()}catch(err){reset();$("login-error").textContent=err.message}finally{$("login-button").disabled=false}});
$("logout").addEventListener("click",reset);$("refresh").addEventListener("click",load);
$("refresh-my-rides").addEventListener("click",loadMyRides);
for(const id of ["dispatch-range","dispatch-date"])$(id).addEventListener("change",()=>{selectedTripIds.clear();load()});
for(const [id,tab] of [["my-active","active"],["my-history","history"]])$(id).addEventListener("click",()=>{myRidesTab=tab;$("my-active").classList.toggle("active",tab==="active");$("my-history").classList.toggle("active",tab==="history");loadMyRides()});
function bostonDate(value){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value))}
function addDays(date,days){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function visibleTrip(t){const range=$("dispatch-range").value,day=$("dispatch-date").value,date=bostonDate(t.pickup_at);return range==="all"||!day||(range==="day"?date===day:date>=day&&date<addDays(day,7))}
function tripColor(status){return status==="pending"?"ride-pending":status==="completed"?"ride-completed":status==="cancelled"?"ride-cancelled":""}
$("dispatch-date").value=bostonDate(new Date());
function updateSelection(){const count=selectedTripIds.size;$("bulk-count").textContent=count+" selected";$("bulk-apply").disabled=count===0;$("bulk-clear").disabled=count===0;const all=visibleTripIds.length>0&&visibleTripIds.every(id=>selectedTripIds.has(id));$("bulk-all").checked=all;$("bulk-all").indeterminate=!all&&visibleTripIds.some(id=>selectedTripIds.has(id))}
$("bulk-all").addEventListener("change",e=>{for(const id of visibleTripIds){if(e.target.checked)selectedTripIds.add(id);else selectedTripIds.delete(id)}for(const input of document.querySelectorAll(".trip-select"))input.checked=selectedTripIds.has(input.value);updateSelection()});
$("bulk-clear").addEventListener("click",()=>{selectedTripIds.clear();for(const input of document.querySelectorAll(".trip-select"))input.checked=false;updateSelection()});
$("bulk-apply").addEventListener("click",async()=>{const ids=[...selectedTripIds],status=$("bulk-status").value;if(!ids.length)return;const labels={pending:"Pending",completed:"Completed",cancelled:"Cancelled"};if(!labels[status])return;const warning=status==="cancelled"?" This will cancel the selected rides.":status==="completed"?" This will mark the selected rides completed.":"";if(!confirm("Change "+ids.length+" selected ride(s) to "+labels[status]+"?"+warning))return;const button=$("bulk-apply");button.disabled=true;let success=0;const errors=[];for(const id of ids){try{await api("/rest/v1/trips?id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({status,updated_at:new Date().toISOString()})});success++;selectedTripIds.delete(id)}catch(e){errors.push(e.message)}}await load();msg(success+" ride(s) updated."+(errors.length?" "+errors.length+" failed: "+errors[0]:""),errors.length>0);updateSelection()});


for(const [tab,panel,other] of [["tab-dispatch","dispatch-panel","my-rides-panel"],["tab-my-rides","my-rides-panel","dispatch-panel"]]){
  $(tab).addEventListener("click",()=>{$(panel).classList.remove("hidden");$(other).classList.add("hidden");$("tab-dispatch").classList.toggle("active",tab==="tab-dispatch");$("tab-my-rides").classList.toggle("active",tab==="tab-my-rides");if(tab==="tab-my-rides")loadMyRides()});
}
async function loadMyRides(){
  const note=$("my-rides-notice"),list=$("my-rides-list");
  note.textContent="Loading...";
  try{
    const trips=await api("/rest/v1/rpc/dispatch_get_trips",{method:"POST",body:"{}"});
    const mine=trips.filter(t=>t.assigned_driver_id===userId&&(["completed","cancelled"].includes(t.status)===(myRidesTab==="history"))).sort((a,b)=>myRidesTab==="history"?new Date(b.pickup_at)-new Date(a.pickup_at):new Date(a.pickup_at)-new Date(b.pickup_at));
    list.replaceChildren();
    for(const trip of mine){
      const card=el("article");card.className="ride-card "+tripColor(trip.status);
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
    note.textContent=mine.length+(myRidesTab==="history"?" ride(s) in history.":" active ride(s) assigned to you.");
  }catch(e){note.textContent=e.message}
}
async function load(){if(refreshing)return;refreshing=true;msg("Loading...");try{drivers=await api("/rest/v1/driver_profiles?select=id,username,display_name,role&role=in.(admin,dispatcher,driver)&order=display_name.asc");const trips=(await api("/rest/v1/rpc/dispatch_get_trips",{method:"POST",body:"{}"})).filter(visibleTrip).sort((a,b)=>new Date(a.pickup_at)-new Date(b.pickup_at)).slice(0,200);const body=$("trips");body.replaceChildren();visibleTripIds=trips.map(t=>t.id);for(const id of [...selectedTripIds])if(!visibleTripIds.includes(id))selectedTripIds.delete(id);for(const trip of trips){const row=el("tr");row.className=tripColor(trip.status);const check=el("input");check.type="checkbox";check.className="trip-select";check.value=trip.id;check.checked=selectedTripIds.has(trip.id);check.setAttribute("aria-label","Select ride for "+trip.passenger_name);check.addEventListener("change",()=>{if(check.checked)selectedTripIds.add(trip.id);else selectedTripIds.delete(trip.id);updateSelection()});td(row,check);const date=el("span",new Date(trip.pickup_at).toLocaleString("en-US",{timeZone:"America/New_York",dateStyle:"medium",timeStyle:"short"}));td(row,date);const passenger=el("div");passenger.append(el("strong",trip.passenger_name),el("small",trip.passenger_phone));if(trip.passenger_email)passenger.append(el("small",trip.passenger_email));td(row,passenger);const route=el("div");route.append(el("div",trip.pickup_address),el("small","→ "+trip.dropoff_address));td(row,route);const details=el("div",trip.trip_type.replaceAll("_"," "));details.append(el("small",trip.wheelchair_required?"Wheelchair":"No wheelchair"));if(trip.notes)details.append(el("small",trip.notes));td(row,details);
const statuses=["pending","confirmed","assigned","on_the_way","arrived","boarded","completed","cancelled"];const status=select([...new Set([trip.status,...statuses])].map(v=>[v,v.replaceAll("_"," ")]),trip.status);td(row,status);
const price=el("input");price.type="number";price.min="0";price.step="0.01";price.value=trip.price_cents==null?"":(trip.price_cents/100).toFixed(2);price.placeholder="Not set";td(row,price);
const driver=select([["","Unassigned"],...drivers.map(d=>[d.id,d.display_name+" ("+d.role+", "+d.username+")"])],trip.assigned_driver_id||"");td(row,driver);
const save=el("button","Save");save.addEventListener("click",async()=>{save.disabled=true;try{const cents=price.value.trim()===""?null:Math.round(Number(price.value)*100);if(cents!==null&&(!Number.isSafeInteger(cents)||cents<0))throw Error("Invalid price");await api("/rest/v1/trips?id=eq."+encodeURIComponent(trip.id),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({status:status.value,price_cents:cents,assigned_driver_id:driver.value||null,updated_at:new Date().toISOString()})});msg("Ride updated.");}catch(err){msg(err.message,true)}finally{save.disabled=false}});td(row,save);body.append(row)}updateSelection();msg(trips.length+" ride(s) in selected view.");}catch(err){msg(err.message,true)}finally{refreshing=false}}
