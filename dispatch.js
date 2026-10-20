// Browser only receives the Supabase publishable key; service-role credentials stay in Cloudflare.
const BASE="https://mmdolkwclsctvwtxnqtc.supabase.co";
const KEY="sb_publishable_Ha7bHx3pq6b342tU_VNnTw_a0hefysO";
let employeeList=[],staffRole=null,token=null,drivers=[],allDriverProfiles=[],refreshing=false,userId=null,myRidesTab="active",selectedTripIds=new Set(),visibleTripIds=[],visibleTripStatuses=new Map();
const $=id=>document.getElementById(id);
const msg=(s,bad=false)=>{const el=$("notice");el.textContent=s;el.className=bad?"error":"success"};
async function api(path,opts={}){const r=await fetch(BASE+path,{...opts,headers:{"apikey":KEY,...(token?{"Authorization":"Bearer "+token}:{}),...(opts.body?{"Content-Type":"application/json"}:{}),...(opts.headers||{})},cache:"no-store"});if(!r.ok){let info;try{info=await r.json()}catch{}throw Error(info?.message||info?.error_description||info?.error||"Request failed ("+r.status+")")}if(r.status===204)return null;const raw=await r.text();if(!raw.trim())return null;try{return JSON.parse(raw)}catch{throw Error("Invalid server response (HTTP "+r.status+")")}}
function el(tag,txt){const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;return e}
function td(row,child){const cell=el("td");cell.append(child);row.append(cell);return cell}
function select(options,value){const s=el("select");for(const [v,label] of options){const o=el("option",label);o.value=v;s.append(o)}s.value=value||"";return s}
const SESSION_KEY="mexpress_dispatch_test_session";
const VIEW_KEY="mexpress_dispatch_test_view";
let restoringView=false;
function saveView(){
 if(!userId||restoringView)return;
 const tab=!$("archive-panel").classList.contains("hidden")?"archive":!$("employees-panel").classList.contains("hidden")?"employees":!$("messages-panel").classList.contains("hidden")?"messages":!$("my-rides-panel").classList.contains("hidden")?"my-rides":"dispatch";
 localStorage.setItem(VIEW_KEY,JSON.stringify({user_id:userId,tab,chat_id:currentChatId,chat_employee:$("chat-employee").value,range:$("dispatch-range").value,date:$("dispatch-date").value,my_rides_tab:myRidesTab}));
}
async function restoreView(){
 let saved;try{saved=JSON.parse(localStorage.getItem(VIEW_KEY)||"null")}catch{return}
 if(!saved||saved.user_id!==userId)return;
 restoringView=true;
 try{
  if(["all","day","week"].includes(saved.range))$("dispatch-range").value=saved.range;
  if(/^\d{4}-\d{2}-\d{2}$/.test(saved.date||""))$("dispatch-date").value=saved.date;
  if(["active","history"].includes(saved.my_rides_tab)){myRidesTab=saved.my_rides_tab;$("my-active").classList.toggle("active",myRidesTab==="active");$("my-history").classList.toggle("active",myRidesTab==="history")}
  if(saved.tab==="archive"&&staffRole!=="driver"){$("tab-archive").click()}else if(saved.tab==="employees"&&["admin","dispatcher"].includes(staffRole)){$("tab-employees").click()}
  else if(saved.tab==="my-rides"&&staffRole==="driver"){$("tab-my-rides").click()}
  else if(saved.tab==="messages"){
   $("tab-messages").click();
   await loadChatDirectory();
   if(saved.chat_id&&saved.chat_employee){
    const person=Array.from($("chat-employee").options).find(o=>o.value===saved.chat_employee);
    if(person){
     $("chat-employee").value=saved.chat_employee;
     try{
      const id=await api("/rest/v1/rpc/open_private_chat",{method:"POST",body:JSON.stringify({p_other_user_id:saved.chat_employee})});
      if(id===saved.chat_id){currentChatId=id;chatRenderedId=null;chatLastMessageId=null;chatLatestTimestamp=null;chatOtherReadAt=null;$("chat-form").classList.remove("hidden");await loadChatMessages()}
     }catch(e){chatNotice(e.message,true)}
    }
   }
  }else $("tab-dispatch").click();
 }finally{restoringView=false}
}

