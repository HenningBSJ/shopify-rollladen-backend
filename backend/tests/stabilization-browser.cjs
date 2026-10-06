const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const http = require('http');
const { spawn } = require('child_process');
const assert = require('node:assert/strict');

// Isolated HTML fixture: API requests never reach Slack or the live backend.
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/routes/intake-ui.js'), 'utf8');
const ctx = vm.createContext({});
const begin = source.indexOf('function pageHtml()');
vm.runInContext(source.slice(begin, source.indexOf("router.get('/',", begin)), ctx);
const html = ctx.pageHtml();
const server = http.createServer((req, res) => {
  if (req.url === '/intake/stabilization.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.end(fs.readFileSync(path.join(root, 'src/stabilization.js')));
  } else if (req.url.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, users: [], results: [] }));
  } else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); }
});
let browser, ws, seq = 0;
const pending = new Map();
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
    pending.set(id, { resolve: data => { clearTimeout(timer); resolve(data); }, reject });
    ws.send(JSON.stringify({id, method, params}));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function screenshot(name) {
  const result = await call('Page.captureScreenshot', {format:'png'});
  fs.mkdirSync(path.join(root,'.dbg'), {recursive:true});
  fs.writeFileSync(path.join(root,'.dbg',name), Buffer.from(result.data,'base64'));
}
(async () => {
  await new Promise(r => server.listen(0,'127.0.0.1',r));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'stabi-browser-'));
  const exe = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browser = spawn(exe, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'], {windowsHide:true,stdio:'ignore'});
  const portFile = path.join(profile,'DevToolsActivePort');
  for(let i=0;i<100 && !fs.existsSync(portFile);i++) await sleep(100);
  const port = fs.readFileSync(portFile,'utf8').split('\n')[0];
  const targets = await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());
  ws = new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage = event => {
    const msg=JSON.parse(event.data);
    if(msg.id && pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);}
    if(msg.method==='Runtime.exceptionThrown') errors.push(msg.params);
  };
  await call('Runtime.enable');await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/intake'});
  for(let i=0;i<100;i++){if(await evaluate('!!document.querySelector("#items > *")'))break;await sleep(100);}
  const defaults = await evaluate(`Object.fromEntries(['insectColor','insectMesh','spannPosition','rolloCassette','rolloFsAbschluss','rolloGripSli','doorPetFlap'].map(key=>[key,document.querySelector('#items [data-field="'+key+'"]').value]))`);
  assert.deepEqual(defaults,{insectColor:'Weiß',insectMesh:'Standard',spannPosition:'außenliegend',rolloCassette:'eckig',rolloFsAbschluss:'Ja',rolloGripSli:'Ja',doorPetFlap:'keine'});
  assert.equal(await evaluate(`!!document.querySelector('#items [data-field="spannBrushPosition"] option[value="Abdichtung nach unten"]')`),false);
  await evaluate(`window.item=document.querySelector('#items').firstElementChild;
    window.setField=(key,value,event='change')=>{const el=item.querySelector('[data-field="'+key+'"]');el.value=value;el.dispatchEvent(new Event(event,{bubbles:true}));};
    setField('type','Insektenschutz');setField('insectSubtype','Spannrahmen');setField('spannPosition','innenliegend');
    setField('insectWidthMm','1004','input');setField('insectHeightMm','3004','input');`);
  let layout = await evaluate('item._stabiLayout');
  assert.equal(layout.count,2);assert.equal(layout.valid,true);assert.equal(layout.heightMm,3000);
  assert.equal(await evaluate(`item.querySelector('[data-field="spannFederstifte"]').disabled`),false);
  await evaluate(`setField('spannPosition','außenliegend');setField('spannFederstifte','Ja');`);
  assert.equal(await evaluate(`item.querySelector('[data-field="spannBrushPosition"]').value`),'außen umlaufend');
  await evaluate(`setField('spannFederstifte','Nein');`);
  assert.equal(await evaluate(`item.querySelector('[data-field="spannBrushPosition"]').value`),'zum Fenster');
  await evaluate(`setField('spannPosition','innenliegend');setField('insectWidthMm','3004','input');setField('insectHeightMm','1004','input');`);
  assert.equal(await evaluate('item._stabiLayout.orientation'),'vertical');
  await evaluate(`setField('insectWidthMm','1004','input');setField('insectHeightMm','3004','input');`);
  assert.equal(await evaluate('item._stabiLayout.orientation'),'horizontal');
  for (const [index, opposite, text] of [[0,false,'1000.5'],[1,true,'900']]) {
    await evaluate(`window.editField=item.querySelector('[data-stabi-index="${index}"][data-opposite="${opposite}"]');editField.focus();editField.value='';editField.dispatchEvent(new Event('input',{bubbles:true}));`);
    assert.equal(await evaluate('document.activeElement === editField'),true,'Focus after clearing');
    for (const char of text) {
      await call('Input.insertText',{text:char});
      assert.equal(await evaluate('document.activeElement === editField'),true,'Focus after typing '+char);
    }
    assert.equal(await evaluate('editField.value'),text);
  }
  assert.equal(await evaluate('item._stabiLayout.positions[0]'),1000.5);
  assert.equal(await evaluate('item._stabiLayout.oppositePositions[0]'),1965.3);
  await evaluate(`const topField=item.querySelector('[data-stabi-index="1"][data-opposite="true"]');topField.focus();topField.value='900';topField.dispatchEvent(new Event('input',{bubbles:true}));`);
  layout=await evaluate('item._stabiLayout');assert.equal(layout.positions[1],2065.8);assert.equal(layout.valid,true);
  await evaluate(`document.activeElement.blur();item.querySelector('[data-block="stabiPlanner"]').scrollIntoView({block:'center'});`);
  await screenshot('stabi-desktop.png');
  await call('Emulation.setDeviceMetricsOverride',{width:768,height:1024,deviceScaleFactor:1,mobile:false});
  await evaluate(`item.querySelector('[data-block="stabiPlanner"]').scrollIntoView({block:'center'});`);
  await screenshot('stabi-tablet.png');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`item.querySelector('[data-block="stabiPlanner"]').scrollIntoView({block:'start'});`);
  await screenshot('stabi-mobile.png');
  console.log('MOBILE',await evaluate(`({innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,scale:visualViewport.scale,zoom:getComputedStyle(document.body).zoom,wide:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>395 && el.getBoundingClientRect().width>0).slice(0,12).map(el=>({tag:el.tagName,id:el.id,field:el.dataset.field,cls:el.className,w:el.getBoundingClientRect().width,text:el.outerHTML.slice(0,250)}))})`));
  const overflow=await evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth');
  assert.equal(overflow,false,'Mobile horizontal overflow');
  const sketch=await evaluate(`({rects:item.querySelectorAll('[data-block="stabiSketch"] rect').length, height:item.querySelector('[data-block="stabiSketch"] svg').getBoundingClientRect().height})`);
  assert.equal(sketch.rects,4);assert.ok(sketch.height>200);
  await evaluate(`const input=item.querySelector('[data-stabi-index="0"][data-opposite="false"]');input.focus();input.value='100';input.dispatchEvent(new Event('input',{bubbles:true}));`);
  assert.equal(await evaluate('item._stabiLayout.valid'),false);
  await evaluate('submit()');
  assert.ok((await evaluate('document.getElementById("status").textContent')).includes('Stabilisierungsprofile'));
  assert.equal(await evaluate('item._stabiState.positions[0]'),100);
  await evaluate(`document.activeElement.blur();setField('insectHeightMm','5004','input');item._stabiState={orientation:'horizontal',orientationExplicit:true,manual:true,count:3,positions:[1000,2000,3000]};updateStabiPlanner(item);setField('stabiCount','4','input');`);
  const expanded=await evaluate('item._stabiState.positions');
  assert.deepEqual(expanded.slice(0,3),[1000,2000,3000]);
  assert.equal(expanded.length,4);assert.equal(await evaluate('item._stabiLayout.valid'),true);
  await evaluate(`item.querySelector('[data-action="duplicate"]').click();window.clone=document.querySelector('#items').lastElementChild;clone._stabiState.positions[0]=777;`);
  assert.equal(await evaluate('item._stabiState.positions[0]'),1000);
  await evaluate(`window.item=clone;setField('insectSubtype','Tür');setField('insectWidthMm','4000','input');setField('insectHeightMm','1000','input');setField('stabiOrientation','vertical');`);
  assert.equal(await evaluate('item._stabiLayout.count'),3);
  assert.equal(await evaluate('item._stabiLayout.valid'),true);
  const payload=await evaluate('collectPayload().items.at(-1).details.stabilization');
  assert.equal(payload.version,1);assert.equal(payload.orientation,'vertical');assert.equal(payload.positions.length,3);
  assert.deepEqual(errors,[]);
  console.log('PASS browser: automatic count, top/bottom conversion, mobile layout, SVG, invalid submit, clone independence, vertical door payload; screenshots in backend/.dbg.');
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(async()=>{
  if(ws && ws.readyState===1){try {await call('Browser.close');}catch{}ws.close();}
  if(browser && !browser.killed)browser.kill();
  server.close();
});
