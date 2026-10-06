const path = require('node:path');
const express = require('express');
const { History } = require('./history.cjs');
const { scanContext } = require('./scan-context.cjs');
const { requireMonitorUser } = require(path.join(process.env.MONITOR_LAB_APP, 'src/monitor-users.js'));
const store = new History(path.join(process.env.MONITOR_LAB_DIR, 'history.sqlite'));
const router = express.Router();
router.post('/api/production/scan', requireMonitorUser, (req, res, next) => {
  try {
    const b = req.body || {};
    if (typeof b.eventId !== 'string' || !b.eventId) return res.status(400).json({ ok: false, error: 'Scan-ID erforderlich' });
    const m = /^rwjob:(Rec[0-9A-Za-z]+)$/.exec(String(b.code || '').trim());
    if (!m) return res.status(400).json({ ok: false, error: 'Ungültiger Scan-Code' });
    const result = store.append({ id: b.eventId, orderId: m[1], actor: req.monitorUser.code, type: 'monitor_scan', context: scanContext(req),
      payload: { code: 'rwjob:' + m[1], stage: Number(b.stage), rawPart: String(b.part || ''),
        partial: b.partial === true, reportedActor: String(b.actor || ''), reportedOrigin: String(b.origin || ''),
        station: String(b.station || '').trim() } });
    res.json({ ok: true, itemId: m[1], ...result, storedLocally: true, slackUpdated: false,
      status: store.state(m[1]).production.status, needsAssignment: true });
  } catch (e) { next(e); }
});
module.exports = router;
