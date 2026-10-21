import {mkdir,copyFile,cp} from "node:fs/promises";
await mkdir("dist",{recursive:true});
for(const file of ["index.html","script.js","style.css","styles.css","robots.txt","sitemap.xml","favicon.ico"]){
  try {await copyFile(file,"dist/"+file)} catch(e){if(e.code!=="ENOENT") throw e}
}
try {await cp("assets","dist/assets",{recursive:true})} catch(e){if(e.code!=="ENOENT") throw e}
console.log("Static site and image assets prepared in dist");
