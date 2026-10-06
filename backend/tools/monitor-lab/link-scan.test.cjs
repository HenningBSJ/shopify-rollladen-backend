const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { History } = require('./history.cjs');
const { TEST_CALENDAR } = require('./status.cjs');
function setup(t) {
  const file = path.resolve(__dirname, '../../tmp/monitor-calendar-lab-v3/test-runs',randomUUID(),'history.sqlite');
  const h = new History(file);t.after(()=>h.close());
  const emit=(type,payload,orderId='RecTest',id=randomUUID())=>h.append({id,orderId,type,actor:'LAB',payload});
  return {h,emit,file};
}
function link(previousLink=null,id='event-test') { return {previousLink,calendarId:TEST_CALENDAR,event:{id,summary:'Kunde – Montage',colorId:'7'}}; }
test('Terminzuordnung bleibt erhalten; Vorschau übernimmt Titel und lässt Farbe aus Patch weg',t=>{
  const {h,emit,file}=setup(t);const saved=emit('calendar_link',link());
  const second=new History(file);const preview=second.linkedPreview('RecTest');second.close();
  assert.equal(preview.linkRevision,saved.id);assert.equal(preview.before.colorId,'7');
  assert.deepEqual(Object.keys(preview.patch),['summary']);assert.equal(preview.verifiedWithGoogle,false);
  assert.match(preview.patch.summary,/Kunde – Montage$/);assert.equal(h.state('RecTest').eventCount,1);
});
test('Fremdkalender, doppelte Terminbelegung und veraltete Zuordnung werden abgewiesen',t=>{
  const {emit}=setup(t);const saved=emit('calendar_link',link());
  assert.throws(()=>emit('calendar_link',link(null),'RecOther'),/anderen Auftrag/);
  assert.throws(()=>emit('calendar_link',link(null,'new')),/inzwischen geändert/);
  assert.throws(()=>emit('calendar_link',{...link(saved.id),calendarId:'primary'}),/Testkalender/);
});
test('Lösen erhält Verlauf und erlaubt Neuzuordnung mit aktueller Revision',t=>{
  const {h,emit}=setup(t);const saved=emit('calendar_link',link());
  const removed=emit('calendar_unlink',{previousLink:saved.id,reason:'Falscher Termin'});
  assert.equal(h.state('RecTest').calendarLink,null);assert.throws(()=>h.linkedPreview('RecTest'),/Keine Terminzuordnung/);
  emit('calendar_link',link(null),'RecOther');
  emit('calendar_link',link(removed.id,'different'));
  assert.equal(h.events('RecTest').length,3);
});
test('Monitor-Scan bewahrt Rohdaten, Wiederholung und explizite Zuordnung ohne Materialfreigabe',t=>{
  const {h,emit}=setup(t);
  h.append({orderId:'RecTest',type:'slack_snapshot',actor:'slack-readonly-import',payload:{title:'Test',status:'fertig',observedAt:new Date().toISOString(),listId:'L'}});
  const raw={code:'rwjob:RecTest',stage:2,rawPart:'1) Rahmen 100x200',partial:true,reportedActor:'Freitext',reportedOrigin:'BS',station:'TEST'};
  const scan=emit('monitor_scan',raw,'RecTest','scan-request');
  assert.equal(emit('monitor_scan',raw,'RecTest','scan-request').duplicate,true);
  assert.equal(h.state('RecTest').scans[0].needsAssignment,true);
  const revision=emit('requirements',{previousRevision:null,parts:[{id:'stable',label:'Rahmen',source:'production',required:1}]}).id;
  const assignment=emit('scan_assignment',{scanId:scan.id,revision,partId:'stable'});
  assert.equal(h.state('RecTest').scans[0].needsAssignment,false);
  assert.equal(h.state('RecTest').scans[0].actor,'LAB');
  assert.equal(h.state('RecTest').scans[0].reportedActor,'Freitext');
  assert.equal(h.state('RecTest').material.ready,false);assert.equal(h.state('RecTest').production.status,'fertig');
  emit('correction',{targetId:assignment.id,reason:'Falsche Zuordnung'});
  assert.equal(h.state('RecTest').scans[0].needsAssignment,true);
});
test('Unbekannte Aufträge und ungültige Scanstufen erzeugen keinen Erfolg',t=>{
  const {emit,h}=setup(t);const p={code:'rwjob:RecTest',stage:2,rawPart:'',partial:false,reportedActor:'',reportedOrigin:'',station:'T'};
  assert.throws(()=>emit('monitor_scan',p),/nicht aus Slack/);
  assert.throws(()=>emit('monitor_scan',{...p,stage:9}),/Ungültiger/);
  assert.equal(h.events('RecTest').length,0);
});
