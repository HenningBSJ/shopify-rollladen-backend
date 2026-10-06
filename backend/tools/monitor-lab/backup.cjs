const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { History } = require('./history.cjs');
const lab = path.resolve(__dirname, process.argv.includes('--v4') ? '../../tmp/monitor-calendar-lab-v4' : process.argv.includes('--v3') ? '../../tmp/monitor-calendar-lab-v3' : '../../tmp/monitor-calendar-lab-v2');
const store = new History(path.join(lab, 'history.sqlite'));
try {
  const file = path.join(lab, 'backups', new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID() + '.sqlite');
  store.backup(file);
  console.log('Sicherung mit erfolgreicher Integritätsprüfung: ' + file);
} finally { store.close(); }
