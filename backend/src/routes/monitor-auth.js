const express = require('express');
const { monitorHttpAuthMiddleware } = require('../middleware');
const {
  publicUserList,
  requireMonitorUser,
  requireMonitorAdmin,
  login,
  changePassword,
  adminResetUser,
  adminSetDisabled,
  adminCreateUser,
  adminListUsers,
} = require('../monitor-users');

const router = express.Router();
router.use(monitorHttpAuthMiddleware);

router.get('/users', (req, res) => {
  res.json({ ok: true, users: publicUserList() });
});

router.post('/login', express.json(), async (req, res) => {
  const loginValue = String(req.body.login || '').trim();
  const password = String(req.body.password || '').trim();
  const out = await login({ login: loginValue, password });
  if (!out.ok) return res.status(out.status || 401).json({ ok: false, error: out.error || 'Unauthorized' });
  res.json({ ok: true, token: out.token, user: out.user });
});

router.get('/me', requireMonitorUser, (req, res) => {
  res.json({ ok: true, user: req.monitorUser });
});

router.post('/change-password', requireMonitorUser, express.json(), async (req, res) => {
  const oldPassword = String(req.body.oldPassword || '').trim();
  const newPassword = String(req.body.newPassword || '').trim();
  const out = await changePassword({
    file: req.monitorUserStore.file,
    users: req.monitorUserStore.users,
    code: req.monitorUser.code,
    oldPassword,
    newPassword,
  });
  if (!out.ok) return res.status(out.status || 400).json({ ok: false, error: out.error || 'Failed' });
  res.json({ ok: true, token: out.token, user: out.user });
});

router.get('/admin/users', requireMonitorUser, requireMonitorAdmin, (req, res) => {
  res.json({ ok: true, users: adminListUsers(req.monitorUserStore.users) });
});

router.post('/admin/users', requireMonitorUser, requireMonitorAdmin, express.json(), async (req, res) => {
  const code = String(req.body.code || '').trim();
  const name = String(req.body.name || '').trim();
  const role = String(req.body.role || '').trim();
  const password = String(req.body.password || '').trim();
  const out = await adminCreateUser({ file: req.monitorUserStore.file, users: req.monitorUserStore.users, code, name, role, password });
  if (!out.ok) return res.status(out.status || 400).json({ ok: false, error: out.error || 'Failed' });
  res.json({ ok: true });
});

router.post('/admin/users/:code/reset', requireMonitorUser, requireMonitorAdmin, async (req, res) => {
  const code = String(req.params.code || '').trim();
  const out = await adminResetUser({ file: req.monitorUserStore.file, users: req.monitorUserStore.users, code });
  if (!out.ok) return res.status(out.status || 400).json({ ok: false, error: out.error || 'Failed' });
  res.json({ ok: true });
});

router.post('/admin/users/:code/disabled', requireMonitorUser, requireMonitorAdmin, express.json(), (req, res) => {
  const code = String(req.params.code || '').trim();
  const disabled = !!req.body.disabled;
  const out = adminSetDisabled({ file: req.monitorUserStore.file, users: req.monitorUserStore.users, code, disabled });
  if (!out.ok) return res.status(out.status || 400).json({ ok: false, error: out.error || 'Failed' });
  res.json({ ok: true });
});

module.exports = router;
