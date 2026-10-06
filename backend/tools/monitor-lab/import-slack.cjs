// Credentials are read only here; they are never copied into the lab or printed.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createReader, resolveItem } = require('./slack-readonly.cjs');
const { History } = require('./history.cjs');
const root = path.resolve(__dirname, '../..');
const lab = path.join(root, process.argv.includes('--v4') ? 'tmp/monitor-calendar-lab-v4' : process.argv.includes('--v3') ? 'tmp/monitor-calendar-lab-v3' : 'tmp/monitor-calendar-lab-v2');
async function main() {
  if (!fs.existsSync(path.join(lab, 'app'))) throw new Error('Zuerst die gewählte Testkopie vorbereiten');
  const env = require('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
  const reader = createReader({ token: env.SLACK_BOT_TOKEN, listId: env.SLACK_LIST_ID });
  // Complete every page before storing any snapshots; no partial imports on network failure.
  const snapshot = await reader.snapshot();
  const resolved = snapshot.items.map(item => resolveItem(item, snapshot.schema));
  if (resolved.some(item => !item.orderId)) throw new Error('Slack-Auftrags-ID fehlt');
  const store = new History(path.join(lab, 'history.sqlite'));
  const batch = randomUUID();
  try {
    store.backup(path.join(lab, 'backups', batch + '-before-import.sqlite'));
    for (const item of resolved) store.append({ id: batch + ':' + item.orderId, orderId: item.orderId,
      actor: 'slack-readonly-import', type: 'slack_snapshot',
      payload: { title: item.title, status: item.status, observedAt: snapshot.observedAt, listId: snapshot.listId } });
    const file = path.join(lab, 'slack-snapshot.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify(snapshot));
    fs.renameSync(file + '.tmp', file);
    const counts = {};
    for (const item of resolved) counts[item.status] = (counts[item.status] || 0) + 1;
    console.log(JSON.stringify({ imported: resolved.length, observedAt: snapshot.observedAt, statuses: counts }));
  } finally { store.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
