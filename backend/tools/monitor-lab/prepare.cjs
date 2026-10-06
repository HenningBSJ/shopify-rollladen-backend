// Creates a separate application snapshot. Never overwrites an existing lab.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const v4 = process.argv.includes('--v4');
const v3 = v4 || process.argv.includes('--v3');
const v2 = v3 || process.argv.includes('--v2');
const lab = path.join(root, v4 ? 'tmp/monitor-calendar-lab-v4' : v3 ? 'tmp/monitor-calendar-lab-v3' : v2 ? 'tmp/monitor-calendar-lab-v2' : 'tmp/monitor-calendar-lab');
const app = path.join(lab, 'app');
if (fs.existsSync(lab)) throw new Error('Testkopie existiert bereits; kein automatisches Überschreiben.');
fs.mkdirSync(path.join(app, 'data'), { recursive: true });
fs.writeFileSync(path.join(lab, '.gitignore'), '*\n!.gitignore\n');
fs.cpSync(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
for (const name of ['sp-b35-parts.json', 'sp-b35-hook-lookup.json']) {
  fs.copyFileSync(path.join(root, 'data', name), path.join(app, 'data', name));
}
// The current server logs HOST but does not pass it to listen. Fix only the copy.
const indexPath = path.join(app, 'src/index.js');
const original = fs.readFileSync(indexPath, 'utf8');
const needle = 'app.listen(PORT, () => {';
if (original.split(needle).length !== 2) throw new Error('Startcode geändert; lokale Bindung manuell prüfen.');
fs.writeFileSync(indexPath, original.replace(needle, "app.listen(PORT, '127.0.0.1', () => {"));
const bcrypt = require('bcryptjs');
const password = v2 ? JSON.parse(fs.readFileSync(path.join(root, 'tmp/monitor-calendar-lab/access.json'), 'utf8')).password
  : crypto.randomBytes(18).toString('base64url');
fs.writeFileSync(path.join(lab, 'access.json'), JSON.stringify({ user: 'LAB', password }, null, 2));
fs.writeFileSync(path.join(app, 'data/monitor-users.json'), JSON.stringify({ users: [{
  code: 'LAB', name: 'Testperson', role: 'admin', passwordHash: bcrypt.hashSync(password, 10),
  mustChangePassword: false, disabled: false, tokenVersion: 1,
}] }, null, 2));
function hashes(dir) {
  return Object.fromEntries(fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile()).map(e => {
      const file = path.join(e.parentPath, e.name);
      return [path.relative(root, file), crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')];
    }));
}
fs.writeFileSync(path.join(lab, 'baseline.json'), JSON.stringify({ createdAt: new Date().toISOString(),
  source: hashes(path.join(root, 'src')), data: hashes(path.join(root, 'data')) }, null, 2));
if (v3) {
  const previous = path.join(root, v4 ? 'tmp/monitor-calendar-lab-v3' : 'tmp/monitor-calendar-lab-v2');
  const { History } = require('./history.cjs');
  const history = new History(path.join(previous, 'history.sqlite'));
  try { history.backup(path.join(lab, 'history.sqlite')); } finally { history.close(); }
  fs.copyFileSync(path.join(previous, 'slack-snapshot.json'), path.join(lab, 'slack-snapshot.json'));
}
console.log('Testkopie angelegt: ' + app);
