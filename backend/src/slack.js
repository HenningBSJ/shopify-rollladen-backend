const WRITE_METHODS = new Set([
  'chat.postMessage',
  'chat.update',
  'chat.delete',
  'slackLists.items.update',
  'slackLists.items.create',
  'slackLists.items.delete',
  'reactions.add',
  'reactions.remove',
  'files.upload',
]);

const IS_SAFE_MODE = String(process.env.SAFE_MODE_SLACK || process.env.SLACK_READONLY || '')
  .trim()
  .toLowerCase();
const SAFE_MODE_ENABLED = IS_SAFE_MODE === '1' || IS_SAFE_MODE === 'true' || IS_SAFE_MODE === 'yes' || IS_SAFE_MODE === 'on';

function getSlackToken() {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    const err = new Error('SLACK_BOT_TOKEN is not set');
    err.status = 500;
    throw err;
  }
  return token;
}

async function slackApi(method, params) {
  const isWrite = WRITE_METHODS.has(String(method || ''));
  if (SAFE_MODE_ENABLED && isWrite) {
    const safeLog = {
      ts: new Date().toISOString(),
      method: String(method || ''),
      paramsKeys: Object.keys(params || {}),
      preview: (params && params.text ? String(params.text).slice(0, 80) : null),
    };
    console.warn('[SAFE_MODE_SLACK] Slack-Aufruf unterbunden (Schreibzugriff): ' + JSON.stringify(safeLog));
    return {
      ok: true,
      safe_mode: true,
      skipped_method: String(method || ''),
      ts: String(Math.floor(Date.now() / 1000)),
    };
  }

  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getSlackToken()}`,
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
    },
    body: JSON.stringify(params || {}),
  });

  const data = await res.json();
  if (!data.ok) {
    const err = new Error(data.error || 'Slack API error');
    err.status = 502;
    err.details = data;
    throw err;
  }
  return data;
}

async function listItems({ listId, cursor }) {
  return slackApi('slackLists.items.list', {
    list_id: listId,
    cursor: cursor || '',
  });
}

async function listColumns({ listId }) {
  return slackApi('slackLists.columns.list', {
    list_id: listId,
  });
}

async function itemInfo({ listId, itemId }) {
  const data = await slackApi('slackLists.items.info', {
    list_id: listId,
    id: itemId,
    include_is_subscribed: false,
  });
  if (data && !data.item && data.record) {
    data.item = data.record;
  }
  return data;
}

async function listSchema({ listId }) {
  const page = await listItems({ listId, cursor: '' });
  const first = (page.items || []).find(i => i && i.id);
  if (!first) return [];
  const info = await itemInfo({ listId, itemId: first.id });
  const schema = info?.list?.list_metadata?.schema || info?.list?.schema || [];
  return Array.isArray(schema) ? schema : [];
}

async function updateItem({ listId, itemId, cells }) {
  return slackApi('slackLists.items.update', {
    list_id: listId,
    cells: cells || [],
  });
}

async function postMessage({ channel, text, blocks }) {
  return slackApi('chat.postMessage', {
    channel,
    text,
    blocks,
  });
}

async function createItem({ listId, initial_fields }) {
  return slackApi('slackLists.items.create', {
    list_id: listId,
    initial_fields: initial_fields || [],
  });
}

module.exports = {
  listItems,
  listColumns,
  listSchema,
  itemInfo,
  updateItem,
  postMessage,
  createItem,
};