let sessionRefreshTimer=null,refreshToken=null,sessionExpiresAt=0;
function storeSession(auth){token=auth.access_token;refreshToken=auth.refresh_token;userId=auth.user?.id||userId;sessionExpiresAt=Date.now()+(Number(auth.expires_in)||3600)*1000;localStorage.setItem(SESSION_KEY,JSON.stringify({access_token:token,refresh_token:refreshToken,user_id:userId,expires_at:sessionExpiresAt}));scheduleSessionRefresh()}
function scheduleSessionRefresh(){if(sessionRefreshTimer)clearTimeout(sessionRefreshTimer);sessionRefreshTimer=setTimeout(()=>refreshSession().catch(()=>reset()),Math.max(1000,sessionExpiresAt-Date.now()-120000))}
async function refreshSession(){if(!refreshToken)throw Error("Session expired");const auth=await api("/auth/v1/token?grant_type=refresh_token",{method:"POST",body:JSON.stringify({refresh_token:refreshToken})});storeSession(auth);return auth}
async function verifyStaff(){const profile=await api("/rest/v1/driver_profiles?select=role&id=eq."+encodeURIComponent(userId));if(!["admin","dispatcher","driver"].includes(profile[0]?.role))throw Error("This account is not authorized for M Express.");staffRole=profile[0].role;$("tab-archive").classList.toggle("hidden",staffRole==="driver");$("tab-my-rides").classList.toggle("hidden",staffRole!=="driver");$("seed-demo-100-rides").classList.toggle("hidden",staffRole!=="admin");$("tab-dispatch").classList.toggle("hidden",staffRole==="driver");$("dispatch-panel").classList.toggle("hidden",staffRole==="driver");$("tab-employees").classList.toggle("hidden",!["admin","dispatcher"].includes(staffRole));$("employee-admin-tools").classList.toggle("hidden",staffRole!=="admin");$("create-role").value="driver";$("create-role").querySelector('option[value="dispatcher"]').hidden=staffRole!=="admin"}
function showDashboard(){$("login-panel").classList.add("hidden");$("dashboard").classList.remove("hidden");$("logout").classList.remove("hidden");$("password").value=""}
async function restoreSession(){try{const saved=JSON.parse(localStorage.getItem(SESSION_KEY)||"null");if(!saved?.refresh_token||!saved?.user_id)return;token=saved.access_token;refreshToken=saved.refresh_token;userId=saved.user_id;sessionExpiresAt=saved.expires_at||0;if(Date.now()>sessionExpiresAt-120000)await refreshSession();else scheduleSessionRefresh();await verifyStaff();showDashboard();if(staffRole==="driver"){$("tab-my-rides").click();await loadMyRides()}else{await restoreView();await load()}}catch(e){reset()}}
function reset(){closeAttachMenu();$("password").type="password";$("toggle-password").textContent="Show";$("toggle-password").setAttribute("aria-label","Show password");$("toggle-password").setAttribute("aria-pressed","false");clearChatImages();closeChatLightbox();selectedChatFile=null;$("chat-file").value="";$("chat-camera-file").value="";$("chat-file-name").textContent="";if(sessionRefreshTimer)clearTimeout(sessionRefreshTimer);sessionRefreshTimer=null;localStorage.removeItem(SESSION_KEY);localStorage.removeItem(VIEW_KEY);refreshToken=null;sessionExpiresAt=0;if(chatPoll)clearInterval(chatPoll);chatPoll=null;currentChatId=null;chatRenderedId=null;chatLastMessageId=null;$("chat-form").classList.add("hidden");$("chat-thread").replaceChildren();selectedTripIds.clear();staffRole=null;token=null;userId=null;drivers=[];allDriverProfiles=[];$("tab-employees").classList.add("hidden");$("employees-panel").classList.add("hidden");$("dashboard").classList.add("hidden");$("logout").classList.add("hidden");$("login-panel").classList.remove("hidden");$("password").value="";$("trips").replaceChildren()}
$("login-form").addEventListener("submit",async e=>{e.preventDefault();$("login-error").textContent="";$("login-button").disabled=true;try{const response=await fetch("/api/dispatch/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({login:$("email").value.trim(),password:$("password").value})});const r=await response.json();if(!response.ok)throw Error(r.error||"Login failed");storeSession(r);await verifyStaff();showDashboard();localStorage.removeItem(VIEW_KEY);if(staffRole==="driver"){$("tab-my-rides").click();await loadMyRides()}else await load()}catch(err){reset();$("login-error").textContent=err.message}finally{$("login-button").disabled=false}});
$("toggle-password").addEventListener("click",()=>{const input=$("password"),visible=input.type==="password";input.type=visible?"text":"password";$("toggle-password").textContent=visible?"Hide":"Show";$("toggle-password").setAttribute("aria-label",visible?"Hide password":"Show password");$("toggle-password").setAttribute("aria-pressed",String(visible))});
$("logout").addEventListener("click",()=>{if(!confirmLeaveDispatch())return;const oldToken=token;reset();if(oldToken)fetch(BASE+"/auth/v1/logout",{method:"POST",headers:{"apikey":KEY,"Authorization":"Bearer "+oldToken}}).catch(()=>{})});$("refresh").addEventListener("click",load);
$("refresh-my-rides").addEventListener("click",loadMyRides);
for(const id of ["dispatch-range","dispatch-date"])$(id).addEventListener("change",()=>{selectedTripIds.clear();saveView();load()});
for(const [id,tab] of [["my-active","active"],["my-history","history"]])$(id).addEventListener("click",()=>{myRidesTab=tab;$("my-active").classList.toggle("active",tab==="active");$("my-history").classList.toggle("active",tab==="history");loadMyRides();saveView()});
function bostonDate(value){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value))}
function addDays(date,days){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function visibleTrip(t){const selectedStatus=$("dispatch-status-filter")?.value||"";if(selectedStatus&&t.status!==selectedStatus)return false;const query=($("dispatch-search")?.value||"").trim().toLocaleLowerCase();if(query){const assignedProfile=allDriverProfiles.find(profile=>profile.id===t.assigned_driver_id);const fields=[t.id,t.passenger_name,t.passenger_phone,t.passenger_email,t.pickup_address,t.dropoff_address,t.notes,t.internal_notes,t.status,assignedProfile?.display_name,assignedProfile?.username].map(value=>String(value??"").toLocaleLowerCase());const digits=query.replace(/\D/g,"");if(!fields.some(value=>value.includes(query))&&!(digits.length>=3&&String(t.passenger_phone||"").replace(/\D/g,"").includes(digits)))return false;}const driver=$("schedule-driver")?.value||"";if(driver&&((driver==="unassigned"&&t.assigned_driver_id)||(driver!=="unassigned"&&t.assigned_driver_id!==driver)))return false;const range=$("dispatch-range").value,day=$("dispatch-date").value,date=bostonDate(t.pickup_at);return range==="all"||!day||(range==="day"?date===day:date>=day&&date<addDays(day,7))}
function compareDispatchRides(a,b){
 const mode=$("dispatch-sort").value,ta=new Date(a.pickup_at).getTime(),tb=new Date(b.pickup_at).getTime();
 const asc=ta-tb,desc=tb-ta;
 if(mode==="date_asc")return asc||String(a.id).localeCompare(String(b.id));
 if(mode==="date_desc")return desc||String(a.id).localeCompare(String(b.id));
 if(mode==="status"){const order=["pending","confirmed","assigned","on_the_way","arrived","boarded","completed","cancelled"];return order.indexOf(a.status)-order.indexOf(b.status)||asc}
 if(mode==="price_asc"||mode==="price_desc"){const ap=a.price_cents,bp=b.price_cents;if(ap==null&&bp!=null)return 1;if(bp==null&&ap!=null)return -1;return (mode==="price_asc"?(ap||0)-(bp||0):(bp||0)-(ap||0))||asc}
 const now=Date.now(),aPriority=a.status==="pending"&&ta>=now?0:1,bPriority=b.status==="pending"&&tb>=now?0:1;
 return aPriority-bPriority||asc||String(a.id).localeCompare(String(b.id));
}
function tripColor(status){const classes={pending:"ride-pending",confirmed:"ride-confirmed",assigned:"ride-assigned",on_the_way:"ride-assigned",arrived:"ride-assigned",boarded:"ride-assigned",completed:"ride-completed",cancelled:"ride-cancelled"};return classes[status]||""}
$("dispatch-date").value=bostonDate(new Date());
$("dispatch-sort").addEventListener("change",()=>{selectedTripIds.clear();load()});
$("schedule-driver").addEventListener("change",()=>{selectedTripIds.clear();load()});$("dispatch-status-filter").addEventListener("change",()=>{selectedTripIds.clear();load()});
let rideSearchDelay=null;$("dispatch-search").addEventListener("input",()=>{clearTimeout(rideSearchDelay);rideSearchDelay=setTimeout(()=>{selectedTripIds.clear();load()},300)});$("dispatch-search-clear").addEventListener("click",()=>{$("dispatch-search").value="";selectedTripIds.clear();load();$("dispatch-search").focus()});
// Bulk choices are only a preview until Apply is confirmed. Never mutate ride editors.
function previewSelectedChanges(kind,value){
 for(const row of $("trips").querySelectorAll("tr")){
  const check=row.querySelector(".trip-select");
  row.classList.toggle("ride-preview",Boolean(check&&selectedTripIds.has(check.value)&&($("bulk-status").value||$("bulk-driver").value)));
 }
}
$("bulk-status").addEventListener("change",()=>previewSelectedChanges("status",$("bulk-status").value));
$("bulk-driver").addEventListener("change",()=>previewSelectedChanges("driver",$("bulk-driver").value));
function chooseRide(id,additive,toggle=false){
 const already=selectedTripIds.has(id);
 if(!additive)selectedTripIds.clear();
 // A second click on the same selected ride deselects it, even without Ctrl.
 if(!(toggle&&already))selectedTripIds.add(id);
 updateSelection();
}
function updateSelection(){for(const row of $("trips").querySelectorAll("tr")){const box=row.querySelector(".trip-select");if(!box)continue;const active=selectedTripIds.has(box.value);box.checked=active;row.classList.toggle("ride-selected",active)}
 const rows=[...$("trips").querySelectorAll("tr")];
 for(let i=0;i<rows.length;i++){
  const current=rows[i].classList.contains("ride-selected");
  rows[i].classList.toggle("ride-group-start",current&&(i===0||!rows[i-1].classList.contains("ride-selected")));
  rows[i].classList.toggle("ride-group-middle",current&&i>0&&rows[i-1].classList.contains("ride-selected")&&i<rows.length-1&&rows[i+1].classList.contains("ride-selected"));
  rows[i].classList.toggle("ride-group-end",current&&(i===rows.length-1||!rows[i+1].classList.contains("ride-selected")));
 }for(const option of $("bulk-status").options)if(option.value==="delete")option.hidden=staffRole!=="admin";const pendingSelected=[...selectedTripIds].some(id=>visibleTripStatuses.get(id)==="pending")||[...document.querySelectorAll(".trip-select:checked")].some(input=>visibleTripStatuses.get(input.value)==="pending");const bulkDriver=$("bulk-driver");bulkDriver.disabled=selectedTripIds.size===0||pendingSelected;bulkDriver.title=pendingSelected?"One or more selected rides are Pending. Confirm all Pending rides first.":selectedTripIds.size===0?"Select rides first.":"";if(bulkDriver.disabled)bulkDriver.value="";for(const option of bulkDriver.options){if(option.value)option.disabled=bulkDriver.disabled}for(const row of $("trips").querySelectorAll("tr")){const check=row.querySelector(".trip-select");if(check&&!selectedTripIds.has(check.value))row.classList.remove("ride-preview")}const count=selectedTripIds.size;document.querySelector("#dispatch-panel .bulk-toolbar")?.classList.toggle("has-selection",count>0);$("bulk-count").textContent=count+" selected";$("bulk-apply").disabled=count===0;$("bulk-clear").disabled=count===0;const all=visibleTripIds.length>0&&visibleTripIds.every(id=>selectedTripIds.has(id));$("bulk-all").checked=all;$("bulk-all").indeterminate=!all&&visibleTripIds.some(id=>selectedTripIds.has(id));$("mobile-bulk-all").checked=all;$("mobile-bulk-all").indeterminate=!all&&visibleTripIds.some(id=>selectedTripIds.has(id))}
// Explorer-style rubber-band selection, only from blank table-cell space.
let rideDrag=null;
const dragSurface=$("trips");
dragSurface.addEventListener("pointerdown",event=>{
 if(event.button!==0||event.pointerType==="touch"||!(event.target instanceof Element))return;
 // Only blank padding/background, never editable fields, links, text or controls.
 if(!event.target.matches("td, tr"))return;
 const row=event.target.closest("tr");if(!row||!row.querySelector(".trip-select"))return;
 rideDrag={x:event.clientX,y:event.clientY,active:false,initial:new Set(selectedTripIds),additive:event.ctrlKey||event.metaKey,box:null};
});
document.addEventListener("pointermove",event=>{
 if(!rideDrag)return;
 const drag=rideDrag;
 if(!drag.active&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<7)return;
 if(!drag.active){
  drag.active=true;
  drag.box=document.createElement("div");drag.box.className="ride-rubber-band";
  document.body.append(drag.box);
  document.body.classList.add("ride-dragging");
 }
 const left=Math.min(drag.x,event.clientX),top=Math.min(drag.y,event.clientY);
 const right=Math.max(drag.x,event.clientX),bottom=Math.max(drag.y,event.clientY);
 Object.assign(drag.box.style,{left:left+"px",top:top+"px",width:right-left+"px",height:bottom-top+"px"});
 const next=drag.additive?new Set(drag.initial):new Set();let first=null;
 for(const row of dragSurface.querySelectorAll("tr")){
  const rect=row.getBoundingClientRect(),check=row.querySelector(".trip-select");
  if(check&&rect.right>left&&rect.left<right&&rect.bottom>top&&rect.top<bottom){if(drag.additive)next.add(check.value);else if(!first)first=check.value;}
 }
 if(!drag.additive&&first)next.add(first);selectedTripIds.clear();for(const id of next)selectedTripIds.add(id);
 updateSelection();
});
document.addEventListener("pointerup",()=>{
 if(!rideDrag)return;
 if(rideDrag.active){
  suppressRideClick=true;
  setTimeout(()=>{suppressRideClick=false},0);
 }
 rideDrag.box?.remove();document.body.classList.remove("ride-dragging");rideDrag=null;
});
document.addEventListener("pointercancel",()=>{rideDrag?.box?.remove();document.body.classList.remove("ride-dragging");rideDrag=null});
let suppressRideClick=false;
dragSurface.addEventListener("click",event=>{if(suppressRideClick){event.stopImmediatePropagation();event.preventDefault()}},true);
document.addEventListener("click",event=>{
 if(!selectedTripIds.size)return;
 const target=event.target;
 if(target.closest("#dispatch-panel tr,#dispatch-panel button,#dispatch-panel input,#dispatch-panel select,#dispatch-panel textarea,#dispatch-panel label,.cell-editor-overlay,.time-editor"))return;
 selectedTripIds.clear();
 for(const checkbox of document.querySelectorAll("#dispatch-panel .trip-select"))checkbox.checked=false;
 updateSelection();
});
$("bulk-all").addEventListener("change",e=>{for(const id of visibleTripIds){if(e.target.checked)selectedTripIds.add(id);else selectedTripIds.delete(id)}updateSelection()});
$("mobile-bulk-all").addEventListener("change",e=>{for(const id of visibleTripIds){if(e.target.checked)selectedTripIds.add(id);else selectedTripIds.delete(id)}updateSelection()});
$("bulk-clear").addEventListener("click",()=>{selectedTripIds.clear();for(const input of document.querySelectorAll(".trip-select"))input.checked=false;updateSelection()});
$("bulk-driver").addEventListener("focus",updateSelection);
$("bulk-driver").addEventListener("change",()=>{updateSelection();if($("bulk-driver").disabled)$("bulk-driver").value=""});
async function permanentlyDeleteRides(ids,after){
 if(staffRole!=="admin"||!ids.length)return;
 if(!confirm("PERMANENTLY DELETE "+ids.length+" ride(s) and their status history? This cannot be undone."))return;
 const typed=prompt("Type DELETE PERMANENTLY to confirm deleting "+ids.length+" ride(s):");
 if(typed!=="DELETE PERMANENTLY")return;
 try{
  const result=await employeeAdminRequest({action:"delete_rides",ride_ids:ids,confirmation:typed});
  if(result.count!==ids.length)throw Error("Server deleted "+result.count+" of "+ids.length+" rides. Refresh to inspect.");
  await after();
 }catch(e){alert("Delete failed: "+e.message)}
}
let archiveRides=[],selectedArchivedIds=new Set(),visibleArchivedIds=[];
function updateArchiveSelection(){
 const count=selectedArchivedIds.size;
 $("archive-selected-count").textContent=count+" selected";
 $("archive-delete").disabled=count===0;
 const all=visibleArchivedIds.length>0&&visibleArchivedIds.every(id=>selectedArchivedIds.has(id));
 $("archive-select-all").checked=all;
 $("archive-select-all").indeterminate=!all&&visibleArchivedIds.some(id=>selectedArchivedIds.has(id));
}
$("archive-select-all").addEventListener("change",e=>{
 for(const id of visibleArchivedIds){if(e.target.checked)selectedArchivedIds.add(id);else selectedArchivedIds.delete(id)}
 for(const input of document.querySelectorAll(".archive-select"))input.checked=selectedArchivedIds.has(input.value);
 updateArchiveSelection();
});
$("archive-delete").addEventListener("click",async()=>{
 const ids=[...selectedArchivedIds];
 await permanentlyDeleteRides(ids,async()=>{selectedArchivedIds.clear();await loadArchive();$("archive-notice").textContent=ids.length+" ride(s) permanently deleted."});
});
async function loadArchive(){
 const notice=$("archive-notice");notice.textContent="Loading archive...";
 $("archive-delete").classList.toggle("hidden",staffRole!=="admin");
 try{
  const result=await employeeAdminRequest({action:"archive_list"});
  archiveRides=result.rides||[];
  for(const id of [...selectedArchivedIds])if(!archiveRides.some(t=>t.id===id))selectedArchivedIds.delete(id);
  const d=$("archive-driver"),old=d.value;
  d.replaceChildren(new Option("All drivers",""));
  for(const id of [...new Set(archiveRides.map(t=>t.assigned_driver_id).filter(Boolean))]){
   const profile=allDriverProfiles.find(p=>p.id===id);
   d.add(new Option(profile?profile.display_name+" ("+profile.username+")":"Historical driver "+id.slice(0,8),id));
  }
  d.value=old;renderArchive();
 }catch(e){notice.textContent=e.message}
}
function renderArchive(){
 const body=$("archive-trips");body.replaceChildren();
 const driver=$("archive-driver").value,status=$("archive-status").value,period=$("archive-period").value,date=$("archive-date").value;
 const end=period==="day"?addDays(date,1):period==="week"?addDays(date,7):period==="year"?(Number(date.slice(0,4))+1)+"-01-01":null;
 const start=period==="year"?date.slice(0,4)+"-01-01":date;
 let count=0;visibleArchivedIds=[];const matchingArchivedRides=[];
 for(const t of archiveRides){
  const d=bostonDate(t.pickup_at);
  if(driver&&t.assigned_driver_id!==driver||status&&t.status!==status||period!=="all"&&date&&(d<start||d>=end))continue;
  matchingArchivedRides.push(t);
  const tr=el("tr");
  if(t.status==="completed")tr.classList.add("archive-completed");
  else if(t.status==="cancelled")tr.classList.add("archive-cancelled");
  const cell=el("td"),input=el("input");input.type="checkbox";input.className="archive-select";input.value=t.id;input.checked=selectedArchivedIds.has(t.id);
  input.addEventListener("change",()=>{if(input.checked)selectedArchivedIds.add(t.id);else selectedArchivedIds.delete(t.id);updateArchiveSelection()});
  cell.append(input);tr.append(cell);
  for(const value of [new Date(t.pickup_at).toLocaleString("en-US",{timeZone:"America/New_York"}),t.passenger_name,t.pickup_address+" → "+t.dropoff_address,t.status,allDriverProfiles.find(p=>p.id===t.assigned_driver_id)?.display_name||"Unassigned / historical",t.price_cents==null?"—":"$"+(t.price_cents/100).toFixed(2),new Date(t.archived_at).toLocaleString("en-US",{timeZone:"America/New_York"})])td(tr,el("span",value));
  body.append(tr);visibleArchivedIds.push(t.id);count++;
 }
 renderDriverStats(matchingArchivedRides);
 $("archive-notice").textContent=count+" archived ride(s) shown.";updateArchiveSelection();
}
for(const id of ["archive-driver","archive-status","archive-period","archive-date"])$(id).addEventListener("change",renderArchive);
$("archive-refresh").addEventListener("click",loadArchive);
$("archive-date").value=bostonDate(new Date());
$("tab-archive").addEventListener("click",async()=>{if(!confirmLeaveDispatch())return;for(const id of ["dispatch-panel","my-rides-panel","messages-panel","employees-panel"])$(id).classList.add("hidden");$("archive-panel").classList.remove("hidden");for(const id of ["tab-dispatch","tab-my-rides","tab-messages","tab-employees","tab-archive"])$(id).classList.toggle("active",id==="tab-archive");await loadArchive()});
$("bulk-apply").addEventListener("click",async()=>{
 // Bulk actions refresh the whole board. Never silently discard other row drafts.
 if(dispatchHasPendingChanges()){
  msg("Unsaved ride edits detected. Save or discard your row changes before using Apply to selected.",true);
  return;
 }
 if(document.querySelector(".cell-editor-overlay,.contact-action-popover,.time-editor:not(.hidden)")){
  msg("Close the open ride editor before applying bulk changes.",true);return;
 }
const ids=[...selectedTripIds],status=$("bulk-status").value;if(!ids.length)return;const chosenDriver=$("bulk-driver").value;if(chosenDriver&&status&&status!=="assigned"){msg("Choose either a bulk status or a driver, not both. Clear the status selection before assigning.",true);return}if(chosenDriver){if(!confirm("Assign "+ids.length+" selected ride(s) to the chosen driver? Confirmed rides become Assigned; Pending rides must be confirmed first."))return;const button=$("bulk-apply");button.disabled=true;try{const result=await employeeAdminRequest({action:"bulk_assign_driver",ride_ids:ids,assigned_driver_id:chosenDriver});if(result.count!==ids.length)throw Error("Some rides were not updated. Refresh and review.");selectedTripIds.clear();$("bulk-driver").value="";await load();msg(result.count+" ride(s) assigned to driver.")}catch(e){if(e.updatedRideIds?.length){for(const id of e.updatedRideIds)selectedTripIds.delete(id)}await load();msg(e.message+(e.updatedRideIds?.length?" "+e.updatedRideIds.length+" ride(s) saved; remaining rides stay selected for review.":""),true)}finally{button.disabled=false;updateSelection()}return}if(status==="archive"){if(!confirm("Move "+ids.length+" selected Completed/Cancelled rides to Archive?"))return;try{const result=await employeeAdminRequest({action:"archive_rides",ride_ids:ids});if(result.count!==ids.length)throw Error("Not all rides archived");selectedTripIds.clear();await load();msg(result.count+" ride(s) archived.")}catch(e){msg(e.message,true)}return}if(status==="delete"){await permanentlyDeleteRides(ids,async()=>{selectedTripIds.clear();await load();msg(ids.length+" ride(s) permanently deleted.")});return}const labels={pending:"Pending",confirmed:"Confirmed",assigned:"Assigned",on_the_way:"On the Way",arrived:"Arrived",boarded:"Boarded",completed:"Completed",cancelled:"Cancelled"};if(!labels[status])return;if(status==="assigned"&&!chosenDriver){msg("Select Driver before saving Assigned status. For multiple rides, choose a driver in the top Select Driver list.",true);return}const warning=status==="pending"?" Assigned drivers will be removed from these rides.":status==="cancelled"?" This will cancel the selected rides.":status==="completed"?" This will mark the selected rides completed.":"";if(!confirm("Change "+ids.length+" selected ride(s) to "+labels[status]+"?"+warning))return;const button=$("bulk-apply");button.disabled=true;try{const result=await employeeAdminRequest({action:"bulk_update_status",ride_ids:ids,status});if(result.count!==ids.length)throw Error("Only "+result.count+" of "+ids.length+" rides were updated. Refresh and review.");selectedTripIds.clear();await load();msg(result.count+" ride(s) updated.")}catch(e){if(e.updatedRideIds?.length){for(const id of e.updatedRideIds)selectedTripIds.delete(id);await load()}msg(e.message+(e.updatedRideIds?.length?" "+e.updatedRideIds.length+" ride(s) saved; remaining rides stay selected for review.":""),true)}finally{button.disabled=false;updateSelection()}});


for(const [tab,panel,other] of [["tab-dispatch","dispatch-panel","my-rides-panel"],["tab-my-rides","my-rides-panel","dispatch-panel"]]){
  $(tab).addEventListener("click",()=>{if(!confirmLeaveDispatch())return;$(panel).classList.remove("hidden");$(other).classList.add("hidden");$("employees-panel").classList.add("hidden");$("archive-panel").classList.add("hidden");$("tab-archive").classList.remove("active");$("messages-panel").classList.add("hidden");$("tab-messages").classList.remove("active");$("tab-dispatch").classList.toggle("active",tab==="tab-dispatch");$("tab-my-rides").classList.toggle("active",tab==="tab-my-rides");if(tab==="tab-my-rides")loadMyRides();saveView()});
}
// Per-driver ride snapshots detect assignments and schedule edits while this web app is open.
let rideRefreshBusy=false;
const rideHighlights=new Map();
function rideSnapshot(t){return {pickup_at:t.pickup_at||"",dropoff_at:t.dropoff_at||"",pickup_address:t.pickup_address||"",dropoff_address:t.dropoff_address||"",status:t.status||"",notes:t.notes||""};}
function rideSnapshotKey(){return "mexpress_ride_snapshot_"+userId;}
function rideTime(value){return value?new Date(value).toLocaleString("en-US",{timeZone:"America/New_York",dateStyle:"medium",timeStyle:"short"}):"Not set";}
function rideChanges(before,after){
 const fields=[["pickup_at","PICKUP TIME UPDATED",rideTime],["dropoff_at","DROP-OFF TIME UPDATED",rideTime],["pickup_address","PICKUP ADDRESS UPDATED",v=>v||"Not set"],["dropoff_address","DROP-OFF ADDRESS UPDATED",v=>v||"Not set"],["notes","DRIVER NOTES UPDATED",v=>v||"Not set"]];
 const changes=[];
 for(const [field,label,format] of fields){
  if(String(before[field]||"")!==String(after[field]||"")){
   const wasEmpty=!before[field],nowEmpty=!after[field];
   const heading=wasEmpty&&!nowEmpty?label.replace("UPDATED","ADDED"):label;
   changes.push({heading,from:format(before[field]),to:format(after[field])});
  }
 }
 if(before.status!==after.status)changes.push({heading:"RIDE STATUS UPDATED",from:before.status||"Not set",to:after.status||"Not set"});
 return changes;
}
function updateRideNotifications(trips){
 if(staffRole!=="driver"||!userId)return;
 const key=rideSnapshotKey(),next={};
 for(const t of trips.filter(t=>t.assigned_driver_id===userId))next[t.id]=rideSnapshot(t);
 let previous=null;
 try{previous=JSON.parse(localStorage.getItem(key)||"null")}catch{}
 if(previous&&typeof previous==="object"){
  for(const t of trips.filter(t=>t.assigned_driver_id===userId)){
   if(!(t.id in previous))rideHighlights.set(t.id,{text:"NEW RIDE ADDED",changes:[],until:Date.now()+60000});
   else{
    let old=previous[t.id];
    if(typeof old==="string"){try{const values=JSON.parse(old);old={pickup_at:values[0],pickup_address:values[1],dropoff_address:values[2],status:values[3],notes:values[4]}}catch{old={}}}
    const changes=rideChanges(old,next[t.id]);
    if(changes.length)rideHighlights.set(t.id,{text:changes.length===1?changes[0].heading:"RIDE DETAILS UPDATED",changes,until:Date.now()+60000});
   }
  }
 }
 localStorage.setItem(key,JSON.stringify(next));
 for(const [id,highlight] of rideHighlights)if(highlight.until<=Date.now())rideHighlights.delete(id);
 const count=rideHighlights.size;
 $("rides-alert-badge").textContent=count?String(count):"";
 $("rides-alert-badge").classList.toggle("hidden",!count);
}

let driverStatusSaving=false;
let driverRefreshFailures=0;
async function loadMyRides({silent=false}={}){
  if(rideRefreshBusy||driverStatusSaving&&silent)return;rideRefreshBusy=true;
  const note=$("my-rides-notice"),list=$("my-rides-list");
  const refreshTab=myRidesTab;
  const refreshUser=userId;
  if(!silent)note.textContent="Loading...";
  try{
    const trips=staffRole==="driver"?await api("/rest/v1/trips?select=id,passenger_name,passenger_phone,pickup_at,pickup_address,dropoff_address,dropoff_at,status,notes,assigned_driver_id&assigned_driver_id=eq."+encodeURIComponent(refreshUser)+"&archived_at=is.null&order=pickup_at.asc"):await api("/rest/v1/rpc/dispatch_get_trips",{method:"POST",body:"{}"});
    const mine=trips.filter(t=>t.assigned_driver_id===refreshUser&&(["completed","cancelled"].includes(t.status)===(refreshTab==="history"))).sort((a,b)=>refreshTab==="history"?new Date(b.pickup_at)-new Date(a.pickup_at):new Date(a.pickup_at)-new Date(b.pickup_at));
    if(refreshTab!==myRidesTab||refreshUser!==userId)return;
    updateRideNotifications(trips);
    list.replaceChildren();
    for(const trip of mine){
      const card=el("article");card.className="ride-card "+tripColor(trip.status);
      const highlight=rideHighlights.get(trip.id);
      if(highlight&&highlight.until>Date.now()){
        card.classList.add("ride-new-highlight");
        const banner=el("div",highlight.text);banner.className="ride-new-banner";card.append(banner);
        for(const change of highlight.changes||[]){const detail=el("div");detail.className="ride-change-detail";detail.append(el("strong",change.heading),el("div","Previous: "+change.from),el("div","Updated: "+change.to));card.append(detail)}
      }
      card.append(el("h3",trip.passenger_name),el("p","Pickup: "+new Date(trip.pickup_at).toLocaleString("en-US",{timeZone:"America/New_York",dateStyle:"medium",timeStyle:"short"})),el("p","Phone: "+(trip.passenger_phone||"Not provided")),el("p","From: "+trip.pickup_address),el("p","To: "+trip.dropoff_address),el("p","Status: "+trip.status.replaceAll("_"," ")));
      if(trip.notes)card.append(el("p","Driver notes: "+trip.notes));
      for(const [label,address] of [["Pickup map",trip.pickup_address],["Drop-off map",trip.dropoff_address]]){
        const link=el("a",label);link.href="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(address);link.target="_blank";link.rel="noopener noreferrer";card.append(link,document.createTextNode("  "));
      }
      const steps=["assigned","on_the_way","arrived","boarded","completed"],i=steps.indexOf(trip.status);
      if(i>=0&&i<steps.length-1){
        const next=steps[i+1],button=el("button","Mark "+next.replaceAll("_"," "));
        button.addEventListener("click",async()=>{if(driverStatusSaving)return;driverStatusSaving=true;button.disabled=true;let saved=false;try{await api("/rest/v1/rpc/driver_update_trip_status",{method:"POST",body:JSON.stringify({p_trip_id:trip.id,p_new_status:next})});saved=true;while(rideRefreshBusy)await new Promise(resolve=>setTimeout(resolve,75));await loadMyRides()}catch(e){note.textContent=saved?"Status saved, but the ride list could not refresh. Please refresh before changing status again.":e.message;if(!saved)button.disabled=false}finally{driverStatusSaving=false}});
        card.append(button);
      }
      list.append(card);
    }
    driverRefreshFailures=0;
    note.textContent=mine.length+(myRidesTab==="history"?" ride(s) in history.":" active ride(s) assigned to you.");
  }catch(e){driverRefreshFailures++;if(!silent)note.textContent=e.message;else if(driverRefreshFailures>=3)note.textContent="Connection issue: rides may be outdated. Retrying automatically.";else console.warn("Driver ride refresh failed",e)}finally{rideRefreshBusy=false}
}
setInterval(()=>{if(token&&staffRole==="driver"&&!document.hidden&&!rideRefreshBusy&&!driverStatusSaving)loadMyRides({silent:true})},8000);
// Refresh immediately when a driver returns to the app instead of waiting for the next interval.
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&token&&staffRole==="driver"&&!rideRefreshBusy&&!driverStatusSaving)loadMyRides({silent:true})});

