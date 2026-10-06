// Offline prototype; deliberately not imported by the live application.
const TEST_CALENDAR = 'jonat.bsjalousienprofi@gmail.com';

function materialStatus(order) {
  const parts = Array.isArray(order.parts) ? order.parts : [];
  const ids = new Set();
  const valid = order.requirementsConfirmed === true && parts.length > 0 && parts.every(p => {
    if (!p.id || ids.has(p.id)) return false;
    ids.add(p.id);
    return ['production', 'delivery'].includes(p.source)
      && Number.isFinite(p.required) && p.required > 0
      && Number.isFinite(p.confirmed) && p.confirmed >= 0;
  });
  const complete = p => p.confirmed >= p.required && Boolean(p.confirmedAt) && Boolean(p.confirmedBy);
  const group = source => {
    const rows = parts.filter(p => p.source === source);
    return { requiredPositions: rows.length, confirmedPositions: rows.filter(complete).length };
  };
  return { ready: valid && parts.every(complete), requirementsKnown: valid,
    production: group('production'), delivery: group('delivery') };
}

function productionStatus({ slack, history = [] }) {
  // Slack remains authoritative during the transition, including explicit reopening.
  if (slack && slack.available === true && typeof slack.status === 'string' && slack.status) {
    return { status: slack.status, source: 'slack', observedAt: slack.observedAt || null,
      completedAt: null, actor: null };
  }
  // An outage must not silently turn a previously completed job into an open job.
  const last = [...history].reverse().find(e => e.type === 'slack_snapshot');
  return { status: last ? last.status : 'unknown', source: last ? 'slack_snapshot' : 'unknown',
    stale: true, observedAt: last ? last.observedAt : null, completedAt: null, actor: null };
}

function calendarPreview({ calendarId, event, material, production }) {
  if (calendarId !== TEST_CALENDAR) throw new Error('Kalender außerhalb des erlaubten Testkalenders.');
  if (!event || !event.id || typeof event.summary !== 'string') throw new Error('Termin-ID und Titel erforderlich.');
  const label = material.ready ? 'Material bereit' : 'Material offen';
  const productionLabel = production.status === 'fertig' ? 'Produktion fertig'
    : production.status === 'unknown' ? 'Produktion ungeklärt' : 'Produktion offen';
  const base = event.summary.replace(/^\[Monitor: [^\]]*\]\s*/, '');
  return { dryRun: true, calendarId, eventId: event.id,
    before: { summary: event.summary, colorId: event.colorId },
    // Only this field would be changed. Colors and other event fields are omitted.
    patch: { summary: `[Monitor: ${productionLabel}; ${label}] ${base}` } };
}

module.exports = { materialStatus, productionStatus, calendarPreview, TEST_CALENDAR };
