const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const v4 = process.argv.includes('--v4');
const v3 = v4 || process.argv.includes('--v3');
const v2 = v3 || process.argv.includes('--v2');
const lab = path.resolve(__dirname, v4 ? '../../tmp/monitor-calendar-lab-v4' : v3 ? '../../tmp/monitor-calendar-lab-v3' : v2 ? '../../tmp/monitor-calendar-lab-v2' : '../../tmp/monitor-calendar-lab');
const app = path.join(lab, 'app');
const access = JSON.parse(fs.readFileSync(path.join(lab, 'access.json'), 'utf8'));
// Do not inherit production credentials, database settings, printer paths or NODE_OPTIONS.
for (const key of Object.keys(process.env)) {
  if (!['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP'].some(k => k.toLowerCase() === key.toLowerCase())) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: 'development', PORT: v4 ? '3310' : v3 ? '3309' : v2 ? '3308' : '3307', HOST: '127.0.0.1',
  MONITOR_HTTP_USER: access.user, MONITOR_HTTP_PASSWORD: access.password,
  MONITOR_COOKIE_SECRET: crypto.randomBytes(32).toString('hex'),
  JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  MONITOR_USER_STORE_PATH: path.join(app, 'data/monitor-users.json'),
  PDF_LOCAL_DIR: path.join(app, 'tmp'),
  SLACK_LIST_ID: 'LAB_ONLY', AUTO_SYNC_MONTAGE_FROM_DUE: 'false',
  MONITOR_LAB_DIR: lab, MONITOR_LAB_APP: app,
});
// Every external fetch fails closed. No Slack/Shopify/calendar writes or reads.
global.fetch = async () => { throw new Error('LAB_EXTERNAL_NETWORK_DISABLED'); };
// Do not connect to any database, even localhost.
const dbPath = path.join(app, 'src/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  getClient: async () => ({ release() {} }),
  query: async () => { throw new Error('LAB_DATABASE_DISABLED'); },
} };
const slackPath = path.join(app, 'src/slack.js');
const blocked = async () => { throw Object.assign(new Error('LAB_SLACK_WRITE_DISABLED'), { status: 403 }); };
require.cache[slackPath] = { id: slackPath, filename: slackPath, loaded: true, exports: {
  listColumns: async () => ({ columns: [] }), listSchema: async () => [],
  listItems: async () => ({ items: [], response_metadata: {} }),
  itemInfo: async () => { throw new Error('LAB_NO_SLACK_ITEM'); },
  updateItem: blocked, createItem: blocked, postMessage: blocked,
} };
if (v2) {
  const snapshotFile = path.join(lab, 'slack-snapshot.json');
  if (fs.existsSync(snapshotFile)) {
    const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
    process.env.SLACK_LIST_ID = snapshot.listId;
    const checked = listId => { if (listId !== snapshot.listId) throw new Error('LAB_LIST_NOT_IMPORTED'); };
    Object.assign(require.cache[slackPath].exports, {
      listColumns: async ({ listId }) => { checked(listId); return { columns: snapshot.schema }; },
      listSchema: async ({ listId }) => { checked(listId); return snapshot.schema; },
      listItems: async ({ listId, cursor }) => { checked(listId); return { items: cursor ? [] : snapshot.items, response_metadata: {} }; },
      itemInfo: async ({ listId, itemId }) => {
        checked(listId); const item = snapshot.items.find(i => i.id === itemId);
        if (!item) throw new Error('LAB_ITEM_NOT_IMPORTED');
        return { item, list: { list_metadata: { schema: snapshot.schema } } };
      },
    });
  }
}
// Disable all subprocesses (especially printing/browser launches) in this lab process.
const child = require('node:child_process');
for (const name of ['exec', 'execFile', 'execSync', 'execFileSync', 'spawn', 'spawnSync', 'fork']) {
  child[name] = () => { throw new Error('LAB_SUBPROCESS_DISABLED'); };
}
// Use a different cookie name: browser cookies are shared across localhost ports.
const index = path.join(app, 'src/index.js');
const middleware = path.join(app, 'src/middleware.js');
for (const file of [index, middleware]) {
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace(/\bmonitor_session\b/g, v4 ? 'monitor_lab_v4_session' : v3 ? 'monitor_lab_v3_session' : v2 ? 'monitor_lab_v2_session' : 'monitor_lab_session'));
}
if (v2) {
  process.env.MONITOR_LAB_ROUTES = path.join(__dirname, v4 ? 'routes-v4.cjs' : v3 ? 'routes-v3.cjs' : 'routes.cjs');
  const source = fs.readFileSync(index, 'utf8');
  if (!source.includes('MONITOR_LAB_ROUTES')) {
    fs.writeFileSync(index, source.replace('app.use(errorHandler);', "app.use('/lab', require(process.env.MONITOR_LAB_ROUTES));\napp.use(errorHandler);"));
  }
}
if (v3) {
  process.env.MONITOR_LAB_BRIDGE = path.join(__dirname, 'monitor-bridge.cjs');
  const source = fs.readFileSync(index, 'utf8');
  if (!source.includes('MONITOR_LAB_BRIDGE')) {
    const needle = "app.use('/api/production', productionRoutes);";
    if (source.split(needle).length !== 2) throw new Error('Production-Mount geändert; Abbruch');
    fs.writeFileSync(index, source.replace(needle, "app.use(require(process.env.MONITOR_LAB_BRIDGE));\n" + needle));
  }
  require('./patch-monitor.cjs')(app);
}
if (v4) {
  process.env.MONITOR_LAB_ACTIVITY = path.join(__dirname, 'inject-activity.cjs');
  const source = fs.readFileSync(index, 'utf8');
  if (!source.includes('MONITOR_LAB_ACTIVITY')) {
    const needle = "app.use('/api/auth', authRoutes);";
    if (source.split(needle).length !== 2) throw new Error('Middleware-Mount geändert');
    fs.writeFileSync(index, source.replace(needle, "app.use(require(process.env.MONITOR_LAB_ACTIVITY));\n" + needle));
  }
}
console.log(`TESTKOPIE: http://127.0.0.1:${process.env.PORT}/${v2 ? 'lab' : 'display'} — externe Zugriffe gesperrt.`);
require(index);
