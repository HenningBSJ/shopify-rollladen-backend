const express=require('express');
const fs=require('node:fs');
const path=require('node:path');
const {History}=require('./history.cjs');
const {Activity}=require('./activity.cjs');
const {loadCatalog,findEvent,compareLink}=require('./calendar-catalog.cjs');
const {requireMonitorUser}=require(path.join(process.env.MONITOR_LAB_APP,'src/monitor-users.js'));
const store=new History(path.join(process.env.MONITOR_LAB_DIR,'history.sqlite'));
const activity=new Activity(path.join(process.env.MONITOR_LAB_DIR,'activity.sqlite'));
const catalog=()=>loadCatalog(path.join(process.env.MONITOR_LAB_DIR,'calendar-catalog.json'));
const router=express.Router();
router.get('/',(req,res)=>res.type('html').send(fs.readFileSync(path.join(__dirname,'panel-v4.html'),'utf8')));
router.get('/activity-client.js',(req,res)=>res.type('js').send(fs.readFileSync(path.join(__dirname,'activity-client.js'),'utf8')));
router.get('/api/activity',(req,res)=>res.json(activity.status()));
router.post('/api/activity',(req,res,next)=>req.headers.authorization?requireMonitorUser(req,res,next):next(),(req,res,next)=>{try{res.json(activity.report(req.body,req.monitorUser?.code));}catch(e){next(e);}});
router.get('/activity',(req,res)=>res.type('html').send(`<!doctype html><html lang="de"><meta charset="utf-8"><title>Nutzung der Testfassung</title><body><h1>Nutzung der Testfassung 4</h1><p>Nur Seiten dieser Testfassung werden erfasst. Keine automatische Neustartfreigabe. Die Live-App und ältere Testseiten sind nicht erfasst.</p><p>Abgelaufene Lebenszeichen bleiben als ungeklärt sichtbar. Nur die Person im jeweiligen Tab kann ihre Tätigkeit als abgeschlossen melden.</p><a href="/lab">Zurück zum Status</a><pre id="out"></pre><script>async function refresh(){try{const r=await fetch('/lab/api/activity');if(!r.ok)throw Error('HTTP '+r.status);document.getElementById('out').textContent=JSON.stringify(await r.json(),null,2);}catch(e){document.getElementById('out').textContent='Nutzung ungeklärt: '+e.message;}}refresh();setInterval(refresh,10000);</script></body></html>`));
router.get('/api/calendar-catalog',(req,res,next)=>{try{res.json(catalog());}catch(e){next(e);}});
router.get('/api/orders/:id/linked-preview',(req,res,next)=>{try{
  res.json({...store.linkedPreview(req.params.id),calendarReadCheck:compareLink(catalog(),store.state(req.params.id).calendarLink)});
}catch(e){next(e);}});
router.post('/api/orders/:id/calendar-selection',requireMonitorUser,(req,res,next)=>{try{
  if(typeof req.body.id!=='string'||!req.body.id)return res.status(400).json({error:'Ereignis-ID erforderlich'});
  const data=catalog();const event=findEvent(data,req.body.eventId);
  const saved=store.append({id:req.body.id,orderId:req.params.id,actor:req.monitorUser.code,type:'calendar_link',
    payload:{previousLink:req.body.previousLink,calendarId:data.calendarId,event}});
  res.json({...saved,state:store.state(req.params.id),calendarReadCheck:compareLink(data,store.state(req.params.id).calendarLink)});
}catch(e){next(e);}});
router.use(require('./routes-v3.cjs'));
module.exports=router;
