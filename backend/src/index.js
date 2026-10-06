const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const {
  errorHandler,
  createMonitorSessionCookieValue,
  monitorHttpAuthMiddleware,
} = require('./middleware');
const authRoutes = require('./routes/auth');
const addressRoutes = require('./routes/addresses');
const pdfRoutes = require('./routes/pdf');
const qrRoutes = require('./routes/qr');
const monitorAuthRoutes = require('./routes/monitor-auth');
const productionRoutes = require('./routes/production');
const displayRoutes = require('./routes/display');
const intakeRoutes = require('./routes/intake');
const intakeUiRoutes = require('./routes/intake-ui');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================================
// ✅ 1. HELMET: Security Headers! (XSS / Clickjack / etc.)
// ========================================================
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: { action: 'sameorigin' },
    hsts: false,
    hidePoweredBy: true,
    noSniff: true,
    permittedCrossDomainPolicies: true,
    xssFilter: true,
  })
);

// ========================================================
// ✅ 2. CORS WHITELIST! (NUR erlaubte Origins!)
// ========================================================
const CORS_WHITELIST = [
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
  /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?$/i,
  /^https?:\/\/100\.9[0-9]{2}\.\d{1,3}\.\d{1,3}(?::\d+)?$/i,
  /\.trycloudflare\.com$/i,
  /monitor\.rollladenwelt\.de$/i,
  /rollladenwelt\.myshopify\.com$/i,
];
const originIsAllowed = (origin) => {
  if (!origin) return true;
  const o = String(origin).trim();
  if (!o) return true;
  if (o === 'null') return true;
  if (o === 'about:blank') return true;
  return CORS_WHITELIST.some((rx) => rx.test(o));
};
app.use(
  cors({
    origin: function (origin, callback) {
      if (originIsAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS origin not allowed: ' + origin), false);
      }
    },
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 3600,
  })
);

// ========================================================
// ✅ 3. RATE LIMITING: Schutz vor Brute Force / DoS!
// ========================================================
const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => String(req.ip).includes('127.0.0.1'),
});
app.use('/api/', apiLimiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Zu viele Login-Versuche! Bitte 15 Minuten warten.',
});
app.use('/login', loginLimiter);

app.set('trust proxy', 1);

// ========================================================
// ✅ 4. Request Parser
// ========================================================
app.use(express.json({ limit: '4mb' }));

// ========================================================
// ✅ 5. GLOBAL AUTH PROTECTOR! Ausnahmen: /health + /login + /logout
// ========================================================
const PUBLIC_PATHS = [
  '/health',
  '/login',
  '/logout',
  '/favicon.ico',
  '/robots.txt',
];
app.use((req, res, next) => {
  const url = String(req.originalUrl || req.url || req.path || '').split('?')[0];
  if (PUBLIC_PATHS.includes(url)) return next();
  if (url.startsWith('/login') || url.startsWith('/logout')) return next();
  monitorHttpAuthMiddleware(req, res, next);
});

