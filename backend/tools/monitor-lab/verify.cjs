const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const v4 = process.argv.includes('--v4');
const v3 = v4 || process.argv.includes('--v3');
const v2 = v3 || process.argv.includes('--v2');
const lab = path.join(root, v4 ? 'tmp/monitor-calendar-lab-v4' : v3 ? 'tmp/monitor-calendar-lab-v3' : v2 ? 'tmp/monitor-calendar-lab-v2' : 'tmp/monitor-calendar-lab');
const access = JSON.parse(fs.readFileSync(path.join(lab, 'access.json'), 'utf8'));
const base = v4 ? 'http://127.0.0.1:3310' : v3 ? 'http://127.0.0.1:3309' : v2 ? 'http://127.0.0.1:3308' : 'http://127.0.0.1:3307';
const results = [];
async function check(name, fn) { await fn(); results.push(name); console.log('OK: ' + name); }
async function main() {
  await check('Health', async () => {
    const r = await fetch(base + '/health'); assert.equal(r.status, 200);
    assert.equal((await r.json()).status, 'ok');
  });
  await check('Anonyme API bleibt geschützt', async () => {
    assert.equal((await fetch(base + '/api/production/board')).status, 401);
  });
  await check('Falsches Passwort wird abgewiesen', async () => {
    const r = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
      body: new URLSearchParams({ user: access.user, password: 'wrong', next: '/display' }) });
    assert.equal(r.status, 302); assert.match(r.headers.get('location'), /error=1/);
  });
  let cookie;
  await check('Anmeldung mit eigenem Test-Cookie', async () => {
    const r = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
      body: new URLSearchParams({ user: access.user, password: access.password, next: '/display' }) });
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/display');
    cookie = r.headers.get('set-cookie').split(';')[0];
    assert.match(cookie, v4 ? /^monitor_lab_v4_session=/ : v3 ? /^monitor_lab_v3_session=/ : v2 ? /^monitor_lab_v2_session=/ : /^monitor_lab_session=/);
  });
  for (const route of ['/display', '/intake', '/display/kommissionierung', ...(v2 ? ['/lab'] : [])]) {
    await check('Seitenaufruf ' + route, async () => {
      const r = await fetch(base + route, { headers: { cookie } });
      assert.equal(r.status, 200);
      const html = await r.text();
      assert.match(html, /<html/i);
      for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\bsrc\s*=|type\s*=\s*["'](?:application\/ld\+json|application\/json|module)/i.test(match[1])) continue;
        new vm.Script(match[2], { filename: route + ':inline-script' });
      }
    });
  }
  await check('Produktionsboard mit isolierten Daten', async () => {
    const r = await fetch(base + '/api/production/board', { headers: { cookie } });
    assert.equal(r.status, 200);
    const board = await r.json();
    const snapshotFile = path.join(lab, 'slack-snapshot.json');
    if (v2 && fs.existsSync(snapshotFile)) {
      assert.equal(board.listId, JSON.parse(fs.readFileSync(snapshotFile, 'utf8')).listId);
      assert.ok(Array.isArray(board.buckets.today));
    } else {
      assert.equal(board.listId, 'LAB_ONLY');
      assert.deepEqual(board.buckets, { today: [], tomorrow: [], later: [] });
    }
  });
  let personToken;
  await check('Personenanmeldung im isolierten Benutzerbestand', async () => {
    const r = await fetch(base + '/api/monitor-auth/login', { method: 'POST',
      headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: access.user, password: access.password }) });
    assert.equal(r.status, 200); const out = await r.json(); assert.equal(out.ok, true); personToken = out.token;
  });
  if (v2) {
    const orderId = 'LAB-VERIFY-' + crypto.randomUUID();
    const url = base + '/lab/api/orders/' + orderId;
    const headers = { cookie, Authorization: 'Bearer ' + personToken, 'Content-Type': 'application/json' };
    async function post(suffix, body, expected = 200) {
      const r = await fetch(url + suffix, { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await r.json(); assert.equal(r.status, expected, JSON.stringify(data)); return data;
    }
    await check('Historien-API verlangt Personenanmeldung', async () => {
      const r = await fetch(url + '/events', { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(r.status, 401);
    });
    await check('Teilebestätigungen, Scan, Wiederholschutz, Korrektur und Kalendergrenze per HTTP', async () => {
      const revision = crypto.randomUUID();
      await post('/events', { id: revision, type: 'requirements', payload: { previousRevision: null,
        parts: [{ id: 'p', label: 'Testteil', source: 'production', required: 1 }, { id: 'd', label: 'Lieferteil', source: 'delivery', required: 1 }] } });
      const own = await post('/events', { id: crypto.randomUUID(), type: 'confirmation', payload: { revision, partId: 'p', quantity: 1 } });
      assert.equal(own.state.material.ready, false);
      const deliveryId = crypto.randomUUID();
      const ready = await post('/events', { id: deliveryId, type: 'confirmation', payload: { revision, partId: 'd', quantity: 1 } });
      assert.equal(ready.state.material.ready, true);
      const scan = { id: crypto.randomUUID(), type: 'scan', payload: { revision, partId: 'p', action: 'done', station: 'HTTP-TEST' } };
      await post('/events', scan); assert.equal((await post('/events', scan)).duplicate, true);
      const preview = await post('/preview', { calendarId: 'jonat.bsjalousienprofi@gmail.com', event: { id: 'test', summary: 'Testkunde', colorId: '6' } });
      assert.match(preview.patch.summary, /Material bereit/); assert.deepEqual(Object.keys(preview.patch), ['summary']);
      await post('/preview', { calendarId: 'primary', event: { id: 'test', summary: 'Testkunde' } }, 400);
      const corrected = await post('/events', { id: crypto.randomUUID(), type: 'correction', payload: { targetId: deliveryId, reason: 'Prüfung Korrektur' } });
      assert.equal(corrected.state.material.ready, false); assert.equal(corrected.state.scans.length, 1);
      const r = await fetch(url, { headers }); const history = await r.json();
      assert.equal(history.events.length, 5); assert.ok(history.events.every(e => e.actor === 'LAB'));
    });
    await check('Slack-Ausgangsstände bleiben als Quelle sichtbar', async () => {
      const r = await fetch(base + '/lab/api/orders', { headers }); const out = await r.json();
      assert.equal(out.mode, 'lab');
      const imported = out.orders.filter(o => o.slackObservedAt);
      if (fs.existsSync(path.join(lab, 'slack-snapshot.json'))) {
        assert.ok(imported.length > 0);
        assert.ok(imported.every(o => o.production.source === 'slack_snapshot' && o.production.completedAt === null));
      }
    });
  }
  if (v3) {
    const { History } = require('./history.cjs');
    const store = new History(path.join(lab, 'history.sqlite'));
    const orderId = 'RecLab' + crypto.randomBytes(10).toString('hex');
    try { store.append({ orderId, actor: 'slack-readonly-import', type: 'slack_snapshot',
      payload: { title: 'TEST HTTP Monitor-Scan', status: 'fertig', observedAt: new Date().toISOString(), listId: 'LAB-FIXTURE' } }); }
    finally { store.close(); }
    const headers = { cookie, Authorization: 'Bearer ' + personToken, 'Content-Type': 'application/json' };
    async function post(url, body, expected=200, useHeaders=headers) {
      const r=await fetch(base+url,{method:'POST',headers:useHeaders,body:JSON.stringify(body)});
      const out=await r.json();assert.equal(r.status,expected,JSON.stringify(out));return out;
    }
    const endpoint='/lab/api/orders/'+orderId;
    await check('Monitor-Scan verwendet echte Testperson, speichert einmal und verändert Slack nicht',async()=>{
      const body={eventId:crypto.randomUUID(),code:'rwjob:'+orderId,stage:2,part:'1) Testteil',partial:true,origin:'BS',actor:'Freitext',station:'HTTP-TEST'};
      await post('/api/production/scan',body,401,{cookie,'Content-Type':'application/json'});
      const first=await post('/api/production/scan',body);assert.equal(first.storedLocally,true);assert.equal(first.slackUpdated,false);
      assert.equal((await post('/api/production/scan',body)).duplicate,true);
      await post('/api/production/scan',{...body,stage:3},409);
      const detail=await fetch(base+endpoint,{headers}).then(r=>r.json());
      assert.equal(detail.state.scans.length,1);assert.equal(detail.state.scans[0].actor,'LAB');
      assert.equal(detail.state.scans[0].reportedActor,'Freitext');assert.equal(detail.state.scans[0].needsAssignment,true);
      assert.equal(detail.state.production.status,'fertig');assert.equal(detail.state.material.ready,false);
    });
    await check('Gespeicherte Terminzuordnung, geschützte Kalendergrenze und Vorschau per HTTP',async()=>{
      const saved=await post(endpoint+'/events',{id:crypto.randomUUID(),type:'calendar_link',payload:{previousLink:null,
        calendarId:'jonat.bsjalousienprofi@gmail.com',event:{id:'lab-'+crypto.randomUUID(),summary:'Testkundentermin',colorId:'8'}}});
      assert.equal(saved.state.calendarLink.verifiedWithGoogle,false);
      const preview=await fetch(base+endpoint+'/linked-preview',{headers}).then(r=>r.json());
      assert.deepEqual(Object.keys(preview.patch),['summary']);assert.equal(preview.before.colorId,'8');
      await post(endpoint+'/events',{id:crypto.randomUUID(),type:'calendar_link',payload:{previousLink:saved.id,
        calendarId:'primary',event:{id:'forbidden',summary:'Test'}}},400);
    });
    await check('Bestehender Monitor enthält Testhinweis, Scan-ID und Token-Anbindung',async()=>{
      const html=await fetch(base+'/display',{headers}).then(r=>r.text());
      assert.match(html,/MONITOR_LAB_SCAN_BRIDGE_V3/);assert.match(html,/pending.eventId = crypto.randomUUID/);
      assert.match(html,/monitor_lab_token/);assert.match(html,/Scans nur lokal/);
    });
  }
  if (v4) {
    const headers={cookie,Authorization:'Bearer '+personToken,'Content-Type':'application/json'};
    async function request(url,body,expected=200) {
      const r=await fetch(base+url,{headers,...(body?{method:'POST',body:JSON.stringify(body)}:{})});
      const out=await r.json();assert.equal(r.status,expected,JSON.stringify(out));return out;
    }
    await check('Kalender-Ausgangsstand nur aus erlaubtem Kalender',async()=>{
      const out=await request('/lab/api/calendar-catalog');assert.equal(out.calendarId,'jonat.bsjalousienprofi@gmail.com');
      assert.ok(out.events.length>0);assert.ok(out.observedAt);
    });
    await check('Gelesenen Termin lokal zuordnen, vergleichen und Zuordnung wieder lösen',async()=>{
      const data=await request('/lab/api/calendar-catalog');const event=data.events.find(e=>/TEST/.test(e.summary))||data.events[0];
      const endpoint='/lab/api/orders/LAB-CALENDAR-VERIFY-'+crypto.randomUUID();
      const saved=await request(endpoint+'/calendar-selection',{id:crypto.randomUUID(),previousLink:null,eventId:event.id});
      try {
        assert.equal(saved.calendarReadCheck.status,'matches_snapshot');assert.equal(saved.state.calendarLink.event.summary,event.summary);
        const preview=await request(endpoint+'/linked-preview');assert.equal(preview.calendarReadCheck.status,'matches_snapshot');
        assert.deepEqual(Object.keys(preview.patch),['summary']);
      } finally {await request(endpoint+'/events',{id:crypto.randomUUID(),type:'calendar_unlink',payload:{previousLink:saved.id,reason:'HTTP-Prüfung abgeschlossen'}});}
    });
    await check('Nutzung: offen, veraltetes Lebenszeichen und ausdrücklicher Abschluss',async()=>{
      const p={id:crypto.randomUUID(),seq:1,view:'/lab',dirty:true,busy:0,released:false};
      try {
        await request('/lab/api/activity',p);
        assert.equal((await request('/lab/api/activity')).sessions.find(s=>s.id===p.id).dirty,true);
        await request('/lab/api/activity',{...p,seq:2,released:true},400);
        await request('/lab/api/activity',{...p,seq:3,dirty:false,released:true});
        assert.equal((await request('/lab/api/activity',{...p,seq:2})).ignored,true);
        const state=await request('/lab/api/activity');assert.equal(state.sessions.find(s=>s.id===p.id).state,'finished');assert.equal(state.restartAllowed,false);
      } finally {await request('/lab/api/activity',{...p,seq:4,dirty:false,released:true});}
    });
    await check('Nutzungsskript in Monitor, Erfassung und Statusseite eingebunden',async()=>{
      for(const route of ['/display','/intake','/display/kommissionierung','/lab']){
        const r=await fetch(base+route,{headers});assert.equal(r.status,200);assert.match(await r.text(),/src="\/lab\/activity-client.js"/);
      }
      const r=await fetch(base+'/lab/activity-client.js',{headers});assert.equal(r.status,200);new vm.Script(await r.text());
    });
  }
  await check('Live-Quellcode unverändert seit Erstellung der Kopie', async () => {
    const baseline = JSON.parse(fs.readFileSync(path.join(lab, 'baseline.json'), 'utf8'));
    for (const [name, hash] of Object.entries(baseline.source)) {
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex'), hash, name);
    }
    // Live data may legitimately change while colleagues use the monitor.
    const changedData = Object.entries(baseline.data).filter(([name, hash]) =>
      crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex') !== hash).map(([name]) => name);
    console.log('Live-Datendateien mit verändertem Hash: ' + changedData.length);
  });
  fs.writeFileSync(path.join(lab, 'verification.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
