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
    if(!token){feedback.textContent='Please complete the security verification.';return}
    const payload={
      passenger_name:data.get('Passenger name'),passenger_phone:data.get('Phone'),
      passenger_email:data.get('Email'),pickup_address:data.get('Pickup address'),
      dropoff_address:data.get('Drop-off address'),ride_date:data.get('Ride date'),
      pickup_time:data.get('Pickup time'),wheelchair:data.get('Wheelchair passenger'),
      trip_type:data.get('Trip type'),notes:data.get('Notes'),
      website:data.get('website'),turnstile_token:token
    };
    button.disabled=true;feedback.textContent='Sending your request...';
    try{
      const response=await fetch('/api/ride-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(!response.ok) throw new Error('Submission failed');
      feedback.textContent='Request received. Our team will contact you to confirm your ride.';
      form.reset();
    }catch{
      feedback.textContent='We could not send your request. Please call us to book your ride.';
    }finally{
      button.disabled=false;
      if(window.turnstile) form.querySelectorAll('.cf-turnstile').forEach(el=>window.turnstile.reset(el));
    }
  });
});
