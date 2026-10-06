// Embedded in the test panel by build-panel-v4.cjs; no live monitor changes.
let partsDraft = [], partsDraftOrder = null, partsDraftRevision = null, partsDraftDirty = false;
function markPartsDraft(){partsDraftDirty=true;dirty=true;document.dispatchEvent(new Event('input'));}
function draftPartsFromState(){
  partsDraft=state.parts.map(p=>({id:p.id,label:p.label,source:p.source,required:p.required}));
  partsDraftOrder=state.orderId;partsDraftRevision=state.revision;partsDraftDirty=false;renderPartsEditor();
}
function renderPartsEditor(){
  $('partsRows').replaceChildren();
  $('partsEmpty').hidden=partsDraft.length>0;
  $('addPart').disabled=!state;
  $('requirements').disabled=!state||!partsDraft.length;
  for(const p of partsDraft){
    const tr=document.createElement('tr');
    function field(node){const td=document.createElement('td');td.append(node);tr.append(td);}
    const label=document.createElement('input');label.value=p.label;label.maxLength=500;label.setAttribute('aria-label','Bezeichnung');
    label.oninput=()=>{p.label=label.value;markPartsDraft();};field(label);
    const source=document.createElement('select');source.setAttribute('aria-label','Bezugsart');
    for(const [value,text] of [['production','Eigenproduktion'],['delivery','Fremdlieferung']]){const o=document.createElement('option');o.value=value;o.textContent=text;source.append(o);}source.value=p.source;
    source.onchange=()=>{p.source=source.value;markPartsDraft();};field(source);
    const quantity=document.createElement('input');quantity.type='number';quantity.min='0';quantity.step='any';quantity.value=p.required;quantity.setAttribute('aria-label','Benötigte Menge');
    quantity.oninput=()=>{p.required=quantity.value;markPartsDraft();};field(quantity);
    const remove=document.createElement('button');remove.type='button';remove.textContent='Entfernen';
    remove.onclick=()=>{partsDraft=partsDraft.filter(row=>row.id!==p.id);markPartsDraft();renderPartsEditor();};field(remove);
    $('partsRows').append(tr);
  }
}
function partsForSave(){
  if(!state||state.orderId!==partsDraftOrder||state.revision!==partsDraftRevision)throw Error('Auftragsstand geändert. Bedarf neu laden.');
  if(!partsDraft.length)throw Error('Mindestens eine benötigte Position eintragen.');
  return partsDraft.map((p,index)=>{
    const label=p.label.trim(),required=Number(p.required);
    if(!label||!Number.isFinite(required)||required<=0)throw Error('Zeile '+(index+1)+': Bezeichnung und benötigte Menge größer als 0 eintragen.');
    return {id:p.id,label,source:p.source,required};
  });
}
function allowDraftDiscard(){return !partsDraftDirty||window.confirm('Ungespeicherte Änderungen am Teilebedarf verwerfen?');}
$('addPart').onclick=run(()=>{if(!state)throw Error('Zuerst Auftrag öffnen');partsDraft.push({id:crypto.randomUUID(),label:'',source:'production',required:1});markPartsDraft();renderPartsEditor();});
$('requirements').onclick=run(async()=>{
  const parts=partsForSave();
  const unchanged=JSON.stringify(parts)===JSON.stringify(state.parts.map(p=>({id:p.id,label:p.label,source:p.source,required:p.required})));
  if(unchanged){$('message').textContent='Der Teilebedarf ist unverändert. Bestehende Mengenbestätigungen bleiben erhalten.';return;}
  if(state.revision&&!window.confirm('Geänderten Teilebedarf speichern? Danach müssen alle Mengen für diesen neuen Bedarf erneut bestätigt werden.'))return;
  await save('requirements',{previousRevision:state.revision,parts});
});
renderPartsEditor();
