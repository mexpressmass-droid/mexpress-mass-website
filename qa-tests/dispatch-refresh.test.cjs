const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "..", "dispatch.js"), "utf8");
const start = source.indexOf("function dispatchHasUnsavedEdits(){");
const end = source.indexOf("\n}", start) + 2;
assert.ok(start >= 0 && end > start, "refresh guard must be present");
function guard({focus = "none", dirty = false, selected = false, hidden = false, overlay = false} = {}) {
 const field = {type:"text", value:dirty?"draft":"saved", dataset:{loadedValue:"saved"}};
 const focused = focus === "none" ? null : {matches:()=>true};
 const trips = {contains:node=>node===focused && focus==="ride", querySelectorAll:()=>[{querySelectorAll:()=>[field]}]};
 const panel = {classList:{contains:()=>hidden}, contains:()=>true, querySelector:()=>null};
 const context = {document:{activeElement:focused, querySelector:()=>overlay?{}:null}, $:id=>id==="trips"?trips:panel, selectedTripIds:new Set(selected?["synthetic"]:[])};
 vm.createContext(context); vm.runInContext(source.slice(start,end), context);
 return context.dispatchHasUnsavedEdits();
}
test("search focus does not freeze incoming status updates",()=>assert.equal(guard({focus:"search"}),false));
test("filter focus does not freeze incoming status updates",()=>assert.equal(guard({focus:"filter"}),false));
test("focused ride editor is protected",()=>assert.equal(guard({focus:"ride"}),true));
test("unsaved ride draft is protected even after losing focus",()=>assert.equal(guard({dirty:true}),true));
test("selected rides are protected",()=>assert.equal(guard({selected:true}),true));
test("open editor overlay is protected",()=>assert.equal(guard({overlay:true}),true));
test("hidden dispatch panel does not refresh",()=>assert.equal(guard({hidden:true}),true));
test("clean board can refresh",()=>assert.equal(guard(),false));
