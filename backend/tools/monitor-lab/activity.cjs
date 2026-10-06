const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
class Activity {
  constructor(file, now = Date.now) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.now = now;
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, seq INTEGER NOT NULL, seen INTEGER NOT NULL,
        view TEXT NOT NULL, dirty INTEGER NOT NULL, busy INTEGER NOT NULL, released INTEGER NOT NULL, actor TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS activity_log(id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, at INTEGER NOT NULL, action TEXT NOT NULL);`);
  }
  report(p, actor = 'nicht angemeldet') {
    const bad = () => { throw Object.assign(new Error('Ungültiges Lebenszeichen'), { status: 400 }); };
    if (!p || typeof p.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(p.id)
      || !Number.isSafeInteger(p.seq) || p.seq < 1 || typeof p.view !== 'string'
      || !/^\/(?:lab|display|intake)(?:\/[^?#]*)?$/.test(p.view) || p.view.length > 150
      || typeof p.dirty !== 'boolean' || !Number.isSafeInteger(p.busy) || p.busy < 0 || p.busy > 1000
      || typeof p.released !== 'boolean' || (p.released && (p.dirty || p.busy))) bad();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const old = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(p.id);
      if (old && old.seq >= p.seq) { this.db.exec('COMMIT'); return { ignored: true }; }
      const now = this.now();
      this.db.prepare(`INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
        seq=excluded.seq,seen=excluded.seen,view=excluded.view,dirty=excluded.dirty,busy=excluded.busy,released=excluded.released,actor=excluded.actor`)
        .run(p.id,p.seq,now,p.view,Number(p.dirty),p.busy,Number(p.released),actor);
      if (!old || !!old.released !== p.released) this.db.prepare('INSERT INTO activity_log(session_id,at,action) VALUES(?,?,?)')
        .run(p.id,now,p.released ? 'user_finished' : 'active');
      this.db.exec('COMMIT'); return { ignored: false };
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  status() {
    const sessions = this.db.prepare('SELECT * FROM sessions ORDER BY seen DESC').all().map(s => ({
      id:s.id, actor:s.actor, view:s.view, lastSeen:new Date(s.seen).toISOString(), dirty:!!s.dirty, busy:s.busy,
      state: s.released ? 'finished' : this.now()-s.seen > 65000 ? 'unknown' : 'active',
    }));
    return { sessions, blockers:sessions.filter(s=>s.state!=='finished').length,
      restartAllowed:false, manualApprovalRequired:true, coverage:'test-version-4-only' };
  }
  close() { this.db.close(); }
}
module.exports = { Activity };
