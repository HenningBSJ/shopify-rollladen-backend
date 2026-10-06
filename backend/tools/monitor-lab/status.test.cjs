const { test } = require('node:test');
const assert = require('node:assert/strict');
const { materialStatus, productionStatus, calendarPreview, TEST_CALENDAR } = require('./status.cjs');
const part = (id, source, confirmed = 1) => ({ id, source, required: 1, confirmed,
  confirmedAt: '2026-09-30T10:00:00Z', confirmedBy: 'LAB' });
test('Material braucht alle Eigen- und Fremdpositionen mit Bestätigung', () => {
  const order = { requirementsConfirmed: true, parts: [part('p', 'production'), part('d', 'delivery', 0)] };
  assert.equal(materialStatus(order).ready, false);
  order.parts[1].confirmed = 1;
  assert.equal(materialStatus(order).ready, true);
  order.parts[1].confirmedBy = '';
  assert.equal(materialStatus(order).ready, false);
});
test('Leere, ungeklärte und doppelte Bedarfe geben keine Freigabe', () => {
  for (const order of [{ parts: [] }, { requirementsConfirmed: true, parts: [] },
    { parts: [part('p', 'production')] },
    { requirementsConfirmed: true, parts: [part('p', 'production'), part('p', 'delivery')] },
    { requirementsConfirmed: true, parts: [{ ...part('p', 'production'), required: NaN }] }]) {
    assert.equal(materialStatus(order).ready, false);
  }
});
test('Slack fertig bleibt trotz fehlender lokaler Scans fertig; Wiederöffnung wird übernommen', () => {
  for (const status of ['fertig', 'offen']) {
    assert.equal(productionStatus({ slack: { available: true, status }, history: [] }).status, status);
  }
  const out = productionStatus({ history: [{ type: 'slack_snapshot', status: 'fertig', observedAt: '2026-09-30' }] });
  assert.equal(out.status, 'fertig');
  assert.equal(out.stale, true);
  assert.equal(out.completedAt, null);
  assert.equal(productionStatus({}).status, 'unknown');
});
test('Vorschau erlaubt ausschließlich Testkalender und erhält Farben und Basistitel', () => {
  const event = { id: 'lab-event', summary: 'Testkunde – Montage', colorId: '6' };
  const input = { calendarId: TEST_CALENDAR, event, material: { ready: false }, production: { status: 'fertig' } };
  assert.throws(() => calendarPreview({ ...input, calendarId: 'primary' }));
  const first = calendarPreview(input);
  assert.deepEqual(Object.keys(first.patch), ['summary']);
  assert.equal(event.colorId, '6');
  assert.equal(event.summary, 'Testkunde – Montage');
  assert.equal(first.patch.summary, '[Monitor: Produktion fertig; Material offen] Testkunde – Montage');
  assert.deepEqual(calendarPreview({ ...input, event: { ...event, ...first.patch } }).patch, first.patch);
});
