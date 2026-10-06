const fs = require('node:fs');
const path = require('node:path');
module.exports = function patchMonitor(app) {
  const file = path.join(app, 'src/routes/display.js');
  let source = fs.readFileSync(file, 'utf8');
  if (source.includes('MONITOR_LAB_SCAN_BRIDGE_V3')) return;
  function replaceOnce(before, after) {
    if (source.split(before).length !== 2) throw new Error('Monitor-Code geändert; Testpatch abgebrochen');
    source = source.replace(before, after);
  }
  replaceOnce("const out = await postJsonWithRetry('/api/production/scan', { code, stage, part, partial, origin, station, actor }, { retries: 1 });",
    "// MONITOR_LAB_SCAN_BRIDGE_V3\n        if (!pending.eventId) pending.eventId = crypto.randomUUID();\n        const eventId = pending.eventId;\n        const out = await postJsonWithRetry('/api/production/scan', { code, stage, part, partial, origin, station, actor, eventId }, { retries: 1 });");
  replaceOnce("if (ak) headers['x-admin-key'] = ak;",
    "if (ak) headers['x-admin-key'] = ak;\n        if (url === '/api/production/scan') {\n          const labToken = sessionStorage.getItem('monitor_lab_token');\n          if (labToken) headers.Authorization = 'Bearer ' + labToken;\n        }");
  replaceOnce("showToast('Status gesetzt');", "showToast('Testscan dauerhaft gespeichert; Slack unverändert');");
  // A visible notice is attached only to the main monitor page in the copy.
  const marker = "router.get('/', (req, res) => {";
  const at = source.indexOf(marker);
  if (at < 0) throw new Error('Monitor-Hauptroute fehlt');
  const bodyAt = source.indexOf('<body>', at);
  if (bodyAt < 0) throw new Error('Monitor-HTML fehlt');
  source = source.slice(0, bodyAt) + source.slice(bodyAt).replace('<body>',
    '<body><div style="background:#fff2cc;padding:12px;color:#222">TESTKOPIE · Slack-Ausgangsstand · Scans nur lokal. <a href="/lab">Testperson anmelden / Historie / Terminzuordnung</a></div>');
  fs.writeFileSync(file, source);
};
