const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'dispatch.js'), 'utf8');
const helpers = source.slice(source.indexOf('function resetSessionView(){'), source.indexOf('function showDashboard(){'));
function fixture() {
 const nodes = new Map();
 const get = id => {
  if (!nodes.has(id)) {
   const classes = new Set();
   nodes.set(id, {value:'previous account',textContent:'previous account',children:['private data'],
    replaceChildren(...children){this.children=children;},
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){on?classes.add(c):classes.delete(c);}}});
  }
  return nodes.get(id);
 };
 const overlay = {removed:false,remove(){this.removed=true;}};
 const context = { $:get, document:{querySelectorAll:()=>[overlay]}, staffRole:'driver',employeeList:[1],archiveRides:[1],selectedArchivedIds:new Set([1]),visibleArchivedIds:[1],visibleTripIds:[1],visibleTripStatuses:new Map([[1,1]]),rideHighlights:new Map([[1,1]]),chatDirectoryCache:[1],myRidesTab:'history'};
 vm.createContext(context);vm.runInContext(helpers,context);
 return {get,context,overlay};
}
for (const role of ['driver','dispatcher','admin']) {
 test(`new ${role} session shows exactly its default panel`,()=>{
  const {get,context}=fixture();
  // All panels deliberately start visible, as when a previous account left them open.
  context.staffRole=role;context.showDefaultSessionPanel();
  const expected=role==='driver'?'my-rides':'dispatch';
  for(const panel of ['dispatch','archive','my-rides','messages','employees']){
   assert.equal(get(panel+'-panel').classList.contains('hidden'),panel!==expected);
   assert.equal(get('tab-'+panel).classList.contains('active'),panel===expected);
  }
 });
}
test('logout removes previous account data, editor overlays and history selection',()=>{
 const {get,context,overlay}=fixture();
 context.resetSessionView();
 for(const panel of ['dispatch','archive','my-rides','messages','employees'])assert.equal(get(panel+'-panel').classList.contains('hidden'),true);
 for(const id of ['trips','my-rides-list','archive-trips','employee-audit-log','chat-thread','chat-employee'])assert.equal(get(id).children.length,0);
 assert.equal(overlay.removed,true);
 assert.equal(context.archiveRides.length,0);assert.equal(context.employeeList.length,0);
 assert.equal(context.rideHighlights.size,0);assert.equal(context.selectedArchivedIds.size,0);
 assert.equal(context.myRidesTab,'active');assert.equal(get('chat-text').value,'');
 context.staffRole='dispatcher';context.showDefaultSessionPanel();
 assert.equal(get('my-rides-panel').classList.contains('hidden'),true);
});
