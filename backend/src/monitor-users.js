const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SALT_ROUNDS = 10;

const DEFAULT_USERS = [
  { code: 'PM', name: 'Pit', role: 'user' },
  { code: 'SB', name: 'Sascha', role: 'user' },
  { code: 'HEJ', name: 'Henning', role: 'user' },
  { code: 'SA', name: 'Serdar', role: 'user' },
  { code: 'JO', name: 'Julien', role: 'user' },
  { code: 'BA', name: 'Bader', role: 'user' },
  { code: 'JK', name: 'Jens', role: 'user' },
  { code: 'PP', name: 'Plamen', role: 'user' },
  { code: 'AM', name: 'Angie', role: 'user' },
  { code: 'NO', name: 'Nadine', role: 'user' },
  { code: 'ADM', name: 'Admin', role: 'admin' },
];

function storePath() {
  const raw = String(process.env.MONITOR_USER_STORE_PATH || '').trim();
  if (raw) return path.resolve(raw);
  return path.join(process.cwd(), 'data', 'monitor-users.json');
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function readJsonSafe(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

function writeJsonAtomic(file, obj) {
  const dir = path.dirname(file);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function bootstrapStoreIfMissing() {
  const file = storePath();
  if (fs.existsSync(file)) return;
  const now = new Date().toISOString();
  const baseHash = bcrypt.hashSync('1234', SALT_ROUNDS);
  const users = DEFAULT_USERS.map(u => ({
    code: normalizeCode(u.code),
    name: String(u.name || '').trim(),
    role: u.role === 'admin' ? 'admin' : 'user',
    passwordHash: baseHash,
    mustChangePassword: true,
    disabled: false,
    tokenVersion: 1,
    createdAt: now,
    updatedAt: now,
  }));
  writeJsonAtomic(file, { users });
}

function loadStore() {
  bootstrapStoreIfMissing();
  const file = storePath();
  const data = readJsonSafe(file);
  const users = Array.isArray(data && data.users) ? data.users : [];
  return { file, users };
}

function saveStore(file, users) {
  writeJsonAtomic(file, { users: users || [] });
}

function findUser(users, { code, name }) {
  const c = normalizeCode(code);
  const n = normalizeName(name);
  if (c) {
    const hit = (users || []).find(u => u && normalizeCode(u.code) === c);
    if (hit) return hit;
  }
  if (n) {
    const hit = (users || []).find(u => u && normalizeName(u.name) === n);
    if (hit) return hit;
  }
  return null;
}

function jwtSecret() {
  const s = String(process.env.MONITOR_USER_JWT_SECRET || process.env.JWT_SECRET || '').trim();
  return s || 'dev_monitor_secret';
}

function signUserToken(user) {
  const payload = { code: normalizeCode(user.code), role: user.role === 'admin' ? 'admin' : 'user', ver: Number(user.tokenVersion || 0) };
  return jwt.sign(payload, jwtSecret(), { expiresIn: '30d', issuer: 'monitor' });
}

function verifyUserToken(token) {
  try {
    const v = jwt.verify(String(token || ''), jwtSecret(), { issuer: 'monitor' });
    if (!v || !v.code) return null;
    return v;
  } catch (e) {
    return null;
  }
}

function publicUserList() {
  const { users } = loadStore();
  return (users || [])
    .filter(u => u && !u.disabled)
    .map(u => ({ code: normalizeCode(u.code), name: String(u.name || '').trim() }))
    .filter(u => u.code && u.name)
    .sort((a, b) => a.code.localeCompare(b.code));
}

function requireMonitorUser(req, res, next) {
  const auth = String(req.header('authorization') || '').trim();
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const decoded = token ? verifyUserToken(token) : null;
  if (!decoded) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const { file, users } = loadStore();
  const user = findUser(users, { code: decoded.code });
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (user.disabled) return res.status(403).json({ ok: false, error: 'User disabled' });
  if (Number(user.tokenVersion || 0) !== Number(decoded.ver || 0)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  req.monitorUser = { code: normalizeCode(user.code), name: String(user.name || '').trim(), role: user.role === 'admin' ? 'admin' : 'user', mustChangePassword: !!user.mustChangePassword };
  req.monitorUserStore = { file, users };
  next();
}

function requireMonitorAdmin(req, res, next) {
  const u = req.monitorUser;
  if (!u || u.role !== 'admin') return res.status(403).json({ ok: false, error: 'Forbidden' });
  next();
}

async function login({ login, password }) {
  const { file, users } = loadStore();
  const user =
    findUser(users, { code: login }) ||
    findUser(users, { name: login }) ||
    null;
  if (!user) return { ok: false, status: 401, error: 'Invalid credentials' };
  if (user.disabled) return { ok: false, status: 403, error: 'User disabled' };
  const ok = await bcrypt.compare(String(password || ''), String(user.passwordHash || ''));
  if (!ok) return { ok: false, status: 401, error: 'Invalid credentials' };
  const token = signUserToken(user);
  const outUser = { code: normalizeCode(user.code), name: String(user.name || '').trim(), role: user.role === 'admin' ? 'admin' : 'user', mustChangePassword: !!user.mustChangePassword };
  return { ok: true, token, user: outUser, file, users };
}

async function changePassword({ file, users, code, oldPassword, newPassword }) {
  const user = findUser(users, { code });
  if (!user) return { ok: false, status: 404, error: 'Not found' };
  if (user.disabled) return { ok: false, status: 403, error: 'User disabled' };
  const oldOk = await bcrypt.compare(String(oldPassword || ''), String(user.passwordHash || ''));
  if (!oldOk) return { ok: false, status: 401, error: 'Invalid credentials' };
  const np = String(newPassword || '');
  if (np.length < 4) return { ok: false, status: 400, error: 'Password too short' };
  const hash = await bcrypt.hash(np, SALT_ROUNDS);
  user.passwordHash = hash;
  user.mustChangePassword = false;
  user.tokenVersion = Number(user.tokenVersion || 0) + 1;
  user.updatedAt = new Date().toISOString();
  saveStore(file, users);
  const token = signUserToken(user);
  const outUser = { code: normalizeCode(user.code), name: String(user.name || '').trim(), role: user.role === 'admin' ? 'admin' : 'user', mustChangePassword: !!user.mustChangePassword };
  return { ok: true, token, user: outUser };
}

async function adminResetUser({ file, users, code }) {
  const user = findUser(users, { code });
  if (!user) return { ok: false, status: 404, error: 'Not found' };
  const hash = await bcrypt.hash('1234', SALT_ROUNDS);
  user.passwordHash = hash;
  user.mustChangePassword = true;
  user.tokenVersion = Number(user.tokenVersion || 0) + 1;
  user.updatedAt = new Date().toISOString();
  saveStore(file, users);
  return { ok: true };
}

function adminSetDisabled({ file, users, code, disabled }) {
  const user = findUser(users, { code });
  if (!user) return { ok: false, status: 404, error: 'Not found' };
  user.disabled = !!disabled;
  user.tokenVersion = Number(user.tokenVersion || 0) + 1;
  user.updatedAt = new Date().toISOString();
  saveStore(file, users);
  return { ok: true };
}

async function adminCreateUser({ file, users, code, name, role, password }) {
  const c = normalizeCode(code);
  const n = String(name || '').trim();
  if (!c || !n) return { ok: false, status: 400, error: 'Missing fields' };
  if (findUser(users, { code: c })) return { ok: false, status: 409, error: 'Code exists' };
  const now = new Date().toISOString();
  const pw = String(password || '1234');
  const hash = await bcrypt.hash(pw, SALT_ROUNDS);
  users.push({
    code: c,
    name: n,
    role: role === 'admin' ? 'admin' : 'user',
    passwordHash: hash,
    mustChangePassword: true,
    disabled: false,
    tokenVersion: 1,
    createdAt: now,
    updatedAt: now,
  });
  saveStore(file, users);
  return { ok: true };
}

function adminListUsers(users) {
  return (users || []).map(u => ({
    code: normalizeCode(u.code),
    name: String(u.name || '').trim(),
    role: u.role === 'admin' ? 'admin' : 'user',
    mustChangePassword: !!u.mustChangePassword,
    disabled: !!u.disabled,
  })).sort((a, b) => a.code.localeCompare(b.code));
}

module.exports = {
  publicUserList,
  requireMonitorUser,
  requireMonitorAdmin,
  login,
  changePassword,
  adminResetUser,
  adminSetDisabled,
  adminCreateUser,
  adminListUsers,
};
