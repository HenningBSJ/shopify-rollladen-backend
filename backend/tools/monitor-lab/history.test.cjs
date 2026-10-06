const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { History } = require('./history.cjs');
const { createReader, resolveItem } = require('./slack-readonly.cjs');
const testRoot = path.resolve(__dirname, '../../tmp/monitor-calendar-lab-v2/test-runs');
function setup(t) {
  const dir = path.join(testRoot, randomUUID());
  const file = path.join(dir, 'history.sqlite');
  const h = new History(file);t.after(()=>h.close());
  const emit = (type,payload,id=randomUUID())=>h.append({id,orderId:'LAB',type,actor:'LAB',payload});
  const parts=[{id:'own',label:'Rahmen',source:'production',required:2},{id:'external',label:'Motor',source:'delivery',required:1}];
  const rev=emit('requirements',{previousRevision:null,parts}).id;
  return {h,emit,rev,parts,file,dir};
}
test('Persistenz nach neuer DB-Verbindung und geprüfte Sicherung',t=>{
  const {h,emit,rev,file,dir}=setup(t);
  const scan=emit('scan',{revision:rev,partId:'own',action:'done',station:'TEST'});
  const reopened=new History(file);assert.equal(reopened.state('LAB').scans[0].id,scan.id);reopened.close();
  h.backup(path.join(dir,'backup.sqlite'));const backup=new History(path.join(dir,'backup.sqlite'));
  assert.deepEqual(backup.events('LAB'),h.events('LAB'));backup.close();
});
test('Wiederholschutz und Konflikt bei abweichender Wiederverwendung',t=>{
  const {h,emit,rev}=setup(t);const p={revision:rev,partId:'own',action:'done',station:'TEST'};
  assert.equal(emit('scan',p,'request-1').duplicate,false);assert.equal(emit('scan',p,'request-1').duplicate,true);
  assert.throws(()=>emit('scan',{...p,action:'courier'},'request-1'),/anders verwendet/);
  assert.equal(h.state('LAB').scans.length,1);
});
test('Material braucht alle Mengen; neue Bedarfsrevision setzt Freigabe zurück',t=>{
  const {h,emit,rev,parts}=setup(t);
  emit('confirmation',{revision:rev,partId:'own',quantity:2});assert.equal(h.state('LAB').material.ready,false);
  emit('confirmation',{revision:rev,partId:'external',quantity:1});assert.equal(h.state('LAB').material.ready,true);
  emit('requirements',{previousRevision:rev,parts});assert.equal(h.state('LAB').material.ready,false);
  assert.throws(()=>emit('confirmation',{revision:rev,partId:'own',quantity:2}),/Veralteter/);
});
test('Korrektur bewahrt Scan und widerruft Bestätigung nachvollziehbar',t=>{
  const {h,emit,rev}=setup(t);
  const own=emit('confirmation',{revision:rev,partId:'own',quantity:2});
  emit('confirmation',{revision:rev,partId:'external',quantity:1});
  const scan=emit('scan',{revision:rev,partId:'own',action:'done',station:'TEST'});
  emit('correction',{targetId:own.id,reason:'Falsch gezählt'});
  emit('correction',{targetId:scan.id,reason:'Falsche Position'});
  assert.equal(h.state('LAB').material.ready,false);assert.equal(h.state('LAB').scans[0].corrected,true);
  assert.equal(h.events('LAB').filter(e=>e.id===scan.id).length,1);
});
test('SQL-Änderung und Löschung sind gesperrt, Bearbeiter nicht aus Nutzlast ersetzbar',t=>{
  const {h,emit,rev}=setup(t);
  assert.throws(()=>h.db.exec("DELETE FROM events"),/immutable_history/);
  assert.throws(()=>h.db.exec("UPDATE events SET actor='x'"),/immutable_history/);
  assert.throws(()=>emit('scan',{revision:rev,partId:'own',action:'done',station:'TEST',actor:'Fake'}),/Ereignisfelder/);
});
test('Fertig aus Slack bleibt maßgeblich trotz lokalem Reopen; keine erfundene Fertigzeit',t=>{
  const {h,emit,rev}=setup(t);
  h.append({orderId:'LAB',type:'slack_snapshot',actor:'slack-readonly-import',payload:{title:'Test',status:'fertig',observedAt:new Date().toISOString(),listId:'L'}});
  emit('scan',{revision:rev,partId:'own',action:'reopen',station:'TEST'});
  assert.equal(h.state('LAB').production.status,'fertig');assert.equal(h.state('LAB').production.completedAt,null);
});
test('Zwei Verbindungen verhindern Bestätigungen auf veraltetem Bedarf',t=>{
  const {h,emit,rev,parts,file}=setup(t);const second=new History(file);
  emit('requirements',{previousRevision:rev,parts});
  assert.throws(()=>second.append({orderId:'LAB',type:'confirmation',actor:'B',payload:{revision:rev,partId:'own',quantity:1}}),/Veralteter/);
  second.close();assert.equal(h.state('LAB').material.ready,false);
});
test('Slack-Schema löst opaque Status-ID auf, Unbekanntes wird nicht fertig',()=>{
  const schema=[{id:'c',key:'status',options:{choices:[{id:'opaque',label:'Fertig'}]}}];
  assert.equal(resolveItem({id:'i',fields:[{column_id:'c',select:['opaque']}]},schema).status,'fertig');
  assert.equal(resolveItem({id:'i',fields:[{column_id:'c',select:['other']}]},schema).status,'unknown');
});
test('Slack-Adapter blockiert Schreibmethoden und fremde Listen vor Netzwerkzugriff',async()=>{
  let calls=0;const r=createReader({token:'fake',listId:'L',transport:async()=>{calls++;}});
  await assert.rejects(r.call('chat.postMessage',{list_id:'L'}),/DENIED/);
  await assert.rejects(r.call('slackLists.items.list',{list_id:'other'}),/DENIED/);assert.equal(calls,0);
});
test('Slack-Import liest alle Seiten und bricht bei wiederholtem Cursor ab',async()=>{
  let calls=0;const transport=async(url,opts)=>{calls++;const body=JSON.parse(opts.body);
    return {ok:true,json:async()=>url.endsWith('info')?{ok:true,list:{schema:[]}}:
      {ok:true,items:[{id:body.cursor?'second':'first'}],response_metadata:{next_cursor:body.cursor?'':'next'}}};};
  const s=await createReader({token:'fake',listId:'L',transport}).snapshot();assert.equal(s.items.length,2);assert.equal(calls,3);
  await assert.rejects(createReader({token:'fake',listId:'L',transport:async()=>({ok:true,json:async()=>({ok:true,items:[],response_metadata:{next_cursor:'same'}})})}).snapshot(),/unvollständig/);
});
