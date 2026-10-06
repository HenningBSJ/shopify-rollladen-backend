const fs = require('node:fs');
const { TEST_CALENDAR } = require('./status.cjs');
function loadCatalog(file) {
  if (!fs.existsSync(file)) return { calendarId:TEST_CALENDAR,observedAt:null,events:[] };
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(data.calendarId!==TEST_CALENDAR || !Array.isArray(data.events) || !Number.isFinite(Date.parse(data.observedAt))) throw new Error('Ungültiger Kalender-Ausgangsstand');
  return data;
}
function findEvent(catalog,id) {
  const e=catalog.events.find(e=>e.id===id);
  if(!e || e.status==='cancelled')throw Object.assign(new Error('Termin nicht im geladenen Kalender-Ausgangsstand'),{status:409});
  return {id:e.id,summary:e.summary,...(e.colorId?{colorId:e.colorId}:{})};
}
function compareLink(catalog,link) {
  if(!link || link.calendarId!==catalog.calendarId)return {status:'not_verified',observedAt:null};
  const e=catalog.events.find(e=>e.id===link.event.id);
  if(!e)return {status:'not_in_loaded_window',observedAt:catalog.observedAt};
  return {status:e.status==='cancelled'?'cancelled':e.summary===link.event.summary && (e.colorId||'')===(link.event.colorId||'')?'matches_snapshot':'changed',
    observedAt:catalog.observedAt,continuousVerification:false};
}
module.exports={loadCatalog,findEvent,compareLink};