// ========================================================
// ✅ 6. LOGIN / LOGOUT + SESSION MANAGEMENT
// ========================================================
app.options('/login', (req, res) => {
  res.setHeader('Allow', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendStatus(204);
});

app.get('/login', (req, res) => {
  const requiredPassword = String(process.env.MONITOR_HTTP_PASSWORD || '').trim();
  if (!requiredPassword) return res.redirect(302, '/display');
  const nextUrlRaw = String(req.query.next || '/display');
  const nextUrl = nextUrlRaw.startsWith('/') ? nextUrlRaw : '/display';
  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Monitor Login</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; }
    .box { max-width: 520px; }
    label { display: grid; gap: 6px; margin: 10px 0; font-weight: 700; }
    input { padding: 10px 12px; border: 1px solid #ccc; border-radius: 10px; font-size: 14px; }
    button { padding: 10px 12px; border-radius: 10px; border: 1px solid #333; background: #111; color: #fff; font-weight: 800; cursor: pointer; }
    .muted { color: #666; font-size: 12px; }
    .err { color: #c62828; font-weight: 700; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="box">
    <h2>Monitor Login</h2>
    <div class="muted">Wenn das Browser-Popup für Basic-Auth nicht erscheint, hier einloggen.</div>
    ${req.query.error ? '<div class="err">Benutzer oder Passwort falsch! Bitte erneut versuchen.</div>' : ''}
    <form method="post" action="/login" autocomplete="on">
      <input type="hidden" name="next" value="${nextUrl.replace(/"/g, '&quot;')}">
      <label>Benutzer
        <input name="user" autocomplete="username" autofocus>
      </label>
      <label>Passwort
        <input name="password" type="password" autocomplete="current-password">
      </label>
      <button type="submit">Einloggen</button>
    </form>
  </div>
</body>
</html>`;
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

app.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  console.log('[LOGIN STEP 1] POST /login hit! method=', req.method, 'ip=', req.ip);
  try {
    const requiredPassword = String(process.env.MONITOR_HTTP_PASSWORD || '').trim();
    console.log('[LOGIN STEP 2] requiredPassword length=', requiredPassword.length);
    const nextUrlRaw = String((req.body && req.body.next) || req.query.next || '/display');
    const nextUrl = nextUrlRaw.startsWith('/') ? nextUrlRaw : '/display';
    console.log('[LOGIN STEP 3] nextUrl=', nextUrl);

    if (!requiredPassword) { console.log('[LOGIN STEP 4a] No required password, redirect!'); return res.redirect(302, nextUrl); }
    const requiredUser = String(process.env.MONITOR_HTTP_USER || '').trim();
    const user = String((req.body && req.body.user) || '').trim();
    const password = String((req.body && req.body.password) || '').trim();
    console.log('[LOGIN STEP 4b] user=', user, 'len=', password.length, 'requiredUser=', requiredUser);

    const userOk = !requiredUser || user === requiredUser;
    const passOk = password === requiredPassword;
    console.log('[LOGIN STEP 5] userOk=', userOk, 'passOk=', passOk);
    if (!userOk || !passOk) { console.log('[LOGIN STEP 5b] Credentials wrong! Redirect error!'); return res.redirect(302, `/login?next=${encodeURIComponent(nextUrl)}&error=1`); }

    try {
      console.log('[LOGIN STEP 6] Credentials OK! Creating cookie...');
      const isHttps = String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https' || req.secure === true;
      const token = createMonitorSessionCookieValue({ user: user || '' });
      console.log('[LOGIN STEP 7] token created=', !!token, 'len=', (token || '').length, 'isHttps=', isHttps);
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
        console.log('[LOGIN STEP 8] Set-Cookie appended! Length=', cookie.join('; ').length);
      }
    } catch (cookieErr) {
      console.error('[LOGIN STEP 9] Cookie create FAILED:', cookieErr.message, cookieErr.stack);
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    console.log('[LOGIN STEP 10] FINAL Redirect to ', nextUrl);
    return res.redirect(302, nextUrl);
  } catch (topErr) {
    console.error('[LOGIN FATAL STEP 99] TOP LEVEL CATCH:', topErr.message, topErr.stack);
    const fallbackNext = '/display';
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.redirect(302, `/login?next=${encodeURIComponent(fallbackNext)}&error=1`);
  }
});

app.get('/logout', (req, res) => {
  const isHttps = String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https' || req.secure === true;
  const cookie = [
    'monitor_session=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isHttps) cookie.push('Secure');
  res.append('Set-Cookie', cookie.join('; '));
  res.redirect(302, '/login');
});

// ========================================================
// ✅ 7. HEALTH UNPROTECTED (OK!)
// ========================================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========================================================
// ✅ 8. PDF STATIC ORDNER (MIT AUTH! - Schon geschützt durch Global Auth!)
// ========================================================
const pdfLocalDir = process.env.PDF_LOCAL_DIR || path.join(process.cwd(), 'tmp');
app.use(
  '/pdfs',
  monitorHttpAuthMiddleware,
  express.static(path.join(pdfLocalDir, 'pdfs'), { fallthrough: false })
);

// ========================================================
// ✅ 9. API ROUTES (MIT AUTH! - Bereits global geschützt!)
// ========================================================
app.use('/api/auth', authRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/monitor-auth', monitorAuthRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/intake', intakeRoutes);
app.use('/display', displayRoutes);
app.use('/intake', intakeUiRoutes);

// ========================================================
// ✅ 10. ERROR HANDLER (KEINE SECRETS im Output!)
// ========================================================
app.use(errorHandler);

// ========================================================
// SERVER START + DB CHECK
// ========================================================
const startServer = async () => {
  try {
    const client = await db.getClient();
    client.release();
    console.log('[DB] Connected successfully');
  } catch (err) {
    const redacted = String(err.message || '').replace(/postgres:\/\/[^@\s]+@/gi, 'postgres://***:***@');
    console.error('[DB] Connection failed:', redacted);
    console.error('[DB] Check DATABASE_URL in .env');
    if (process.env.ALLOW_START_WITHOUT_DB !== 'true') {
      process.exit(1);
    }
  }

  app.listen(PORT, () => {
    const host = String(process.env.HOST || '0.0.0.0');
    console.log(`[Server] Running on ${host}:${PORT}`);
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[Security] Helmet: ON | CORS Whitelist: ${CORS_WHITELIST.length} Einträge | Rate Limit: ON | Global Auth: ON`);
  });
};

startServer();

module.exports = app;
