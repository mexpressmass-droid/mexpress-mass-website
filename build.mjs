import {mkdir,copyFile} from "node:fs/promises";
await mkdir("dist",{recursive:true});
for(const file of ["index.html","script.js","style.css","styles.css","robots.txt","sitemap.xml","favicon.ico"]){
  try {await copyFile(file,"dist/"+file)} catch(e){if(e.code!=="ENOENT") throw e}
}
console.log("Static site assets prepared in dist");
