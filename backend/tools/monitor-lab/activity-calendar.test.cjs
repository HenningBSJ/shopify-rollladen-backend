const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {Activity}=require('./activity.cjs');
const {loadCatalog,findEvent,compareLink}=require('./calendar-catalog.cjs');
const {TEST_CALENDAR}=require('./status.cjs');
const root=path.resolve(__dirname,'../../tmp/monitor-calendar-lab-v4/test-runs');
function setup(t){let now=Date.now();const file=path.join(root,randomUUID(),'activity.sqlite');const a=new Activity(file,()=>now);t.after(()=>a.close());return {a,file,tick:n=>{now+=n;},p:{id:randomUUID(),seq:1,view:'/lab',dirty:true,busy:0,released:false}};}
test('Offene Eingaben und abgelaufene Sitzungen blockieren weiterhin',t=>{
  const {a,p,tick}=setup(t);a.report(p,'LAB');assert.equal(a.status().sessions[0].state,'active');
  tick(70000);assert.equal(a.status().sessions[0].state,'unknown');assert.equal(a.status().blockers,1);
  assert.equal(a.status().restartAllowed,false);assert.equal(a.status().sessions[0].actor,'LAB');
});
test('Abschluss nur ohne offene Eingaben/Speichern, danach keine automatische Freigabe',t=>{
  const {a,p}=setup(t);assert.throws(()=>a.report({...p,released:true}),/Ungültig/);
  assert.throws(()=>a.report({...p,dirty:false,busy:1,released:true}),/Ungültig/);
  a.report({...p,dirty:false,released:true});assert.equal(a.status().blockers,0);assert.equal(a.status().restartAllowed,false);
  a.report({...p,seq:2});assert.equal(a.status().blockers,1);
});
test('Verspätete Lebenszeichen überschreiben neueren Zustand nicht',t=>{
  const {a,p}=setup(t);a.report({...p,seq:3});
  assert.equal(a.report({...p,seq:2,dirty:false,released:true}).ignored,true);
  assert.equal(a.status().sessions[0].dirty,true);
});
test('Zwei Tabs und erneute Datenbankverbindung bleiben getrennt nachvollziehbar',t=>{
  const {a,p,file}=setup(t);a.report(p);a.report({...p,id:randomUUID(),dirty:false});
  const reopened=new Activity(file);assert.equal(reopened.status().blockers,2);reopened.close();
  a.report({...p,seq:2,dirty:false,released:true});assert.equal(a.status().blockers,1);
});
test('Formularinhalte und freie URLs werden nicht als Ansicht übernommen',t=>{
  const {a,p}=setup(t);assert.throws(()=>a.report({...p,view:'/lab?password=secret'}),/Ungültig/);
  assert.throws(()=>a.report({...p,view:'https://example.com'}),/Ungültig/);
  assert.equal(a.status().sessions.length,0);
});
test('Kalenderauswahl verwendet gelesene Titel/Farben und unterscheidet Änderungen',()=>{
  const data={calendarId:TEST_CALENDAR,observedAt:'2026-09-30T14:00:00Z',events:[{id:'real',summary:'Montage',colorId:'6',status:'confirmed'}]};
  const e=findEvent(data,'real');assert.deepEqual(e,{id:'real',summary:'Montage',colorId:'6'});
  const link={calendarId:TEST_CALENDAR,event:e};assert.equal(compareLink(data,link).status,'matches_snapshot');
  assert.equal(compareLink(data,{...link,event:{...e,summary:'Alt'}}).status,'changed');
  assert.equal(compareLink(data,{...link,event:{...e,id:'missing'}}).status,'not_in_loaded_window');
  assert.throws(()=>findEvent(data,'missing'),/nicht im geladenen/);
});
test('Kalenderquelle außerhalb des Testkalenders wird abgewiesen',()=>{
  const dir=path.join(root,randomUUID());fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'catalog.json');
  fs.writeFileSync(file,JSON.stringify({calendarId:'primary',observedAt:'2026-09-30T14:00:00Z',events:[]}));
  assert.throws(()=>loadCatalog(file),/Ungültiger/);
});
test('Browser-Lebenszeichen enthält keinen Zugriffstoken aus dem Materialseitenpfad',async()=>{
  const vm=require('node:vm');const sent=[];
  const element=()=>({style:{},append(){},textContent:'',disabled:false});
  const transport=async(url,options)=>{sent.push(JSON.parse(options.body));return {ok:true};};
  const context={crypto:{randomUUID},window:{fetch:transport,addEventListener(){}},
    document:{createElement:element,body:{prepend(){}},addEventListener(){}},
    sessionStorage:{getItem:()=>null},location:{pathname:'/display/materialstatus/SECRET_ACCESS_TOKEN'},setInterval(){},URL,Request};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'activity-client.js'),'utf8'),context);
  assert.equal(sent.length,1);assert.equal(sent[0].view,'/display/materialstatus');assert.ok(!JSON.stringify(sent).includes('SECRET_ACCESS_TOKEN'));
});