$("seed-demo-100-rides").addEventListener("click",async()=>{
 if(!confirm("Create 100 randomly generated TEST rides over the next 30 days? No real customers or drivers will be assigned."))return;
 const button=$("seed-demo-100-rides");button.disabled=true;
 try{const result=await employeeAdminRequest({action:"seed_demo_100_rides"});await load();msg(result.count+" TEST rides created successfully.")}
 catch(e){msg(e.message,true)}finally{button.disabled=false}
});
// Dispatchers and administrators can create rides without accessing the Supabase service key.
$("create-ride-toggle").addEventListener("click",()=>{const panel=$("create-ride-panel");panel.classList.toggle("hidden");const chooser=$("new-driver");chooser.replaceChildren(new Option("Unassigned",""));/* Pending rides must be created unassigned. */chooser.disabled=true;});
$("create-ride-cancel").addEventListener("click",()=>$("create-ride-panel").classList.add("hidden"));
$("create-ride-form").addEventListener("submit",async event=>{
 event.preventDefault();
 const submit=$("create-ride-submit"),notice=$("create-ride-notice");
 submit.disabled=true;notice.textContent="Creating ride...";
 try{
  const local=$("new-pickup-time").value;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw Error("Enter a valid pickup date and time");
  // datetime-local uses the browser's local zone; drivers in Boston normally use Eastern Time.
  const payload={action:"create_ride",passenger_name:$("new-passenger").value,passenger_phone:$("new-phone").value,passenger_email:$("new-email").value,pickup_at:new Date(local).toISOString(),pickup_address:$("new-pickup-address").value,dropoff_address:$("new-dropoff-address").value,trip_type:$("new-trip-type").value,assigned_driver_id:$("new-driver").value,wheelchair_required:$("new-wheelchair").value==="yes",notes:$("new-notes").value};
  const r=await fetch("/api/dispatch/admin/employees",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(result.error||"Unable to create ride");
  $("create-ride-form").reset();$("create-ride-panel").classList.add("hidden");
  await load();msg("New ride created successfully.");
 }catch(e){notice.textContent=e.message}finally{submit.disabled=false}
});

function inferredRoundTripIds(rides){
 const result=new Set(),groups=new Map();
 const clean=v=>String(v||"").toLowerCase().normalize("NFKC").replace(/[^\\p{L}\\p{N}]/gu,"");
 const phone=v=>String(v||"").replace(/\\D/g,"").slice(-10);
 for(const ride of rides){const day=bostonDate(ride.pickup_at);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(ride)}
 for(const daily of groups.values()){
  const paired=new Set();
  const sorted=[...daily].sort((a,b)=>new Date(a.pickup_at)-new Date(b.pickup_at));
  for(let i=0;i<sorted.length;i++){
   const a=sorted[i];if(paired.has(a.id))continue;
   const candidates=[];
   for(let j=i+1;j<sorted.length;j++){
    const b=sorted[j];if(paired.has(b.id)||a.id===b.id)continue;
    const sameName=clean(a.passenger_name).length>=4&&clean(a.passenger_name)===clean(b.passenger_name);
    const samePhone=phone(a.passenger_phone).length===10&&phone(a.passenger_phone)===phone(b.passenger_phone);
    const reverse=clean(a.pickup_address).length>=8&&clean(a.pickup_address)===clean(b.dropoff_address)&&clean(a.dropoff_address)===clean(b.pickup_address);
    if(sameName||samePhone||reverse)candidates.push(b);
   }
   if(candidates.length===1){paired.add(a.id);paired.add(candidates[0].id);result.add(a.id);result.add(candidates[0].id)}
  }
 }
 return result;
}
$("driver-stats-toggle").addEventListener("click",()=>{
 const panel=$("driver-stats-panel"),expanded=panel.classList.toggle("hidden")===false;
 $("driver-stats-toggle").setAttribute("aria-expanded",String(expanded));
});
function renderDriverStats(rides){
 const totals=new Map();
 for(const ride of rides){
  if(!ride.assigned_driver_id||!["completed","cancelled"].includes(ride.status))continue;
  const id=ride.assigned_driver_id;
  if(!totals.has(id)){
   const profile=allDriverProfiles.find(p=>p.id===id);
   totals.set(id,{name:profile?.display_name||profile?.username||"Historical driver "+id.slice(0,8),completed:0,cancelled:0,value:0});
  }
  const item=totals.get(id);
  if(ride.status==="completed"){item.completed++;item.value+=Number(ride.price_cents)||0}
  else item.cancelled++;
 }
 const rows=$("driver-stats-rows");rows.replaceChildren();
 const entries=[...totals.values()].sort((a,b)=>b.completed-a.completed||a.name.localeCompare(b.name));
 if(!entries.length){
  const tr=el("tr");const cell=el("td","No completed or cancelled rides with an assigned driver match these filters.");
  cell.colSpan=4;tr.append(cell);rows.append(tr);return;
 }
 for(const entry of entries){
  const tr=el("tr");
  for(const value of [entry.name,entry.completed,entry.cancelled,"$"+(entry.value/100).toFixed(2)])td(tr,el("span",String(value)));
  rows.append(tr);
 }
 const total=entries.reduce((sum,item)=>({completed:sum.completed+item.completed,cancelled:sum.cancelled+item.cancelled,value:sum.value+item.value}),{completed:0,cancelled:0,value:0});
 const tr=el("tr");tr.className="driver-stats-total";
 for(const value of ["Total",total.completed,total.cancelled,"$"+(total.value/100).toFixed(2)])td(tr,el("strong",String(value)));
 rows.append(tr);
}
async function load({silent=false}={}){if(refreshing)return;refreshing=true;if(!silent)msg("Loading...");try{allDriverProfiles=await api("/rest/v1/driver_profiles?select=id,username,display_name,role,is_active&role=in.(admin,dispatcher,driver)&order=display_name.asc");drivers=allDriverProfiles.filter(d=>d.is_active===true);const scheduleDriver=$("schedule-driver"),selectedScheduleDriver=scheduleDriver.value;scheduleDriver.replaceChildren(new Option("All drivers",""),new Option("Unassigned rides","unassigned"));for(const profile of allDriverProfiles.filter(d=>d.role==="driver"))scheduleDriver.add(new Option(profile.display_name+" ("+profile.username+")"+(profile.is_active?"":" — inactive"),profile.id));scheduleDriver.value=selectedScheduleDriver;if(scheduleDriver.selectedIndex<0)scheduleDriver.value="";const bulkDriver=$("bulk-driver"),previousBulkDriver=bulkDriver.value;bulkDriver.replaceChildren();for(const [id,label] of [["","No driver change"],...drivers.filter(d=>d.role==="driver").map(d=>[d.id,d.display_name+" ("+d.username+")"])]){const opt=el("option",label);opt.value=id;bulkDriver.append(opt)}bulkDriver.value=previousBulkDriver;if(bulkDriver.selectedIndex<0)bulkDriver.value="";const archivedIds=new Set((await employeeAdminRequest({action:"archive_list"})).rides.map(t=>t.id));const activeTrips=(await api("/rest/v1/rpc/dispatch_get_trips",{method:"POST",body:"{}"})).filter(t=>!archivedIds.has(t.id));// Load drop-off times separately: older dispatch_get_trips RPC versions do not expose this new column.
try{
 const extra=await api("/rest/v1/trips?select=id,dropoff_at&limit=5000");
 const byId=new Map(extra.map(t=>[t.id,t.dropoff_at]));
 for(const t of activeTrips)if(byId.has(t.id))t.dropoff_at=byId.get(t.id);
}catch(error){console.warn("Drop-off times could not be loaded",error)}
// Fetch authoritative edit versions independently of the RPC response shape.
const versions=await api("/rest/v1/trips?select=id,updated_at&limit=5000");
const versionById=new Map(versions.map(t=>[t.id,t.updated_at]));
for(const t of activeTrips)t.updated_at=versionById.get(t.id)||t.updated_at||null;
// A refresh may have started before the user began editing another ride.
 // Never replace the board with a stale response while local drafts exist.
 if(silent&&dispatchHasUnsavedEdits())return;
 const inferredRoundTrips=inferredRoundTripIds(activeTrips);const trips=activeTrips.filter(visibleTrip).sort(compareDispatchRides).slice(0,200);const body=$("trips");body.replaceChildren();visibleTripIds=trips.map(t=>t.id);visibleTripStatuses=new Map(trips.map(t=>[t.id,t.status]));for(const id of [...selectedTripIds])if(!visibleTripIds.includes(id))selectedTripIds.delete(id);const renderRideRow=(trip)=>{const row=el("tr");row.className=tripColor(trip.status);if(["pending","confirmed","assigned","on_the_way"].includes(trip.status)&&Date.parse(trip.pickup_at)<Date.now()){row.classList.add("overdue-ride");row.title="Pickup time has passed and ride is not yet boarded or completed";}if((trip.internal_notes||"").trim())row.classList.add("has-internal-comments");else if(trip.status==="cancelled")row.classList.add("cancelled-no-internal-comments");const check=el("input");check.type="checkbox";check.className="trip-select";check.value=trip.id;check.checked=selectedTripIds.has(trip.id);check.setAttribute("aria-label","Select ride for "+trip.passenger_name);check.addEventListener("pointerdown",event=>event.stopPropagation());check.addEventListener("click",event=>event.stopPropagation());check.addEventListener("change",event=>{event.stopPropagation();if(check.checked)selectedTripIds.add(trip.id);else selectedTripIds.delete(trip.id);updateSelection()});td(row,check);
// Editing a field must not change bulk selection. Select rides only via checkbox
// or by tapping/clicking the non-interactive area of a ride card/row.
row.addEventListener("click",event=>{
 const target=event.target;
 if(target.closest("input,textarea,select,button,a,label,.compact-ellipsis,.time-cell-clickable,[contenteditable],.cell-expandable"))return;
 chooseRide(trip.id,event.ctrlKey||event.metaKey,true);
});
const pu=new Date(trip.pickup_at).toLocaleString("en-US",{timeZone:"America/New_York",hour:"numeric",minute:"2-digit"});const doTime=trip.dropoff_at?new Date(trip.dropoff_at).toLocaleString("en-US",{timeZone:"America/New_York",hour:"numeric",minute:"2-digit"}):"—";const dateLine=el("span",new Date(trip.pickup_at).toLocaleDateString("en-US",{timeZone:"America/New_York",month:"short",day:"numeric"}));dateLine.className="ride-date-line";td(row,dateLine);const timeCell=el("span");const pickupLine=el("span","PU: "+pu);pickupLine.className="ride-time-line";const dropoffLine=el("span","DropOff: "+doTime);dropoffLine.className="ride-time-line";timeCell.append(pickupLine,dropoffLine);timeCell.title="Pickup: "+new Date(trip.pickup_at).toLocaleString("en-US",{timeZone:"America/New_York",dateStyle:"full",timeStyle:"short"})+" | Drop-off: "+(trip.dropoff_at?new Date(trip.dropoff_at).toLocaleString("en-US",{timeZone:"America/New_York",dateStyle:"full",timeStyle:"short"}):"Not set");const timeWrap=el("div");timeWrap.className="time-cell-wrap";timeWrap.append(timeCell);
 const timeLocked=["completed","cancelled"].includes(trip.status);
 const puEdit=el("input");puEdit.type="time";puEdit.value=bostonTimeValue(trip.pickup_at);puEdit.disabled=timeLocked;puEdit.title=timeLocked?"Time locked for completed or cancelled rides":"Edit pickup time";
 const dropEdit=el("input");dropEdit.type="time";dropEdit.value=bostonTimeValue(trip.dropoff_at);dropEdit.disabled=timeLocked;dropEdit.title=timeLocked?"Time locked for completed or cancelled rides":"Edit drop-off time";
 const timeEdit=el("div");timeEdit.className="time-editor hidden";timeEdit.setAttribute("role","dialog");timeEdit.setAttribute("aria-label","Edit ride times");
 const puLabel=el("label","PU");puLabel.append(puEdit);const dropLabel=el("label","DropOff");dropLabel.append(dropEdit);timeEdit.append(puLabel,dropLabel);
 const timeActions=el("div");timeActions.className="time-editor-actions";
 const timeCancel=el("button","Cancel");timeCancel.type="button";
 const timeApply=el("button","Save");timeApply.type="button";
 const closeTime=()=>{timeEdit.classList.add("hidden");timeEdit.remove();updateUnsavedIndicator()};
 let appliedPickupTime=puEdit.value,appliedDropoffTime=dropEdit.value,appliedPickupLabel=pickupLine.textContent,appliedDropoffLabel=dropoffLine.textContent;
 const cancelTime=()=>{puEdit.value=appliedPickupTime;dropEdit.value=appliedDropoffTime;pickupLine.textContent=appliedPickupLabel;dropoffLine.textContent=appliedDropoffLabel;timeCell.classList.toggle("time-draft",appliedPickupTime!==bostonTimeValue(trip.pickup_at)||appliedDropoffTime!==bostonTimeValue(trip.dropoff_at));row.classList.toggle("unsaved-row",!!row.querySelector(".unsaved-field,.time-draft"));closeTime()};
 const previewTime=()=>{const pickup=puEdit.value?puEdit.value:pu;const drop=dropEdit.value?dropEdit.value:"—";pickupLine.textContent="PU: "+pickup;dropoffLine.textContent="DropOff: "+drop;timeCell.classList.toggle("time-draft",puEdit.value!==bostonTimeValue(trip.pickup_at)||dropEdit.value!==bostonTimeValue(trip.dropoff_at));row.classList.toggle("unsaved-row",!!row.querySelector(".unsaved-field,.time-draft"));updateUnsavedIndicator()};
 const applyTime=()=>{if(!puEdit.value){msg("Pickup time is required.",true);return}if(!puEdit.validity.valid||(dropEdit.value&&!dropEdit.validity.valid)){msg("Enter a valid pickup and drop-off time.",true);return}if(dropEdit.value){const pickup=changedBostonTime(trip.pickup_at,puEdit.value);const dropoff=changedBostonTime(trip.dropoff_at||trip.pickup_at,dropEdit.value);if(Date.parse(dropoff)<Date.parse(pickup)){msg("Drop-off time cannot be earlier than pickup time on the same date.",true);return}}previewTime();appliedPickupTime=puEdit.value;appliedDropoffTime=dropEdit.value;appliedPickupLabel=pickupLine.textContent;appliedDropoffLabel=dropoffLine.textContent;closeTime()};
 timeCancel.addEventListener("click",cancelTime);timeApply.addEventListener("click",applyTime);
 for(const input of [puEdit,dropEdit])input.addEventListener("input",previewTime);
 timeEdit.addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();cancelTime()}});
 timeActions.append(timeCancel,timeApply);timeEdit.append(timeActions);
 if(!timeLocked){timeCell.classList.add("time-cell-clickable");timeCell.title+=" | Double-click to edit";timeCell.addEventListener("dblclick",()=>{if(timeEdit.classList.contains("hidden")){document.body.append(timeEdit);timeEdit.classList.remove("hidden");if(!selectedTripIds.has(trip.id))chooseRide(trip.id,false);puEdit.focus()}else cancelTime()})}
 timeWrap.append(timeEdit);td(row,timeWrap);const passenger=el("div");passenger.className="compact-passenger";passenger.title=[trip.passenger_name,trip.passenger_phone,trip.passenger_email].filter(Boolean).join(" | ");function contactAction(field,label,value){
 const button=el("span",value||"—");button.className="contact-action-trigger";button.title="Select text to copy; double-click to edit "+label;
 button.addEventListener("dblclick",event=>{
  event.stopPropagation();
  document.querySelectorAll(".contact-action-popover").forEach(node=>node.remove());
  const pop=el("div");pop.className="contact-action-popover";
  const title=el("div",label+": "+(button.textContent||"—"));title.className="contact-action-title";
  const copy=el("button","Copy");copy.type="button";
  copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(button.textContent==="—"?"":button.textContent);msg(label+" copied.");pop.remove()}catch(err){msg("Unable to copy: "+err.message,true)}});
  const edit=el("button","Edit");edit.type="button";
  edit.addEventListener("click",()=>{
   pop.replaceChildren(title);
   const input=el("input");input.type="text";input.value=button.textContent==="—"?"":button.textContent;input.maxLength=250;
   const actions=el("div");actions.className="contact-action-buttons";
   const cancel=el("button","Cancel");cancel.type="button";cancel.addEventListener("click",()=>pop.remove());
   const saveContact=el("button","Save");saveContact.type="button";
   saveContact.addEventListener("click",async()=>{
    saveContact.disabled=true;
    try{await employeeAdminRequest({action:"update_ride_contact",ride_id:trip.id,field,value:input.value});button.textContent=input.value.trim()||"—";pop.remove();msg(label+" saved.");await load()}catch(err){msg(err.message,true)}finally{saveContact.disabled=false}
   });
   input.addEventListener("keydown",e=>{if(e.key==="Enter")saveContact.click();if(e.key==="Escape")pop.remove()});
   actions.append(cancel,saveContact);pop.append(input,actions);input.focus();input.select();
  });
  const actions=el("div");actions.className="contact-action-buttons";actions.append(copy,edit);pop.append(title,actions);
  const rect=button.getBoundingClientRect();pop.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-290))+"px";pop.style.top=Math.min(rect.bottom+5,window.innerHeight-165)+"px";
  document.body.append(pop);
  edit.click();
  const dismiss=e=>{if(!pop.contains(e.target)&&e.target!==button){pop.remove();document.removeEventListener("pointerdown",dismiss,true)}};
  setTimeout(()=>document.addEventListener("pointerdown",dismiss,true),0);
  pop.addEventListener("keydown",e=>{if(e.key==="Escape"){pop.remove();document.removeEventListener("pointerdown",dismiss,true)}});
 });
 return button;
}
passenger.append(contactAction("passenger_name","Passenger name",trip.passenger_name));
td(row,passenger);
const cell=el("div");cell.className="client-cell";
cell.append(contactAction("passenger_phone","Cell",trip.passenger_phone));
if(trip.passenger_email)cell.append(contactAction("passenger_email","Email",trip.passenger_email));
td(row,cell);let route=el("div");
function bostonTimeValue(value){return value?new Date(value).toLocaleTimeString("en-GB",{timeZone:"America/New_York",hour:"2-digit",minute:"2-digit",hour12:false}):""}
function changedBostonTime(original,time){
 if(!time||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error("Enter a valid time");
 const day=bostonDate(original);const desired=day+"T"+time+":00";
 let guess=Date.parse(desired+"Z");
 for(let i=0;i<3;i++){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(guess));
  const vals=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  const actual=vals.year+"-"+vals.month+"-"+vals.day+"T"+vals.hour+":"+vals.minute+":00";
  guess+=Date.parse(desired+"Z")-Date.parse(actual+"Z");
 }
 return new Date(guess).toISOString();
}
function openFullCellEditor(field,label){
 const overlay=el("div");overlay.className="cell-editor-overlay";
 const panel=el("div");panel.className="cell-editor-panel";
 const heading=el("h3",label);
 const editor=el("textarea");editor.value=field.value;editor.maxLength=field.maxLength>0?field.maxLength:4000;editor.rows=9;editor.setAttribute("aria-label",label);
 const actions=el("div");actions.className="cell-editor-actions";
 const cancel=el("button","Cancel");cancel.type="button";
 const apply=el("button","Apply to row");apply.type="button";
 const close=()=>overlay.remove();
 cancel.addEventListener("click",close);
 apply.addEventListener("click",()=>{field.value=editor.value;field.dispatchEvent(new Event("input",{bubbles:true}));close()});
 actions.append(cancel,apply);panel.append(heading,editor,actions);overlay.append(panel);
 overlay.addEventListener("click",e=>{if(e.target===overlay)close()});
 overlay.addEventListener("keydown",e=>{if(e.key==="Escape")close()});
 document.body.append(overlay);editor.focus();
}
function expandOnClick(field,label){
 field.classList.add("cell-expandable");
 field.title="Double-click to edit "+label;
 field.addEventListener("dblclick",()=>openFullCellEditor(field,label));
}
function addressEditor(value,placeholder,fieldName){
 const wrap=el("div");wrap.className="compact-route-item";
 const shown=el("span",value);shown.className="compact-ellipsis contact-action-trigger";shown.title="Select to copy; double-click to edit "+placeholder;
 const field=el("input");field.type="text";field.value=value;field.maxLength=500;field.className="hidden";
 shown.addEventListener("dblclick",event=>{
  event.stopPropagation();document.querySelectorAll(".contact-action-popover").forEach(n=>n.remove());
  const pop=el("div");pop.className="contact-action-popover";const title=el("div",placeholder);title.className="contact-action-title";
  const input=el("input");input.type="text";input.value=field.value;input.maxLength=500;
  const actions=el("div");actions.className="contact-action-buttons";
  const cancel=el("button","Cancel");cancel.type="button";cancel.addEventListener("click",()=>pop.remove());
  const saveAddress=el("button","Save");saveAddress.type="button";saveAddress.addEventListener("click",async()=>{
   const next=input.value.trim();if(!next){msg(placeholder+" is required.",true);return}
   saveAddress.disabled=true;try{await employeeAdminRequest({action:"update_ride_address",ride_id:trip.id,field:fieldName,value:next});field.value=next;shown.textContent=next;shown.title=next;pop.remove();msg(placeholder+" saved.");await load()}catch(err){msg(err.message,true)}finally{saveAddress.disabled=false}
  });
  input.addEventListener("keydown",e=>{if(e.key==="Enter")saveAddress.click();if(e.key==="Escape")pop.remove()});
  actions.append(cancel,saveAddress);pop.append(title,input,actions);
  const rect=shown.getBoundingClientRect();pop.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-340))+"px";pop.style.top=Math.max(8,Math.min(rect.bottom+5,window.innerHeight-170))+"px";document.body.append(pop);input.focus();input.select();
  const dismiss=e=>{if(!pop.contains(e.target)&&e.target!==shown){pop.remove();document.removeEventListener("pointerdown",dismiss,true)}};
  setTimeout(()=>document.addEventListener("pointerdown",dismiss,true),0);
 });wrap.append(shown,field);route.append(wrap);return field;
}
const pickupInput=addressEditor(trip.pickup_address,"Pickup address","pickup_address");td(row,route);const dropRoute=el("div");route=dropRoute;const dropoffInput=addressEditor(trip.dropoff_address,"Drop-off address","dropoff_address");td(row,dropRoute);
const statuses=["pending","confirmed","assigned","on_the_way","arrived","boarded","completed","cancelled"];function doubleClickField(field){
 field.classList.add("dblclick-edit-field");
 field.title="Double-click to edit";
 let unlocked=false;
 const block=event=>{if(!unlocked){event.preventDefault();event.stopPropagation()}};
 field.addEventListener("pointerdown",block,true);
 field.addEventListener("click",block,true);
 field.addEventListener("dblclick",event=>{event.preventDefault();event.stopPropagation();unlocked=true;field.classList.add("editing-active");field.focus();if(field.tagName==="SELECT")field.showPicker?.();else field.select?.()});
 field.addEventListener("blur",()=>{unlocked=false;field.classList.remove("editing-active")});
 field.addEventListener("keydown",event=>{if(event.key==="Escape"){field.blur()}});
}
const status=select([...new Set([trip.status,...statuses])].map(v=>[v,v.replaceAll("_"," ")]).concat([["archive","Move to Archive"],...(staffRole==="admin"?[["delete","Delete Permanently"]]:[])]),trip.status);for(const option of status.options){if(option.value==="archive"){option.style.color="#d97706";option.style.fontWeight="700"}if(option.value==="delete"){option.style.color="#c62828";option.style.fontWeight="700"}}status.dataset.rideStatus="true";status.addEventListener("change",()=>{if(selectedTripIds.has(trip.id)&&selectedTripIds.size>=1){$("bulk-status").value=status.value;previewSelectedChanges("status",status.value)}});td(row,status);
const price=el("input");price.type="number";price.min="0";price.step="0.01";price.value=trip.price_cents==null?"":(trip.price_cents/100).toFixed(2);price.placeholder="Not set";doubleClickField(price);td(row,price);
const archivedAssigned=allDriverProfiles.find(d=>d.id===trip.assigned_driver_id&&d.is_active===false);const driverOptions=[["","Unassigned"],...drivers.filter(d=>d.role==="driver").map(d=>[d.id,d.display_name+" ("+d.username+")"])];if(archivedAssigned&&staffRole==="admin")driverOptions.push([archivedAssigned.id,archivedAssigned.display_name+" (archived — historical assignment)"]);const driver=select(driverOptions,trip.assigned_driver_id||"");if(trip.status==="pending"){driver.disabled=true;driver.title="Confirm and save this ride before assigning a driver."}driver.dataset.rideDriver="true";driver.addEventListener("change",()=>{if(driver.value&&["confirmed","assigned"].includes(status.value)){status.value="assigned"}else if(!driver.value&&status.value==="assigned"){status.value="confirmed"}row.classList.remove("ride-pending","ride-confirmed","ride-assigned","ride-completed","ride-cancelled");row.classList.add(tripColor(status.value));if(selectedTripIds.has(trip.id)&&selectedTripIds.size>=1&&driver.value){$("bulk-driver").value=driver.value;previewSelectedChanges("driver",driver.value)}});if(archivedAssigned&&staffRole==="admin"){const opt=Array.from(driver.options).find(o=>o.value===archivedAssigned.id);if(opt)opt.disabled=true}td(row,driver);
const driverComment=el("textarea");driverComment.rows=2;driverComment.maxLength=4000;driverComment.className="driver-comment-edit";driverComment.title=trip.notes||"Driver comments — visible to assigned driver";driverComment.placeholder="Notes for driver";driverComment.value=[trip.wheelchair_required&&!/\bwheelchair\b/i.test(trip.notes||"")?"Wheelchair required":null,trip.notes||null].filter(Boolean).join(" | ");expandOnClick(driverComment,"Driver Comments");td(row,driverComment);const internal=el("textarea");internal.rows=2;internal.maxLength=4000;internal.title=trip.internal_notes||"Internal comments";internal.placeholder="Staff only — not visible to driver";internal.value=trip.internal_notes||"";internal.addEventListener("input",()=>{row.classList.toggle("has-internal-comments",!!internal.value.trim());row.classList.toggle("cancelled-no-internal-comments",!internal.value.trim()&&trip.status==="cancelled")});expandOnClick(internal,"Internal Comments");td(row,internal);
const save=el("button","Save");save.addEventListener("click",async()=>{
 const selectedAction=status.value;
 // Row Save always affects this ride only, regardless of bulk selection.
 // Multi-ride changes must use the explicit Apply to selected toolbar.
 if(selectedAction==="assigned"&&!driver.value){msg("Select a driver for this ride before saving Assigned status.",true);return}
 if(selectedAction==="archive"||selectedAction==="delete"){
  const dirtyOther=[...$("trips").querySelectorAll("tr")].some(other=>other!==row&&(other.querySelector(".time-draft")||[...other.querySelectorAll("input,textarea,select")].some(field=>!["checkbox","button","hidden"].includes(field.type)&&field.dataset.loadedValue!==undefined&&field.value!==field.dataset.loadedValue)));
  if(dirtyOther){msg("Save or discard changes in other rides before archiving or deleting. These actions refresh the board.",true);return}
  const ids=[trip.id];
  if(selectedAction==="archive"){
   if(!confirm("Move this ride to Archive? Only Completed/Cancelled rides are eligible."))return;
   save.disabled=true;
   try{const result=await employeeAdminRequest({action:"archive_rides",ride_ids:ids});if(result.count!==1)throw Error("Ride was not archived");selectedTripIds.delete(trip.id);await load();msg("Ride moved to Archive.")}catch(err){msg(err.message,true)}finally{save.disabled=false}
  }else await permanentlyDeleteRides(ids,async()=>{selectedTripIds.delete(trip.id);await load();msg("Ride permanently deleted.")});
  return;
 }
 if(!confirm("Confirm changes to this ride?"))return;
 save.disabled=true;try{const cents=price.value.trim()===""?null:Math.round(Number(price.value)*100);if(cents!==null&&(!Number.isSafeInteger(cents)||cents<0))throw Error("Invalid price");await employeeAdminRequest({action:"update_ride",ride_id:trip.id,expected_updated_at:trip.updated_at,status:status.value,price_cents:cents,assigned_driver_id:driver.value||null,pickup_at:timeLocked?trip.pickup_at:changedBostonTime(trip.pickup_at,puEdit.value),dropoff_at:timeLocked?trip.dropoff_at:(dropEdit.value?(trip.dropoff_at?changedBostonTime(trip.dropoff_at,dropEdit.value):changedBostonTime(trip.pickup_at,dropEdit.value)):null),pickup_address:pickupInput.value,dropoff_address:dropoffInput.value,notes:driverComment.value.trim()||null,internal_notes:internal.value.trim()||null});
 // Refresh only the saved row; preserve unsaved drafts and checkbox selections elsewhere.
 const latestRows=await api("/rest/v1/rpc/dispatch_get_trips",{method:"POST",body:"{}"});
 const latest=latestRows.find(item=>item.id===trip.id);
 if(!latest)throw Error("Ride saved, but the refreshed record is unavailable. Use Refresh to update the board.");
 const versions=await api("/rest/v1/trips?select=id,updated_at&id=eq."+encodeURIComponent(trip.id)+"&limit=1");
 latest.updated_at=versions[0]?.updated_at||null;
 // A stale background refresh must not replace other edited rows.
 const fresh=renderRideRow(latest);
 row.replaceWith(fresh);
 const index=activeTrips.findIndex(item=>item.id===trip.id);
 if(index>=0)activeTrips[index]=latest;
 visibleTripStatuses.set(trip.id,latest.status);
 // If the saved ride no longer matches the active filters, remove only its row.
 // Other ride drafts must remain mounted and untouched.
 if(!visibleTrip(latest)){
  fresh.remove();
  visibleTripIds=visibleTripIds.filter(id=>id!==trip.id);
  visibleTripStatuses.delete(trip.id);
  selectedTripIds.delete(trip.id);
 }
 updateSelection();updateUnsavedIndicator();
 msg("Ride updated. Other unsaved edits were preserved.");
 }catch(err){if(/changed by another user|version information is missing|archived\. Restore/i.test(err.message)){let details="";
 try{
  const latest=await api("/rest/v1/rpc/dispatch_get_trips",{method:"POST",body:"{}"});
  const current=latest.find(item=>item.id===trip.id);
  if(current){
   const fields=[["Pickup time","pickup_at"],["Drop-off time","dropoff_at"],["Pickup address","pickup_address"],["Drop-off address","dropoff_address"],["Status","status"],["Price","price_cents"],["Driver","assigned_driver_id"],["Driver comments","notes"],["Internal comments","internal_notes"]];
   const changed=fields.filter(([,key])=>String(current[key]??"")!==String(trip[key]??"")).map(([label])=>label);
   details=changed.length?" Updated by another user: "+changed.join(", ")+".":" The ride version changed; review the latest record.";
  }else details=" The ride may no longer be available.";
 }catch(e){console.warn("Could not load conflict details",e)}
 msg("Save blocked: "+err.message+details+" Your unsaved edits remain on screen. Copy them before refreshing.",true);row.classList.add("unsaved-row")}else msg(err.message,true)}finally{save.disabled=false}
});
td(row,save);
for(const field of row.querySelectorAll("input,textarea,select")){if(field.type!=="checkbox"&&field.type!=="button"&&field.type!=="hidden"){field.dataset.loadedValue=field.value;const markDraft=()=>{const changed=field.value!==field.dataset.loadedValue;field.classList.toggle("unsaved-field",changed);row.classList.toggle("unsaved-row",!!row.querySelector(".unsaved-field,.time-draft"));updateUnsavedIndicator()};field.addEventListener("input",markDraft);field.addEventListener("change",markDraft)}}return row;};for(const trip of trips)body.append(renderRideRow(trip));updateUnsavedIndicator();const scheduled=trips.filter(t=>t.assigned_driver_id).length;const pending=trips.filter(t=>t.status==="pending").length;$("schedule-summary").textContent=trips.length+" shown · "+scheduled+" assigned · "+(trips.length-scheduled)+" unassigned · "+pending+" pending";const completed=trips.filter(t=>t.status==="completed");const revenue=completed.reduce((sum,t)=>sum+(Number(t.price_cents)||0),0)/100;const activeDrivers=new Set(trips.filter(t=>t.assigned_driver_id).map(t=>t.assigned_driver_id)).size;updateSelection();if(!silent)msg(trips.length+" ride(s) in selected view.");}catch(err){if(!silent)msg(err.message,true);else console.warn("Silent dispatch refresh failed",err)}finally{refreshing=false}}

