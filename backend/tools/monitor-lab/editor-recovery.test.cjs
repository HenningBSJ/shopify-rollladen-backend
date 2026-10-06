const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const {History}=require('./history.cjs');
const {Activity}=require('./activity.cjs');
const {createBundle,verifyBundle,restoreBundle}=require('./recovery.cjs');
const root=path.resolve(__dirname,'../../tmp/monitor-calendar-lab-v4/test-runs');
function editor(){
  const controls=new Map();const el=()=>({children:[],value:'',append(x){this.children.push(x);},replaceChildren(){this.children=[];},setAttribute(){}});
  const $=id=>{if(!controls.has(id))controls.set(id,el());return controls.get(id);};
  const calls=[];const context=vm.createContext({$,state:{orderId:'LAB',revision:'r1',parts:[{id:'stable',label:'Motor',source:'delivery',required:3,confirmed:2}]},dirty:false,
    document:{createElement:el,dispatchEvent(){}},Event:class{},window:{confirm:()=>true},crypto:{randomUUID},run:fn=>fn,save:async(...args)=>calls.push(args)});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'parts-editor.js'),'utf8'),context);
  vm.runInContext('draftPartsFromState()',context);return {context,$,calls,run:s=>vm.runInContext(s,context)};
}
test('Editor erhält Positions-ID und verhindert unnötige neue Bedarfsrevision',async()=>{
  const e=editor();assert.equal(e.run('partsForSave()[0].id'),'stable');
  await e.$('requirements').onclick();assert.equal(e.calls.length,0);assert.match(e.$('message').textContent,/unverändert/);
  e.run("partsDraft[0].required='4';markPartsDraft()");await e.$('requirements').onclick();
  assert.equal(e.calls[0][1].parts[0].required,4);assert.equal(e.calls[0][1].parts[0].id,'stable');
});
test('Editor blockiert leere/ungültige Mengen und schützt ungespeicherte Änderungen',()=>{
  const e=editor();e.run("partsDraft[0].required='';markPartsDraft()");assert.throws(()=>e.run('partsForSave()'),/größer als 0/);
  e.context.window.confirm=()=>false;assert.equal(e.run('allowDraftDiscard()'),false);
  e.run("state.revision='r2'");assert.throws(()=>e.run('partsForSave()'),/Auftragsstand geändert/);
});
function fixture(){
  const dir=path.join(root,randomUUID()),lab=path.join(dir,'lab'),repo=path.join(dir,'repo');fs.mkdirSync(lab,{recursive:true});
  const h=new History(path.join(lab,'history.sqlite'));h.append({orderId:'LAB',actor:'LAB',type:'requirements',payload:{previousRevision:null,parts:[{id:'p',label:'Teil',source:'production',required:1}]}});h.close();
  const a=new Activity(path.join(lab,'activity.sqlite'));a.report({id:randomUUID(),seq:1,view:'/lab',dirty:true,busy:0,released:false});a.close();
  for(const file of ['calendar-catalog.json','slack-snapshot.json','access.json','baseline.json'])fs.writeFileSync(path.join(lab,file),'{}');
  fs.mkdirSync(path.join(lab,'app/src'),{recursive:true});fs.writeFileSync(path.join(lab,'app/src/index.js'),'// fixture');
  fs.mkdirSync(path.join(repo,'tools/monitor-lab'),{recursive:true});fs.writeFileSync(path.join(repo,'tools/monitor-lab/start.cjs'),'// fixture');
  for(const file of ['package.json','package-lock.json'])fs.writeFileSync(path.join(repo,file),'{}');
  return {dir,lab,repo};
}
test('Vollständige Sicherung wiederherstellen ohne Original oder Ziel zu überschreiben',()=>{
  const f=fixture();const {bundle}=createBundle(f.lab,f.repo);const destination=path.join(f.dir,'restored');
  restoreBundle(bundle,destination);verifyBundle(destination);
  const h=new History(path.join(destination,'history.sqlite'));assert.equal(h.events('LAB').length,1);assert.equal(h.state('LAB').parts[0].id,'p');h.close();
  const a=new Activity(path.join(destination,'activity.sqlite'));assert.equal(a.status().sessions[0].dirty,true);assert.equal(a.status().restartAllowed,false);a.close();
  assert.throws(()=>restoreBundle(bundle,destination),/existiert bereits/);
});
test('Beschädigte Dateien und Pfade außerhalb des Zielverzeichnisses werden abgewiesen',()=>{
  const f=fixture();const {bundle}=createBundle(f.lab,f.repo);const file=path.join(bundle,'calendar-catalog.json');fs.appendFileSync(file,'damage');
  const destination=path.join(f.dir,'restored');assert.throws(()=>restoreBundle(bundle,destination),/Prüfsumme/);assert.equal(fs.existsSync(destination),false);
  fs.writeFileSync(file,'{}');const manifestFile=path.join(bundle,'manifest.json');const m=JSON.parse(fs.readFileSync(manifestFile,'utf8'));m.entries[0].path='../outside.sqlite';fs.writeFileSync(manifestFile,JSON.stringify(m));
  assert.throws(()=>restoreBundle(bundle,destination),/Unsicherer/);assert.equal(fs.existsSync(destination),false);
});
