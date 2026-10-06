const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { History } = require('./history.cjs');
const { requireMonitorUser } = require(path.join(process.env.MONITOR_LAB_APP, 'src/monitor-users.js'));
const store = new History(path.join(process.env.MONITOR_LAB_DIR, 'history.sqlite'));
const router = express.Router();
router.get('/', (req, res) => res.type('html').send(fs.readFileSync(path.join(__dirname, 'panel-v3.html'), 'utf8')));
router.get('/api/orders/:id/linked-preview', (req, res, next) => {
  try { res.json(store.linkedPreview(req.params.id)); } catch (e) { next(e); }
});
router.post('/api/orders/:id/events', requireMonitorUser, (req, res, next) => {
  if (!['calendar_link', 'calendar_unlink', 'scan_assignment'].includes(req.body.type)) return next();
  try {
    if (typeof req.body.id !== 'string' || !req.body.id) return res.status(400).json({ error: 'Ereignis-ID erforderlich' });
    res.json({ ...store.append({ id: req.body.id, orderId: req.params.id, type: req.body.type,
      actor: req.monitorUser.code, payload: req.body.payload }), state: store.state(req.params.id) });
  } catch (e) { next(e); }
});
router.use(require('./routes.cjs'));
module.exports = router;
