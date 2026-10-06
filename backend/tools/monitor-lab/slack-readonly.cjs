const ALLOWED = new Set(['slackLists.items.list', 'slackLists.items.info']);
function createReader({ token, listId, transport = fetch }) {
  if (!token || !listId) throw new Error('Slack-Konfiguration fehlt');
  async function call(method, args) {
    if (!ALLOWED.has(method) || args.list_id !== listId) throw new Error('SLACK_READONLY_DENIED');
    const r = await transport('https://slack.com/api/' + method, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
    });
    if (!r.ok) throw new Error('Slack HTTP ' + r.status);
    const data = await r.json();
    if (!data.ok) throw new Error('Slack: ' + String(data.error || 'read_failed'));
    return data;
  }
  return { call, async snapshot() {
    const items = []; let cursor = ''; const cursors = new Set();
    for (let page = 0; page < 100; page++) {
      const data = await call('slackLists.items.list', { list_id: listId, cursor, limit: 100 });
      if (!Array.isArray(data.items)) throw new Error('Slack-Liste unvollständig');
      items.push(...data.items);
      cursor = data.response_metadata?.next_cursor || '';
      if (!cursor) break;
      if (cursors.has(cursor) || page === 99) throw new Error('Slack-Paginierung unvollständig');
      cursors.add(cursor);
    }
    let schema = [];
    if (items.length) {
      const info = await call('slackLists.items.info', { list_id: listId, id: items[0].id, include_is_subscribed: false });
      schema = info.list?.list_metadata?.schema || info.list?.schema;
      if (!Array.isArray(schema)) throw new Error('Slack-Schema fehlt');
    }
    return { listId, observedAt: new Date().toISOString(), items, schema };
  } };
}
function normalizeStatus(label) {
  const s = String(label || '').trim().toLowerCase();
  if (['fertig', 'completed', 'done'].includes(s)) return 'fertig';
  if (s.includes('archiv')) return 'archiv';
  if (['offen', 'not_started'].includes(s)) return 'offen';
  if (s.includes('bearbeit') || s === 'in_progress') return 'in_bearbeitung';
  if (s === 'bestellt') return 'bestellt';
  if (s === 'angenommen') return 'angenommen';
  return 'unknown';
}
function resolveItem(item, schema) {
  const col = schema.find(c => c.key === 'status') || schema.find(c => /^status$/i.test(c.name || ''));
  const field = col && (item.fields || []).find(f => f.column_id === col.id);
  const raw = field?.select?.[0] || field?.value || field?.text || '';
  const choice = (col?.options?.choices || []).find(c => c.id === raw || c.value === raw);
  const titleCol = schema.find(c => c.is_primary_column) || schema.find(c => c.key === 'title');
  const titleField = titleCol && (item.fields || []).find(f => f.column_id === titleCol.id);
  return { orderId: item.id, status: normalizeStatus(choice?.label || choice?.value || raw),
    title: typeof titleField?.text === 'string' ? titleField.text : item.id };
}
module.exports = { createReader, resolveItem };
