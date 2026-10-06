const fs = require('node:fs');
const path = require('node:path');
let html = fs.readFileSync(path.join(__dirname, 'panel.html'), 'utf8');
function replace(before, after) {
  if (html.split(before).length !== 2) throw new Error('Panel-Vorlage geändert: ' + before.slice(0, 40));
  html = html.replace(before, after);
}
replace("let token='',state=null,dirty=false,pending=null;", "let token=sessionStorage.getItem('monitor_lab_token')||'',state=null,dirty=false,pending=null;");
replace("token=d.token;$('password').value='';", "token=d.token;sessionStorage.setItem('monitor_lab_token',token);$('password').value='';");
replace('<h1>Produktions- und Materialstatus · Test</h1>', '<h1>Produktions- und Materialstatus · Testfassung 3</h1>');
replace('<h3>Korrektur</h3>', '<h3>Monitor-Scan zuordnen</h3><p>Beschreibungstexte werden nicht automatisch zugeordnet. Die ausgewählte Position oben muss fachlich zum Scan passen. Eine Zuordnung bestätigt noch keine Materialmenge.</p><label>Scan-Ereignis-ID <input id="scanId"></label><button id="assign">Der ausgewählten Position zuordnen</button><h3>Korrektur</h3>');
replace('<h2>Kalendervorschau</h2>', '<h2>Terminzuordnung und Vorschau</h2><p>Diese Zuordnung wird lokal gespeichert. Termin-ID, Titel und Farbe sind manuelle Angaben und noch nicht gegen Google geprüft.</p>');
replace('<button id="preview">Titeländerung anzeigen</button>', '<button id="link">Zuordnung speichern</button> <button id="preview">Vorschau zum gespeicherten Termin</button><label>Grund für das Lösen <input id="unlinkReason"></label><button id="unlink">Zuordnung lösen</button>');
replace("$('preview').onclick=run(async()=>{$('previewOut').textContent=JSON.stringify(await api('/lab/api/orders/'+order()+'/preview',{calendarId:'jonat.bsjalousienprofi@gmail.com',event:{id:$('eventId').value,summary:$('title').value,colorId:$('color').value}}),null,2);});",
  "$('link').onclick=run(()=>save('calendar_link',{previousLink:state?.linkRevision||null,calendarId:'jonat.bsjalousienprofi@gmail.com',event:{id:$('eventId').value,summary:$('title').value,colorId:$('color').value}}));\n" +
  "$('unlink').onclick=run(()=>save('calendar_unlink',{previousLink:state?.linkRevision,reason:$('unlinkReason').value}));\n" +
  "$('assign').onclick=run(()=>save('scan_assignment',{scanId:$('scanId').value,revision:state?.revision,partId:$('part').value}));\n" +
  "$('preview').onclick=run(async()=>{$('previewOut').textContent=JSON.stringify(await api('/lab/api/orders/'+order()+'/linked-preview'),null,2);});");
replace("state=d.state;$('details').textContent", "state=d.state;if(state.calendarLink){$('eventId').value=state.calendarLink.event.id;$('title').value=state.calendarLink.event.summary;$('color').value=state.calendarLink.event.colorId||'';}if(state.parts.length){$('parts').value=JSON.stringify(state.parts.map(p=>({id:p.id,label:p.label,source:p.source,required:p.required})),null,2);}$('details').textContent");
replace('<select id="part"></select>', '<select id="part" disabled aria-describedby="partHint"><option value="">Zuerst einen Auftrag öffnen</option></select>');
replace('<button id="confirm">Menge bestätigen</button>', '<button id="confirm" disabled>Menge bestätigen</button><p id="partHint" class="hint">Zuerst einen Auftrag öffnen und seinen vollständigen Teilebedarf speichern. Slack liefert bisher den Produktionsstatus, aber noch keine bestätigte Teileliste.</p><p class="hint">Beispiel: Von 5 benötigten Motoren sind 3 vorhanden → 3 bestätigen. Treffen später 2 weitere ein, insgesamt 5 bestätigen.</p>');
replace("$('part').replaceChildren();for(const p of state.parts){const o=document.createElement('option');o.value=p.id;o.textContent=p.label+' ('+p.source+')';$('part').append(o);}",
  "renderParts();");
replace("async function save(type,payload)", `function renderParts(){
  const previous=$('part').value;const rows=state?.parts||[];$('part').replaceChildren();
  $('part').disabled=!rows.length;$('confirm').disabled=!rows.length;
  $('quantity').disabled=!rows.length;$('scan').disabled=!rows.length;$('assign').disabled=!rows.length;
  if(!rows.length){const o=document.createElement('option');o.value='';o.textContent='Noch kein Teilebedarf gespeichert';$('part').append(o);$('partHint').textContent='Für diesen Auftrag fehlt die Teileliste. Oben den tatsächlichen Bedarf prüfen und mit „Vollständigen Bedarf bestätigen“ speichern. Die angezeigten Beispielteile nicht ungeprüft übernehmen.';return;}
  for(const p of rows){const o=document.createElement('option');o.value=p.id;o.textContent=p.label+' – '+(p.source==='production'?'Eigenproduktion':'Fremdlieferung')+' – '+p.confirmed+' von '+p.required+' bestätigt';$('part').append(o);}
  if(rows.some(p=>p.id===previous))$('part').value=previous;showQuantity();
}
function showQuantity(){const p=state?.parts.find(p=>p.id===$('part').value);if(!p)return;$('quantity').max=p.required;$('quantity').value=p.confirmed;$('partHint').textContent=p.label+': benötigt '+p.required+', bisher bestätigt '+p.confirmed+'. Jetzt die insgesamt bestätigte Menge eintragen.';}
$('part').onchange=showQuantity;
async function save(type,payload)`);
fs.writeFileSync(path.join(__dirname, 'panel-v3.html'), html);
