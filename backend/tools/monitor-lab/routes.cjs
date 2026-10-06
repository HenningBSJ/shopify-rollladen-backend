const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { History } = require('./history.cjs');
const { calendarPreview } = require('./status.cjs');
const { scanContext } = require('./scan-context.cjs');
const { requireMonitorUser } = require(path.join(process.env.MONITOR_LAB_APP, 'src/monitor-users.js'));
const store = new History(path.join(process.env.MONITOR_LAB_DIR, 'history.sqlite'));
const router = express.Router();
router.get('/', (req, res) => res.type('html').send(fs.readFileSync(path.join(__dirname, 'panel.html'), 'utf8')));
router.get('/api/orders', (req, res) => res.json({ orders: store.orders(), mode: 'lab', slack: 'dated-snapshot' }));
router.get('/api/orders/:id', (req, res) => res.json({ state: store.state(req.params.id), events: store.events(req.params.id) }));
router.post('/api/orders/:id/events', requireMonitorUser, (req, res, next) => {
  try {
    if (!['requirements', 'confirmation', 'scan', 'correction'].includes(req.body.type)) return res.status(400).json({ error: 'Ereignistyp nicht erlaubt' });
    if (typeof req.body.id !== 'string' || !req.body.id) return res.status(400).json({ error: 'Wiederholschutz-ID erforderlich' });
    const saved = store.append({ id: req.body.id, orderId: req.params.id, type: req.body.type,
      actor: req.monitorUser.code, payload: req.body.payload,
      context: req.body.type === 'scan' ? scanContext(req) : {} });
    res.json({ ...saved, state: store.state(req.params.id) });
  } catch (e) { next(e); }
});
router.post('/api/orders/:id/preview', (req, res, next) => {
  try {
    const state = store.state(req.params.id);
    res.json(calendarPreview({ ...req.body, material: state.material, production: state.production }));
  } catch (e) { e.status = 400; next(e); }
});
module.exports = router;