let currentChatId=null,chatPoll=null,chatRenderedId=null,chatLastMessageId=null,chatLoading=false,chatForceBottom=false,chatLatestTimestamp=null,chatOtherReadAt=null;
const CHAT_BOTTOM_THRESHOLD=75;
const chatImageCache=new Map();
function clearChatImages(){for(const url of chatImageCache.values())URL.revokeObjectURL(url);chatImageCache.clear()}
function appendLinkedText(target,value){
  const re=/https?:\/\/[^\s<>"]+/gi;let cursor=0;
  for(const match of value.matchAll(re)){const start=match.index;target.append(document.createTextNode(value.slice(cursor,start)));const raw=match[0],url=raw.replace(/[.,;!?)]*$/,"");try{const parsed=new URL(url);if(["https:","http:"].includes(parsed.protocol)){const a=el("a",url);a.href=parsed.href;a.target="_blank";a.rel="noopener noreferrer";target.append(a)}else target.append(document.createTextNode(url))}catch{target.append(document.createTextNode(url))}target.append(document.createTextNode(raw.slice(url.length)));cursor=start+raw.length}
  target.append(document.createTextNode(value.slice(cursor)));
}
async function loadPrivateImage(path,img){
  if(chatImageCache.has(path)){img.src=chatImageCache.get(path);return}
  const r=await fetch(BASE+"/storage/v1/object/authenticated/chat-attachments/"+path.split("/").map(encodeURIComponent).join("/"),{headers:{"apikey":KEY,"Authorization":"Bearer "+token},cache:"no-store"});
  if(!r.ok)throw Error("Unable to load image ("+r.status+")");
  const blob=await r.blob();if(!blob.type.startsWith("image/"))throw Error("Invalid image type");
  const url=URL.createObjectURL(blob);chatImageCache.set(path,url);img.src=url;
}
async function uploadChatImage(file){
  const allowed=["image/jpeg","image/png","image/webp","image/heic","image/heif"];
  const extension=(file.name.split(".").pop()||"").toLowerCase();
  const types={jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",heic:"image/heic",heif:"image/heif"};
  const mime=file.type||types[extension];
  if(!allowed.includes(mime)||!types[extension]||types[extension]!==mime)throw Error("Choose a JPG, PNG, WebP or HEIC image.");
  if(file.size>10*1024*1024)throw Error("Image must be 10 MB or smaller.");
  if(!file.size)throw Error("The selected image is empty.");
  const path=currentChatId+"/"+userId+"/"+crypto.randomUUID()+"."+extension;
  const r=await fetch(BASE+"/storage/v1/object/chat-attachments/"+path,{method:"POST",headers:{"apikey":KEY,"Authorization":"Bearer "+token,"Content-Type":mime,"x-upsert":"false"},body:file});
  if(!r.ok){let error;try{error=await r.json()}catch{}throw Error(error?.message||error?.error||"Photo upload failed ("+r.status+")")}
  return path;
}
let selectedChatFile=null;
function closeAttachMenu(){$("chat-attach-menu").classList.add("hidden");$("chat-attach").setAttribute("aria-expanded","false")}
$("chat-attach").addEventListener("click",()=>{const menu=$("chat-attach-menu"),opening=menu.classList.contains("hidden");menu.classList.toggle("hidden",!opening);$("chat-attach").setAttribute("aria-expanded",String(opening))});
$("chat-choose").addEventListener("click",()=>{closeAttachMenu();$("chat-file").click()});
$("chat-camera").addEventListener("click",()=>{closeAttachMenu();$("chat-camera-file").click()});
document.addEventListener("click",e=>{if(!e.target.closest(".chat-attach-wrap"))closeAttachMenu()});
function selectChatFile(input){const file=input.files[0];if(!file)return;selectedChatFile=file;$("chat-file-name").textContent=file.name||"Photo ready";if(input.id==="chat-file")$("chat-camera-file").value="";else $("chat-file").value=""}
$("chat-file").addEventListener("change",()=>selectChatFile($("chat-file")));
$("chat-camera-file").addEventListener("change",()=>selectChatFile($("chat-camera-file")));
function closeChatLightbox(){$("chat-lightbox").classList.add("hidden");$("chat-lightbox-image").removeAttribute("src")}
$("chat-lightbox-close").addEventListener("click",closeChatLightbox);
$("chat-lightbox").addEventListener("click",e=>{if(e.target===$("chat-lightbox"))closeChatLightbox()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeChatLightbox()});
function openChatLightbox(url){$("chat-lightbox-image").src=url;$("chat-lightbox").classList.remove("hidden")}

function chatNotice(message,isError=false){const node=$("chat-notice");node.textContent=message;node.className=isError?"error":"muted"}
async function loadChatDirectory(){
  const staff=await api("/rest/v1/rpc/chat_employee_directory",{method:"POST",body:"{}"});
  const chooser=$("chat-employee"),previous=chooser.value;
  chooser.replaceChildren(new Option("Select employee",""));
  for(const person of staff)chooser.append(new Option(person.display_name+" ("+person.role+")",person.id));
  chooser.value=previous;
}
async function getChatReadPosition(id){
 const rows=await api("/rest/v1/chat_read_positions?select=last_read_at&conversation_id=eq."+encodeURIComponent(id)+"&user_id=eq."+encodeURIComponent(userId)+"&limit=1");
 return rows[0]?.last_read_at||null;
}
async function getOtherReadPosition(id){
 const rows=await api("/rest/v1/chat_read_positions?select=user_id,last_read_at&conversation_id=eq."+encodeURIComponent(id)+"&user_id=neq."+encodeURIComponent(userId)+"&order=last_read_at.desc&limit=1");
 return rows[0]?.last_read_at||null;
}
function updateChatReceiptIndicators(){
 for(const node of $("chat-thread").querySelectorAll("[data-chat-sent-at]")){
  const read=chatOtherReadAt&&new Date(chatOtherReadAt)>=new Date(node.dataset.chatSentAt);
  node.textContent=read?"✓✓ Read":"✓ Sent";
  node.title=read?"Read by recipient":"Sent to server; not yet marked as read";
 }
}
async function markChatRead(id,createdAt){
 if(!createdAt||id!==currentChatId||document.hidden)return;
 try{
  const old=await getChatReadPosition(id);
  if(old&&new Date(old)>=new Date(createdAt))return;
  await api("/rest/v1/chat_read_positions?on_conflict=conversation_id,user_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({conversation_id:id,user_id:userId,last_read_at:createdAt})});
 }catch(e){console.warn("Could not update chat read position",e)}
}
async function loadChatMessages(){
 if(!currentChatId||!token||chatLoading)return;
 const id=currentChatId;chatLoading=true;
 try{
  const thread=$("chat-thread");
  const newConversation=chatRenderedId!==id;
  const oldAtBottom=thread.scrollHeight-thread.scrollTop-thread.clientHeight<CHAT_BOTTOM_THRESHOLD;
  const previousScrollTop=thread.scrollTop;
  const [rows,readAt,otherReadAt]=await Promise.all([
   api("/rest/v1/chat_messages?select=id,sender_id,message_text,attachment_path,attachment_name,attachment_type,created_at&conversation_id=eq."+encodeURIComponent(id)+"&order=created_at.asc&limit=200"),
   newConversation?getChatReadPosition(id):Promise.resolve(null),
   getOtherReadPosition(id)
  ]);
  if(currentChatId!==id)return;
  chatOtherReadAt=otherReadAt;
  updateChatReceiptIndicators();
  const latestId=rows.at(-1)?.id||null;
  const changed=newConversation||chatLastMessageId!==latestId;
  if(!changed&&!chatForceBottom)return;
  thread.replaceChildren();
  let firstUnread=null;
  for(const message of rows){
   const bubble=el("div");bubble.className="chat-bubble"+(message.sender_id===userId?" mine":"");
   if(newConversation&&message.sender_id!==userId&&(!readAt||new Date(message.created_at)>new Date(readAt))&&!firstUnread)firstUnread=bubble;
   if(message.message_text){const body=el("div");appendLinkedText(body,message.message_text);bubble.append(body)}
   if(message.attachment_path){
    const img=el("img");img.className="chat-image";img.alt=message.attachment_name||"Chat photo";img.loading="lazy";
    const link=el("button");link.type="button";link.className="chat-image-button";link.title="View photo";link.append(img);link.addEventListener("click",()=>{if(img.src)openChatLightbox(img.src)});
    bubble.append(link);loadPrivateImage(message.attachment_path,img).catch(()=>{img.replaceWith(el("small","Photo unavailable"))});
   }
   const meta=el("small",(message.sender_id===userId?"You":"Colleague")+" · "+new Date(message.created_at).toLocaleString("en-US",{timeZone:"America/New_York",dateStyle:"short",timeStyle:"short"}));
   if(message.sender_id===userId){
    meta.append(document.createTextNode(" · "));
    const receipt=el("span");receipt.dataset.chatSentAt=message.created_at;receipt.textContent=otherReadAt&&new Date(otherReadAt)>=new Date(message.created_at)?"✓✓ Read":"✓ Sent";receipt.title=receipt.textContent==="✓✓ Read"?"Read by recipient":"Sent to server; not yet marked as read";meta.append(receipt);
   }
   bubble.append(meta);
   thread.append(bubble);
  }
  if(!rows.length)thread.append(el("p","No messages yet. Say hello!"));
  chatRenderedId=id;chatLastMessageId=latestId;chatLatestTimestamp=rows.at(-1)?.created_at||null;
  const scrollBottom=()=>{thread.scrollTop=thread.scrollHeight-thread.clientHeight};
  if(newConversation){
   if(firstUnread){const target=firstUnread.getBoundingClientRect(),box=thread.getBoundingClientRect();thread.scrollTop+=target.top-box.top-10}
   else scrollBottom();
  }else if(chatForceBottom||oldAtBottom)scrollBottom();
  else thread.scrollTop=previousScrollTop;
  const atBottom=thread.scrollHeight-thread.scrollTop-thread.clientHeight<CHAT_BOTTOM_THRESHOLD;
  if(atBottom&&rows.length)markChatRead(id,rows.at(-1).created_at);
  else if(newConversation&&firstUnread){
   // Opening unread messages marks them read once they are shown.
   const lastVisible=[...thread.querySelectorAll(".chat-bubble")].filter(b=>b.offsetTop-thread.offsetTop<thread.scrollTop+thread.clientHeight).at(-1);
   const idx=lastVisible?[...thread.querySelectorAll(".chat-bubble")].indexOf(lastVisible):-1;
   if(idx>=0)markChatRead(id,rows[idx].created_at);
  }
  chatForceBottom=false;
  chatNotice("Conversation ready.");
 }catch(e){chatNotice(e.message,true)}finally{chatLoading=false}
}
$("chat-thread").addEventListener("scroll",()=>{
 const thread=$("chat-thread");
 if(thread.scrollHeight-thread.scrollTop-thread.clientHeight<CHAT_BOTTOM_THRESHOLD&&currentChatId&&chatLatestTimestamp)markChatRead(currentChatId,chatLatestTimestamp);
},{passive:true});

$("tab-messages").addEventListener("click",async()=>{if(!confirmLeaveDispatch())return;
  $("dispatch-panel").classList.add("hidden");$("my-rides-panel").classList.add("hidden");$("employees-panel").classList.add("hidden");$("messages-panel").classList.remove("hidden");
  for(const id of ["tab-dispatch","tab-my-rides","tab-messages","tab-employees"])$(id).classList.toggle("active",id==="tab-messages");
  try{await loadChatDirectory();await loadChatMessages()}catch(e){chatNotice(e.message,true)}
  saveView();if(chatPoll)clearInterval(chatPoll);
  chatPoll=setInterval(()=>{if(token&&!$("messages-panel").classList.contains("hidden"))loadChatMessages()},8000);
});
$("open-chat").addEventListener("click",async()=>{
  const other=$("chat-employee").value;if(!other){chatNotice("Select an employee first.",true);return}
  $("open-chat").disabled=true;
  try{
    const id=await api("/rest/v1/rpc/open_private_chat",{method:"POST",body:JSON.stringify({p_other_user_id:other})});
    if(!id)throw Error("Unable to open conversation");
    currentChatId=id;chatRenderedId=null;chatLastMessageId=null;$("chat-form").classList.remove("hidden");saveView();await loadChatMessages();
  }catch(e){chatNotice(e.message,true)}finally{$("open-chat").disabled=false}
});
$("refresh-messages").addEventListener("click",loadChatMessages);
$("chat-form").addEventListener("submit",async e=>{
  e.preventDefault();if(!currentChatId||!token)return;
  const value=$("chat-text").value.trim(),file=selectedChatFile;if(!value&&!file)return;
  $("chat-send").disabled=true;
  try{
    const attachment_path=file?await uploadChatImage(file):null;
    await api("/rest/v1/chat_messages",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({conversation_id:currentChatId,sender_id:userId,message_text:value,attachment_path,attachment_name:file?.name||null,attachment_type:file?.type||null})});
    $("chat-text").value="";$("chat-file").value="";$("chat-camera-file").value="";selectedChatFile=null;$("chat-file-name").textContent="";chatForceBottom=true;await loadChatMessages();
  }catch(err){chatNotice(err.message,true)}finally{$("chat-send").disabled=false}
});

async function employeeAdminRequest(payload){
 async function send(){
  const r=await fetch("/api/dispatch/admin/employees",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(payload),cache:"no-store"});
  let data;try{data=await r.json()}catch{throw Error("Invalid server response ("+r.status+")")}
  return {r,data};
 }
 let result;
 try{result=await send()}catch(error){refreshConnectionNotice();throw Error("Connection failed. Check your internet and retry. No success was confirmed.")}
 if(result.r.status===401){
  try{await refreshSession()}catch{throw Error("Session expired. Please sign out and sign in again.")}
  try{result=await send()}catch(error){refreshConnectionNotice();throw Error("Connection failed after session refresh. Check your connection before retrying.")}
 }
 if(!result.r.ok){
  const error=new Error(result.data.error||"Request failed ("+result.r.status+")");
  error.updatedRideIds=Array.isArray(result.data.updated_ride_ids)?result.data.updated_ride_ids:[];
  error.requestedCount=result.data.requested;
  throw error;
 }
 return result.data;
}
function employeeNotice(message,bad=false){const n=$("employee-password-notice");n.textContent=message;n.className=bad?"error":"success"}
async function loadEmployees(){
 const result=await employeeAdminRequest({action:"list"});
 employeeList=result.employees||[];
 const picker=$("manage-employee"),previous=picker.value;
 picker.replaceChildren(new Option("Select employee",""));
 for(const p of result.employees||[])if(p.id!==userId)picker.append(new Option(p.display_name+" ("+p.username+" · "+p.role+")",p.id));
 picker.value=previous;
 const audit=$("audit-person");audit.replaceChildren(new Option("All employees",""));
 for(const employee of result.employees||[])audit.append(new Option(employee.display_name+" ("+employee.username+")",employee.id));
 syncEmployeeManagement();
}
function syncEmployeeManagement(){
 const id=$("manage-employee").value,action=$("manage-action").value;
 $("employee-select").value=id;$("employee-username-select").value=id;
 $("manage-username-panel").classList.toggle("hidden",!id||action!=="username");
 $("manage-password-panel").classList.toggle("hidden",!id||action!=="password");
 $("manage-delete-panel").classList.toggle("hidden",!id||action!=="delete");
}
$("manage-employee").addEventListener("change",syncEmployeeManagement);
$("manage-action").addEventListener("change",syncEmployeeManagement);
$("employee-delete-button").addEventListener("click",async()=>{
 const id=$("manage-employee").value;
 const employee=employeeList.find(p=>p.id===id);
 if(!employee||employee.role==="admin"||id===userId)return;
 if(!confirm("Permanently delete login for "+employee.display_name+" ("+employee.username+")? Historical rides and messages will remain."))return;
 const typed=prompt("To confirm, type the exact username: "+employee.username);
 if(typed===null)return;
 if(typed!==employee.username){employeeNotice("Username did not match. Nothing deleted.",true);return}
 const button=$("employee-delete-button");button.disabled=true;
 try{
  await employeeAdminRequest({action:"delete_employee",user_id:id,confirm_username:typed});
  employeeNotice("Employee login deleted. Historical records preserved.");
  await loadEmployees();await load();
 }catch(e){employeeNotice(e.message,true)}
 finally{button.disabled=false}
});


