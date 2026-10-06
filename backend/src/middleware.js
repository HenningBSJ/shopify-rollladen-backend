const auth = require('./auth');
const crypto = require('crypto');

function base64UrlEncode(input) {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(String(input || ''), 'utf8');
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeToString(s) {
  const t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = t.length % 4 ? '='.repeat(4 - (t.length % 4)) : '';
  return Buffer.from(t + pad, 'base64').toString('utf8');
}

function getMonitorCookieSecret() {
  const s = String(process.env.MONITOR_COOKIE_SECRET || '').trim();
  if (s) return s;
  return String(process.env.MONITOR_HTTP_PASSWORD || '').trim();
}

function createMonitorSessionCookieValue({ user = '', ttlSeconds = 60 * 60 * 24 * 14 } = {}) {
  const secret = getMonitorCookieSecret();
  if (!secret) return '';
  const now = Date.now();
  const payload = JSON.stringify({ v: 1, u: String(user || ''), exp: now + (Math.max(60, ttlSeconds) * 1000) });
  const payloadB64 = base64UrlEncode(payload);
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest();
  const sigB64 = base64UrlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

function verifyMonitorSessionCookieValue(value) {
  const token = String(value || '').trim();
  if (!token) return { ok: false };
  const secret = getMonitorCookieSecret();
  if (!secret) return { ok: false };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false };
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return { ok: false };
  let expected;
  try {
    expected = base64UrlEncode(crypto.createHmac('sha256', secret).update(payloadB64).digest());
  } catch (e) {
    return { ok: false };
  }
  const a = Buffer.from(String(sigB64));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false };
  let payload;
  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  } catch (e) {
    return { ok: false };
  }
  const exp = Number(payload?.exp);
  if (!Number.isFinite(exp) || exp < Date.now()) return { ok: false };
  return { ok: true, user: String(payload?.u || '') };
}

function parseCookies(header) {
  const s = String(header || '');
  if (!s) return {};
  const out = {};
  for (const part of s.split(';')) {
    const p = part.trim();
    if (!p) continue;
    const idx = p.indexOf('=');
    if (idx < 0) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = v;
  }
  return out;
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const decoded = auth.verifyAccessToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.user = decoded;
  next();
}

function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
}

function monitorHttpAuthMiddleware(req, res, next) {
  const isApiRequest = () => {
    const full = String(req.originalUrl || req.url || req.path || '');
    return full.startsWith('/api/');
  };

  const isNavigationRequest = () => {
    if (isApiRequest()) return false;
    const accept = String(req.headers.accept || '').toLowerCase();
    if (accept.includes('application/json')) return false;
    const mode = String(req.headers['sec-fetch-mode'] || '').toLowerCase();
    const dest = String(req.headers['sec-fetch-dest'] || '').toLowerCase();
    if (mode === 'navigate' || dest === 'document') return true;
    if (req.method !== 'GET') return false;
    return accept.includes('text/html') || !accept;
  };

  const setNoCacheHeaders = () => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  };

  const fullUrl = String(req.originalUrl || req.url || req.path || '/');
  const cookies = parseCookies(req.headers.cookie);
  const session = verifyMonitorSessionCookieValue(cookies.monitor_session);
  if (session.ok) {
    setNoCacheHeaders();
    return next();
  }

  const requiredPassword = String(process.env.MONITOR_HTTP_PASSWORD || '').trim();
  if (!requiredPassword) return next();
  const requiredUser = String(process.env.MONITOR_HTTP_USER || '').trim();

  const sendUnauthorized = () => {
    if (isApiRequest()) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    if (isNavigationRequest()) {
      const nextUrl = fullUrl && fullUrl.startsWith('/') ? fullUrl : '/display';
      setNoCacheHeaders();
      return res.redirect(302, `/login?next=${encodeURIComponent(nextUrl)}`);
    }
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  };

  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Basic ')) {
    return sendUnauthorized();
  }

  let decoded = '';
  try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8'); } catch (e) {}
  const idx = decoded.indexOf(':');
  const givenUser = idx >= 0 ? decoded.slice(0, idx) : '';
  const givenPassword = idx >= 0 ? decoded.slice(idx + 1) : '';

  const a = Buffer.from(String(givenUser));
  const b = Buffer.from(String(requiredUser));
  const userOk = !requiredUser || (a.length === b.length && crypto.timingSafeEqual(a, b));

  const p1 = Buffer.from(String(givenPassword));
  const p2 = Buffer.from(String(requiredPassword));
  const passOk = p1.length === p2.length && crypto.timingSafeEqual(p1, p2);

  if (!userOk || !passOk) {
    return sendUnauthorized();
  }

  let token = '';
  try {
    const isHttps = String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https' || req.secure === true;
    token = createMonitorSessionCookieValue({ user: givenUser || '' });
    if (token) {
      const cookie = [
        `monitor_session=${token}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${60 * 60 * 24 * 14}`,
      ];
      if (isHttps) cookie.push('Secure');
      res.append('Set-Cookie', cookie.join('; '));
    }
  } catch (e) {}

  if (token && isNavigationRequest() && req.method === 'GET' && !fullUrl.match(/[?&]__cookie_set=1($|&|#)/)) {
    setNoCacheHeaders();
    const sep = fullUrl.includes('?') ? '&' : '?';
    const target = `${fullUrl}${sep}__cookie_set=1`;
    return res.redirect(302, target);
  }

  setNoCacheHeaders();
  next();
}

module.exports = {
  authMiddleware,
  errorHandler,
  monitorHttpAuthMiddleware,
  createMonitorSessionCookieValue,
};
