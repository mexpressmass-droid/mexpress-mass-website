const toggle=document.querySelector('.nav-toggle');
const nav=document.querySelector('.nav');
if(toggle&&nav){toggle.addEventListener('click',()=>nav.classList.toggle('open'));nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')))}

const modal=document.querySelector('.booking-modal');
const openButtons=document.querySelectorAll('[data-open-booking]');
const closeButtons=document.querySelectorAll('[data-close-booking]');
openButtons.forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();modal?.classList.add('open');modal?.setAttribute('aria-hidden','false');document.body.style.overflow='hidden'}));
closeButtons.forEach(btn=>btn.addEventListener('click',()=>{modal?.classList.remove('open');modal?.setAttribute('aria-hidden','true');document.body.style.overflow=''}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal?.classList.contains('open')){modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.style.overflow=''}});

/* Optional Google Places Autocomplete:
   1) Create a Google Maps JavaScript API key with Places API enabled.
   2) Add this script before script.js in index.html:
   <script src="https://maps.googleapis.com/maps/api/js?key=YOUR_GOOGLE_API_KEY&libraries=places"></script>
   After that, pickup and drop-off address fields will use Google address autocomplete.
*/
function initAddressAutocomplete(){
  if(!window.google||!google.maps||!google.maps.places) return;
  document.querySelectorAll('.address-input').forEach(input=>{
    new google.maps.places.Autocomplete(input,{componentRestrictions:{country:'us'},fields:['formatted_address','address_components','geometry'],types:['address']});
  });
}
window.addEventListener('load',initAddressAutocomplete);

document.querySelectorAll('form.ride-form').forEach(form=>{
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=form.querySelector('[type="submit"]');
    const feedback=form.querySelector('.booking-feedback');
    const data=new FormData(form);
    const token=data.get('cf-turnstile-response');
    if(!token){feedback.textContent='Please complete the security verification.';return;}
    const fields={'Passenger name':'passenger_name','Phone':'passenger_phone','Email':'passenger_email','Pickup address':'pickup_address','Drop-off address':'dropoff_address','Ride date':'ride_date','Pickup time':'pickup_time','Wheelchair passenger':'wheelchair_passenger','Trip type':'trip_type','Notes':'notes'};
    const payload={website:data.get('website')||'',turnstile_token:token};
    for(const [label,key] of Object.entries(fields))payload[key]=String(data.get(label)||'');
    button.disabled=true;feedback.textContent='Sending your request...';
    try{
      const res=await fetch('/api/ride-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const body=await res.json().catch(()=>({}));
      if(!res.ok||!body.ok)throw new Error(body.error||'Unable to send request');
      feedback.textContent='Your request was sent. We will contact you to confirm the ride.';
      form.reset();
    }catch(error){
      feedback.textContent='Request was not sent. Please call 617-251-7049 or try again. '+(error.message||'');
    }finally{
      button.disabled=false;
      if(window.turnstile){const widget=form.querySelector('.cf-turnstile');try{window.turnstile.reset(widget)}catch{}}
    }
  });
});
