const fs=require('node:fs');
const path=require('node:path');
let html=fs.readFileSync(path.join(__dirname,'panel-v3.html'),'utf8');
html=html.replace('Testfassung 3','Testfassung 4');
function replaceOnce(before,after){if(html.split(before).length!==2)throw Error('Panel-Vorlage geändert: '+before.slice(0,40));html=html.replace(before,after);}
replaceOnce('<p>Testeingabe als JSON: stabile ID, Bezeichnung, Bezugsart <code>production</code> oder <code>delivery</code> und Sollmenge.</p>',
  '<p>Alle benötigten Teile eintragen. Eigenproduktion und Fremdlieferungen werden getrennt bestätigt.</p>');
html=html.replace(/<textarea id="parts"[^>]*>[\s\S]*?<\/textarea>/,
  '<div style="overflow-x:auto"><table><thead><tr><th>Bezeichnung</th><th>Bezugsart</th><th>Benötigte Menge</th><th></th></tr></thead><tbody id="partsRows"></tbody></table></div><p id="partsEmpty" class="hint">Noch keine Positionen. Zuerst einen Auftrag öffnen, dann die benötigten Teile hinzufügen.</p><button id="addPart" type="button" disabled>Position hinzufügen</button>');
replaceOnce("if(state.parts.length){$('parts').value=JSON.stringify(state.parts.map(p=>({id:p.id,label:p.label,source:p.source,required:p.required})),null,2);}", "if(!partsDraftDirty||partsDraftOrder!==state.orderId||partsDraftRevision!==state.revision)draftPartsFromState();");
replaceOnce("$('requirements').onclick=run(()=>save('requirements',{previousRevision:state?.revision||null,parts:JSON.parse($('parts').value)}));",'');
replaceOnce("$('orderId').value=row.orderId;await load();", "if(!allowDraftDiscard())return;partsDraftDirty=false;$('orderId').value=row.orderId;await load();");
replaceOnce("$('load').onclick=run(load);", "$('load').onclick=run(async()=>{if(!allowDraftDiscard())return;partsDraftDirty=false;await load();});");
replaceOnce('pending=null;dirty=false;await load();','pending=null;dirty=partsDraftDirty&&type!==\'requirements\';await load();');
replaceOnce('Für diesen Auftrag fehlt die Teileliste. Oben den tatsächlichen Bedarf prüfen und mit „Vollständigen Bedarf bestätigen“ speichern. Die angezeigten Beispielteile nicht ungeprüft übernehmen.',
  'Für diesen Auftrag fehlt die Teileliste. Oben mit „Position hinzufügen“ alle benötigten Teile erfassen und anschließend „Vollständigen Bedarf bestätigen“ wählen.');
const marker='<h2>Terminzuordnung und Vorschau</h2>';
if(html.split(marker).length!==2)throw Error('Kalenderbereich fehlt');
html=html.replace(marker,marker+'<p id="calendarObserved">Kalender-Ausgangsstand wird geladen …</p><label>Gelesener Kalendertermin <select id="calendarEvent"><option value="">Bitte auswählen</option></select></label><button id="selectCalendar">Ausgewählten Termin zuordnen</button><p>Diese Auswahl übernimmt ID, Titel und Farbe aus dem datierten Kalender-Ausgangsstand. Google wird dabei nicht verändert.</p>');
const script=`
async function loadCalendar(){const c=await api('/lab/api/calendar-catalog');$('calendarObserved').textContent=c.observedAt?'Kalender gelesen am '+new Date(c.observedAt).toLocaleString('de-DE')+' · '+c.events.length+' Termine':'Kein Kalender-Ausgangsstand vorhanden';for(const e of c.events){const o=document.createElement('option');o.value=e.id;o.textContent=new Date(e.start).toLocaleString('de-DE')+' · '+e.summary;$('calendarEvent').append(o);}}
$('selectCalendar').onclick=run(async()=>{if(!token)throw Error('Bitte Testperson anmelden');if(!state||state.orderId!==$('orderId').value.trim())throw Error('Zuerst Auftrag öffnen');if(!$('calendarEvent').value)throw Error('Kalendertermin auswählen');const body={previousLink:state.linkRevision,eventId:$('calendarEvent').value};const key=JSON.stringify({orderId:state.orderId,calendarSelection:body});if(!pending||pending.key!==key)pending={key,id:crypto.randomUUID()};await api('/lab/api/orders/'+order()+'/calendar-selection',{id:pending.id,...body});pending=null;await load();$('message').textContent='Termin lokal zugeordnet. Kalender unverändert.';});
run(loadCalendar)();
`;
html=html.replace('</script></body>',fs.readFileSync(path.join(__dirname,'parts-editor.js'),'utf8')+'\n'+script+'</script></body>');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new (require('node:vm').Script)(match[1]);
fs.writeFileSync(path.join(__dirname,'panel-v4.html')+'.tmp',html);
fs.renameSync(path.join(__dirname,'panel-v4.html')+'.tmp',path.join(__dirname,'panel-v4.html'));