$("tab-employees").addEventListener("click",async()=>{
 if(!["admin","dispatcher"].includes(staffRole))return;
 for(const id of ["dispatch-panel","my-rides-panel","messages-panel"])$(id).classList.add("hidden");
 $("employees-panel").classList.remove("hidden");
 for(const id of ["tab-dispatch","tab-my-rides","tab-messages","tab-employees"])$(id).classList.toggle("active",id==="tab-employees");
 if(chatPoll)clearInterval(chatPoll);chatPoll=null;
 saveView();
 try{await loadEmployees()}catch(e){employeeNotice(e.message,true)}if(staffRole==="admin")await loadEmployeeAudit()
});
$("employee-create-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!["admin","dispatcher"].includes(staffRole))return;
 const notice=$("create-driver-notice"),button=$("create-driver-button");
 button.disabled=true;notice.textContent="Creating employee...";notice.className="muted";
 try{
  const username=$("create-username").value.trim().toLowerCase();
  await employeeAdminRequest({action:"create_employee",role:staffRole==="admin"?$("create-role").value:"driver",username,display_name:$("create-display-name").value.trim(),password:$("create-password").value});
  notice.textContent="Employee created. Sign in with username: "+username;notice.className="success";
  $("employee-create-form").reset();await load();
  await loadEmployees();
 }catch(err){notice.textContent=err.message;notice.className="error"}finally{button.disabled=false}
});
async function loadEmployeeAudit(){
 if(staffRole!=="admin")return;
 const log=$("employee-audit-log");log.textContent="Loading...";
 const now=new Date(),period=$("audit-period").value;
 const day=d=>{const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));return values.year+"-"+values.month+"-"+values.day};
 const offset=n=>day(new Date(now.getTime()+n*86400000));
 let from=day(now),to=from;
 if(period==="yesterday")from=to=offset(-1);
 if(period==="week")from=offset(-6);
 if(period==="month")from=offset(-29);
 if(period==="previous_month"){const first=new Date(from.slice(0,7)+"-01T12:00:00Z");to=day(new Date(first.getTime()-86400000));from=to.slice(0,7)+"-01"}
 if(period==="custom"){from=$("audit-from").value||from;to=$("audit-to").value||to}
 if(period!=="all"&&from>to){log.textContent="Invalid date range";return}
 try{
  const result=await employeeAdminRequest({action:"audit_log",actor_id:$("audit-person").value,actor_role:$("audit-role").value,action_filter:$("audit-action").value,limit:500,from:period==="all"?"":new Date(from+"T00:00:00Z").toISOString(),to:period==="all"?"":new Date(new Date(to+"T00:00:00Z").getTime()+2*86400000).toISOString()});
  log.replaceChildren();let count=0;
  for(const e of result.events||[]){
   const date=new Date(e.created_at),localDay=day(date),clock=new Intl.DateTimeFormat("en-GB",{timeZone:"America/New_York",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date);
   if((period!=="all"&&(localDay<from||localDay>to))||clock<($("audit-start-time").value||"00:00")||clock>($("audit-end-time").value||"23:59"))continue;
   const who=Array.from($("audit-person").options).find(o=>o.value===e.actor_id);
   const changes=e.details?.changes||{};
   const labels={status:"Status",assigned_driver_id:"Assigned driver",pickup_at:"Pickup time",pickup_address:"Pickup address",dropoff_address:"Drop-off address",price_cents:"Price",internal_notes:"Internal comment",notes:"Ride notes"};
   const show=(field,value)=>{
    if(value===null||value===undefined||value==="")return "None";
    if(field==="price_cents")return "$"+(Number(value)/100).toFixed(2);
    if(field==="assigned_driver_id"){const driver=allDriverProfiles.find(d=>d.id===value);return driver?.display_name||driver?.username||String(value).slice(0,8)}
    if(field==="pickup_at")return new Date(value).toLocaleString("en-US",{timeZone:"America/New_York",dateStyle:"medium",timeStyle:"short"});
    return String(value);
   };
   const meaningful=["ride_changed","update_ride","update_ride_contact","bulk_update_status","bulk_assign_driver","create_ride","create_driver","create_dispatcher","change_username","reset_password","delete_employee"].includes(e.action);
   if(!meaningful)continue;
   const lines=Object.entries(changes).map(([field,values])=>(labels[field]||field)+": "+show(field,values.before??values.old)+" → "+show(field,values.after??values.new));
   if(!lines.length&&e.action==="bulk_update_status"&&e.details?.status)lines.push("New status: "+e.details.status);
   if(!lines.length&&e.action==="bulk_assign_driver"&&e.details?.driver_id)lines.push("Assigned driver: "+show("assigned_driver_id",e.details.driver_id));
   if(!lines.length&&e.action==="ride_changed"){
    for(const [field,label] of [["status","Status"],["driver","Assigned driver"],["pickup","Pickup time"]]){
     const old=e.details?.["previous_"+field],next=e.details?.[field];
     if(old!==undefined&&old!==next)lines.push(label+": "+show(field==="driver"?"assigned_driver_id":field==="pickup"?"pickup_at":field,old)+" → "+show(field==="driver"?"assigned_driver_id":field==="pickup"?"pickup_at":field,next));
    }
   }
   const known=allDriverProfiles.find(d=>d.id===e.actor_id);const whoName=who?who.textContent:known?.display_name||known?.username||e.actor_id.slice(0,8);
   const item=el("div");item.style.padding="12px 0";item.style.borderBottom="1px solid #ddd";
   item.append(el("strong",localDay+" "+clock+" · "+whoName+" · "+e.actor_role));
   const eventTitle={ride_changed:changes.status?"Ride status changed":"Ride updated",update_ride:changes.status?"Ride status changed":"Ride updated",update_ride_contact:"Ride contact updated",bulk_update_status:"Ride status updated (bulk)",bulk_assign_driver:"Driver assigned (bulk)",create_ride:"Ride created",create_driver:"Driver account created",create_dispatcher:"Dispatcher account created",change_username:"Username changed",reset_password:"Password reset",delete_employee:"Employee deleted"}[e.action]||e.action;
   item.append(el("div",eventTitle+(e.details?.ride_id?" · Ride "+String(e.details.ride_id).slice(0,8):"")));
   for(const line of lines)item.append(el("div",line));
   item.append(el("small","Source: "+(e.details?.source||"Web / database")));

   item.style.padding="8px 0";item.style.borderBottom="1px solid #ddd";log.append(item);count++;
  }
  $("audit-count").textContent=count+" events shown (latest 500 records maximum)";
  if(!count)log.textContent="No events match your filters.";
 }catch(e){log.textContent=e.message}
}

