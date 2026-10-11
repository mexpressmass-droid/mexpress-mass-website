import { onRequestPost } from "./functions/api/ride-request.js";
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==="/api/ride-request"){
      if(request.method!=="POST") return new Response("Method not allowed",{status:405,headers:{Allow:"POST"}});
      return onRequestPost({request,env,ctx});
    }
    return env.ASSETS.fetch(request);
  }
};
