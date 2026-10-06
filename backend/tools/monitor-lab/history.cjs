const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { materialStatus, productionStatus, TEST_CALENDAR, calendarPreview } = require('./status.cjs');
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function required(value, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) fail(name + ' fehlt/ungültig');
  return value.trim();
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
class History {
  constructor(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE, order_id TEXT NOT NULL, type TEXT NOT NULL,
        actor TEXT NOT NULL, recorded_at TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_order ON events(order_id, seq);
      CREATE TRIGGER IF NOT EXISTS immutable_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'immutable_history'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'immutable_history'); END;`);
    if (!this.db.prepare('PRAGMA table_info(events)').all().some(c => c.name === 'context')) {
      this.db.exec("ALTER TABLE events ADD COLUMN context TEXT NOT NULL DEFAULT '{}'");
    }
  }
  events(orderId) {
    return this.db.prepare('SELECT * FROM events WHERE order_id=? ORDER BY seq').all(orderId)
      .map(e => ({ ...JSON.parse(e.payload), seq: e.seq, id: e.id, orderId: e.order_id, type: e.type,
        actor: e.actor, recordedAt: e.recorded_at, context: JSON.parse(e.context || '{}') }));
  }
  orders() { return this.db.prepare('SELECT DISTINCT order_id FROM events ORDER BY order_id').all().map(r => this.state(r.order_id)); }
  state(orderId) {
    const events = this.events(orderId);
    const voided = new Set(events.filter(e => e.type === 'correction').map(e => e.targetId));
    const active = events.filter(e => !voided.has(e.id));
    const requirements = active.findLast(e => e.type === 'requirements');
    const parts = (requirements?.parts || []).map(p => {
      const confirmation = active.findLast(e => e.type === 'confirmation' && e.revision === requirements.id && e.partId === p.id);
      return { ...p, confirmed: confirmation?.quantity || 0,
        confirmedAt: confirmation?.recordedAt || null, confirmedBy: confirmation?.actor || null };
    });
    const snapshot = events.findLast(e => e.type === 'slack_snapshot');
    const link = events.findLast(e => ['calendar_link', 'calendar_unlink'].includes(e.type));
    return { orderId, title: snapshot?.title || orderId, revision: requirements?.id || null, parts,
      calendarLink: link?.type === 'calendar_link' ? { id: link.id, calendarId: link.calendarId,
        event: link.event, verifiedWithGoogle: false } : null,
      linkRevision: link?.id || null,
      material: materialStatus({ requirementsConfirmed: !!requirements, parts }),
      production: productionStatus({ history: events }),
      // Read snapshots are always visibly dated; they are not a continuous live connection.
      slackObservedAt: snapshot?.observedAt || null,
      scans: events.filter(e => ['scan', 'monitor_scan'].includes(e.type)).map(e => {
        const assignment = active.findLast(a => a.type === 'scan_assignment' && a.scanId === e.id);
        return { ...e, corrected: voided.has(e.id),
          ...(e.type === 'monitor_scan' ? { assignment: assignment || null, needsAssignment: !assignment } : {}) };
      }),
      eventCount: events.length };
  }
  append({ id = randomUUID(), orderId, type, actor, payload, context = {} }) {
    id = required(id, 'Ereignis-ID'); orderId = required(orderId, 'Auftrags-ID'); actor = required(actor, 'Bearbeiter');
    const allowed = { requirements: ['previousRevision', 'parts'], confirmation: ['revision', 'partId', 'quantity'],
      scan: ['revision', 'partId', 'action', 'station'], correction: ['targetId', 'reason'],
      slack_snapshot: ['title', 'status', 'observedAt', 'listId'],
      monitor_scan: ['code', 'stage', 'rawPart', 'partial', 'reportedActor', 'reportedOrigin', 'station'],
      scan_assignment: ['scanId', 'revision', 'partId'],
      calendar_link: ['previousLink', 'calendarId', 'event'], calendar_unlink: ['previousLink', 'reason'] };
    if (!allowed[type] || !payload || Array.isArray(payload) || typeof payload !== 'object'
      || Object.keys(payload).some(k => !allowed[type].includes(k))) fail('Ungültige Ereignisfelder');
    const body = JSON.stringify(canonical(payload || {}));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const old = this.db.prepare('SELECT * FROM events WHERE id=?').get(id);
      if (old) {
        if (old.order_id !== orderId || old.type !== type || old.actor !== actor || old.payload !== body) fail('Ereignis-ID bereits anders verwendet', 409);
        this.db.exec('COMMIT'); return { id, duplicate: true };
      }
      const state = this.state(orderId);
      if (type === 'requirements') {
        if (payload.previousRevision !== state.revision) fail('Bedarf wurde inzwischen geändert', 409);
        if (!Array.isArray(payload.parts) || !payload.parts.length || payload.parts.length > 500) fail('Vollständige Teileliste erforderlich');
        const ids = new Set();
        for (const p of payload.parts) {
          if (!p || typeof p !== 'object' || Array.isArray(p)) fail('Ungültiger Bedarf');
          required(p.id, 'Positions-ID'); required(p.label, 'Bezeichnung');
          if (ids.has(p.id) || !['production', 'delivery'].includes(p.source) || !Number.isFinite(p.required) || p.required <= 0) fail('Ungültiger Bedarf');
          ids.add(p.id);
        }
      } else if (type === 'confirmation') {
        if (!state.revision || payload.revision !== state.revision) fail('Veralteter/fehlender Bedarf', 409);
        const p = state.parts.find(p => p.id === payload.partId);
        if (!p || !Number.isFinite(payload.quantity) || payload.quantity < 0 || payload.quantity > p.required) fail('Ungültige bestätigte Menge');
      } else if (type === 'scan') {
        if (!['done', 'reopen', 'courier'].includes(payload.action)) fail('Ungültiger Scan');
        if (!state.revision || payload.revision !== state.revision || !state.parts.some(p => p.id === payload.partId)) fail('Scan braucht aktuelle Positions-ID', 409);
        required(payload.station, 'Station');
      } else if (type === 'monitor_scan') {
        if (payload.code !== 'rwjob:' + orderId || !/^Rec[0-9A-Za-z]+$/.test(orderId)
          || ![1, 2, 3].includes(payload.stage) || typeof payload.partial !== 'boolean') fail('Ungültiger Monitor-Scan');
        if (!this.events(orderId).some(e => e.type === 'slack_snapshot')) fail('Auftrag nicht aus Slack importiert', 409);
        for (const key of ['rawPart', 'reportedActor', 'reportedOrigin']) {
          if (typeof payload[key] !== 'string' || payload[key].length > 2000) fail('Ungültige Scanangabe');
        }
        required(payload.station, 'Station');
      } else if (type === 'scan_assignment') {
        const scan = state.scans.find(s => s.id === payload.scanId);
        if (!scan || scan.type !== 'monitor_scan' || scan.corrected || scan.assignment) fail('Scan nicht zuordenbar', 409);
        if (payload.revision !== state.revision || !state.parts.some(p => p.id === payload.partId)) fail('Aktuelle Position erforderlich', 409);
      } else if (type === 'calendar_link') {
        if (payload.previousLink !== state.linkRevision) fail('Terminzuordnung inzwischen geändert', 409);
        if (payload.calendarId !== TEST_CALENDAR) fail('Nur der freigegebene Testkalender ist erlaubt');
        if (!payload.event || typeof payload.event !== 'object') fail('Termin fehlt');
        required(payload.event.id, 'Termin-ID'); required(payload.event.summary, 'Termintitel');
        if (Object.keys(payload.event).some(k => !['id', 'summary', 'colorId'].includes(k))
          || (payload.event.colorId !== undefined && typeof payload.event.colorId !== 'string')) fail('Ungültige Termindaten');
        const owners = this.db.prepare('SELECT DISTINCT order_id FROM events WHERE type=? AND order_id<>?').all('calendar_link', orderId);
        for (const owner of owners) {
          const other = this.state(owner.order_id).calendarLink;
          if (other?.calendarId === payload.calendarId && other.event.id === payload.event.id) fail('Termin ist bereits einem anderen Auftrag zugeordnet', 409);
        }
      } else if (type === 'calendar_unlink') {
        if (!state.calendarLink || payload.previousLink !== state.linkRevision) fail('Terminzuordnung inzwischen geändert', 409);
        required(payload.reason, 'Grund');
      } else if (type === 'correction') {
        required(payload.reason, 'Korrekturgrund');
        const events = this.events(orderId);
        const target = events.find(e => e.id === payload.targetId);
        if (!target || !['confirmation', 'scan', 'monitor_scan', 'scan_assignment'].includes(target.type) || events.some(e => e.type === 'correction' && e.targetId === target.id)) fail('Korrekturziel ungültig', 409);
      } else if (type === 'slack_snapshot') {
        if (actor !== 'slack-readonly-import' || !['fertig', 'offen', 'in_bearbeitung', 'bestellt', 'angenommen', 'archiv', 'unknown'].includes(payload.status)
          || !Number.isFinite(Date.parse(payload.observedAt))) fail('Ungültiger Slack-Ausgangsstand');
      } else fail('Unbekannter Ereignistyp');
      this.db.prepare('INSERT INTO events(id,order_id,type,actor,recorded_at,payload,context) VALUES(?,?,?,?,?,?,?)')
        .run(id, orderId, type, actor, new Date().toISOString(), body, JSON.stringify(canonical(context)));
      this.db.exec('COMMIT');
      return { id, duplicate: false };
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  linkedPreview(orderId) {
    const state = this.state(orderId);
    if (!state.calendarLink) fail('Keine Terminzuordnung vorhanden', 409);
    return { ...calendarPreview({ calendarId: state.calendarLink.calendarId, event: state.calendarLink.event,
      production: state.production, material: state.material }),
      linkRevision: state.linkRevision, verifiedWithGoogle: false, slackObservedAt: state.slackObservedAt };
  }
  backup(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db.exec("VACUUM INTO '" + file.replace(/'/g, "''") + "'");
    const copy = new DatabaseSync(file, { readOnly: true });
    try {
      if (copy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') fail('Sicherung fehlerhaft', 500);
    } finally { copy.close(); }
  }
  close() { this.db.close(); }
}
module.exports = { History };