$("employee-audit-refresh").addEventListener("click",loadEmployeeAudit);
$("employee-username-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!["admin","dispatcher"].includes(staffRole))return;
 const target=$("employee-username-select").value,username=$("employee-new-username").value.trim().toLowerCase(),notice=$("employee-username-notice");
 if(!target){notice.textContent="Select employee";notice.className="error";return}
 if(!/^[a-z][a-z0-9._-]{2,31}$/.test(username)){notice.textContent="Invalid username";notice.className="error";return}
 if(!window.confirm("Change this employee's login to "+username+"? They must use the new login next time."))return;
 $("employee-save-username").disabled=true;notice.textContent="Saving...";notice.className="muted";
 try{await employeeAdminRequest({action:"change_username",user_id:target,username});notice.textContent="Username updated. Employee can sign in with "+username+" and their existing password.";notice.className="success";$("employee-new-username").value="";await loadEmployees()}
 catch(err){notice.textContent=err.message;notice.className="error"}
 finally{$("employee-save-username").disabled=false}
});
$("employee-show-password").addEventListener("click",()=>{
 const input=$("employee-new-password"),visible=input.type==="password";
 input.type=visible?"text":"password";$("employee-show-password").textContent=visible?"Hide":"Show";
});
$("employee-password-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!["admin","dispatcher"].includes(staffRole))return;
 const user=$("employee-select").value,password=$("employee-new-password").value,confirm=$("employee-confirm-password").value;
 if(!user){employeeNotice("Select an employee.",true);return}
 if(password.length<12){employeeNotice("Password must contain at least 12 characters.",true);return}
 if(password!==confirm){employeeNotice("Passwords do not match.",true);return}
 if(!window.confirm("Change this employee's password? Their existing sessions may remain active."))return;
 $("employee-save-password").disabled=true;employeeNotice("Saving...");
 try{
  await employeeAdminRequest({action:"reset_password",user_id:user,password});
  $("employee-new-password").value="";$("employee-confirm-password").value="";
  employeeNotice("Password updated. Share the new password privately with the employee.");
 }catch(err){employeeNotice(err.message,true)}finally{$("employee-save-password").disabled=false}
});
// Refresh the dispatcher view periodically without interrupting edits or selections.
let dispatchAutoRefreshBusy=false;
function updateUnsavedIndicator(){const indicator=$("unsaved-indicator"),pending=dispatchHasPendingChanges();if(indicator)indicator.classList.toggle("hidden",!pending);}
function refreshConnectionNotice(){
 const indicator=$("connection-indicator");
 if(indicator)indicator.classList.toggle("hidden",navigator.onLine!==false);
 if(staffRole==="driver"&&navigator.onLine===false)$("my-rides-notice").textContent="Offline — rides may be outdated. Reconnect to refresh.";
}
window.addEventListener("offline",refreshConnectionNotice);
window.addEventListener("online",()=>{
 refreshConnectionNotice();
 if(!token||document.hidden)return;
 if(staffRole==="driver"&&!rideRefreshBusy&&!driverStatusSaving)loadMyRides({silent:true});
 else if(["admin","dispatcher"].includes(staffRole)&&!refreshing&&!dispatchHasUnsavedEdits())load({silent:true});
});
refreshConnectionNotice();
function dispatchHasPendingChanges(){
 // Include pending editors that render outside the dispatch table.
 if(document.querySelector(".cell-editor-overlay,.contact-action-popover"))return true;
 const panel=$("dispatch-panel");
 if(!panel||panel.classList.contains("hidden"))return false;
 if(panel.querySelector(".time-draft")||document.querySelector(".time-editor:not(.hidden)"))return true;
 for(const field of $("trips").querySelectorAll("input,textarea,select")){
  if(["checkbox","button","hidden"].includes(field.type))continue;
  if(field.dataset.loadedValue!==undefined&&field.value!==field.dataset.loadedValue)return true;
 }
 return false;
}
window.addEventListener("beforeunload",event=>{
 if(!dispatchHasPendingChanges())return;
 event.preventDefault();
 event.returnValue="";
});
function confirmLeaveDispatch(){
 return !dispatchHasPendingChanges()||confirm("You have unsaved ride changes. Leave without saving?");
}
function dispatchHasUnsavedEdits(){
 const panel=$("dispatch-panel");
 if(!panel||panel.classList.contains("hidden"))return true;
 const focused=document.activeElement;
 if(focused&&panel.contains(focused)&&focused.matches("input,textarea,select,[contenteditable]"))return true;
 if(panel.querySelector(".time-draft")||document.querySelector(".cell-editor-overlay,.contact-action-popover,.time-editor:not(.hidden)"))return true;
 // Do not discard any unsaved row edits while auto-refreshing.
 for(const row of $("trips").querySelectorAll("tr")){
  for(const field of row.querySelectorAll("input,textarea,select")){
   if(field.type==="checkbox"||field.type==="button"||field.type==="hidden")continue;
   if(field.dataset.loadedValue!==undefined&&field.value!==field.dataset.loadedValue)return true;
  }
 }
 return selectedTripIds.size>0;
}
setInterval(async()=>{
 if(!token||!["admin","dispatcher"].includes(staffRole)||document.hidden||refreshing||dispatchAutoRefreshBusy||dispatchHasUnsavedEdits())return;
 dispatchAutoRefreshBusy=true;
 try{await load({silent:true})}catch(error){console.warn("Dispatch auto-refresh failed",error)}
 finally{dispatchAutoRefreshBusy=false}
},15000);
// Refresh the dispatch board on return from another tab, while preserving unsaved edits.
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&token&&["admin","dispatcher"].includes(staffRole)&&!refreshing&&!dispatchAutoRefreshBusy&&!dispatchHasUnsavedEdits())load({silent:true})});
restoreSession();
