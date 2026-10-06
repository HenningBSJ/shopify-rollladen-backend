(() => {
  if (window.monitorLabActivity) return;
  window.monitorLabActivity = true;
  // Every document gets its own identity: duplicated tabs must not share a heartbeat.
  const id = crypto.randomUUID();
  const originalFetch = window.fetch.bind(window);
  // Material views contain access tokens in later path segments. Report only the view name.
  const knownViews=new Set(['/lab','/display','/intake','/display/kommissionierung','/display/materialcheck','/display/materialstatus','/display/materialbestand','/display/materialfreigabe','/display/materials','/display/bestand','/display/label-tool','/display/label','/display/montagebericht']);
  const candidate=location.pathname.split('/').slice(0,3).join('/');
  const view=knownViews.has(candidate)?candidate:'/'+location.pathname.split('/')[1];
  let seq = 0, dirty = false, busy = 0, released = false, connected = false;
  const bar = document.createElement('div');
  bar.style.cssText = 'position:sticky;top:0;z-index:9999;background:#fff2cc;color:#222;padding:10px;border:1px solid #b89c43;font:14px system-ui';
  const status = document.createElement('span');
  const finish = document.createElement('button');finish.textContent='Tätigkeit abgeschlossen';finish.type='button';finish.style.marginLeft='12px';
  const link=document.createElement('a');link.href='/lab/activity';link.textContent='Nutzungsübersicht';link.style.marginLeft='12px';
  bar.append(status,finish,link);document.body.prepend(bar);
  function render(){status.textContent='TEST · '+(!connected?'Nutzungserkennung nicht bestätigt':released?'Tätigkeit abgeschlossen':busy?'Speichervorgang läuft':dirty?'Offene Eingaben gemeldet':'Seite aktiv');finish.disabled=busy>0;}
  async function beat(){
    const body={id,seq:++seq,view,dirty,busy,released};
    try {const token=sessionStorage.getItem('monitor_lab_token');const r=await originalFetch('/lab/api/activity',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});connected=r.ok;}catch{connected=false;}
    render();
  }
  function touch(){dirty=true;released=false;render();void beat();}
  document.addEventListener('input',touch);document.addEventListener('change',touch);
  window.fetch=async function(input,init){
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
    const writing=url.origin===location.origin && !['GET','HEAD','OPTIONS'].includes(method) && url.pathname!=='/lab/api/activity';
    if(writing){busy++;released=false;render();void beat();}
    try{return await originalFetch(input,init);}finally{if(writing){busy--;render();void beat();}}
  };
  finish.onclick=async()=>{
    if(busy)return;
    if(dirty && !window.confirm('Sind alle Eingaben gespeichert oder bewusst verworfen? Nur dann Tätigkeit als abgeschlossen melden.'))return;
    dirty=false;released=true;await beat();
  };
  // Navigation/closing does not prove that work is saved. The old document stays unresolved
  // unless the user explicitly finished it. Expiry is always treated as unknown by the server.
  window.addEventListener('pagehide',()=>{void beat();});
  window.addEventListener('pageshow',e=>{if(e.persisted){released=false;void beat();}});
  setInterval(()=>{void beat();},20000);render();void beat();
})();
