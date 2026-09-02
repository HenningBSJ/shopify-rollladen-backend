const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const { pathToFileURL } = require('url');
const QRCode = require('qrcode');
const { monitorHttpAuthMiddleware } = require('../middleware');
const { getMaterialStatusToken, isMaterialStatusTokenValid } = require('../material-status');
const { listColumns, listSchema, itemInfo } = require('../slack');

const router = express.Router();
router.use(monitorHttpAuthMiddleware);
const execFileAsync = promisify(execFile);
const ISS_ASSETS_DIR = path.resolve(__dirname, '..', '..', '..', 'assets');
const ISS_DISPLAY_IMAGE_NAME = 'GehrungsDisplay.jpg';

router.get('/iss-assets/:fileName', (req, res, next) => {
  const fileName = path.basename(String(req.params.fileName || ''));
  if (!fileName || fileName !== ISS_DISPLAY_IMAGE_NAME) {
    return res.status(404).send('Not found');
  }
  const filePath = path.join(ISS_ASSETS_DIR, fileName);
  fs.access(filePath, fs.constants.R_OK, (err) => {
    if (err) return res.status(404).send('Not found');
    res.sendFile(filePath, { headers: { 'Cache-Control': 'no-cache' } }, (sendErr) => {
      if (sendErr && !res.headersSent) next(sendErr);
    });
  });
});

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalize(s) {
  return String(s ?? '')
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFromRichText(richText) {
  const parts = [];
  for (const node of richText || []) {
    if (!node || typeof node !== 'object') continue;
    if (typeof node.text === 'string') parts.push(node.text);
    if (Array.isArray(node.elements)) parts.push(extractFromRichText(node.elements));
  }
  return parts.join('');
}

function getFieldText(field) {
  if (!field) return '';
  if (typeof field.text === 'string' && field.text.trim()) return field.text.trim();
  if (typeof field.value === 'string' && field.value.trim()) return field.value.trim();
  if (Array.isArray(field.rich_text)) {
    const t = extractFromRichText(field.rich_text);
    if (t && String(t).trim()) return String(t).trim();
  }
  return '';
}

function findColumn(columns, { key, nameIncludes, primary, type } = {}) {
  const cols = columns || [];
  if (primary) {
    const p = cols.find(c => c && c.is_primary_column);
    if (p) return p;
  }
  if (key) {
    const k = cols.find(c => c && c.key === key);
    if (k) return k;
  }
  if (nameIncludes) {
    const needle = String(nameIncludes).toLowerCase();
    const c = cols.find(col => col && typeof col.name === 'string' && col.name.toLowerCase().includes(needle));
    if (c) return c;
  }
  if (type) {
    const c = cols.find(col => col && String(col.type || '').toLowerCase() === String(type).toLowerCase());
    if (c) return c;
  }
  return null;
}

let columnsCache = { listId: '', expiresAt: 0, columns: [] };
async function getColumns(listId) {
  const now = Date.now();
  if (columnsCache.listId === listId && columnsCache.expiresAt > now && Array.isArray(columnsCache.columns)) {
    return columnsCache.columns;
  }
  try {
    const data = await listColumns({ listId });
    const cols = data.columns || [];
    columnsCache = { listId, expiresAt: now + (10 * 60 * 1000), columns: cols };
    return cols;
  } catch (err) {
    const slackError = err?.details?.error;
    const reqMethod = err?.details?.req_method;
    if (slackError === 'unknown_method' && reqMethod === 'slackLists.columns.list') {
      const schema = await listSchema({ listId });
      const cols = schema.map(c => ({
        id: c.id,
        key: c.key,
        name: c.name,
        type: c.type,
        is_primary_column: !!c.is_primary_column,
        options: c.options,
      }));
      columnsCache = { listId, expiresAt: now + (10 * 60 * 1000), columns: cols };
      return cols;
    }
    throw err;
  }
}

function getListId() {
  const listId = String(process.env.SLACK_LIST_ID || '').trim();
  if (!listId) {
    const err = new Error('SLACK_LIST_ID is not set');
    err.status = 500;
    throw err;
  }
  return listId;
}

function getFieldByColumnId(item, colId) {
  const id = String(colId || '').trim();
  if (!id) return null;
  return (item?.fields || []).find(f => f && String(f.column_id || '') === id) || null;
}

function parsePositionsFromDescription(description) {
  const desc = String(description || '').replace(/\r\n/g, '\n').trim();
  if (!desc) return [];
  const lines = desc.split('\n').map(l => String(l || '').trim()).filter(Boolean);
  if (!lines.length) return [];

  const out = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const t = normalize(cur.text);
    if (t) out.push(cur.idx + ') ' + t);
    cur = null;
  };

  for (const ln of lines) {
    const m = /^\s*(\d{1,3})\s*[).]\s*(.+)\s*$/.exec(ln);
    if (m) {
      flush();
      cur = { idx: String(m[1]), text: String(m[2] || '').trim() };
      continue;
    }
    if (cur) cur.text = (cur.text ? (cur.text + ' ' + ln) : ln).trim();
  }
  flush();
  return out.slice(0, 80);
}

function formatDateDe(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}.${mm}.${yyyy}`;
}

function buildMontageberichtPrefill({ title, description, itemId, positionsText }) {
  const custParts = String(title || '').split(/\s+[–-]\s+/).map(s => String(s || '').trim()).filter(Boolean);
  const isZipCity = (s) => /^\d{5}\s+\S+/.test(String(s || '').trim());
  const isStreet = (s) => {
    const t = String(s || '').trim().toLowerCase();
    if (!/\d/.test(t)) return false;
    if (isZipCity(t)) return false;
    if (/(straße|strasse|str\.|weg|platz|allee|ring|gasse|damm|ufer)\b/.test(t)) return true;
    return /\d+\s*[a-z]?$/.test(t) || /\d+/.test(t);
  };
  const isOrderRef = (s) => {
    const t = String(s || '').trim();
    if (!t) return false;
    if (/^rec[a-z0-9]{6,}$/i.test(t)) return false;
    if (isStreet(t) || isZipCity(t)) return false;
    if (t.length > 24) return false;
    if (/^\d{4,}$/.test(t)) return true;
    if (/^[a-z]{1,5}\s*[-/#]?\s*\d{3,}$/i.test(t)) return true;
    if (/[-/#]\d{3,}/.test(t) && /\d/.test(t)) return true;
    return false;
  };

  let orderRef = '';
  let street = '';
  let zipCity = '';
  const other = [];
  for (const part of custParts) {
    if (!zipCity && isZipCity(part)) { zipCity = part; continue; }
    if (!street && isStreet(part)) { street = part; continue; }
    if (!orderRef && isOrderRef(part)) { orderRef = part; continue; }
    other.push(part);
  }
  if (!street) {
    const fallbackStreet = other.find(p => /\d/.test(String(p || ''))) || '';
    if (fallbackStreet) street = fallbackStreet;
  }

  const company = other.length >= 2 ? other[0] : '';
  const person = other.length >= 2 ? other.slice(1).join(' – ') : (other[0] || '');

  const montagefirma = (company || person || '').trim();
  const bauvorhaben = company ? String(person || '').trim() : '';
  const ort = zipCity || '';

  const combinedText = [positionsText, description].filter(Boolean).join('\n');
  const positions = parsePositionsFromDescription(positionsText || description);
  const normalizeWorkLine = (s) =>
    String(s || '')
      .replace(/^\d+\)\s*/i, '')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/_/g, '')
      .replace(/\s*\|\s*/g, ' | ')
      .replace(/\s+/g, ' ')
      .trim();
  const repairs = positions
    .map(p => normalizeWorkLine(p))
    .filter(Boolean)
    .filter(p => /^reparatur\b/i.test(p))
    .map(p => p.replace(/^reparatur\b/i, '').trim())
    .map(p => p.replace(/^[-–:]\s*/i, '').trim())
    .filter(Boolean);
  let repairText = repairs.join('\n');
  if (!repairText) {
    const lines = String(combinedText || '').replace(/\r\n/g, '\n').split('\n').map(l => String(l || '').trim()).filter(Boolean);
    const hits = lines
      .map(l => normalizeWorkLine(l))
      .filter(l => /^reparatur\b/i.test(l))
      .map(l => l.replace(/^reparatur\b/i, '').trim())
      .map(l => l.replace(/^[-–:]\s*/i, '').trim())
      .filter(Boolean)
      .slice(0, 10);
    repairText = hits.join('\n');
  }

  return {
    montagefirma: montagefirma || '',
    auftragsnummer: orderRef || '',
    bauvorhaben: bauvorhaben || '',
    strasse: street || '',
    ort: ort || '',
    datum: formatDateDe(new Date()),
    arbeiten: repairText,
  };
}

function getMontageberichtTemplatePath() {
  return (
    String(process.env.MONTAGEBERICHT_TEMPLATE_PATH || '').trim() ||
    path.join(process.cwd(), 'data', 'montagebericht.png')
  );
}

function getMontageberichtTemplateVersion() {
  const p = getMontageberichtTemplatePath();
  try {
    const st = fs.statSync(p);
    return String(Math.floor(Number(st.mtimeMs) || 0)) || '1';
  } catch (e) {
    return '1';
  }
}

router.get('/montagebericht-template', (req, res) => {
  const templatePath = getMontageberichtTemplatePath();
  if (!fs.existsSync(templatePath)) {
    return res.status(404).send('Template not found');
  }
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(templatePath);
});

router.get('/montagebericht', async (req, res, next) => {
  try {
    const itemId = normalize(req.query.itemId);
    let title = normalize(req.query.title);
    let description = String(req.query.description || '').replace(/\r\n/g, '\n').trim();
    let positionsText = '';

    if (itemId && (!title || !description)) {
      const listId = getListId();
      const cols = await getColumns(listId);
      const titleCol =
        findColumn(cols, { nameIncludes: 'aufgabe' }) ||
        findColumn(cols, { primary: true }) ||
        findColumn(cols, { key: 'title' }) ||
        findColumn(cols, { key: 'rich_text_notes' }) ||
        findColumn(cols, { type: 'text' });
      const detailsCol =
        findColumn(cols, { nameIncludes: 'info' }) ||
        findColumn(cols, { nameIncludes: 'materialbestellung' }) ||
        findColumn(cols, { nameIncludes: 'bestellung' }) ||
        findColumn(cols, { nameIncludes: 'beschreibung' }) ||
        null;
      const positionsCol =
        findColumn(cols, { nameIncludes: 'position' }) ||
        findColumn(cols, { nameIncludes: 'teilaufgabe' }) ||
        findColumn(cols, { nameIncludes: 'positionen' }) ||
        null;

      const info = await itemInfo({ listId, itemId });
      const item = info?.item || info?.record || null;
      if (item) {
        const titleField = getFieldByColumnId(item, titleCol?.id);
        const detailsField = getFieldByColumnId(item, detailsCol?.id);
        const positionsField = getFieldByColumnId(item, positionsCol?.id);
        title = title || normalize(getFieldText(titleField));
        description = description || String(getFieldText(detailsField) || '').replace(/\r\n/g, '\n').trim();
        positionsText = positionsText || String(getFieldText(positionsField) || '').replace(/\r\n/g, '\n').trim();
      }
    }

    if (!title && !description && !itemId) {
      return res.status(400).send('Missing itemId');
    }

    const pre = buildMontageberichtPrefill({ title, description, itemId, positionsText });
    const templateUrl = '/display/montagebericht-template?v=' + encodeURIComponent(getMontageberichtTemplateVersion());
    const debug = String(req.query.debug || '').trim() === '1';
    const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Montagebericht</title>
  <link rel="preload" as="image" href="${templateUrl}">
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: Arial, sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .page { width: 210mm; height: 297mm; position: relative; overflow: hidden; background: #fff; }
    .page::before { content: ""; position: absolute; inset: 0; background-image: url("${templateUrl}"); background-repeat: no-repeat; background-position: top left; background-size: 210mm 297mm; opacity: .28; }
    .content { position: relative; width: 100%; height: 100%; }
    .field { position: absolute; color: #000; font-size: 10.5pt; line-height: 1.15; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .multiline { white-space: pre-wrap; }
    .debug .field { outline: 1px solid rgba(255,0,0,.35); background: rgba(255,0,0,.04); }
  </style>
</head>
<body class="${debug ? 'debug' : ''}">
  <div class="page">
    <div class="content">
      <div class="field" style="left: 39mm; top: 40.5mm; width: 90mm;">${escapeHtml(pre.montagefirma)}</div>
      <div class="field mono" style="left: 39mm; top: 28.8mm; width: 90mm;">${escapeHtml(pre.auftragsnummer)}</div>
      <div class="field" style="left: 139mm; top: 20.5mm; width: 72mm;">${escapeHtml(pre.bauvorhaben)}</div>
      <div class="field" style="left: 139mm; top: 28.8mm; width: 72mm;">${escapeHtml(pre.strasse)}</div>
      <div class="field" style="left: 139mm; top: 37.0mm; width: 72mm;">${escapeHtml(pre.ort)}</div>

      <div class="field" style="left: 22mm; top: 104.2mm; width: 20mm;">${escapeHtml(pre.datum)}</div>
      <div class="field multiline" style="left: 22mm; top: 181mm; width: 174mm; min-height: 16mm; font-size: 9.6pt; line-height: 1.2;">${escapeHtml(pre.arbeiten)}</div>
    </div>
  </div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => { try { window.print(); } catch (e) {} }, 200);
    });
    window.addEventListener('afterprint', () => {
      try { window.close(); } catch (e) {}
    });
  <\/script>
</body>
</html>`;
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    next(e);
  }
});

function parseYes(v) {
  const t = String(v || '').trim().toLowerCase();
  return t === '1' || t === 'true' || t === 'yes' || t === 'ja' || t === 'on';
}

function normalizeEnum(v, allowed, fallback) {
  const t = String(v || '').trim().toLowerCase();
  return allowed.includes(t) ? t : fallback;
}

function normalizeLabelText(s) {
  return String(s || '')
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toOperatorCode(s) {
  const t = normalizeLabelText(s)
    .replace(/[^0-9A-Za-zÄÖÜäöüß]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  const parts = t.split(' ').filter(Boolean);
  if (!parts.length) return '';
  const joined = parts.join('');
  if (parts.length === 1 && joined.length <= 4) return joined.toUpperCase();
  if (parts.length >= 2) return parts.map(p => String(p).charAt(0)).join('').toUpperCase().slice(0, 4);
  return String(parts[0]).slice(0, 3).toUpperCase();
}

function splitLabelTextAfterSize(s) {
  const txt = normalizeLabelText(s);
  if (!txt) return { head: '', tail: '' };
  const m =
    txt.match(/^(.+?\b\d+(?:[.,]\d+)?\s*(?:x|×)\s*\d+(?:[.,]\d+)?\s*mm\b)\s+(.*)$/i) ||
    txt.match(/^(.+?\b\d+(?:[.,]\d+)?\s*mm\b)\s+(.*)$/i);
  if (!m) return { head: txt, tail: '' };
  return { head: String(m[1] || '').trim(), tail: String(m[2] || '').trim() };
}

function parseLabelPayload(input) {
  const src = input && typeof input === 'object' ? input : {};
  const qr = String(src.qr || '').trim();
  const bold = parseYes(src.bold);
  const ha = normalizeEnum(src.ha, ['left', 'center', 'right'], 'left');
  const va = normalizeEnum(src.va, ['top', 'middle', 'bottom'], 'top');
  const fsRaw = String(src.fs || '').trim().toLowerCase();
  const fsMap = { s: 0.9, m: 1, l: 1.1, xl: 1.2 };
  let fs = fsMap[fsRaw];
  if (!Number.isFinite(fs)) {
    const n = Number.parseFloat(fsRaw);
    fs = Number.isFinite(n) ? n : 1;
  }
  fs = Math.min(1.5, Math.max(0.7, fs));

  let l1 = normalizeLabelText(src.l1);
  let l2 = normalizeLabelText(src.l2);
  let l3 = normalizeLabelText(src.l3);
  let l4 = normalizeLabelText(src.l4);
  const d = String(src.d || '').trim();
  const c = normalizeLabelText(src.c);
  const c1 = normalizeLabelText(src.c1);
  const c2 = normalizeLabelText(src.c2);
  const c3 = normalizeLabelText(src.c3);
  const op = toOperatorCode(src.op);
  const copiesRaw = Number.parseInt(String(src.copies || ''), 10);
  const copies = Math.min(10, Math.max(1, Number.isFinite(copiesRaw) ? copiesRaw : 1));
  const packageTotalRaw = Number.parseInt(String(src.pkgTotal || src.packageTotal || src.packages || ''), 10);
  const packageTotal = Math.min(20, Math.max(1, Number.isFinite(packageTotalRaw) ? packageTotalRaw : 1));
  const packageIndexRaw = Number.parseInt(String(src.pkgIndex || src.packageIndex || ''), 10);
  const packageIndex = Number.isFinite(packageIndexRaw)
    ? Math.min(packageTotal, Math.max(1, packageIndexRaw))
    : null;
  const autoprint = parseYes(src.autoprint || src.autoPrint);
  const datePrefixDelivery = parseYes(src.datePrefixDelivery || src.deliveryDatePrefix || src.deliveryPrefix);

  let dateLabel = '';
  let datePrefixLabel = '';
  if (d) {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    dateLabel = m ? `${m[3]}.${m[2]}.` : d;
    datePrefixLabel = datePrefixDelivery ? 'Lieferung vom:' : '';
  }

  if (l2) {
    const { head, tail } = splitLabelTextAfterSize(l2);
    if (tail) {
      l2 = head;
      if (!l3) l3 = tail;
      else if (!l4) l4 = tail;
      else l4 = `${l4} ${tail}`.trim();
    } else {
      l2 = head;
    }
  }

  const custLines = [c1, c2, c3].filter(Boolean);
  if (!custLines.length && c) custLines.push(c);

  return {
    qr,
    showQr: !!qr,
    bold,
    ha,
    va,
    fs,
    l1,
    l2,
    l3,
    l4,
    dateLabel,
    datePrefixLabel,
    custLines,
    op,
    copies,
    packageTotal,
    packageIndex,
    autoprint,
  };
}

function parseLabelBatchPayload(input) {
  const src = input && typeof input === 'object' ? input : {};
  const raw = src.batch;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => parseLabelPayload(entry))
      .filter((model) => !!(model && (model.qr || model.l1 || model.l2 || model.l3 || model.l4 || model.custLines.length || model.dateLabel || model.op)));
  } catch (e) {
    return [];
  }
}

async function buildLabelHtml(input, { includeToolbar = true, allowDirectPrint = true } = {}) {
  const batchModels = parseLabelBatchPayload(input);
  const model = batchModels[0] || parseLabelPayload(input);
  const models = batchModels.length ? batchModels : [model];
  const hasAnyContent = models.some((entry) => !!(entry.l1 || entry.l2 || entry.l3 || entry.l4 || entry.custLines.length || entry.dateLabel || entry.op));
  const hasAnyQr = models.some((entry) => !!entry.showQr);
  if (!hasAnyQr && !hasAnyContent) {
    const err = new Error('Missing content');
    err.status = 400;
    throw err;
  }
  const hasCust = models.some((entry) => entry.custLines.length > 0);
  const labels = [];
  for (const entry of models) {
    const qrSrc = entry.showQr
      ? await QRCode.toDataURL(entry.qr, { errorCorrectionLevel: 'M', margin: 0, scale: 8 })
      : '';
    const renderLabelBlock = (packageIndex) => {
      const packageBadge = entry.packageTotal > 1 && Number.isFinite(packageIndex)
        ? `${packageIndex}/${entry.packageTotal}`
        : '';
      return `
    ${entry.showQr ? `<img class="qr" src="${qrSrc}" alt="QR">` : ''}
    <div class="txt">
      <div class="line">${escapeHtml(entry.l1 || 'Etikett')}</div>
      ${entry.l2 ? `<div class="line">${escapeHtml(entry.l2)}</div>` : ''}
      ${entry.l3 ? `<div class="line">${escapeHtml(entry.l3)}</div>` : ''}
      ${entry.l4 ? `<div class="line">${escapeHtml(entry.l4)}</div>` : ''}
    </div>
    ${entry.custLines.length ? `<div class="cust">${entry.custLines.map(x => `<div class="custline">${escapeHtml(x)}</div>`).join('')}</div>` : ''}
    ${entry.dateLabel ? `<div class="datebox">${entry.datePrefixLabel ? `<div class="date-prefix">${escapeHtml(entry.datePrefixLabel)}</div>` : ''}<div class="date">${escapeHtml(entry.dateLabel)}</div></div>` : ''}
    ${entry.op ? `<div class="op">${escapeHtml(entry.op)}</div>` : ''}
    ${packageBadge ? `<div class="pkg">${escapeHtml(packageBadge)}</div>` : ''}
  `;
    };
    if (Number.isFinite(entry.packageIndex) && entry.packageTotal > 1) {
      const count = Math.max(1, entry.copies || 1);
      for (let i = 0; i < count; i += 1) labels.push(`<div class="label">${renderLabelBlock(entry.packageIndex)}</div>`);
      continue;
    }
    if (entry.packageTotal > 1) {
      for (let i = 1; i <= entry.packageTotal; i += 1) labels.push(`<div class="label">${renderLabelBlock(i)}</div>`);
      continue;
    }
    const count = Math.max(1, entry.copies || 1);
    for (let i = 0; i < count; i += 1) labels.push(`<div class="label">${renderLabelBlock(null)}</div>`);
  }
  const labelsHtml = labels.join('');
  const bodyClasses = [
    model.showQr ? '' : 'noqr',
    hasCust ? 'hascust' : '',
    model.bold ? 'bold' : '',
    'ha-' + model.ha,
    'va-' + model.va,
  ].filter(Boolean).join(' ');
  const bodyStyle = `--fs:${String(model.fs)};`;
  const toolbarHtml = includeToolbar
    ? `
  <div class="toolbar">
    ${allowDirectPrint ? '<button class="printbtn" type="button" id="directPrintBtn">Direktdruck</button><div id="directPrintInfo" class="printnote" style="margin-top:8px">Bereit...</div>' : ''}
    <label class="pkgctl">Pakete
      <input id="pkgTotalInput" type="number" min="1" max="20" step="1" value="${String(model.packageTotal)}">
    </label>
    <button class="printbtn secondary" type="button" id="pkgApplyBtn">Paketserie</button>
    <div class="printnote">Der Auftrag wird an den festen Etikettendrucker im Backend gesendet.</div>
  </div>`
    : '';

  const autoPrintStr = model.autoprint ? 'true' : 'false';
  const clientJsLines = [];
  clientJsLines.push('"use strict";');
  clientJsLines.push('(function(){');
  clientJsLines.push('  window.__LABEL_PAGE_LOADED = true;');
  clientJsLines.push('  var autoPrint = ' + autoPrintStr + ';');
  clientJsLines.push('  function log(msg){ try{ if(window.console&&console.log){console.log(msg)} }catch(e){} }');
  clientJsLines.push('  log("[LABEL-PAGE:READY] v3 (robust script extraction)");');
  clientJsLines.push('  function getLabelPayload(){');
  clientJsLines.push('    var out = {};');
  clientJsLines.push('    try{');
  clientJsLines.push('      var p = new URLSearchParams(window.location.search);');
  clientJsLines.push('      p.forEach(function(v,k){ out[k] = v; });');
  clientJsLines.push('    }catch(e){}');
  clientJsLines.push('    return out;');
  clientJsLines.push('  }');
  clientJsLines.push('  function getReturnTarget(){');
  clientJsLines.push('    try{');
  clientJsLines.push('      var p = new URLSearchParams(window.location.search);');
  clientJsLines.push('      var raw = String(p.get("ret") || "").trim();');
  clientJsLines.push('      if(!raw) return "";');
  clientJsLines.push('      var u = new URL(raw, window.location.href);');
  clientJsLines.push('      if(u.origin !== window.location.origin) return "";');
  clientJsLines.push('      return u.pathname + u.search + u.hash;');
  clientJsLines.push('    }catch(e){ return ""; }');
  clientJsLines.push('  }');
  clientJsLines.push('  function navigateAfterDirectPrint(){');
  clientJsLines.push('    var ret = getReturnTarget();');
  clientJsLines.push('    if(ret){ window.location.replace(ret); return; }');
  clientJsLines.push('    if(window.history.length > 1){ window.history.back(); return; }');
  clientJsLines.push('    try{ window.close(); }catch(e){}');
  clientJsLines.push('    window.location.replace("/display");');
  clientJsLines.push('  }');
  clientJsLines.push('  function printNow(){ try{ window.print(); }catch(e){} }');
  clientJsLines.push('  function getPackageTotalInputValue(){');
  clientJsLines.push('    var el = document.getElementById("pkgTotalInput");');
  clientJsLines.push('    var raw = el ? Number.parseInt(String(el.value || ""), 10) : 1;');
  clientJsLines.push('    var n = Number.isFinite(raw) ? raw : 1;');
  clientJsLines.push('    if(n < 1) n = 1; if(n > 20) n = 20;');
  clientJsLines.push('    return n;');
  clientJsLines.push('  }');
  clientJsLines.push('  function applyPackageSeries(){');
  clientJsLines.push('    try{');
  clientJsLines.push('      var next = getPackageTotalInputValue();');
  clientJsLines.push('      var p = new URLSearchParams(window.location.search);');
  clientJsLines.push('      if(next > 1) p.set("pkgTotal", String(next)); else p.delete("pkgTotal");');
  clientJsLines.push('      var qs = p.toString();');
  clientJsLines.push('      window.location.replace(window.location.pathname + (qs ? ("?" + qs) : ""));');
  clientJsLines.push('    }catch(e){}');
  clientJsLines.push('  }');
  clientJsLines.push('  function showAlert(text){');
  clientJsLines.push('    try{ alert(text); }');
  clientJsLines.push('    catch(e){');
  clientJsLines.push('      try{');
  clientJsLines.push('        var info = document.getElementById("directPrintInfo");');
  clientJsLines.push('        if(info) info.textContent = String(text).slice(0, 320);');
  clientJsLines.push('      }catch(_){}');
  clientJsLines.push('    }');
  clientJsLines.push('  }');
  clientJsLines.push('  function setInfo(msg){');
  clientJsLines.push('    try{');
  clientJsLines.push('      var el = document.getElementById("directPrintInfo");');
  clientJsLines.push('      if(el) el.textContent = msg || "";');
  clientJsLines.push('    }catch(e){}');
  clientJsLines.push('  }');
  clientJsLines.push('  function __runDirectPrint(){');
  clientJsLines.push('    var directBtn = document.getElementById("directPrintBtn");');
  clientJsLines.push('    if(!directBtn){ showAlert("Direktdruck Button fehlt"); return; }');
  clientJsLines.push('    try{');
  clientJsLines.push('      var originalBtnText = directBtn.textContent || "Direktdruck";');
  clientJsLines.push('      var payload = getLabelPayload();');
  clientJsLines.push('      directBtn.disabled = true;');
  clientJsLines.push('      directBtn.textContent = "Druck läuft...";');
  clientJsLines.push('      setInfo("Request wird vorbereitet...");');
  clientJsLines.push('      var latestDetails = null;');
  clientJsLines.push('      var bodyStr = "{}";');
  clientJsLines.push('      try{ bodyStr = JSON.stringify(payload); }catch(e){ bodyStr = "{}"; }');
  clientJsLines.push('      var timeoutMs = 70000;');
  clientJsLines.push('      var ctrl = (typeof AbortController === "function") ? new AbortController() : null;');
  clientJsLines.push('      var signal = ctrl ? ctrl.signal : undefined;');
  clientJsLines.push('      var abortTimer = ctrl ? setTimeout(function(){ try{ ctrl.abort(); }catch(e){} }, timeoutMs) : null;');
  clientJsLines.push('      setInfo("Sende an Server (" + Math.round(timeoutMs/1000) + "s Timeout) ...");');
  clientJsLines.push('      var p = Promise.resolve().then(function(){');
  clientJsLines.push('        return fetch("/display/label/direct-print", {');
  clientJsLines.push('          method: "POST", credentials: "same-origin",');
  clientJsLines.push('          headers: { "Content-Type": "application/json" }, body: bodyStr, signal: signal');
  clientJsLines.push('        });');
  clientJsLines.push('      });');
  clientJsLines.push('      p = p.then(function(res){');
  clientJsLines.push('        setInfo("Antwort wird ausgewertet (HTTP " + ((res && typeof res.status==="number")?String(res.status):"?") + ")...");');
  clientJsLines.push('        return res.json().catch(function(){ return null; }).then(function(data){');
  clientJsLines.push('          if(data && typeof data.details !== "undefined" && data.details !== null){');
  clientJsLines.push('            try{');
  clientJsLines.push('              latestDetails = (typeof data.details === "string") ? data.details : JSON.stringify(data.details, null, 2);');
  clientJsLines.push('            }catch(e){}');
  clientJsLines.push('          }');
  clientJsLines.push('          if(!res.ok || !data || data.ok === false){');
  clientJsLines.push('            var base = (data && data.error) ? data.error : "Direktdruck fehlgeschlagen";');
  clientJsLines.push('            var extra = latestDetails ? ("\\n\\nDetails:\\n" + String(latestDetails).slice(0, 2800)) : "";');
  clientJsLines.push('            var statusInfo = (res && typeof res.status==="number") ? ("\\n\\nHTTP Status: " + String(res.status)) : "";');
  clientJsLines.push('            var err = new Error(base + statusInfo + extra);');
  clientJsLines.push('            err.status = (res && typeof res.status==="number") ? res.status : 0;');
  clientJsLines.push('            throw err;');
  clientJsLines.push('          }');
  clientJsLines.push('          return data;');
  clientJsLines.push('        });');
  clientJsLines.push('      });');
  clientJsLines.push('      p = p.then(function(data){');
  clientJsLines.push('        if(abortTimer) clearTimeout(abortTimer);');
  clientJsLines.push('        var okMsg = "Direktdruck erfolgreich übergeben. Drucker: " + ((data && data.printer) ? String(data.printer) : "(Standarddrucker)");');
  clientJsLines.push('        setInfo(okMsg);');
  clientJsLines.push('        showAlert(okMsg);');
  clientJsLines.push('        try{ navigateAfterDirectPrint(); }catch(e){}');
  clientJsLines.push('      });');
  clientJsLines.push('      p = p.catch(function(err){');
  clientJsLines.push('        if(abortTimer) clearTimeout(abortTimer);');
  clientJsLines.push('        var aborted = err && (err.name === "AbortError" || String(err.message||"").toLowerCase().indexOf("abort") !== -1);');
  clientJsLines.push('        var base = aborted ?');
  clientJsLines.push('          ("Direktdruck Timeout nach " + Math.round(timeoutMs/1000) + "s (Edge/Sumatra hängt?)") :');
  clientJsLines.push('          ((err && err.message) ? String(err.message) : "Direktdruck fehlgeschlagen");');
  clientJsLines.push('        var extra = latestDetails ? ("\\n\\nDetails:\\n" + String(latestDetails).slice(0, 2800)) : "";');
  clientJsLines.push('        var hint = aborted ?');
  clientJsLines.push('          ("\\n\\nAuf Server PC: taskkill /F /IM msedge.exe /T  und  taskkill /F /IM SumatraPDF.exe /T") : "";');
  clientJsLines.push('        var full = base + extra + hint;');
  clientJsLines.push('        setInfo(aborted ? "Timeout" : ("Fehler: " + ((err&&err.message)?String(err.message).slice(0,120):"")));');
  clientJsLines.push('        showAlert(full);');
  clientJsLines.push('      });');
  clientJsLines.push('      p = p.then(function(){');
  clientJsLines.push('        if(abortTimer) clearTimeout(abortTimer);');
  clientJsLines.push('        try{ directBtn.disabled = false; }catch(e){}');
  clientJsLines.push('        try{ directBtn.textContent = originalBtnText; }catch(e){}');
  clientJsLines.push('      });');
  clientJsLines.push('    }catch(outerErr){');
  clientJsLines.push('      try{ directBtn.disabled = false; }catch(e){}');
  clientJsLines.push('      try{ if(directBtn) directBtn.textContent = "Direktdruck"; }catch(e){}');
  clientJsLines.push('      showAlert("Direktdruck fehlgeschlagen (Client): " + ((outerErr&&outerErr.message)?outerErr.message:String(outerErr)));');
  clientJsLines.push('    }');
  clientJsLines.push('  }');
  clientJsLines.push('  function bootstrapPage(){');
  clientJsLines.push('    try{ log("[LABEL-PAGE:BOOTSTRAP] allowDirectPrint=" + String(!!document.getElementById("directPrintBtn"))); }catch(e){}');
  clientJsLines.push('    var directBtn = document.getElementById("directPrintBtn");');
  clientJsLines.push('    if(directBtn){');
  clientJsLines.push('      directBtn.addEventListener("click", function(e){');
  clientJsLines.push('        if(e && e.preventDefault){ e.preventDefault(); }');
  clientJsLines.push('        if(e && e.stopPropagation){ e.stopPropagation(); }');
  clientJsLines.push('        __runDirectPrint();');
  clientJsLines.push('        return false;');
  clientJsLines.push('      });');
  clientJsLines.push('    }');
  clientJsLines.push('    var pkgBtn = document.getElementById("pkgApplyBtn");');
  clientJsLines.push('    if(pkgBtn){ pkgBtn.addEventListener("click", applyPackageSeries); }');
  clientJsLines.push('    var pkgInput = document.getElementById("pkgTotalInput");');
  clientJsLines.push('    if(pkgInput){ pkgInput.addEventListener("keydown", function(ev){');
  clientJsLines.push('      if(ev && ev.key === "Enter"){ if(ev.preventDefault) ev.preventDefault(); applyPackageSeries(); }');
  clientJsLines.push('    }); }');
  clientJsLines.push('    if(autoPrint){');
  clientJsLines.push('      window.addEventListener("load", function(){ setTimeout(printNow, 200); });');
  clientJsLines.push('      window.addEventListener("afterprint", function(){ try{ window.close(); }catch(e){} });');
  clientJsLines.push('    }');
  clientJsLines.push('  }');
  clientJsLines.push('  if(document.readyState === "loading"){');
  clientJsLines.push('    document.addEventListener("DOMContentLoaded", bootstrapPage);');
  clientJsLines.push('  } else {');
  clientJsLines.push('    setTimeout(bootstrapPage, 0);');
  clientJsLines.push('  }');
  clientJsLines.push('})();');
  const clientScriptStr = clientJsLines.join('\n');

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Etikett</title>
  <style>
    @page { size: 90mm 29mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 90mm; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; --fs: 1; --ta: left; --jc: flex-start; --fw: 400; }
    .bold { --fw: 900; }
    .ha-left { --ta: left; }
    .ha-center { --ta: center; }
    .ha-right { --ta: right; }
    .va-top { --jc: flex-start; }
    .va-middle { --jc: center; }
    .va-bottom { --jc: flex-end; }
    .label { width: 90mm; height: 29mm; box-sizing: border-box; padding: 1.2mm 1.4mm; display: flex; gap: 2mm; align-items: flex-start; position: relative; page-break-inside: avoid; break-inside: avoid; }
    .label { page-break-after: always; }
    .label:last-child { page-break-after: auto; }
    .qr { width: 26mm; height: 26mm; background: #fff; padding: 1mm; box-sizing: border-box; border-radius: 1.2mm; }
    .noqr .label { gap: 0; }
    .noqr .txt { padding-top: 0; }
    .noqr.hascust .txt { padding-top: 10.8mm; }
    .noqr .cust { left: 1.4mm; right: 18.5mm; }
    .cust { position: absolute; top: 1.1mm; left: 30.2mm; right: 18.5mm; height: 10.2mm; font-size: calc(9.5pt * var(--fs)); font-weight: 800; line-height: 1.05; overflow: hidden; word-break: normal; overflow-wrap: normal; hyphens: none; text-align: var(--ta); }
    .custline + .custline { margin-top: .2mm; }
    .txt { flex: 1; min-width: 0; height: 26mm; display: flex; flex-direction: column; justify-content: var(--jc); overflow: hidden; padding-top: 10.8mm; text-align: var(--ta); }
    .line { font-size: calc(11pt * var(--fs)); line-height: 1.05; white-space: normal; overflow: hidden; text-overflow: clip; word-break: normal; overflow-wrap: normal; hyphens: none; font-weight: var(--fw); }
    .line + .line { margin-top: .6mm; }
    .datebox { position: absolute; top: 1.0mm; right: 1.4mm; width: 15.8mm; display: flex; flex-direction: column; align-items: flex-end; gap: .2mm; }
    .date-prefix { width: 100%; font-size: 5.1pt; font-weight: 500; line-height: .95; color: #4b5563; white-space: normal; overflow: hidden; text-align: right; }
    .date { position: static; font-size: 13.6pt; font-weight: 800; line-height: 1; background: rgba(255,255,255,.92); padding: .2mm 1.0mm; border-radius: 1.2mm; }
    .op { position: absolute; bottom: 1.0mm; right: 1.4mm; font-size: 8.5pt; font-weight: 800; line-height: 1; background: rgba(255,255,255,.92); padding: .2mm .9mm; border-radius: 1.2mm; }
    .pkg { position: absolute; bottom: 0.8mm; left: 1.0mm; min-width: 17mm; text-align: center; font-size: 15pt; font-weight: 900; line-height: 1; color: #fff; background: rgba(17,24,39,.96); border: .45mm solid #fff; padding: .5mm 1.2mm; border-radius: 1.8mm; box-shadow: 0 .8mm 2.2mm rgba(0,0,0,.28); letter-spacing: .02em; }
    @media screen {
      html, body { width: auto; min-height: 100%; background: #f3f4f6; }
      body { padding: 16px; }
      .toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
      .printbtn { appearance: none; border: 0; border-radius: 10px; background: #111827; color: #fff; font-size: 16px; font-weight: 800; padding: 12px 18px; cursor: pointer; }
      .printbtn.secondary { background: #374151; }
      .printbtn[disabled] { opacity: .55; cursor: wait; }
      .pkgctl { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: #111827; }
      .pkgctl input { width: 78px; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font: inherit; }
      .printnote { color: #4b5563; font-size: 14px; }
      .sheet { width: 90mm; background: #fff; box-shadow: 0 6px 20px rgba(0,0,0,.12); }
    }
    @media print {
      .toolbar { display: none !important; }
      body { padding: 0; background: #fff; }
      .sheet { box-shadow: none; }
    }
  </style>
</head>
<body class="${bodyClasses}" style="${escapeHtml(bodyStyle)}">
  ${toolbarHtml}
  <div class="sheet">${labelsHtml}</div>
  <script>
${clientScriptStr}
  </script>
</body>
</html>`;
}

function firstExistingPath(candidates) {
  for (const raw of candidates || []) {
    const p = String(raw || '').trim();
    if (!p) continue;
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) {}
  }
  return '';
}

function getDirectPrintConfig() {
  return {
    edgeExe: firstExistingPath([
      process.env.DIRECT_PRINT_EDGE_EXE,
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ]),
    sumatraExe: firstExistingPath([
      process.env.DIRECT_PRINT_SUMATRA_EXE,
      'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
      path.join(process.env.LOCALAPPDATA || '', 'SumatraPDF', 'SumatraPDF.exe'),
    ]),
    printer: String(process.env.DIRECT_PRINT_PRINTER || '').trim(),
    tempDir: path.join(os.tmpdir(), 'rollladen-monitor-print'),
  };
}

async function waitForFile(filePath, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const st = await fs.promises.stat(filePath);
      if (st && st.size > 0) return;
    } catch (e) {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('PDF generation timed out');
}

function normalizePrinterName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripPrinterCopySuffix(name) {
  return String(name || '').replace(/\s*\(\s*kopie\s*\d+\s*\)\s*$/i, '').trim();
}

async function listWindowsPrinters() {
  if (process.platform !== 'win32') return [];
  const exe = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';
  try {
    const { stdout } = await execFileAsync(
      exe,
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress',
      ],
      { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 }
    );
    const raw = String(stdout || '').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : (typeof parsed === 'string' ? [parsed] : []);
    return list.map(s => String(s || '').trim()).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function resolvePrinterName(requested, available) {
  const req = String(requested || '').trim();
  if (!req) return { printer: '', resolvedFrom: '' };
  const avail = Array.isArray(available) ? available.filter(Boolean) : [];
  if (!avail.length) return { printer: req, resolvedFrom: '' };
  if (avail.includes(req)) return { printer: req, resolvedFrom: '' };

  const reqNorm = normalizePrinterName(req);
  const byNorm = avail.filter(p => normalizePrinterName(p) === reqNorm);
  if (byNorm.length === 1) return { printer: byNorm[0], resolvedFrom: req };

  const stripped = stripPrinterCopySuffix(req);
  if (stripped && stripped !== req) {
    const strippedNorm = normalizePrinterName(stripped);
    const byStripped = avail.filter(p => normalizePrinterName(stripPrinterCopySuffix(p)) === strippedNorm);
    if (byStripped.length === 1) return { printer: byStripped[0], resolvedFrom: req };
  }

  const startsWith = avail.filter(p => normalizePrinterName(stripPrinterCopySuffix(p)).startsWith(normalizePrinterName(stripPrinterCopySuffix(req))));
  if (startsWith.length === 1) return { printer: startsWith[0], resolvedFrom: req };

  return { printer: req, resolvedFrom: '' };
}

async function printLabelDirect(input) {
  if (process.platform !== 'win32') {
    const err = new Error('Direktdruck ist aktuell nur unter Windows aktiviert');
    err.status = 501;
    err.details = { platform: process.platform, env: Object.keys(process.env || {}) };
    throw err;
  }

  const cfg = getDirectPrintConfig();
  if (!cfg.edgeExe) {
    const err = new Error('Edge nicht gefunden. Setze DIRECT_PRINT_EDGE_EXE oder installiere Microsoft Edge.');
    err.status = 501;
    err.details = {
      env_DIRECT_PRINT_EDGE_EXE: process.env.DIRECT_PRINT_EDGE_EXE || null,
      envPath: process.env.PATH || null,
      candidates: [
        process.env.DIRECT_PRINT_EDGE_EXE || '',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ],
      cfg,
    };
    throw err;
  }
  if (!cfg.sumatraExe) {
    const err = new Error('SumatraPDF nicht gefunden. Installiere SumatraPDF oder setze DIRECT_PRINT_SUMATRA_EXE.');
    err.status = 501;
    err.details = {
      env_DIRECT_PRINT_SUMATRA_EXE: process.env.DIRECT_PRINT_SUMATRA_EXE || null,
      env_LOCALAPPDATA: process.env.LOCALAPPDATA || null,
      candidates: [
        process.env.DIRECT_PRINT_SUMATRA_EXE || '',
        'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
        path.join(process.env.LOCALAPPDATA || '', 'SumatraPDF', 'SumatraPDF.exe'),
      ],
      cfg,
    };
    throw err;
  }

  let accessErrors = [];
  try { await fs.promises.access(cfg.edgeExe, fs.constants.R_OK); }
  catch (e) { accessErrors.push('edgeExe "' + cfg.edgeExe + '" nicht lesbar: ' + (e && (e.code || e.message) ? String(e.code || e.message) : String(e))); }
  try { await fs.promises.access(cfg.sumatraExe, fs.constants.R_OK); }
  catch (e) { accessErrors.push('sumatraExe "' + cfg.sumatraExe + '" nicht lesbar: ' + (e && (e.code || e.message) ? String(e.code || e.message) : String(e))); }
  if (accessErrors.length) {
    const err = new Error('Direktdruck fehlgeschlagen (EXE nicht lesbar). ' + accessErrors.join(' | '));
    err.status = 500;
    err.details = { stage: 'exeAccess', accessErrors, cfg, envPath: process.env.PATH || null };
    throw err;
  }

  const requestedPrinter = String(input && input.printer || cfg.printer || '').trim();
  let availablePrinters = [];
  try {
    availablePrinters = await listWindowsPrinters();
  } catch (e) {
    availablePrinters = [];
  }
  if (availablePrinters.length === 0) {
    const err = new Error('Direktdruck fehlgeschlagen: Keine Windows-Drucker für den Node-Prozess sichtbar. Wahrscheinliche Ursache: Node läuft als Windows-Dienst (Session0-Isolation). Node muss in einer echten User-Session laufen (Taskplaner: "Nur ausführen wenn Benutzer angemeldet ist" oder Autostart-Ordner statt Dienst).');
    err.status = 500;
    err.details = {
      stage: 'listPrintersEmpty',
      requestedPrinter: requestedPrinter || null,
      sessionName: process.env.SESSIONNAME || null,
      username: process.env.USERNAME || null,
      localAppData: process.env.LOCALAPPDATA || null,
      serviceHint: 'If the Node process is started via "sc.exe create" / Services / Task Scheduler "Run whether user is logged on or not", Win32 PrintAPI is blocked in Session 0. Use Task Scheduler "Run only when user is logged on" or launch from Startup folder.',
    };
    throw err;
  }
  if (requestedPrinter) {
    const resolved = resolvePrinterName(requestedPrinter, availablePrinters);
    const matches = availablePrinters.some(p => normalizePrinterName(p) === normalizePrinterName(resolved.printer)) || availablePrinters.includes(resolved.printer);
    if (!matches) {
      const err = new Error(`Direktdruck fehlgeschlagen: Konfigurierter Drucker "${requestedPrinter}" existiert unter den sichtbaren Druckern nicht (${availablePrinters.length} Drucker gefunden).`);
      err.status = 500;
      err.details = {
        stage: 'resolvePrinterMissing',
        requestedPrinter,
        resolvedFrom: resolved.resolvedFrom || null,
        printerResolved: resolved.printer || null,
        availablePrintersPreview: availablePrinters.slice(0, 50),
      };
      throw err;
    }
  }

  await fs.promises.mkdir(cfg.tempDir, { recursive: true });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const htmlPath = path.join(cfg.tempDir, `label-${stamp}.html`);
  const pdfPath = path.join(cfg.tempDir, `label-${stamp}.pdf`);
  const inputSummary = {
    fields: Object.keys(input || {}),
    qr: input && input.qr ? String(input.qr).slice(0, 100) : null,
    l1: input && input.l1 ? String(input.l1).slice(0, 100) : null,
    l2: input && input.l2 ? String(input.l2).slice(0, 100) : null,
    delivery: input && input.delivery ? String(input.delivery).slice(0, 100) : null,
    pkgIndex: typeof (input && input.pkgIndex) !== 'undefined' ? String(input.pkgIndex) : null,
    pkgTotal: typeof (input && input.pkgTotal) !== 'undefined' ? String(input.pkgTotal) : null,
    printer: input && input.printer ? String(input.printer).slice(0, 200) : null,
    includeToolbar: !!(input && input.includeToolbar),
    allowDirectPrint: !!(input && input.allowDirectPrint),
  };

  let html;
  try {
    html = await buildLabelHtml(input, { includeToolbar: false, allowDirectPrint: false });
  } catch (e) {
    const err = new Error('Direktdruck fehlgeschlagen (Label-HTML konnte nicht gebaut werden).');
    err.status = 500;
    err.details = {
      stage: 'buildLabelHtml',
      inputSummary,
      message: e?.message || String(e),
      name: e?.name || null,
      stack: typeof e?.stack === 'string' ? e.stack.slice(-4000) : null,
    };
    throw err;
  }
  try {
    await fs.promises.writeFile(htmlPath, html, 'utf8');
  } catch (e) {
    const err = new Error('Direktdruck fehlgeschlagen (Label-HTML konnte nicht geschrieben werden).');
    err.status = 500;
    err.details = {
      stage: 'writeHtml',
      inputSummary,
      htmlPath,
      tempDir: cfg.tempDir,
      message: e?.message || String(e),
      name: e?.name || null,
      code: e?.code || null,
    };
    throw err;
  }

  const edgeArgs = [
    '--headless=new',
    '--disable-gpu',
    '--allow-file-access-from-files',
    `--print-to-pdf=${pdfPath}`,
    '--print-to-pdf-no-header',
    pathToFileURL(htmlPath).href,
  ];
  try {
    await execFileAsync(
      cfg.edgeExe,
      edgeArgs,
      { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 }
    );
    await waitForFile(pdfPath, 20000);
  } catch (e) {
    let pdfStats = null;
    try {
      const st = await fs.promises.stat(pdfPath);
      pdfStats = { exists: true, size: st.size, mtime: st.mtime ? String(st.mtime) : null };
    } catch (_) {
      pdfStats = { exists: false };
    }
    const msg = e && e.message && /timed?\s*out/i.test(String(e.message))
      ? 'Direktdruck fehlgeschlagen (PDF-Generierung: Edge-Timeout).'
      : 'Direktdruck fehlgeschlagen (PDF-Generierung: Edge konnte PDF nicht erzeugen).';
    const err = new Error(msg);
    err.status = 500;
    err.details = {
      stage: 'edgeHeadlessPdf',
      edgeExe: cfg.edgeExe,
      edgeArgs,
      htmlPath,
      pdfPath,
      pdfStats,
      tempDir: cfg.tempDir,
      inputSummary,
      exitCode: typeof e?.code === 'number' ? e.code : null,
      signal: typeof e?.signal === 'string' ? e.signal : null,
      stdout: typeof e?.stdout === 'string' ? e.stdout.slice(-2000) : null,
      stderr: typeof e?.stderr === 'string' ? e.stderr.slice(-2000) : null,
      message: e?.message || String(e),
      code: e?.code || null,
    };
    throw err;
  }

  let printer = requestedPrinter;
  let resolvedFrom = '';
  if (printer) {
    const resolved = resolvePrinterName(printer, availablePrinters);
    printer = resolved.printer;
    resolvedFrom = resolved.resolvedFrom;
  }
  const args = ['-silent'];
  if (printer) args.push('-print-to', printer);
  else args.push('-print-to-default');
  args.push(pdfPath);
  try {
    await execFileAsync(cfg.sumatraExe, args, { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
  } catch (e) {
    const shown = availablePrinters.slice(0, 8);
    const hint = printer
      ? `Drucker "${printer}" nicht druckbereit oder Name falsch.`
      : 'Kein Drucker gesetzt und Standarddrucker nicht druckbereit.';
    const msg = [
      'Direktdruck fehlgeschlagen (SumatraPDF).',
      hint,
      shown.length ? ('Verfügbare Drucker: ' + shown.join(' | ')) : '',
    ].filter(Boolean).join(' ');
    const err = new Error(msg);
    err.status = 500;
    err.details = {
      stage: 'sumatraPrint',
      sumatraExe: cfg.sumatraExe,
      args,
      requestedPrinter: requestedPrinter || null,
      printer: printer || null,
      resolvedFrom: resolvedFrom || null,
      exitCode: typeof e?.code === 'number' ? e.code : null,
      signal: typeof e?.signal === 'string' ? e.signal : null,
      stdout: typeof e?.stdout === 'string' ? e.stdout.slice(-2000) : null,
      stderr: typeof e?.stderr === 'string' ? e.stderr.slice(-2000) : null,
      pdfPath,
      tempDir: cfg.tempDir,
      availablePrinters: availablePrinters.slice(0, 50),
      inputSummary,
      message: e?.message || String(e),
    };
    throw err;
  }

  setTimeout(() => {
    try { fs.unlinkSync(htmlPath); } catch (e) {}
    try { fs.unlinkSync(pdfPath); } catch (e) {}
  }, 15 * 60 * 1000);

  return { ok: true, printer: printer || '(Standarddrucker)', resolvedFrom: resolvedFrom || null };
}

router.get('/label', async (req, res, next) => {
  try {
    const html = await buildLabelHtml(req.query, { includeToolbar: true, allowDirectPrint: true });
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    next(err);
  }
});

router.post('/label/direct-print', express.json(), async (req, res) => {
  const startedAt = Date.now();
  let responded = false;
  const timeoutMs = 80000;
  const killTimer = setTimeout(function () {
    if (responded) return;
    responded = true;
    try {
      res.status(504).json({
        ok: false,
        error: 'Direktdruck-Timeout nach ' + Math.round(timeoutMs/1000) + 's: Server- Prozess (Edge/SumatraPDF) hängt. Bitte Prozess auf Server-PC beenden.',
        details: {
          stage: 'serverTimeout',
          afterMs: timeoutMs,
          inputSummary: { fields: Object.keys(req.body || {}), qr: (req.body && req.body.qr ? String(req.body.qr).slice(0,100) : null) }
        }
      });
    } catch (e) {}
  }, timeoutMs);
  try {
    console.error('[DIRECT-PRINT:START] ts=' + startedAt + ' bodyKeys=' + JSON.stringify(Object.keys(req.body || {})) + ' qr=' + (req.body && req.body.qr ? String(req.body.qr).slice(0,120) : ''));
    const out = await printLabelDirect(req.body || {});
    if (responded) return;
    clearTimeout(killTimer);
    responded = true;
    console.error('[DIRECT-PRINT:OK] dt_ms=' + (Date.now() - startedAt) + ' printer=' + JSON.stringify(out && out.printer ? out.printer : null) + ' resolvedFrom=' + JSON.stringify(out && out.resolvedFrom ? out.resolvedFrom : null));
    res.json(out);
  } catch (err) {
    if (responded) return;
    clearTimeout(killTimer);
    responded = true;
    try {
      const safe = {
        message: err && err.message ? String(err.message) : String(err),
        status: err && err.status ? err.status : 500,
        details: err && err.details ? err.details : null,
        name: err && err.name ? err.name : null,
        code: err && err.code ? err.code : null,
        stack: err && typeof err.stack === 'string' ? err.stack.slice(-2500) : null,
      };
      console.error('[DIRECT-PRINT:ERROR] dt_ms=' + (Date.now() - startedAt) + ' ' + JSON.stringify(safe));
    } catch (_) {}
    res.status(err.status || 500).json({ ok: false, error: err.message || 'Direktdruck fehlgeschlagen', details: err.details || null });
  } finally {
    try { clearTimeout(killTimer); } catch (e) {}
  }
});

router.get('/label/direct-print', async (req, res) => {
  const startedAt = Date.now();
  let responded = false;
  const timeoutMs = 80000;
  const killTimer = setTimeout(function () {
    if (responded) return;
    responded = true;
    try {
      res.status(504).json({
        ok: false,
        error: 'Direktdruck-Timeout nach ' + Math.round(timeoutMs/1000) + 's: Server- Prozess (Edge/SumatraPDF) hängt.',
        details: { stage: 'serverTimeout', afterMs: timeoutMs, inputSummary: { fields: Object.keys(req.query || {}) } },
      });
    } catch (e) {}
  }, timeoutMs);
  try {
    console.error('[DIRECT-PRINT:START-GET] ts=' + startedAt + ' queryKeys=' + JSON.stringify(Object.keys(req.query || {})));
    const out = await printLabelDirect(req.query || {});
    if (responded) return;
    clearTimeout(killTimer);
    responded = true;
    res.json(out);
  } catch (err) {
    if (responded) return;
    clearTimeout(killTimer);
    responded = true;
    res.status(err.status || 500).json({ ok: false, error: err.message || 'Direktdruck fehlgeschlagen', details: err.details || null });
  } finally {
    try { clearTimeout(killTimer); } catch (e) {}
  }
});

router.get('/label-print-config', (req, res) => {
  const cfg = getDirectPrintConfig();
  res.json({
    ok: true,
    win32: process.platform === 'win32',
    edgeExe: cfg.edgeExe || null,
    sumatraExe: cfg.sumatraExe || null,
    printer: cfg.printer || null,
  });
});

router.get('/print-health', async (req, res) => {
  const cfg = getDirectPrintConfig();
  const edgeExists = cfg.edgeExe ? fs.existsSync(cfg.edgeExe) : false;
  const sumatraExists = cfg.sumatraExe ? fs.existsSync(cfg.sumatraExe) : false;
  let printers = [];
  let printersErr = null;
  let printersCount = 0;
  try {
    printers = await listWindowsPrinters();
    printersCount = printers.length;
  } catch (e) {
    printersErr = { message: e && e.message ? String(e.message) : String(e), code: e && e.code ? String(e.code) : null, name: e && e.name ? String(e.name) : null };
  }
  let tmpDirOk = false;
  let tmpDirErr = null;
  try {
    await fs.promises.mkdir(cfg.tempDir, { recursive: true });
    await fs.promises.access(cfg.tempDir, fs.constants.W_OK | fs.constants.R_OK);
    tmpDirOk = true;
  } catch (e) {
    tmpDirErr = { message: e && e.message ? String(e.message) : String(e), code: e && e.code ? String(e.code) : null };
  }
  const requestedPrinter = String(cfg.printer || '').trim();
  let resolvedPrinter = '';
  let resolvedFrom = '';
  if (requestedPrinter && printersCount) {
    const resolved = resolvePrinterName(requestedPrinter, printers);
    resolvedPrinter = resolved.printer;
    resolvedFrom = resolved.resolvedFrom;
  }
  const sessionHint = (process.platform === 'win32' && !printersCount)
    ? 'Achtung: Keine Drucker gelistet. Läuft Node als Windows-Dienst (Session0)? Diensten ist Drucken per Win32-PrintAPI meist verboten. Startet Node in einer echten User-Session (z.B. Autostart-Ordner, Taskplaner "Run whether user is logged on or not" deaktivieren, oder "Nur ausführen wenn Benutzer angemeldet ist" aktivieren).'
    : '';
  const winSession = process.platform === 'win32' ? {
    sessionName: process.env.SESSIONNAME || null,
    username: process.env.USERNAME || null,
    userdomain: process.env.USERDOMAIN || null,
    localAppData: process.env.LOCALAPPDATA || null,
  } : null;
  res.json({
    ok: true,
    platform: process.platform,
    nodeAsUser: winSession,
    pid: process.pid,
    directPrint: {
      edgeExe: cfg.edgeExe || null,
      edgeExists,
      sumatraExe: cfg.sumatraExe || null,
      sumatraExists,
      printerEnv: requestedPrinter || null,
      printerResolved: resolvedPrinter || null,
      printerResolvedFrom: resolvedFrom || null,
      tempDir: cfg.tempDir,
      tempDirOk,
      tempDirErr,
    },
    printersCount,
    printersPreview: printers.slice(0, 50),
    printersErr,
    hints: [
      edgeExists ? '' : 'Edge nicht gefunden. Installiere Microsoft Edge (stable) oder setze DIRECT_PRINT_EDGE_EXE auf den vollen Pfad zu msedge.exe.',
      sumatraExists ? '' : 'SumatraPDF nicht gefunden. Installiere SumatraPDF (https://www.sumatrapdfreader.org/download-free-pdf-viewer) oder setze DIRECT_PRINT_SUMATRA_EXE.',
      (process.platform === 'win32') ? '' : 'Direktdruck ist nur unter Windows implementiert.',
      requestedPrinter ? (printersCount ? (resolvedPrinter ? '' : `Config-Drucker "${requestedPrinter}" wurde in den Windows-Druckern NICHT gefunden. Prüfe DIRECT_PRINT_PRINTER - Wert und/oder Druckerliste unten.`) : '') : 'Kein fester Drucker per DIRECT_PRINT_PRINTER gesetzt. Es wird auf den Windows-Standarddrucker gedruckt.',
      sessionHint,
      tmpDirOk ? '' : 'Temp-Verzeichnis nicht beschreibbar (benötigt für HTML/PDF-Dateien).',
    ].filter(Boolean),
  });
});

router.get('/materials', (req, res) => {
  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Materialübersicht</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: #08111f; color: #f4f7fb; }
    a { color: inherit; }
    .wrap { max-width: 1280px; margin: 0 auto; padding: 14px; }
    .top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 10px; }
    .title { font-size: 18px; font-weight: 800; }
    .meta { font-size: 12px; color: #a8b0c2; }
    .bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .bar input { flex: 1 1 320px; min-width: 220px; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color: #e6eaf2; outline: none; }
    .btn { padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); color: #e6eaf2; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
    .btn:hover { background: rgba(255,255,255,.09); }
    .grid { display: grid; gap: 10px; }
    .card { border: 1px solid rgba(255,255,255,.10); border-radius: 14px; background: rgba(255,255,255,.04); overflow: hidden; }
    .card-h { padding: 10px 12px; display: flex; justify-content: space-between; gap: 10px; align-items: baseline; border-bottom: 1px solid rgba(255,255,255,.08); }
    .card-h .h { font-weight: 800; }
    .card-h .c { font-size: 12px; color: #a8b0c2; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,.06); vertical-align: top; }
    th { font-size: 12px; color: #a8b0c2; font-weight: 700; }
    td { font-size: 13px; }
    tr:hover td { background: rgba(255,255,255,.03); }
    .muted { color: #a8b0c2; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .tag { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04); color: #d6dbeb; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="title">Materialübersicht</div>
      <div class="meta" id="meta"></div>
    </div>
    <div class="bar">
      <input id="q" placeholder="Filter (Material, Kunde, Datum)…" autocomplete="off" />
      <a class="btn" href="/display">Zurück zum Monitor</a>
      <button class="btn" id="reload" type="button">Aktualisieren</button>
    </div>
    <div id="root" class="grid"></div>
  </div>
  <script>
    const state = { last: null, q: '' };

    function el(tag, attrs, children) {
      const node = document.createElement(tag);
      if (attrs) {
        Object.entries(attrs).forEach(([k, v]) => {
          if (k === 'class') node.className = v;
          else if (k === 'html') node.innerHTML = v;
          else node.setAttribute(k, v);
        });
      }
      (children || []).forEach(c => node.appendChild(c));
      return node;
    }

    function text(s) { return document.createTextNode(s); }
    function normalizeOneLine(s) { return String(s || '').replace(/\\s+/g, ' ').trim(); }

    function formatDateShort(iso) {
      if (!iso) return '';
      const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
      if (!isFinite(d.getTime())) return String(iso).slice(0, 10);
      return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function flattenItems(data) {
      const b = data && data.buckets ? data.buckets : null;
      if (!b) return [];
      return []
        .concat(Array.isArray(b.today) ? b.today : [])
        .concat(Array.isArray(b.tomorrow) ? b.tomorrow : [])
        .concat(Array.isArray(b.later) ? b.later : []);
    }

    function buildMaterialMap(items) {
      const map = new Map();
      items.forEach(it => {
        const needs = Array.isArray(it && it.materialNeeds) ? it.materialNeeds : [];
        needs.forEach(m => {
          const key = normalizeOneLine(m);
          if (!key) return;
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(it);
        });
      });
      return map;
    }

    function itemRow(it) {
      const montage = it && it.montageDate ? formatDateShort(it.montageDate) : '';
      const title = normalizeOneLine(it && it.title);
      const id = it && it.id ? String(it.id) : '';
      const link = id ? ('/display?code=' + encodeURIComponent('rwjob:' + id)) : '/display';
      return el('tr', null, [
        el('td', { class: 'mono' }, [text(montage || '—')]),
        el('td', null, [el('a', { href: link, target: '_blank', rel: 'noopener noreferrer' }, [text(title || id || '—')])]),
        el('td', { class: 'mono muted' }, [text(id ? ('#' + id.slice(0, 8)) : '')]),
      ]);
    }

    function render(data) {
      state.last = data;
      const root = document.getElementById('root');
      root.innerHTML = '';
      const items = flattenItems(data);
      const map = buildMaterialMap(items);
      const q = normalizeOneLine(state.q).toLowerCase();

      const entries = Array.from(map.entries())
        .map(([material, its]) => {
          const rows = its
            .slice()
            .sort((a, b) => String(a.montageDate || a.dueDate || '').localeCompare(String(b.montageDate || b.dueDate || '')));
          const hay = (material + ' ' + rows.map(r => (r.title || '') + ' ' + (r.montageDate || '')).join(' ')).toLowerCase();
          return { material, rows, hay };
        })
        .filter(e => !q || e.hay.includes(q))
        .sort((a, b) => a.material.localeCompare(b.material));

      document.getElementById('meta').textContent =
        'Stand: ' + new Date(data.generatedAt).toLocaleString('de-DE') +
        ' • Materialien: ' + entries.length +
        ' • Aufträge: ' + items.length;

      if (!entries.length) {
        root.appendChild(el('div', { class: 'muted' }, [text('Keine Materialien gefunden (oder Filter zu streng).')]));
        return;
      }

      entries.forEach(e => {
        const card = el('div', { class: 'card' }, [
          el('div', { class: 'card-h' }, [
            el('div', { class: 'h' }, [text(e.material)]),
            el('div', { class: 'c' }, [el('span', { class: 'tag' }, [text(String(e.rows.length) + ' Auftrag' + (e.rows.length === 1 ? '' : 'e'))])])
          ]),
          el('div', null, [
            el('table', null, [
              el('thead', null, [
                el('tr', null, [
                  el('th', null, [text('Montage')]),
                  el('th', null, [text('Kommission / Kunde')]),
                  el('th', null, [text('ID')]),
                ])
              ]),
              el('tbody', null, e.rows.map(itemRow))
            ])
          ])
        ]);
        root.appendChild(card);
      });
    }

    function load() {
      fetch('/api/production/board')
        .then(r => r.json())
        .then(render)
        .catch(() => {
          const root = document.getElementById('root');
          root.innerHTML = '';
          root.appendChild(el('div', { class: 'muted' }, [text('Laden fehlgeschlagen. Bitte erneut versuchen.')]));
        });
    }

    document.getElementById('q').addEventListener('input', (e) => {
      state.q = String(e.target.value || '');
      if (state.last) render(state.last);
    });
    document.getElementById('reload').addEventListener('click', load);
    load();
    setInterval(load, 60000);
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

router.get('/materialstatus/:token', (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!isMaterialStatusTokenValid(token)) {
    return res.status(404).send('Not found');
  }

  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Materialstatus</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: #0b0f19; color: #e6eaf2; }
    a { color: inherit; }
    .wrap { max-width: 1440px; margin: 0 auto; padding: 16px; }
    .top { display:flex; justify-content:space-between; align-items:flex-start; gap: 12px; margin-bottom: 12px; }
    .title { font-size: 22px; font-weight: 800; }
    .meta { font-size: 12px; color: #d1d9e6; margin-top: 4px; }
    .bar, .statsbar { display:flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .btn, .bar a { padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.18); background: rgba(18,28,46,.92); color: #f4f7fb; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
    .btn:hover, .bar a:hover { background: rgba(35,48,73,.98); }
    .btn.small { padding: 7px 10px; border-radius: 10px; font-size: 12px; }
    .btn.ok { border-color: rgba(34,197,94,.55); background: rgba(22,163,74,.16); }
    .btn.err { border-color: rgba(239,68,68,.55); background: rgba(220,38,38,.16); }
    .btn.primary { background: #1d4ed8; border-color: #2563eb; color: #fff; }
    .btn.warn { background: #7c2d12; border-color: #9a3412; color: #fff; }
    input, select, textarea { width: 100%; padding: 9px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,.18); background: #1a2436; color: #f8fbff; }
    input::placeholder, textarea::placeholder { color: #b8c4d7; }
    input:focus, select:focus, textarea:focus { outline: 2px solid #60a5fa; outline-offset: 1px; border-color: #60a5fa; background: #202c42; }
    select option { background: #f8fafc; color: #111827; }
    textarea { min-height: 42px; resize: vertical; }
    .grid { display:grid; gap: 12px; grid-template-columns: 1.5fr 1fr; align-items: start; }
    .full { grid-column: 1 / -1; }
    .cards { display:grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
    .card { border: 1px solid rgba(255,255,255,.12); border-radius: 14px; background: rgba(15,24,39,.96); overflow: hidden; box-shadow: 0 6px 18px rgba(0,0,0,.24); }
    .card-h { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.10); display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
    .card-b { padding: 12px; }
    .label { font-size: 12px; color: #d1d9e6; }
    .num { font-size: 24px; font-weight: 800; }
    .sub { font-size: 12px; color: #d7dfec; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { text-align: left; padding: 8px 8px; border-bottom: 1px solid rgba(255,255,255,.07); vertical-align: top; }
    th { font-size: 12px; color: #d1d9e6; font-weight: 700; white-space: nowrap; }
    td { font-size: 13px; color: #f4f7fb; }
    td input, td textarea { font-size: 12px; }
    td textarea[data-field="label"] { min-height: 52px; line-height: 1.2; }
    .inventory-table th:first-child, .inventory-table td:first-child { width: 20%; }
    .inventory-table th:nth-child(2), .inventory-table td:nth-child(2),
    .inventory-table th:nth-child(3), .inventory-table td:nth-child(3),
    .inventory-table th:nth-child(4), .inventory-table td:nth-child(4),
    .inventory-table th:nth-child(5), .inventory-table td:nth-child(5),
    .inventory-table th:nth-child(6), .inventory-table td:nth-child(6),
    .inventory-table th:nth-child(7), .inventory-table td:nth-child(7) { width: 8%; }
    .inventory-table th:nth-child(8), .inventory-table td:nth-child(8) { width: 10%; }
    .inventory-table th:nth-child(9), .inventory-table td:nth-child(9) { width: 18%; }
    .inventory-table th:nth-child(10), .inventory-table td:nth-child(10) { width: 4%; }
    tr.status-missing td { background: rgba(153,27,27,.20); }
    tr.status-low td { background: rgba(133,77,14,.18); }
    tr.status-untracked td { background: rgba(8,145,178,.18); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace; }
    .pill { display:inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: #f4f7fb; }
    .pill.red { background: rgba(153,27,27,.24); }
    .pill.yellow { background: rgba(133,77,14,.24); }
    .pill.blue { background: rgba(8,145,178,.24); }
    .list { display:grid; gap: 8px; }
    .item { border: 1px solid rgba(255,255,255,.10); border-radius: 12px; padding: 10px 12px; background: rgba(28,40,61,.92); }
    .item .h { font-weight: 700; color: #ffffff; }
    .item .m { font-size: 12px; color: #d5ddec; margin-top: 4px; }
    .item .d { font-size: 13px; margin-top: 6px; white-space: pre-wrap; color: #eef2f8; }
    .muted { color: #d5ddec; }
    .empty { border: 1px dashed rgba(255,255,255,.20); border-radius: 12px; padding: 14px; color: #e2e8f0; background: rgba(20,31,49,.85); }
    .split { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .stats-grid { display:grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .stats-entry-grid { display:grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 10px; }
    .order-overview { margin-top: 8px; padding-left: 18px; color: #eef2f8; }
    .order-overview li { margin: 4px 0; }
    .recent { max-height: 420px; overflow: auto; }
    @media (max-width: 1180px) { .grid, .split { grid-template-columns: 1fr; } .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) { .cards, .stats-grid, .stats-entry-grid { grid-template-columns: 1fr; } .wrap { padding: 12px; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title">Materialstatus</div>
        <div class="meta" id="pageMeta">Geheime lokale Ansicht für Bestand, Fehlteile und Statistik</div>
      </div>
      <div class="bar">
        <a href="/display">Zurück zum Monitor</a>
        <a href="/display/materialbestand/${escapeHtml(token)}">Bestandsansicht</a>
        <a href="/display/materialfreigabe">Materialfreigabe</a>
        <button class="btn" id="reloadBtn" type="button">Aktualisieren</button>
        <button class="btn primary" id="saveBtn" type="button">Aenderungen speichern</button>
      </div>
    </div>

    <div class="cards" id="summaryCards"></div>

    <div class="grid">
      <div class="card full">
        <div class="card-h">
          <div>
            <div class="h">Bestand pflegen</div>
            <div class="sub">Bestand in VE pflegen. Verfügbar = Bestand VE x VE-Größe.</div>
          </div>
          <div>
            <button class="btn" id="addRowBtn" type="button">Zeile hinzufügen</button>
          </div>
        </div>
        <div class="card-b">
          <div style="overflow-x:hidden;">
            <table class="inventory-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Bestand VE</th>
                  <th>VE-Größe</th>
                  <th>Min. VE</th>
                  <th>Pegel</th>
                  <th>Einheit</th>
                  <th>Bedarf</th>
                  <th>Fehlt</th>
                  <th>Notiz</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="inventoryBody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-h">
          <div class="h">Akute Fehlteile</div>
          <div class="pill red" id="shortageCount">0</div>
        </div>
        <div class="card-b">
          <div class="list" id="shortageList"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-h">
          <div class="h">Suchauftrag / Regel fehlt</div>
          <div class="pill blue" id="searchCount">0</div>
        </div>
        <div class="card-b">
          <div class="list" id="searchList"></div>
        </div>
      </div>

      <div class="card full">
        <div class="card-h">
          <div>
            <div class="h">Laufende Aufträge und Materialbedarf</div>
            <div class="sub">Aktuelle offene Aufträge mit erkannten Panzer-Bedarfen und allgemeinen Materialhinweisen.</div>
          </div>
        </div>
        <div class="card-b">
          <div class="list" id="openItemsList"></div>
        </div>
      </div>

      <div class="card full">
        <div class="card-h">
          <div>
            <div class="h">Produktzuordnung bearbeiten</div>
            <div class="sub">Vergleiche automatische Erkennung mit deiner lokalen Zuweisung. Die Statistik zaehlt danach mit der Zuweisung.</div>
          </div>
        </div>
        <div class="card-b">
          <div class="list" id="productOverrideList"></div>
        </div>
      </div>

      <div class="card full">
        <div class="card-h">
          <div>
            <div class="h">Statistik</div>
            <div class="sub">Erledigte Aufträge nach Zeitraum plus aktuelle laufende Aufträge.</div>
          </div>
        </div>
        <div class="card-b">
          <div class="statsbar">
            <div style="min-width:180px;"><input id="fromInput" type="date"></div>
            <div style="min-width:180px;"><input id="toInput" type="date"></div>
            <div style="min-width:220px;"><select id="productTypeSelect"><option value="">Alle Produktarten</option></select></div>
            <button class="btn" id="loadStatsBtn" type="button">Statistik laden</button>
          </div>
          <div class="stats-grid" id="statsCards"></div>
          <div class="split" style="margin-top:12px;">
            <div class="card">
              <div class="card-h"><div class="h">Erledigt nach Produktart</div></div>
              <div class="card-b"><div class="list" id="completedByType"></div></div>
            </div>
            <div class="card">
              <div class="card-h"><div class="h">Laufend nach Produktart</div></div>
              <div class="card-b"><div class="list" id="runningByType"></div></div>
            </div>
          </div>
          <div class="card" style="margin-top:12px;">
            <div class="card-h"><div class="h">Zuletzt erledigte Aufträge</div></div>
            <div class="card-b recent">
              <div class="list" id="recentCompleted"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const token = ${JSON.stringify(token)};
    const state = { report: null, stats: null, rows: [], statsRunningItems: [], recentCompletedItems: [], productOverrides: {}, productTypeOptions: [], itemStats: {}, statFieldOptions: [] };

    function el(tag, attrs, children) {
      const node = document.createElement(tag);
      if (attrs) {
        Object.entries(attrs).forEach(([k, v]) => {
          if (k === 'class') node.className = v;
          else if (k === 'html') node.innerHTML = v;
          else if (k === 'value') node.value = v;
          else node.setAttribute(k, v);
        });
      }
      (children || []).forEach(c => node.appendChild(c));
      return node;
    }
    function text(s) { return document.createTextNode(String(s == null ? '' : s)); }
    function fmtNum(n) {
      const num = Number(n || 0);
      return Number.isFinite(num) ? num.toLocaleString('de-DE') : '0';
    }
    function todayIso() { return new Date().toISOString().slice(0, 10); }
    function minusDaysIso(days) {
      const d = new Date();
      d.setDate(d.getDate() - Number(days || 0));
      return d.toISOString().slice(0, 10);
    }
    function formatTs(ts) {
      const d = new Date(ts);
      return isFinite(d.getTime()) ? d.toLocaleString('de-DE') : String(ts || '');
    }
    function formatDate(iso) {
      if (!iso) return '';
      const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
      return isFinite(d.getTime()) ? d.toLocaleDateString('de-DE') : String(iso || '');
    }
    function pillClass(status) {
      if (status === 'missing') return 'pill red';
      if (status === 'low') return 'pill yellow';
      if (status === 'untracked') return 'pill blue';
      return 'pill';
    }

    function fetchJson(url, options) {
      return fetch(url, options).then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || data.ok === false) {
          throw new Error(data && data.error ? data.error : 'Anfrage fehlgeschlagen');
        }
        return data;
      });
    }

    function getRowUiState(row) {
      const packSize = Math.max(1, Number(row && row.packSize || 1) || 1);
      const stockPacks = Math.max(0, Number(row && row.stockPacks || 0) || 0);
      const minPacks = Math.max(0, Number(row && row.minPacks || 0) || 0);
      const neededUnits = Math.max(0, Number(row && row.neededUnits || 0) || 0);
      const availableUnits = stockPacks * packSize;
      const missingUnits = Math.max(0, neededUnits - availableUnits);
      const remainingUnits = Math.max(0, availableUnits - neededUnits);
      let status = String(row && row.status || 'ok');
      if (status !== 'untracked') {
        if (missingUnits > 0) status = 'missing';
        else if ((minPacks * packSize) > 0 && remainingUnits < (minPacks * packSize)) status = 'low';
        else status = 'ok';
      }
      return { packSize, stockPacks, minPacks, neededUnits, availableUnits, missingUnits, status };
    }

    function addRow() {
      state.rows = collectInventoryRowsFromDom();
      state.rows.push({
        key: '',
        label: '',
        stockPacks: 0,
        packSize: 1,
        minPacks: 0,
        pegValue: 0,
        pegMode: 'packs',
        unit: 'Stk',
        neededUnits: 0,
        missingUnits: 0,
        status: 'ok',
        notes: '',
      });
      renderInventory();
    }

    function removeRow(idx) {
      state.rows = collectInventoryRowsFromDom();
      state.rows.splice(idx, 1);
      renderInventory();
    }

    function collectInventoryRowsFromDom() {
      const body = document.getElementById('inventoryBody');
      if (!body) return state.rows.slice();
      const trs = Array.from(body.querySelectorAll('tr[data-row="1"]'));
      if (!trs.length) return state.rows.slice();
      return trs.map((tr) => {
        const getValue = (field) => {
          const node = tr.querySelector('[data-field="' + field + '"]');
          return node ? String(node.value || '') : '';
        };
        return {
          key: String(tr.dataset.key || '').trim(),
          category: String(tr.dataset.category || '').trim(),
          status: String(tr.dataset.status || 'ok').trim(),
          neededUnits: Number(tr.dataset.neededUnits || 0) || 0,
          missingUnits: Number(tr.dataset.missingUnits || 0) || 0,
          label: getValue('label'),
          stockPacks: getValue('stockPacks'),
          packSize: getValue('packSize'),
          minPacks: getValue('minPacks'),
          pegValue: getValue('pegValue'),
          pegMode: getValue('pegMode'),
          unit: getValue('unit'),
          notes: getValue('notes'),
        };
      });
    }

    function productTypeOptions() {
      return (Array.isArray(state.productTypeOptions) && state.productTypeOptions.length
        ? state.productTypeOptions
        : ['Rollladenpanzer', 'Insektenschutz', 'Gurt / Wickler', 'Motor / Antrieb', 'Jalousie', 'Plissee', 'Rollo', 'Office / Frage', 'Sonstiges']
      ).slice();
    }

    function statFieldOptions() {
      return (Array.isArray(state.statFieldOptions) && state.statFieldOptions.length
        ? state.statFieldOptions
        : ['Rollladenpanzer', 'Nachschneiden im selben Auftrag', 'ISS - Spannrahmen', 'ISS - Rollo', 'ISS - Tür', 'Reparatur', 'Vorsatz-/Aufsatzelement', 'Bestellware Erfal', 'Bestellware Delta Dore/Rademacher', 'Bestellware Sonstige', 'Schnittware']
      ).slice();
    }

    function collectProductOverridesFromDom() {
      const next = { ...(state.productOverrides || {}) };
      Array.from(document.querySelectorAll('select[data-product-override]')).forEach((select) => {
        const itemId = String(select.getAttribute('data-item-id') || '').trim();
        const value = String(select.value || '').trim();
        if (!itemId) return;
        if (value) next[itemId] = value;
        else delete next[itemId];
      });
      state.productOverrides = next;
      return next;
    }

    function collectItemStatsFromDom() {
      const next = {};
      Array.from(document.querySelectorAll('input[data-stat-field]')).forEach((input) => {
        const itemId = String(input.getAttribute('data-item-id') || '').trim();
        const field = String(input.getAttribute('data-stat-field') || '').trim();
        const value = Number(input.value || 0);
        const detected = Number(input.getAttribute('data-detected') || 0);
        if (!itemId || !field || !Number.isFinite(value)) return;
        if (Math.round(value) === Math.round(detected)) return;
        if (!next[itemId]) next[itemId] = {};
        next[itemId][field] = Math.max(0, Math.round(value));
      });
      state.itemStats = next;
      return next;
    }

    function collectItemStatsForItem(itemId) {
      const next = {};
      Array.from(document.querySelectorAll('input[data-stat-field][data-item-id="' + itemId + '"]')).forEach((input) => {
        const field = String(input.getAttribute('data-stat-field') || '').trim();
        const value = Number(input.value || 0);
        const detected = Number(input.getAttribute('data-detected') || 0);
        if (!field || !Number.isFinite(value)) return;
        if (Math.round(value) === Math.round(detected)) return;
        next[field] = Math.max(0, Math.round(value));
      });
      return next;
    }

    async function saveSingleItem(itemId, buttonEl) {
      const select = document.querySelector('select[data-product-override][data-item-id="' + itemId + '"]');
      const productTypeOverride = select ? String(select.value || '').trim() : '';
      const itemStats = collectItemStatsForItem(itemId);
      const originalText = buttonEl ? (buttonEl.textContent || '') : '';
      if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.classList.remove('ok', 'err');
        buttonEl.textContent = 'Speichere...';
      }
      try {
        await fetchJson('/api/production/material-status/save-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, itemId, productTypeOverride, itemStats }),
        });
        if (buttonEl) {
          buttonEl.classList.add('ok');
          buttonEl.textContent = 'Gespeichert';
        }
        await loadReport();
        await loadStats();
      } catch (e) {
        if (buttonEl) {
          buttonEl.classList.add('err');
          buttonEl.textContent = 'Fehler';
        }
        alert(String((e && e.message) || e || 'Speichern fehlgeschlagen'));
      } finally {
        if (buttonEl) {
          setTimeout(() => {
            buttonEl.disabled = false;
            buttonEl.classList.remove('ok', 'err');
            buttonEl.textContent = originalText || 'Speichern';
          }, 1200);
        }
      }
    }

    function renderSummary() {
      const root = document.getElementById('summaryCards');
      root.innerHTML = '';
      const s = state.report && state.report.summary ? state.report.summary : {};
      const cards = [
        ['Offene Aufträge', s.openItems || 0, 'Aktuell laufend im Monitor'],
        ['Materialien mit Bedarf', s.demandMaterials || 0, 'Ermittelte Bedarfszeilen'],
        ['Akute Fehlteile', s.shortageCount || 0, 'Sofort kritisch'],
        ['Aktualisierungsbedarf', s.updateCount || 0, 'Unter Puffer / Mindestbestand'],
        ['Suchaufträge', s.searchCount || 0, 'Regel fehlt oder Material unklar'],
      ];
      cards.forEach(([label, value, sub]) => {
        root.appendChild(el('div', { class: 'card' }, [
          el('div', { class: 'card-b' }, [
            el('div', { class: 'label' }, [text(label)]),
            el('div', { class: 'num' }, [text(fmtNum(value))]),
            el('div', { class: 'sub' }, [text(sub)]),
          ])
        ]));
      });
      const updated = state.report && state.report.updatedAt ? formatTs(state.report.updatedAt) : 'noch nie gespeichert';
      document.getElementById('pageMeta').textContent = 'Geheime lokale Ansicht • Bestand zuletzt gespeichert: ' + updated;
    }

    function renderInventory() {
      const body = document.getElementById('inventoryBody');
      body.innerHTML = '';
      if (!state.rows.length) {
        body.appendChild(el('tr', null, [el('td', { colspan: '10', class: 'muted' }, [text('Noch keine Materialien vorhanden.')])]));
        return;
      }
      state.rows.forEach((row, idx) => {
        const tr = el('tr', {
          class: 'status-' + String(row.status || 'ok'),
          'data-row': '1',
          'data-key': row.key || '',
          'data-category': row.category || '',
          'data-status': row.status || 'ok',
          'data-needed-units': row.neededUnits || 0,
          'data-missing-units': row.missingUnits || 0,
        }, []);
        const availableSub = el('div', { class: 'sub' }, []);
        const missingBadge = el('span', { class: pillClass(row.status) }, []);
        const neededText = el('td', { class: 'mono' }, []);

        function refreshRowUi() {
          const view = getRowUiState(row);
          tr.className = 'status-' + String(view.status || 'ok');
          neededText.textContent = fmtNum(view.neededUnits || 0) + ' ' + (row.unit || '');
          missingBadge.className = pillClass(view.status);
          missingBadge.textContent = view.missingUnits > 0 ? (fmtNum(view.missingUnits) + ' ' + (row.unit || '')) : 'ok';
          availableSub.textContent = 'Verfügbar: ' + fmtNum(view.availableUnits || 0);
        }

        const mkInput = (field, type) => {
          if (field === 'label') {
            const area = el('textarea', { rows: '2', 'data-field': field }, []);
            area.value = row[field] != null ? row[field] : '';
            return area;
          }
          const input = el('input', { type: type || 'text', value: row[field] != null ? row[field] : '', 'data-field': field }, []);
          if (field === 'stockPacks' || field === 'packSize' || field === 'minPacks' || field === 'unit') {
            input.addEventListener('change', refreshRowUi);
            input.addEventListener('blur', refreshRowUi);
          }
          return input;
        };
        const note = el('textarea', { rows: '1', 'data-field': 'notes' }, []);
        note.value = row.notes || '';
        tr.appendChild(el('td', null, [mkInput('label', 'text')]));
        tr.appendChild(el('td', null, [mkInput('stockPacks', 'number')]));
        tr.appendChild(el('td', null, [mkInput('packSize', 'number')]));
        tr.appendChild(el('td', null, [mkInput('minPacks', 'number')]));
        const pegWrap = el('div', { style: 'display:grid;gap:4px;' }, []);
        const pegVal = el('input', { type: 'number', min: '0', step: '1', value: String(row.pegValue != null ? row.pegValue : 0), 'data-field': 'pegValue' }, []);
        const pegMode = el('select', { 'data-field': 'pegMode' }, []);
        const optVe = el('option', { value: 'packs' }, [text('VE')]);
        const optStk = el('option', { value: 'units' }, [text('Stk')]);
        const currentMode = String(row.pegMode || '').trim() || 'packs';
        if (currentMode === 'packs') optVe.selected = true;
        if (currentMode === 'units') optStk.selected = true;
        pegMode.appendChild(optVe);
        pegMode.appendChild(optStk);
        pegWrap.appendChild(pegVal);
        pegWrap.appendChild(pegMode);
        tr.appendChild(el('td', null, [pegWrap]));
        tr.appendChild(el('td', null, [mkInput('unit', 'text')]));
        tr.appendChild(neededText);
        tr.appendChild(el('td', null, [
          el('div', null, [missingBadge]),
          availableSub,
        ]));
        tr.appendChild(el('td', null, [note]));
        const delBtn = el('button', { class: 'btn warn', type: 'button' }, [text('X')]);
        delBtn.addEventListener('click', () => removeRow(idx));
        tr.appendChild(el('td', null, [delBtn]));
        refreshRowUi();
        body.appendChild(tr);
      });
    }

    function renderIssues() {
      const shortageRows = (state.rows || []).filter(r => r.status === 'missing');
      const searchRows = (state.rows || []).filter(r => r.status === 'untracked');
      document.getElementById('shortageCount').textContent = String(shortageRows.length);
      document.getElementById('searchCount').textContent = String((state.report && state.report.searchTasks ? state.report.searchTasks.length : 0) + searchRows.length);

      const shortageList = document.getElementById('shortageList');
      shortageList.innerHTML = '';
      if (!shortageRows.length) shortageList.appendChild(el('div', { class: 'empty' }, [text('Aktuell keine akuten Fehlteile.')]));
      shortageRows.forEach((row) => {
        shortageList.appendChild(el('div', { class: 'item' }, [
          el('div', { class: 'h' }, [text(row.label)]),
          el('div', { class: 'm' }, [text('Fehlt: ' + fmtNum(row.missingUnits) + ' ' + (row.unit || ''))]),
          el('div', { class: 'd' }, [text('Bedarf: ' + fmtNum(row.neededUnits) + ' • Verfügbar: ' + fmtNum(row.availableUnits || ((Number(row.stockPacks || 0) || 0) * (Number(row.packSize || 1) || 1))))]),
        ]));
      });

      const searchList = document.getElementById('searchList');
      searchList.innerHTML = '';
      if (!searchRows.length && !(state.report && state.report.searchTasks && state.report.searchTasks.length)) {
        searchList.appendChild(el('div', { class: 'empty' }, [text('Aktuell keine Suchaufträge oder offenen Regeln.')]));
      }
      searchRows.forEach((row) => {
        searchList.appendChild(el('div', { class: 'item' }, [
          el('div', { class: 'h' }, [text(row.label)]),
          el('div', { class: 'm' }, [text('Bedarf erkannt, aber keine lokale Bestandsregel vorhanden.')]),
        ]));
      });
      (state.report && state.report.searchTasks ? state.report.searchTasks : []).forEach((task) => {
        searchList.appendChild(el('div', { class: 'item' }, [
          el('div', { class: 'h' }, [text(task.material || '(unklar)')]),
          el('div', { class: 'm' }, [text((task.productType || 'Auftrag') + ' • ' + (task.title || task.itemId || ''))]),
          el('div', { class: 'd' }, [text(task.reason || '')]),
        ]));
      });
    }

    function renderOpenItems() {
      const root = document.getElementById('openItemsList');
      root.innerHTML = '';
      const items = state.report && Array.isArray(state.report.items) ? state.report.items : [];
      if (!items.length) {
        root.appendChild(el('div', { class: 'empty' }, [text('Keine laufenden Aufträge gefunden.')]));
        return;
      }
      items.forEach((item) => {
        const demandText = (item.demands || []).map(d => d.label + ': ' + fmtNum(d.quantity) + ' ' + (d.unit || '')).join('\\n');
        const genericText = (item.genericNeeds || []).join(', ');
        root.appendChild(el('div', { class: 'item' }, [
          el('div', { class: 'h' }, [text(item.title || item.itemId || '')]),
          el('div', { class: 'm' }, [text((item.productType || 'Sonstiges') + ' • erkannt: ' + (item.detectedProductType || item.productType || 'Sonstiges') + ' • ' + (item.status || '') + (item.effectiveDate ? (' • ' + formatDate(item.effectiveDate)) : ''))]),
          demandText ? el('div', { class: 'd' }, [text(demandText)]) : el('div', { class: 'd muted' }, [text('Kein berechneter Panzer-Bedarf.')]),
          genericText ? el('div', { class: 'd muted' }, [text('Allgemeine Materialhinweise: ' + genericText)]) : el('span'),
        ]));
      });
    }

    function renderProductOverrideList() {
      const root = document.getElementById('productOverrideList');
      root.innerHTML = '';
      const seen = new Set();
      const entries = [];
      (Array.isArray(state.statsRunningItems) ? state.statsRunningItems : []).forEach((item) => {
        const id = String(item.itemId || '').trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        entries.push({ ...item, scope: 'laufend' });
      });
      (Array.isArray(state.recentCompletedItems) ? state.recentCompletedItems : []).forEach((item) => {
        const id = String(item.itemId || '').trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        entries.push({ ...item, scope: 'erledigt' });
      });
      if (!entries.length) {
        root.appendChild(el('div', { class: 'empty' }, [text('Keine Aufträge für Produktzuordnung vorhanden.')]));
        return;
      }
      entries.forEach((item) => {
        const currentOverride = (state.productOverrides && state.productOverrides[item.itemId]) || item.productTypeOverride || '';
        const select = el('select', { 'data-product-override': '1', 'data-item-id': item.itemId }, []);
        select.appendChild(el('option', { value: '' }, [text('Automatische Erkennung verwenden')]));
        productTypeOptions().forEach((type) => {
          const opt = el('option', { value: type }, [text(type)]);
          if (type === currentOverride) opt.selected = true;
          select.appendChild(opt);
        });
        select.addEventListener('change', (e) => {
          const value = String(e.target.value || '').trim();
          if (value) state.productOverrides[item.itemId] = value;
          else delete state.productOverrides[item.itemId];
        });
        const overview = Array.isArray(item.orderOverview) ? item.orderOverview : [];
        const overviewList = overview.length
          ? el('ul', { class: 'order-overview' }, overview.map((line) => el('li', null, [text(line)])))
          : el('div', { class: 'd muted' }, [text('Keine aufbereitete Auftragsübersicht verfügbar.')]);
        const detectedStats = item.detectedStats || {};
        const effectiveStats = item.effectiveStats || {};
        const statsGrid = el('div', { class: 'stats-entry-grid' }, []);
        statFieldOptions().forEach((field) => {
          const input = el('input', {
            type: 'number',
            min: '0',
            step: '1',
            value: String(effectiveStats[field] != null ? effectiveStats[field] : (detectedStats[field] || 0)),
            'data-item-id': item.itemId,
            'data-stat-field': field,
            'data-detected': String(detectedStats[field] || 0),
          }, []);
          input.addEventListener('input', (e) => {
            const value = Number(e.target.value || 0);
            const detected = Number(e.target.getAttribute('data-detected') || 0);
            if (!state.itemStats[item.itemId]) state.itemStats[item.itemId] = {};
            if (Number.isFinite(value) && Math.round(value) !== Math.round(detected)) state.itemStats[item.itemId][field] = Math.max(0, Math.round(value));
            else if (state.itemStats[item.itemId]) delete state.itemStats[item.itemId][field];
          });
          statsGrid.appendChild(el('div', null, [
            el('div', { class: 'label' }, [text(field + ' • erkannt: ' + String(detectedStats[field] || 0))]),
            input,
          ]));
        });
        const saveBtn = el('button', { class: 'btn small', type: 'button' }, [text('Speichern')]);
        saveBtn.addEventListener('click', () => saveSingleItem(item.itemId, saveBtn));
        root.appendChild(el('div', { class: 'item' }, [
          el('div', { class: 'h' }, [text(item.title || item.itemId || '')]),
          el('div', { class: 'm' }, [text((item.scope === 'laufend' ? 'Laufend' : 'Erledigt') + ' • erkannt als: ' + (item.detectedProductType || item.productType || 'Sonstiges') + ' • aktuell wirksam: ' + (currentOverride || item.productType || item.detectedProductType || 'Sonstiges'))]),
          el('div', { class: 'd' }, [text('Auftragsübersicht')]),
          overviewList,
          el('div', { class: 'd' }, [select]),
          el('div', { class: 'd' }, [saveBtn]),
          statsGrid,
        ]));
      });
    }

    function fillProductTypeSelect(types) {
      const select = document.getElementById('productTypeSelect');
      const current = select.value || '';
      select.innerHTML = '';
      select.appendChild(el('option', { value: '' }, [text('Alle Produktarten')]));
      (types || []).forEach((type) => {
        const opt = el('option', { value: type }, [text(type)]);
        if (type === current) opt.selected = true;
        select.appendChild(opt);
      });
    }

    function renderStats() {
      const stats = state.stats || { summary: {} };
      const cards = document.getElementById('statsCards');
      cards.innerHTML = '';
      [
        ['Erledigt im Zeitraum', stats.summary && stats.summary.completedOrders || 0],
        ['Laufend (Filter)', stats.summary && stats.summary.runningOrders || 0],
        ['Laufend gesamt', stats.summary && stats.summary.runningTotal || 0],
      ].forEach(([label, value]) => {
        cards.appendChild(el('div', { class: 'card' }, [
          el('div', { class: 'card-b' }, [
            el('div', { class: 'label' }, [text(label)]),
            el('div', { class: 'num' }, [text(fmtNum(value))]),
          ])
        ]));
      });

      const renderTypeList = (id, rows, emptyText) => {
        const root = document.getElementById(id);
        root.innerHTML = '';
        if (!(rows || []).length) {
          root.appendChild(el('div', { class: 'empty' }, [text(emptyText)]));
          return;
        }
        rows.forEach((row) => {
          root.appendChild(el('div', { class: 'item' }, [
            el('div', { class: 'h' }, [text(row.productType || 'Sonstiges')]),
            el('div', { class: 'm' }, [text('Anzahl: ' + fmtNum(row.count || 0))]),
          ]));
        });
      };

      renderTypeList('completedByType', stats.completedByType || [], 'Keine erledigten Aufträge im Zeitraum.');
      renderTypeList('runningByType', stats.runningByType || [], 'Keine laufenden Aufträge.');

      const recent = document.getElementById('recentCompleted');
      recent.innerHTML = '';
      const recentItems = Array.isArray(stats.completedItems) ? stats.completedItems : [];
      if (!recentItems.length) {
        recent.appendChild(el('div', { class: 'empty' }, [text('Keine erledigten Aufträge im gewählten Zeitraum.')]));
      }
      recentItems.forEach((item) => {
        recent.appendChild(el('div', { class: 'item' }, [
          el('div', { class: 'h' }, [text(item.title || item.itemId || '')]),
          el('div', { class: 'm' }, [text((item.productType || 'Sonstiges') + ' • erkannt: ' + (item.detectedProductType || item.productType || 'Sonstiges') + ' • ' + formatTs(item.latestTs || ''))]),
        ]));
      });
    }

    async function loadReport() {
      const data = await fetchJson('/api/production/material-status?token=' + encodeURIComponent(token) + '&_ts=' + Date.now());
      state.report = data;
      state.rows = Array.isArray(data.rows) ? data.rows.map(r => ({ ...r })) : [];
      state.productOverrides = { ...(data.productOverrides || {}) };
      state.productTypeOptions = Array.isArray(data.productTypeOptions) ? data.productTypeOptions.slice() : state.productTypeOptions;
      state.itemStats = { ...(data.itemStats || {}) };
      state.statFieldOptions = Array.isArray(data.statFieldOptions) ? data.statFieldOptions.slice() : state.statFieldOptions;
      renderSummary();
      renderInventory();
      renderIssues();
      renderOpenItems();
      renderProductOverrideList();
      fillProductTypeSelect(data.productTypes || []);
    }

    async function loadStats() {
      const from = document.getElementById('fromInput').value || '';
      const to = document.getElementById('toInput').value || '';
      const productType = document.getElementById('productTypeSelect').value || '';
      const url = '/api/production/material-stats?token=' + encodeURIComponent(token)
        + '&from=' + encodeURIComponent(from)
        + '&to=' + encodeURIComponent(to)
        + '&productType=' + encodeURIComponent(productType)
        + '&_ts=' + Date.now();
      const data = await fetchJson(url);
      state.stats = data;
      state.productOverrides = { ...(state.productOverrides || {}), ...(data.productOverrides || {}) };
      state.productTypeOptions = Array.isArray(data.productTypeOptions) ? data.productTypeOptions.slice() : state.productTypeOptions;
      state.itemStats = { ...(state.itemStats || {}), ...(data.itemStats || {}) };
      state.statFieldOptions = Array.isArray(data.statFieldOptions) ? data.statFieldOptions.slice() : state.statFieldOptions;
      state.statsRunningItems = Array.isArray(data.runningItems) ? data.runningItems.slice() : [];
      state.recentCompletedItems = Array.isArray(data.completedItems) ? data.completedItems.slice() : [];
      fillProductTypeSelect(data.productTypes || state.report && state.report.productTypes || []);
      renderStats();
      renderProductOverrideList();
    }

    async function saveInventory() {
      state.rows = collectInventoryRowsFromDom();
      state.productOverrides = collectProductOverridesFromDom();
      state.itemStats = collectItemStatsFromDom();
      const rows = state.rows.map((row) => ({
        key: row.key || row.label || '',
        label: row.label || '',
        category: row.category || '',
        stockPacks: Number(row.stockPacks || 0),
        packSize: Number(row.packSize || 1),
        minPacks: Number(row.minPacks || 0),
        pegValue: Number(row.pegValue || 0),
        pegMode: String(row.pegMode || '').trim(),
        unit: row.unit || '',
        notes: row.notes || '',
      })).filter(r => r.label);
      await fetchJson('/api/production/material-status/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, rows, productOverrides: state.productOverrides, itemStats: state.itemStats }),
      });
      await loadReport();
    }

    document.getElementById('fromInput').value = minusDaysIso(29);
    document.getElementById('toInput').value = todayIso();
    document.getElementById('reloadBtn').addEventListener('click', async () => { await loadReport(); await loadStats(); });
    document.getElementById('saveBtn').addEventListener('click', async () => { await saveInventory(); await loadStats(); });
    document.getElementById('addRowBtn').addEventListener('click', addRow);
    document.getElementById('loadStatsBtn').addEventListener('click', loadStats);

    Promise.resolve()
      .then(loadReport)
      .then(loadStats)
      .catch((err) => {
        document.getElementById('summaryCards').innerHTML = '';
        document.getElementById('summaryCards').appendChild(el('div', { class: 'empty' }, [text(err && err.message ? err.message : 'Laden fehlgeschlagen')]));
      });
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

router.get('/bestand', (req, res) => {
  const token = getMaterialStatusToken();
  const cacheBust = Date.now();
  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bestandsansicht</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0b0f19; }
    iframe { width: 100%; height: 100%; border: 0; display: block; }
  </style>
</head>
<body>
  <iframe src="/display/materialbestand/${escapeHtml(token)}?v=${cacheBust}" title="Bestandsansicht"></iframe>
</body>
</html>`;
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

router.get('/materialfreigabe', (req, res) => {
  const token = getMaterialStatusToken();
  const cacheBust = Date.now();
  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Materialfreigabe</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0b0f19; }
    iframe { width: 100%; height: 100%; border: 0; display: block; }
  </style>
</head>
<body>
  <iframe src="/display/materialcheck/${escapeHtml(token)}?v=${cacheBust}" title="Materialfreigabe"></iframe>
</body>
</html>`;
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

router.get('/materialbestand/:token', (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!isMaterialStatusTokenValid(token)) {
    return res.status(404).send('Not found');
  }

  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bestandsansicht</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: #0b0f19; color: #e6eaf2; }
    a { color: inherit; }
    .wrap { max-width: 1500px; margin: 0 auto; padding: 16px; }
    .top { display:flex; justify-content:space-between; align-items:flex-start; gap: 12px; margin-bottom: 12px; }
    .title { font-size: 22px; font-weight: 800; }
    .meta { font-size: 12px; color: #d1d9e6; margin-top: 4px; }
    .bar { display:flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; align-items: end; }
    .btn, .bar a { padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.18); background: rgba(18,28,46,.92); color: #f4f7fb; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
    .btn:hover, .bar a:hover { background: rgba(35,48,73,.98); }
    .btn.small { padding: 7px 10px; font-size: 12px; }
    .btn.primary { background: #1d4ed8; border-color: #2563eb; color: #fff; }
    .btn.ok { border-color: rgba(34,197,94,.55); background: rgba(22,163,74,.16); }
    .btn.warn { border-color: rgba(245,158,11,.55); background: rgba(180,83,9,.18); }
    .btn.err { border-color: rgba(239,68,68,.55); background: rgba(220,38,38,.16); }
    .grid { display:grid; gap: 12px; grid-template-columns: 1.35fr 1fr; }
    .card { border: 1px solid rgba(255,255,255,.12); border-radius: 14px; background: rgba(15,24,39,.96); overflow: hidden; box-shadow: 0 6px 18px rgba(0,0,0,.24); }
    .card-h { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.10); display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
    .card-b { padding: 12px; }
    .cards { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
    .label { font-size: 12px; color: #d1d9e6; }
    .num { font-size: 24px; font-weight: 800; }
    .sub { font-size: 12px; color: #d7dfec; margin-top: 2px; }
    input, select, textarea { width: 100%; padding: 9px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,.18); background: #1a2436; color: #f8fbff; }
    input::placeholder, textarea::placeholder { color: #b8c4d7; }
    input:focus, select:focus, textarea:focus { outline: 2px solid #60a5fa; outline-offset: 1px; border-color: #60a5fa; background: #202c42; }
    select option { background: #f8fafc; color: #111827; }
    textarea { min-height: 40px; resize: vertical; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { text-align: left; padding: 8px 8px; border-bottom: 1px solid rgba(255,255,255,.07); vertical-align: top; }
    th { font-size: 12px; color: #d1d9e6; font-weight: 700; white-space: nowrap; }
    td { font-size: 13px; color: #f4f7fb; }
    th[data-sort] { cursor: pointer; }
    .thbtn { width: 100%; border: 0; padding: 0; background: transparent; color: inherit; font: inherit; font-weight: inherit; text-align: left; pointer-events: none; }
    .thbtn:hover { color: #ffffff; }
    .thbtn[data-dir="asc"]::after { content: " ↑"; color: #93c5fd; }
    .thbtn[data-dir="desc"]::after { content: " ↓"; color: #93c5fd; }
    .inventory-table th:nth-child(1), .inventory-table td:nth-child(1) { width: 10%; }
    .inventory-table th:nth-child(2), .inventory-table td:nth-child(2) { width: 20%; }
    .inventory-table th:nth-child(3), .inventory-table td:nth-child(3),
    .inventory-table th:nth-child(4), .inventory-table td:nth-child(4),
    .inventory-table th:nth-child(5), .inventory-table td:nth-child(5),
    .inventory-table th:nth-child(6), .inventory-table td:nth-child(6),
    .inventory-table th:nth-child(7), .inventory-table td:nth-child(7),
    .inventory-table th:nth-child(8), .inventory-table td:nth-child(8) { width: 8%; }
    .inventory-table th:nth-child(9), .inventory-table td:nth-child(9) { width: 16%; }
    .inventory-table th:nth-child(10), .inventory-table td:nth-child(10) { width: 7%; }
    .inventory-table th:nth-child(11), .inventory-table td:nth-child(11) { width: 16%; }
    .inventory-table th:nth-child(12), .inventory-table td:nth-child(12) { width: 7%; }
    .pill { display:inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: #f4f7fb; }
    .pill.red { background: rgba(153,27,27,.24); }
    .pill.yellow { background: rgba(133,77,14,.24); }
    .pill.blue { background: rgba(8,145,178,.24); }
    .pill.green { background: rgba(22,163,74,.20); }
    .row-peg-near td { background: rgba(133,77,14,.16); }
    .row-peg-below td { background: rgba(153,27,27,.18); }
    .cell-peg-near { background: rgba(133,77,14,.22); border-radius: 10px; }
    .cell-peg-below { background: rgba(153,27,27,.24); border-radius: 10px; }
    .muted { color: #d5ddec; }
    .empty { border: 1px dashed rgba(255,255,255,.20); border-radius: 12px; padding: 14px; color: #e2e8f0; background: rgba(20,31,49,.85); }
    .form-grid { display:grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .form-grid-2 { display:grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .details { margin-top: 6px; }
    .details summary { cursor: pointer; color: #cfe3ff; }
    .details-list { display:grid; gap: 8px; margin-top: 8px; }
    .details-item { border: 1px solid rgba(255,255,255,.08); border-radius: 10px; padding: 8px; background: rgba(24,36,56,.72); }
    .order-overview { margin: 6px 0 0 16px; color: #eef2f8; }
    .order-overview li { margin: 3px 0; }
    @media (max-width: 1260px) { .grid { grid-template-columns: 1fr; } .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 820px) { .cards, .form-grid, .form-grid-2 { grid-template-columns: 1fr; } .wrap { padding: 12px; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title">Bestandsansicht</div>
        <div class="meta" id="pageMeta">Bestand mit Auftragsbezug und schneller Nachpflege</div>
      </div>
      <div class="bar">
        <a href="/display/materialstatus/${escapeHtml(token)}">Materialstatus</a>
        <a href="/display/materialfreigabe">Materialfreigabe</a>
        <a href="/display">Monitor</a>
        <button class="btn" id="reloadBtn" type="button">Aktualisieren</button>
      </div>
    </div>

    <div class="cards" id="summaryCards"></div>

    <div class="grid">
      <div class="card">
        <div class="card-h">
          <div>
            <div class="h">Bestand</div>
            <div class="sub">Jede Zeile zeigt, wie viele offene Aufträge den Bestand aktuell verwenden.</div>
          </div>
        </div>
        <div class="card-b">
          <div class="bar">
            <div style="min-width:220px;">
              <div class="label">Suche</div>
              <input id="searchInput" type="search" placeholder="Material, Farbe, Profil" />
            </div>
            <div style="min-width:220px;">
              <div class="label">Kategorie</div>
              <select id="categoryFilter"></select>
            </div>
            <div style="min-width:180px;">
              <div class="label">Nutzung</div>
              <select id="usageFilter">
                <option value="all">Alle</option>
                <option value="used">Nur mit Aufträgen</option>
                <option value="unused">Nur ohne Aufträge</option>
                <option value="missing">Nur kritisch</option>
              </select>
            </div>
            <div style="min-width:180px;">
              <div class="label">Status</div>
              <select id="statusFilter">
                <option value="all">Alle</option>
                <option value="missing">Fehlteile</option>
                <option value="untracked">Ungeführt</option>
                <option value="low">Puffer niedrig</option>
                <option value="ok">Nur ok</option>
              </select>
            </div>
            <div style="min-width:180px;">
              <div class="label">Pegel</div>
              <select id="pegFilter">
                <option value="all">Alle</option>
                <option value="below">Unter Pegel</option>
                <option value="near">Nahe Pegel</option>
                <option value="healthy">Klar über Pegel</option>
                <option value="none">Ohne Pegel</option>
              </select>
            </div>
          </div>
          <div style="overflow-x:auto;">
            <table class="inventory-table">
              <thead>
                <tr>
                  <th data-sort="category"><button class="thbtn" type="button" data-sort="category">Kategorie</button></th>
                  <th data-sort="label"><button class="thbtn" type="button" data-sort="label">Material</button></th>
                  <th data-sort="stockPacks"><button class="thbtn" type="button" data-sort="stockPacks">Bestand VE</button></th>
                  <th data-sort="packSize"><button class="thbtn" type="button" data-sort="packSize">VE-Größe</button></th>
                  <th data-sort="minPacks"><button class="thbtn" type="button" data-sort="minPacks">Min. VE</button></th>
                  <th data-sort="peg"><button class="thbtn" type="button" data-sort="peg">Pegel</button></th>
                  <th data-sort="unit"><button class="thbtn" type="button" data-sort="unit">Einheit</button></th>
                  <th data-sort="availableUnits"><button class="thbtn" type="button" data-sort="availableUnits">Verfügbar</button></th>
                  <th data-sort="neededUnits"><button class="thbtn" type="button" data-sort="neededUnits">Bedarf</button></th>
                  <th data-sort="orderCount"><button class="thbtn" type="button" data-sort="orderCount">Aufträge</button></th>
                  <th data-sort="status"><button class="thbtn" type="button" data-sort="status">Status</button></th>
                  <th data-sort="notes"><button class="thbtn" type="button" data-sort="notes">Notiz</button></th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="inventoryBody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-h">
          <div>
            <div class="h">Bestand ergänzen</div>
            <div class="sub">Schnellanlage über Kategorien, Presets oder freie Eingabe.</div>
          </div>
        </div>
        <div class="card-b">
          <div class="form-grid">
            <div>
              <div class="label">Kategorie</div>
              <select id="addCategory"></select>
            </div>
            <div>
              <div class="label">Vorkategorie / Vorlage</div>
              <select id="addPreset"></select>
            </div>
            <div>
              <div class="label">Einheit</div>
              <input id="addUnit" type="text" placeholder="Stk / Stangen" />
            </div>
            <div style="grid-column: 1 / -1;">
              <div class="label">Materialbezeichnung</div>
              <input id="addLabel" type="text" placeholder="z. B. Panzerstab Alu 37er gelocht 6m Grau" />
            </div>
          </div>
          <div class="form-grid-2" style="margin-top:10px;">
            <div>
              <div class="label">Startbestand VE</div>
              <input id="addStockPacks" type="number" min="0" step="1" value="0" />
            </div>
            <div>
              <div class="label">VE-Größe</div>
              <input id="addPackSize" type="number" min="1" step="1" value="1" />
            </div>
            <div>
              <div class="label">Mindestbestand VE</div>
              <input id="addMinPacks" type="number" min="0" step="1" value="0" />
            </div>
            <div>
              <div class="label">Pegel</div>
              <div style="display:grid;gap:6px;">
                <input id="addPegValue" type="number" min="0" step="1" value="0" />
                <select id="addPegMode">
                  <option value="packs">VE</option>
                  <option value="units">Stk</option>
                </select>
              </div>
            </div>
            <div>
              <div class="label">Notiz</div>
              <textarea id="addNotes" rows="2" placeholder="optional"></textarea>
            </div>
          </div>
          <div class="bar" style="margin-top:10px;">
            <button class="btn primary" id="addBtn" type="button">Als Bestand anlegen</button>
            <button class="btn" id="resetAddBtn" type="button">Felder leeren</button>
          </div>
          <div id="searchTaskList" style="margin-top:8px;"></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const token = ${JSON.stringify(token)};
    const state = { data: null, rows: [], categories: [], presets: [], sortKey: '', sortDir: 'asc' };

    function el(tag, attrs, children) {
      const node = document.createElement(tag);
      if (attrs) {
        Object.entries(attrs).forEach(([k, v]) => {
          if (k === 'class') node.className = v;
          else if (k === 'html') node.innerHTML = v;
          else if (k === 'value') node.value = v;
          else node.setAttribute(k, v);
        });
      }
      (children || []).forEach(c => node.appendChild(c));
      return node;
    }
    function text(s) { return document.createTextNode(String(s == null ? '' : s)); }
    function fmtNum(n) {
      const num = Number(n || 0);
      return Number.isFinite(num) ? num.toLocaleString('de-DE') : '0';
    }
    function normText(s) {
      return String(s == null ? '' : s).toLowerCase().trim();
    }
    function formatDate(iso) {
      if (!iso) return '';
      const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
      return isFinite(d.getTime()) ? d.toLocaleDateString('de-DE') : String(iso || '');
    }
    function formatTs(ts) {
      const d = new Date(ts);
      return isFinite(d.getTime()) ? d.toLocaleString('de-DE') : String(ts || '');
    }
    function pillClass(status) {
      if (status === 'missing') return 'pill red';
      if (status === 'low') return 'pill yellow';
      if (status === 'untracked') return 'pill blue';
      return 'pill green';
    }
    function fetchJson(url, options) {
      return fetch(url, options).then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || data.ok === false) {
          throw new Error(data && data.error ? data.error : 'Anfrage fehlgeschlagen');
        }
        return data;
      });
    }

    function getRowUiState(row) {
      const packSize = Math.max(1, Number(row && row.packSize || 1) || 1);
      const stockPacks = Math.max(0, Number(row && row.stockPacks || 0) || 0);
      const minPacks = Math.max(0, Number(row && row.minPacks || 0) || 0);
      const neededUnits = Math.max(0, Number(row && row.neededUnits || 0) || 0);
      const availableUnits = stockPacks * packSize;
      const missingUnits = Math.max(0, neededUnits - availableUnits);
      const remainingUnits = Math.max(0, availableUnits - neededUnits);
      let status = String(row && row.status || 'ok');
      if (status !== 'untracked') {
        if (missingUnits > 0) status = 'missing';
        else if ((minPacks * packSize) > 0 && remainingUnits < (minPacks * packSize)) status = 'low';
        else status = 'ok';
      }
      return { packSize, stockPacks, minPacks, neededUnits, availableUnits, missingUnits, status };
    }

    function getPegMeta(row, view) {
      const pegMode = String(row && row.pegMode || '').trim() || 'packs';
      const pegValue = Math.max(0, Number(row && row.pegValue || 0) || 0);
      const packSize = Math.max(1, Number(view && view.packSize || row && row.packSize || 1) || 1);
      const availableUnits = Math.max(0, Number(view && view.availableUnits || 0) || 0);
      const pegUnits = pegMode === 'packs' ? (pegValue * packSize) : pegValue;
      if (!(pegUnits > 0)) {
        return { pegMode, pegValue, pegUnits: 0, zone: 'none', label: 'ohne Pegel', display: '0 ' + (pegMode === 'packs' ? 'VE' : 'Stk') };
      }
      const nearMargin = Math.max(1, packSize, Math.round(pegUnits * 0.15));
      let zone = 'healthy';
      if (availableUnits < pegUnits) zone = 'below';
      else if (availableUnits <= (pegUnits + nearMargin)) zone = 'near';
      return {
        pegMode,
        pegValue,
        pegUnits,
        zone,
        label: zone === 'below' ? 'unter Pegel' : (zone === 'near' ? 'nahe Pegel' : 'klar über Pegel'),
        display: fmtNum(pegValue) + ' ' + (pegMode === 'packs' ? 'VE' : 'Stk'),
      };
    }

    function getStatusSortRank(status) {
      const rank = { missing: 0, untracked: 1, low: 2, ok: 3 };
      return rank[String(status || 'ok')] != null ? rank[String(status || 'ok')] : 9;
    }

    function getSortValue(row, key) {
      const view = getRowUiState(row);
      const peg = getPegMeta(row, view);
      if (key === 'status') return getStatusSortRank(view.status);
      if (key === 'peg') return peg.pegUnits;
      if (key === 'availableUnits') return view.availableUnits;
      if (key === 'neededUnits') return view.neededUnits;
      if (key === 'stockPacks') return Number(row && row.stockPacks || 0) || 0;
      if (key === 'packSize') return view.packSize;
      if (key === 'minPacks') return view.minPacks;
      if (key === 'orderCount') return Number(row && row.orderCount || 0) || 0;
      return normText(row && row[key]);
    }

    function sortRows(rows) {
      const list = Array.isArray(rows) ? rows.slice() : [];
      if (!state.sortKey) return list;
      const dir = state.sortDir === 'desc' ? -1 : 1;
      return list.sort((a, b) => {
        const av = getSortValue(a, state.sortKey);
        const bv = getSortValue(b, state.sortKey);
        if (typeof av === 'number' && typeof bv === 'number') {
          if (av !== bv) return (av - bv) * dir;
        } else {
          const cmp = String(av || '').localeCompare(String(bv || ''), 'de');
          if (cmp !== 0) return cmp * dir;
        }
        return String(a.label || '').localeCompare(String(b.label || ''), 'de');
      });
    }

    function updateSortButtons() {
      Array.from(document.querySelectorAll('.thbtn[data-sort]')).forEach((btn) => {
        const key = String(btn.getAttribute('data-sort') || '').trim();
        if (key && key === state.sortKey) btn.setAttribute('data-dir', state.sortDir);
        else btn.removeAttribute('data-dir');
      });
    }

    function collectRow(tr) {
      const getValue = (field) => {
        const node = tr.querySelector('[data-field="' + field + '"]');
        return node ? String(node.value || '') : '';
      };
      return {
        key: String(tr.dataset.key || '').trim(),
        inventoryKey: String(tr.dataset.inventoryKey || '').trim(),
        label: getValue('label'),
        category: getValue('category'),
        stockPacks: Number(getValue('stockPacks') || 0),
        packSize: Number(getValue('packSize') || 1),
        minPacks: Number(getValue('minPacks') || 0),
          pegValue: Number(getValue('pegValue') || 0),
          pegMode: getValue('pegMode'),
        unit: getValue('unit'),
        notes: getValue('notes'),
        neededUnits: Number(tr.dataset.neededUnits || 0),
        orderCount: Number(tr.dataset.orderCount || 0),
        status: String(tr.dataset.status || 'ok'),
      };
    }

    function fillCategorySelects() {
      const categories = ['Alle'].concat((state.categories || []).slice());
      const filter = document.getElementById('categoryFilter');
      const add = document.getElementById('addCategory');
      const currentFilter = filter.value || 'Alle';
      const currentAdd = add.value || ((state.categories || [])[0] || 'Sonstiges');
      filter.innerHTML = '';
      add.innerHTML = '';
      categories.forEach((cat) => {
        const opt = el('option', { value: cat }, [text(cat)]);
        if (cat === currentFilter) opt.selected = true;
        filter.appendChild(opt);
      });
      (state.categories || []).forEach((cat) => {
        const opt = el('option', { value: cat }, [text(cat)]);
        if (cat === currentAdd) opt.selected = true;
        add.appendChild(opt);
      });
    }

    function updatePresetOptions() {
      const category = document.getElementById('addCategory').value || '';
      const presetSelect = document.getElementById('addPreset');
      const presets = (state.presets || []).filter(p => !category || p.category === category);
      presetSelect.innerHTML = '';
      presetSelect.appendChild(el('option', { value: '' }, [text('Freie Eingabe')]));
      presets.forEach((preset) => {
        presetSelect.appendChild(el('option', { value: preset.key }, [text(preset.label)]));
      });
    }

    function applyPreset(key) {
      const preset = (state.presets || []).find(p => p.key === key) || null;
      if (!preset) return;
      document.getElementById('addCategory').value = preset.category || 'Sonstiges';
      document.getElementById('addLabel').value = preset.label || '';
      document.getElementById('addUnit').value = preset.unit || '';
      document.getElementById('addPackSize').value = String(preset.packSize || 1);
      document.getElementById('addMinPacks').value = String(preset.minPacks || 0);
      document.getElementById('addNotes').value = preset.notes || '';
      const hay = String(preset.category || '') + ' ' + String(preset.label || '');
      const m = /\b(motor|antrieb|wickler)\b/i.test(hay) ? 'units' : (/\bclip\b/i.test(hay) || Number(preset.packSize || 1) > 1 ? 'packs' : 'units');
      document.getElementById('addPegMode').value = String(preset.pegMode || m);
      document.getElementById('addPegValue').value = String(preset.pegValue || 0);
    }

    function resetAddForm() {
      document.getElementById('addLabel').value = '';
      document.getElementById('addUnit').value = 'Stk';
      document.getElementById('addPackSize').value = '1';
      document.getElementById('addMinPacks').value = '0';
      document.getElementById('addStockPacks').value = '0';
      document.getElementById('addPegValue').value = '0';
      document.getElementById('addPegMode').value = 'packs';
      document.getElementById('addNotes').value = '';
      document.getElementById('addPreset').value = '';
    }

    function renderSummary() {
      const root = document.getElementById('summaryCards');
      root.innerHTML = '';
      const data = state.data || {};
      const rows = Array.isArray(data.rows) ? data.rows : [];
      const used = rows.filter(r => Number(r.orderCount || 0) > 0).length;
      const critical = rows.filter(r => String(r.status || '') === 'missing' || String(r.status || '') === 'untracked').length;
      const cards = [
        ['Geführte Materialien', rows.length, 'Aktuell angelegte Bestandszeilen'],
        ['Mit Auftragsbezug', used, 'Werden von offenen Aufträgen genutzt'],
        ['Kritische Zeilen', critical, 'Fehlt oder noch nicht geführt'],
        ['Offene Suchaufträge', (data.searchTasks || []).length, 'Bedarf erkannt, aber Regel fehlt'],
      ];
      cards.forEach(([label, value, sub]) => {
        root.appendChild(el('div', { class: 'card' }, [
          el('div', { class: 'card-b' }, [
            el('div', { class: 'label' }, [text(label)]),
            el('div', { class: 'num' }, [text(fmtNum(value))]),
            el('div', { class: 'sub' }, [text(sub)]),
          ])
        ]));
      });
      document.getElementById('pageMeta').textContent = 'Zuletzt aktualisiert: ' + (data.updatedAt ? formatTs(data.updatedAt) : 'noch nie');
      updateSortButtons();
    }

    function renderSearchTasks() {
      const root = document.getElementById('searchTaskList');
      root.innerHTML = '';
      const tasks = state.data && Array.isArray(state.data.searchTasks) ? state.data.searchTasks : [];
      if (!tasks.length) {
        root.appendChild(el('div', { class: 'empty' }, [text('Keine offenen Suchaufträge.')]));
        return;
      }
      root.appendChild(el('div', { class: 'label' }, [text('Erkannte Bedarfe ohne gepflegte Bestandsregel')]));
      const list = el('div', { class: 'details-list', style: 'margin-top:8px;' }, []);
      tasks.slice(0, 12).forEach((task) => {
        list.appendChild(el('div', { class: 'details-item' }, [
          el('div', null, [text((task.material || '(unklar)') + ' • ' + (task.title || task.itemId || ''))]),
          el('div', { class: 'muted', style: 'margin-top:4px;' }, [text(task.reason || '')]),
        ]));
      });
      root.appendChild(list);
    }

    function buildUsageDetails(row) {
      const items = Array.isArray(row.usageLabels) ? row.usageLabels : [];
      if (!items.length) return el('span', { class: 'muted' }, [text('0 Aufträge')]);
      const details = el('details', { class: 'details' }, []);
      details.appendChild(el('summary', null, [text(String(row.orderCount || items.length) + ' Aufträge anzeigen')]));
      const list = el('div', { class: 'details-list' }, []);
      items.forEach((item) => {
        const block = el('div', { class: 'details-item' }, [
          el('div', null, [text((item.title || item.itemId || '') + ' • ' + fmtNum(item.quantity || 0) + ' ' + (item.unit || ''))]),
          el('div', { class: 'muted', style: 'margin-top:4px;' }, [text((item.productType || 'Auftrag') + (item.effectiveDate ? (' • ' + formatDate(item.effectiveDate)) : '') + (item.status ? (' • ' + item.status) : ''))]),
        ]);
        if (Array.isArray(item.orderOverview) && item.orderOverview.length) {
          block.appendChild(el('ul', { class: 'order-overview' }, item.orderOverview.map((line) => el('li', null, [text(line)]))));
        }
        list.appendChild(block);
      });
      details.appendChild(list);
      return details;
    }

    function renderInventory() {
      const body = document.getElementById('inventoryBody');
      body.innerHTML = '';
      const rows = Array.isArray(state.rows) ? state.rows : [];
      if (!rows.length) {
        body.appendChild(el('tr', null, [el('td', { colspan: '13', class: 'empty' }, [text('Keine passenden Materialien gefunden.')])]));
        return;
      }

      rows.forEach((row) => {
        const tr = el('tr', {
          'data-key': row.key || '',
          'data-inventory-key': row.inventoryKey || row.key || '',
          'data-needed-units': row.neededUnits || 0,
          'data-order-count': row.orderCount || 0,
          'data-status': row.status || 'ok',
        }, []);

        const mkInput = (field, type) => {
          if (field === 'notes') {
            const area = el('textarea', { rows: '2', 'data-field': field }, []);
            area.value = row[field] != null ? row[field] : '';
            return area;
          }
          if (field === 'category') {
            const select = el('select', { 'data-field': field }, []);
            (state.categories || []).forEach((cat) => {
              const opt = el('option', { value: cat }, [text(cat)]);
              if (cat === String(row.category || '')) opt.selected = true;
              select.appendChild(opt);
            });
            return select;
          }
          const input = el('input', { type: type || 'text', value: row[field] != null ? row[field] : '', 'data-field': field }, []);
          return input;
        };

        const availableCell = el('td', null, []);
        const needCell = el('td', null, []);
        const statusCell = el('td', null, []);
        tr.appendChild(el('td', null, [mkInput('category', 'text')]));
        tr.appendChild(el('td', null, [mkInput('label', 'text')]));
        tr.appendChild(el('td', null, [mkInput('stockPacks', 'number')]));
        tr.appendChild(el('td', null, [mkInput('packSize', 'number')]));
        tr.appendChild(el('td', null, [mkInput('minPacks', 'number')]));
        const pegWrap = el('div', { style: 'display:grid;gap:4px;' }, []);
        const pegVal = el('input', { type: 'number', min: '0', step: '1', value: String(row.pegValue != null ? row.pegValue : 0), 'data-field': 'pegValue' }, []);
        const pegMode = el('select', { 'data-field': 'pegMode' }, []);
        const pegMetaLine = el('div', { class: 'muted', style: 'font-size:11px;' }, []);
        const optVe = el('option', { value: 'packs' }, [text('VE')]);
        const optStk = el('option', { value: 'units' }, [text('Stk')]);
        const currentMode = String(row.pegMode || '').trim() || 'packs';
        if (currentMode === 'packs') optVe.selected = true;
        if (currentMode === 'units') optStk.selected = true;
        pegMode.appendChild(optVe);
        pegMode.appendChild(optStk);
        pegWrap.appendChild(pegVal);
        pegWrap.appendChild(pegMode);
        pegWrap.appendChild(pegMetaLine);
        if (Array.isArray(row.pegHistory) && row.pegHistory.length) {
          const details = el('details', { class: 'details' }, []);
          details.appendChild(el('summary', null, [text('Historie')]));
          const list = el('div', { class: 'details-list' }, []);
          row.pegHistory.slice(-6).reverse().forEach((h) => {
            const when = h && h.at ? formatTs(h.at) : '';
            const mode = h && h.mode === 'packs' ? 'VE' : 'Stk';
            const value = h && h.value != null ? fmtNum(h.value) : '0';
            list.appendChild(el('div', { class: 'details-item' }, [
              el('div', null, [text(when + ' • ' + value + ' ' + mode)]),
            ]));
          });
          details.appendChild(list);
          pegWrap.appendChild(details);
        }
        tr.appendChild(el('td', null, [pegWrap]));
        tr.appendChild(el('td', null, [mkInput('unit', 'text')]));
        tr.appendChild(availableCell);
        tr.appendChild(needCell);
        tr.appendChild(el('td', null, [buildUsageDetails(row)]));
        tr.appendChild(statusCell);
        tr.appendChild(el('td', null, [mkInput('notes', 'text')]));
        const saveBtn = el('button', { class: 'btn small ok', type: 'button' }, [text('Speichern')]);
        saveBtn.addEventListener('click', () => saveRow(tr, saveBtn));
        tr.appendChild(el('td', null, [saveBtn]));

        function refreshPresentation() {
          const live = collectRow(tr);
          const merged = { ...row, ...live, neededUnits: row.neededUnits, orderCount: row.orderCount, status: row.status };
          const view = getRowUiState(merged);
          const peg = getPegMeta(merged, view);
          tr.className = peg.zone === 'below' ? 'row-peg-below' : (peg.zone === 'near' ? 'row-peg-near' : '');
          availableCell.className = peg.zone === 'below' ? 'cell-peg-below' : (peg.zone === 'near' ? 'cell-peg-near' : '');
          const pegCell = tr.children[5];
          if (pegCell) pegCell.className = peg.zone === 'below' ? 'cell-peg-below' : (peg.zone === 'near' ? 'cell-peg-near' : '');
          availableCell.textContent = fmtNum(view.availableUnits);
          needCell.textContent = fmtNum(view.neededUnits);
          pegMetaLine.textContent = 'Ziel: ' + fmtNum(peg.pegUnits) + ' Stk • ' + peg.label;
          let badgeText = 'ok';
          let badgeClass = 'pill green';
          if (view.missingUnits > 0) {
            badgeText = 'Fehlt ' + fmtNum(view.missingUnits);
            badgeClass = 'pill red';
          } else if (view.status === 'untracked') {
            badgeText = 'ungeführt';
            badgeClass = 'pill blue';
          } else if (view.status === 'low') {
            badgeText = 'Puffer niedrig';
            badgeClass = 'pill yellow';
          } else if (peg.zone === 'below') {
            badgeText = 'unter Pegel';
            badgeClass = 'pill red';
          } else if (peg.zone === 'near') {
            badgeText = 'nahe Pegel';
            badgeClass = 'pill yellow';
          }
          statusCell.innerHTML = '';
          statusCell.appendChild(el('span', { class: badgeClass }, [text(badgeText)]));
        }

        Array.from(tr.querySelectorAll('input[data-field], select[data-field]')).forEach((node) => {
          node.addEventListener('input', refreshPresentation);
          node.addEventListener('change', refreshPresentation);
          node.addEventListener('blur', refreshPresentation);
        });
        refreshPresentation();
        body.appendChild(tr);
      });
    }

    function applyFilters() {
      const search = String(document.getElementById('searchInput').value || '').trim().toLowerCase();
      const category = String(document.getElementById('categoryFilter').value || 'Alle');
      const usage = String(document.getElementById('usageFilter').value || 'all');
      const statusFilter = String(document.getElementById('statusFilter').value || 'all');
      const pegFilter = String(document.getElementById('pegFilter').value || 'all');
      const rows = Array.isArray(state.data && state.data.rows) ? state.data.rows.slice() : [];
      state.rows = sortRows(rows.filter((row) => {
        const view = getRowUiState(row);
        const peg = getPegMeta(row, view);
        const hay = [row.label, row.category, row.notes].join(' ').toLowerCase();
        if (search && !hay.includes(search)) return false;
        if (category && category !== 'Alle' && String(row.category || '') !== category) return false;
        if (usage === 'used' && !(Number(row.orderCount || 0) > 0)) return false;
        if (usage === 'unused' && Number(row.orderCount || 0) > 0) return false;
        if (usage === 'missing' && !['missing', 'untracked', 'low'].includes(String(row.status || ''))) return false;
        if (statusFilter !== 'all' && String(view.status || 'ok') !== statusFilter) return false;
        if (pegFilter === 'below' && peg.zone !== 'below') return false;
        if (pegFilter === 'near' && peg.zone !== 'near') return false;
        if (pegFilter === 'healthy' && peg.zone !== 'healthy') return false;
        if (pegFilter === 'none' && peg.zone !== 'none') return false;
        return true;
      }));
      renderInventory();
    }

    async function saveRow(tr, btn) {
      const row = collectRow(tr);
      if (!row.label) {
        alert('Bitte eine Materialbezeichnung eintragen.');
        return;
      }
      const payload = {
        key: row.inventoryKey || row.key || row.label,
        label: row.label,
        category: row.category || 'Sonstiges',
        stockPacks: row.stockPacks,
        packSize: row.packSize,
        minPacks: row.minPacks,
        pegValue: row.pegValue,
        pegMode: row.pegMode,
        unit: row.unit || 'Stk',
        notes: row.notes || '',
      };
      const original = btn.textContent || 'Speichern';
      btn.disabled = true;
      btn.textContent = 'Speichere...';
      try {
        await fetchJson('/api/production/material-status/upsert-inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, records: [payload] }),
        });
        await load();
      } catch (err) {
        alert(String(err && err.message ? err.message : err || 'Speichern fehlgeschlagen'));
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    }

    async function addInventoryItem() {
      const payload = {
        category: String(document.getElementById('addCategory').value || 'Sonstiges'),
        label: String(document.getElementById('addLabel').value || '').trim(),
        stockPacks: Number(document.getElementById('addStockPacks').value || 0),
        packSize: Number(document.getElementById('addPackSize').value || 1),
        minPacks: Number(document.getElementById('addMinPacks').value || 0),
        pegValue: Number(document.getElementById('addPegValue').value || 0),
        pegMode: String(document.getElementById('addPegMode').value || '').trim(),
        unit: String(document.getElementById('addUnit').value || '').trim() || 'Stk',
        notes: String(document.getElementById('addNotes').value || '').trim(),
      };
      if (!payload.label) {
        alert('Bitte zuerst eine Materialbezeichnung wählen oder eingeben.');
        return;
      }
      await fetchJson('/api/production/material-status/upsert-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, records: [payload] }),
      });
      resetAddForm();
      await load();
    }

    async function load() {
      const data = await fetchJson('/api/production/material-status/overview?token=' + encodeURIComponent(token) + '&_ts=' + Date.now());
      state.data = data;
      state.categories = Array.isArray(data.catalog && data.catalog.categories) ? data.catalog.categories.slice() : [];
      state.presets = Array.isArray(data.catalog && data.catalog.presets) ? data.catalog.presets.slice() : [];
      fillCategorySelects();
      updatePresetOptions();
      renderSummary();
      renderSearchTasks();
      applyFilters();
    }

    document.getElementById('reloadBtn').addEventListener('click', load);
    document.getElementById('searchInput').addEventListener('input', applyFilters);
    document.getElementById('categoryFilter').addEventListener('change', applyFilters);
    document.getElementById('usageFilter').addEventListener('change', applyFilters);
    document.getElementById('statusFilter').addEventListener('change', applyFilters);
    document.getElementById('pegFilter').addEventListener('change', applyFilters);
    Array.from(document.querySelectorAll('th[data-sort]')).forEach((th) => {
      th.addEventListener('click', () => {
        const key = String(th.getAttribute('data-sort') || '').trim();
        if (!key) return;
        if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else {
          state.sortKey = key;
          state.sortDir = 'asc';
        }
        updateSortButtons();
        applyFilters();
      });
    });
    document.getElementById('addCategory').addEventListener('change', () => {
      updatePresetOptions();
      document.getElementById('addPreset').value = '';
    });
    document.getElementById('addPreset').addEventListener('change', (e) => applyPreset(String(e.target.value || '')));
    document.getElementById('addBtn').addEventListener('click', () => addInventoryItem().catch((err) => {
      alert(String(err && err.message ? err.message : err || 'Anlegen fehlgeschlagen'));
    }));
    document.getElementById('resetAddBtn').addEventListener('click', resetAddForm);

    load().catch((err) => {
      const body = document.getElementById('inventoryBody');
      body.innerHTML = '';
      body.appendChild(el('tr', null, [el('td', { colspan: '13', class: 'empty' }, [text(err && err.message ? err.message : 'Laden fehlgeschlagen')])]));
    });
  </script>
</body>
</html>`;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

router.get('/label-tool', (req, res) => {
  function getLanIp() {
    try {
      const nets = os.networkInterfaces();
      const all = [];
      for (const name of Object.keys(nets || {})) {
        for (const n of nets[name] || []) {
          if (!n || n.family !== 'IPv4' || n.internal) continue;
          all.push(n.address);
        }
      }
      const preferred = all.find(ip => ip.startsWith('192.168.')) || all.find(ip => ip.startsWith('10.')) || all.find(ip => ip.startsWith('172.'));
      return preferred || all[0] || '';
    } catch (e) {
      return '';
    }
  }

  const envBase = String(process.env.DISPLAY_BASE_URL || '').trim();
  const host = String(req.get('host') || '').trim();
  const isLocalhostHost = host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]');
  const lanIp = getLanIp();
  const fallbackBase = (isLocalhostHost && lanIp) ? `http://${lanIp}:3006` : (host ? `http://${host}` : '');
  const displayBaseUrl = envBase || fallbackBase;

  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Etikett ohne Auftrag</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background: #0b0f19; color: #e8eefc; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 16px; }
    h1 { margin: 0; font-size: 18px; }
    .muted { color: rgba(232,238,252,.7); font-size: 12px; }
    .card { background: rgba(18,22,36,.95); border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 12px; }
    .grid { display: grid; gap: 10px; }
    .grid-2 { grid-template-columns: 1fr 1fr; }
    label { display: grid; gap: 6px; font-size: 12px; font-weight: 800; }
    input, textarea { width: 100%; padding: 10px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,.16); background: rgba(0,0,0,.25); color: #e8eefc; }
    textarea { min-height: 70px; resize: vertical; }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .btn { appearance: none; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.06); color: #e8eefc; padding: 8px 10px; border-radius: 10px; font-weight: 900; font-size: 12px; cursor: pointer; text-decoration: none; }
    .btn:hover { background: rgba(255,255,255,.10); }
    .btn.primary { background: rgba(65,196,255,.18); border-color: rgba(65,196,255,.35); }
    .btn.primary:hover { background: rgba(65,196,255,.26); }
    .items { display: grid; gap: 8px; }
    .item { border: 1px solid rgba(255,255,255,.10); border-radius: 10px; padding: 10px; background: rgba(0,0,0,.18); }
    .item-head { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
    .item-title { font-weight: 900; font-size: 12px; }
    .pill { display: inline-flex; gap: 8px; align-items: center; font-size: 12px; font-weight: 900; padding: 6px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); }
    .pill input { width: auto; margin: 0; }
    .pill select { width: auto; margin: 0; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; font-weight: 900; outline: none; }
    select { padding: 10px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,.16); background: rgba(0,0,0,.25); color: #e8eefc; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="row" style="justify-content:space-between; margin-bottom:10px;">
      <h1>Etikett ohne Auftrag</h1>
      <a class="btn" href="/display">Monitor</a>
    </div>

    <div class="card grid" style="margin-bottom:12px;">
      <div class="grid grid-2">
        <label>
          Datum
          <input id="date" type="date" />
        </label>
        <label>
          Kürzel (optional)
          <input id="op" placeholder="z.B. JO" />
        </label>
      </div>
      <div class="grid grid-2">
        <label>
          Name
          <input id="name" placeholder="z.B. Vonovia / Kunde / Baustelle" />
        </label>
        <label>
          Produkt
          <input id="product" placeholder="z.B. Gurtwickler / Jalousie / Motor ..." />
        </label>
      </div>
      <label>
        Zusatz (optional)
        <textarea id="extra" placeholder="optional: zweite Zeile / Details"></textarea>
      </label>
      <div class="row">
        <span class="pill">Frei-Etikett</span>
        <label class="pill" style="cursor:pointer;">
          <input id="withDate" type="checkbox" checked />
          Datum
        </label>
        <label class="pill" style="cursor:pointer;">
          <input id="datePrefixDelivery" type="checkbox" />
          Lieferung vom:
        </label>
        <label class="pill" style="cursor:pointer;">
          <input id="withQr" type="checkbox" checked />
          QR
        </label>
        <label class="pill" style="cursor:pointer;">
          <input id="bold" type="checkbox" />
          Fett
        </label>
        <label class="pill">
          Größe
          <select id="fs" aria-label="Schriftgröße">
            <option value="s">klein</option>
            <option value="m" selected>normal</option>
            <option value="l">groß</option>
            <option value="xl">sehr groß</option>
          </select>
        </label>
        <label class="pill">
          ↔
          <select id="ha" aria-label="Ausrichtung horizontal">
            <option value="left" selected>links</option>
            <option value="center">zentriert</option>
            <option value="right">rechts</option>
          </select>
        </label>
        <label class="pill">
          ↕
          <select id="va" aria-label="Ausrichtung vertikal">
            <option value="top" selected>oben</option>
            <option value="middle">mitte</option>
            <option value="bottom">unten</option>
          </select>
        </label>
        <label class="pill">
          Pakete
          <input id="pkgTotal" type="number" min="1" max="20" step="1" value="1" style="width:72px; padding:6px 8px;" />
        </label>
        <button class="btn primary" type="button" id="print1">Etikett drucken (1x)</button>
        <button class="btn" type="button" id="print2">Etikett drucken (2x)</button>
      </div>
      <div class="muted">URL: ${escapeHtml(displayBaseUrl)}/display/label-tool</div>
    </div>

    <div class="card">
      <div style="font-weight:900; font-size:12px;">Suche in Slack</div>
      <div class="muted" style="margin-top:2px;">Treffer können Name/Produkt/Datum vorbelegen</div>
      <label style="margin-top:10px;">
        Suchbegriff (mind. 3 Zeichen)
        <input id="search" placeholder="z.B. Vonovia 510 / Straße / Auftragsnummer ..." autocomplete="off" />
      </label>
      <div id="results" class="items" style="margin-top:10px;"></div>
    </div>
  </div>

  <script>
    const DISPLAY_BASE_URL = ${JSON.stringify(displayBaseUrl)};

    function normalize(s) {
      const t = String(s ?? '');
      let out = '';
      let inSpace = false;
      for (let i = 0; i < t.length; i += 1) {
        const ch = t[i];
        const code = ch.charCodeAt(0);
        const isSpace =
          code <= 32 ||
          code === 0x00A0 ||
          code === 0x200B ||
          code === 0x200C ||
          code === 0x200D ||
          code === 0xFEFF;
        if (isSpace) { inSpace = true; continue; }
        if (inSpace && out) out += ' ';
        inSpace = false;
        out += ch;
      }
      return out.trim();
    }

    function el(tag, attrs, children) {
      const node = document.createElement(tag);
      if (attrs) {
        Object.entries(attrs).forEach(([k, v]) => {
          if (k === 'class') node.className = v;
          else node.setAttribute(k, v);
        });
      }
      (children || []).forEach(c => node.appendChild(c));
      return node;
    }
    function text(s) { return document.createTextNode(String(s ?? '')); }

    function isoToday() {
      const d = new Date();
      const yyyy = String(d.getFullYear());
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return yyyy + '-' + mm + '-' + dd;
    }

    function buildQr(dateIso, name, product) {
      const parts = [normalize(dateIso), normalize(name), normalize(product)].filter(Boolean);
      const raw = 'freelabel:' + parts.join('|');
      return raw.slice(0, 180);
    }

    function currentPageReturnTarget() {
      return window.location.pathname + window.location.search + window.location.hash;
    }

    function openFreeLabel(copies) {
      const withDate = !!(document.getElementById('withDate') && document.getElementById('withDate').checked);
      const datePrefixDelivery = !!(document.getElementById('datePrefixDelivery') && document.getElementById('datePrefixDelivery').checked);
      const withQr = !!(document.getElementById('withQr') && document.getElementById('withQr').checked);
      const bold = !!(document.getElementById('bold') && document.getElementById('bold').checked);
      const fs = normalize(document.getElementById('fs') && document.getElementById('fs').value);
      const ha = normalize(document.getElementById('ha') && document.getElementById('ha').value);
      const va = normalize(document.getElementById('va') && document.getElementById('va').value);
      const pkgTotalRaw = Number.parseInt(normalize(document.getElementById('pkgTotal') && document.getElementById('pkgTotal').value), 10);
      const pkgTotal = Math.min(20, Math.max(1, Number.isFinite(pkgTotalRaw) ? pkgTotalRaw : 1));
      const rawDate = normalize(document.getElementById('date').value);
      const dateIso = withDate ? (rawDate || isoToday()) : '';
      const name = normalize(document.getElementById('name').value);
      const product = normalize(document.getElementById('product').value);
      const extra = normalize(document.getElementById('extra').value);
      const op = normalize(document.getElementById('op').value);
      if (!name && !product) {
        alert('Bitte mindestens Name oder Produkt ausfüllen.');
        return;
      }
      const qrText = withQr ? buildQr(dateIso, name, product) : '';
      const params = [];
      if (withQr && qrText) params.push('qr=' + encodeURIComponent(qrText));
      params.push('l1=' + encodeURIComponent(product || 'Etikett'));
      if (extra) params.push('l2=' + encodeURIComponent(extra));
      if (dateIso) params.push('d=' + encodeURIComponent(dateIso));
      if (dateIso && datePrefixDelivery) params.push('datePrefixDelivery=1');
      if (name) params.push('c=' + encodeURIComponent(name));
      if (op) params.push('op=' + encodeURIComponent(op));
      if (fs) params.push('fs=' + encodeURIComponent(fs));
      if (ha) params.push('ha=' + encodeURIComponent(ha));
      if (va) params.push('va=' + encodeURIComponent(va));
      if (bold) params.push('bold=1');
      if (pkgTotal > 1) params.push('pkgTotal=' + encodeURIComponent(String(pkgTotal)));
      else params.push('copies=' + encodeURIComponent(String(copies || 1)));
      params.push('ret=' + encodeURIComponent(currentPageReturnTarget()));
      const url = '/display/label?' + params.join('&');
      try { window.open(url, '_blank', 'noopener'); } catch (e) { window.location.href = url; }
    }

    document.getElementById('date').value = isoToday();
    document.getElementById('print1').addEventListener('click', () => openFreeLabel(1));
    document.getElementById('print2').addEventListener('click', () => openFreeLabel(2));

    const resultsEl = document.getElementById('results');
    const searchEl = document.getElementById('search');
    let timer = null;

    function clearResults() { resultsEl.innerHTML = ''; }

    function renderResults(list) {
      clearResults();
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        resultsEl.appendChild(el('div', { class: 'muted' }, [text('Keine Treffer.')])); 
        return;
      }
      items.slice(0, 12).forEach(it => {
        const title = normalize(it && it.title);
        const due = normalize(it && it.dueDate);
        const excerpt = normalize(it && it.excerpt);
        const url = normalize(it && it.url);

        const row = el('div', { class: 'item' }, [
          el('div', { class: 'item-head' }, [
            el('div', { class: 'item-title' }, [text(title || 'Treffer')]),
            el('div', { class: 'row' }, [
              el('button', { class: 'btn', type: 'button' }, [text('Übernehmen')]),
              url ? el('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, [text('Link')]) : el('span'),
            ])
          ]),
          due ? el('div', { class: 'muted' }, [text('Datum: ' + due)]) : el('span'),
          excerpt ? el('div', { class: 'muted' }, [text(excerpt)]) : el('span'),
        ]);
        row.querySelector('button').addEventListener('click', () => {
          if (due) document.getElementById('date').value = due;
          if (title) document.getElementById('name').value = title;
          if (excerpt) document.getElementById('product').value = excerpt;
        });
        resultsEl.appendChild(row);
      });
    }

    async function runSearch() {
      const q = normalize(searchEl.value);
      if (q.length < 3) { clearResults(); return; }
      clearResults();
      resultsEl.appendChild(el('div', { class: 'muted' }, [text('Suche…')]));
      try {
        const res = await fetch('/api/intake/search?q=' + encodeURIComponent(q)).then(r => r.json()).catch(() => null);
        if (!res || !res.ok) { clearResults(); return; }
        renderResults(res.results || []);
      } catch (e) { clearResults(); }
    }

    searchEl.addEventListener('input', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(runSearch, 450);
    });
  </script>
</body>
</html>`;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

router.get('/', (req, res) => {
  function getLanIp() {
    try {
      const nets = os.networkInterfaces();
      const all = [];
      for (const name of Object.keys(nets || {})) {
        for (const n of nets[name] || []) {
          if (!n || n.family !== 'IPv4' || n.internal) continue;
          all.push(n.address);
        }
      }
      const preferred = all.find(ip => ip.startsWith('192.168.')) || all.find(ip => ip.startsWith('10.')) || all.find(ip => ip.startsWith('172.'));
      return preferred || all[0] || '';
    } catch (e) {
      return '';
    }
  }

  const envBase = String(process.env.DISPLAY_BASE_URL || '').trim();
  const host = String(req.get('host') || '').trim();
  const isLocalhostHost = host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]');
  const lanIp = getLanIp();
  const fallbackBase = (isLocalhostHost && lanIp) ? `http://${lanIp}:3006` : (host ? `http://${host}` : '');
  const displayBaseUrl = envBase || fallbackBase;
  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Produktion Monitor</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background: #0d0f14; color: #fff; }
    #boot { padding: 14px 16px; }
    #bootTitle { font-weight: 900; }
    #bootMsg { margin-top: 6px; opacity: .85; white-space: pre-wrap; }
    #bootErr { margin-top: 10px; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,90,90,.55); background: rgba(255,90,90,.10); display: none; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div id="boot">
    <div id="bootTitle">Produktion Monitor</div>
    <div id="bootMsg">Lade…</div>
    <div id="bootErr"></div>
  </div>
  <div id="root"></div>
  <script>
    (function initBoot() {
      const bootMsg = document.getElementById('bootMsg');
      const bootErr = document.getElementById('bootErr');
      function showErr(msg) {
        try {
          if (!bootErr) return;
          bootErr.style.display = 'block';
          bootErr.textContent = String(msg || 'Unbekannter Fehler');
        } catch (e) {}
      }
      try { if (bootMsg) bootMsg.textContent = 'Initialisiere…'; } catch (e) {}
      window.addEventListener('error', (e) => {
        const m = e && e.message ? e.message : 'JavaScript Fehler';
        showErr(m);
      });
      window.addEventListener('unhandledrejection', (e) => {
        const r = e && e.reason;
        const m = r && r.message ? r.message : (typeof r === 'string' ? r : 'Promise Fehler');
        showErr(m);
      });
      window.__boot = { showErr: showErr };
    })();

    const DISPLAY_BASE_URL = ${JSON.stringify(displayBaseUrl)};
    const state = { last: null, filter: '', onlySaw: null, autoPrint: null, toastTimeout: null, pending: null, detailsItem: null, detailsItemId: null, materialSignalsAt: null, station: '', actor: '', adminKey: '', urlCode: null, urlCodeHandled: false, doneTodayData: null, materialCheckedIds: null };

    const MATVIEW_ENDPOINT = '/api/production/mat-checked';

    function matCheckedIds() {
      if (!Array.isArray(state.materialCheckedIds)) state.materialCheckedIds = [];
      return state.materialCheckedIds;
    }

    function isMatViewed(itemId) {
      const id = String(itemId || '');
      return !!(id && matCheckedIds().includes(id));
    }

    async function loadMatCheckedIds() {
      try {
        const r = await fetch(MATVIEW_ENDPOINT, { headers: { Accept: 'application/json' } });
        const data = r.ok ? (await r.json()) : null;
        state.materialCheckedIds = Array.isArray(data && data.ids) ? data.ids.filter(x => typeof x === 'string' && x) : [];
        return true;
      } catch (e) {
        state.materialCheckedIds = [];
        return false;
      }
    }

    async function markMatViewed(itemId) {
      const id = String(itemId || '');
      if (!id) return false;
      const arr = matCheckedIds();
      if (arr.includes(id)) return false;
      try {
        const r = await fetch(MATVIEW_ENDPOINT + '/' + encodeURIComponent(id), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}' });
        const data = r.ok ? (await r.json()) : null;
        if (data && Array.isArray(data.ids)) state.materialCheckedIds = data.ids.filter(x => typeof x === 'string' && x);
        else if (!arr.includes(id)) arr.push(id);
        return data && data.ok && data.added === true;
      } catch (e) {
        if (!arr.includes(id)) arr.push(id);
        return false;
      }
    }

    async function unmarkMatChecked(itemId) {
      const id = String(itemId || '');
      if (!id) return false;
      try {
        const r = await fetch(MATVIEW_ENDPOINT + '/' + encodeURIComponent(id), { method: 'DELETE', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}' });
        const data = r.ok ? (await r.json()) : null;
        if (data && Array.isArray(data.ids)) state.materialCheckedIds = data.ids.filter(x => typeof x === 'string' && x);
        else state.materialCheckedIds = matCheckedIds().filter(x => String(x) !== id);
        return data && data.ok && data.removed === true;
      } catch (e) {
        state.materialCheckedIds = matCheckedIds().filter(x => String(x) !== id);
        return false;
      }
    }

    async function resetMatViewedIds() {
      try {
        const r = await fetch(MATVIEW_ENDPOINT, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}' });
        state.materialCheckedIds = [];
        if (r.ok) return true;
      } catch (e) {
        state.materialCheckedIds = [];
      }
      return false;
    }

    function el(tag, attrs, children) {
      const node = document.createElement(tag);
      if (attrs) {
        Object.entries(attrs).forEach(([k, v]) => {
          if (k === 'class') node.className = v;
          else if (k === 'html') node.innerHTML = v;
          else node.setAttribute(k, v);
        });
      }
      (children || []).forEach(c => node.appendChild(c));
      return node;
    }

    function text(s) { return document.createTextNode(s); }

    function getDisplayBaseUrlForQr() {
      const raw = DISPLAY_BASE_URL ? String(DISPLAY_BASE_URL) : '';
      const base = raw ? raw.replace(/\\/+$/, '') : window.location.origin;
      if (base.endsWith('/display')) return base;
      return base + '/display';
    }

    function currentPageReturnTarget() {
      return window.location.pathname + window.location.search + window.location.hash;
    }

    function applyAutoPrintParam(params) {
      if (state.autoPrint) params.push('autoprint=1');
    }

    (function initUrlCode() {
      try {
        const p = new URLSearchParams(window.location.search);
        const c = String(p.get('code') || '').trim();
        if (c) state.urlCode = c;
      } catch (e) {}
    })();

    function parseJsonSafe(s) {
      try { return JSON.parse(String(s || '')); } catch (e) { return null; }
    }

    function normalizeOneLine(s) {
      const t = String(s || '');
      let out = '';
      let inSpace = false;
      for (let i = 0; i < t.length; i += 1) {
        const ch = t[i];
        const code = ch.charCodeAt(0);
        const isSpace =
          code <= 32 ||
          code === 0x00A0 ||
          code === 0x200B ||
          code === 0x200C ||
          code === 0x200D ||
          code === 0xFEFF;
        if (isSpace) {
          inSpace = true;
          continue;
        }
        if (inSpace && out) out += ' ';
        inSpace = false;
        out += ch;
      }
      return out.trim();
    }

    function findFirstUrl(text) {
      const t = String(text || '');
      const lower = t.toLowerCase();
      const i1 = lower.indexOf('http://');
      const i2 = lower.indexOf('https://');
      let start = -1;
      if (i1 >= 0 && i2 >= 0) start = Math.min(i1, i2);
      else start = i1 >= 0 ? i1 : i2;
      if (start < 0) return '';
      let end = start;
      while (end < t.length) {
        const ch = t[end];
        const code = ch.charCodeAt(0);
        const isSpace =
          code <= 32 ||
          code === 0x00A0 ||
          code === 0x200B ||
          code === 0x200C ||
          code === 0x200D ||
          code === 0xFEFF;
        if (isSpace || ch === ')') break;
        end += 1;
      }
      return t.slice(start, end);
    }

    function findItemUrl(item) {
      const desc = item && item.description ? String(item.description) : '';
      const title = item && item.title ? String(item.title) : '';
      const note = item && item.note && item.note.text ? String(item.note.text) : '';
      return findFirstUrl(desc) || findFirstUrl(note) || findFirstUrl(title) || '';
    }

    function isWeekend(d) {
      const day = d.getDay();
      return day === 0 || day === 6;
    }

    function workdaysUntilDateIso(dateIso) {
      const s = String(dateIso || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(s + 'T00:00:00');
      if (!isFinite(due.getTime())) return null;
      if (due.getTime() < today.getTime()) return -1;
      let d = new Date(today.getTime());
      let workdays = 0;
      for (let i = 0; i < 70; i += 1) {
        d.setDate(d.getDate() + 1);
        if (d.getTime() > due.getTime()) break;
        if (!isWeekend(d)) workdays += 1;
      }
      return workdays;
    }

    function operatorCode(input) {
      const t = normalizeOneLine(input)
        .replace(/[^0-9A-Za-zÄÖÜäöüß]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!t) return '';
      const parts = t.split(' ').filter(Boolean);
      if (!parts.length) return '';
      const joined = parts.join('');
      if (parts.length === 1 && joined.length <= 4) return joined.toUpperCase();
      if (parts.length >= 2) return parts.map(p => String(p).charAt(0)).join('').toUpperCase().slice(0, 4);
      return String(parts[0]).slice(0, 3).toUpperCase();
    }

    const VIEW_RULES = {
      SM: { onlySaw: true, lockOnlySaw: true },
    };

    function currentUserCode() {
      return operatorCode(state.actor || '');
    }

    function effectiveOnlySaw() {
      const code = currentUserCode();
      const rule = code ? VIEW_RULES[code] : null;
      if (rule && rule.onlySaw) return true;
      return !!state.onlySaw;
    }

    function onlySawStorageKey() {
      const code = currentUserCode();
      return code ? ('onlySaw:' + code) : 'onlySaw';
    }

    function stripSupplierInfo(s) {
      const t = normalizeOneLine(s);
      if (!t) return '';
      const suppliers = [
        'Rademacher/Delta Dore',
        'Rademacher',
        'Delta Dore',
        'Erfal',
        'Hella',
        'May',
        'Viktor Müller',
        'Viktor Mueller',
        'Sonstige'
      ];
      const parts = t.split(/\\s+[–-]\\s+/).map(x => String(x || '').trim()).filter(Boolean);
      const cleaned = parts.filter(p => !suppliers.some(v => p.toLowerCase() === String(v).toLowerCase()));
      const joined = cleaned.length ? cleaned.join(' – ') : t;
      let out = joined;
      suppliers.forEach(v => {
        const vv = String(v);
        out = out.replace(new RegExp('^' + vv.replace(/[.*+?^()|[\\]\\\\]/g, '\\$&') + '\\s+', 'i'), '');
      });
      return normalizeOneLine(out);
    }

    function splitNonPanzerLabelLines(partLabel) {
      const s0 = stripSupplierInfo(partLabel);
      const s = String(s0 || '').trim();
      if (!s) return { l1: '', l2: '' };
      const lc = s.toLowerCase();
      if (!lc.includes('welle')) return { l1: s, l2: '' };
      const mm = s.match(/(\\d{3,5})\\s*mm\\b/i);
      const m = !mm ? s.match(/(\\d+(?:[.,]\\d+)?)\\s*m\\b/i) : null;
      const len = mm ? (String(mm[1]) + ' mm') : (m ? (String(m[1]).replace(',', '.') + ' m') : '');
      if (!len) return { l1: s, l2: '' };
      const base = s
        .replace(mm ? mm[0] : (m ? m[0] : ''), ' ')
        .replace(/[\s,;|]+/g, ' ')
        .trim();
      const cleanedBase = stripSupplierInfo(base || s);
      return { l1: cleanedBase || (base || s), l2: 'L ' + len };
    }

    function isProbablyMobilePrintClient() {
      const ua = String(navigator.userAgent || '');
      const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      return /android|iphone|ipad|ipod|mobile|huawei|honor/i.test(ua) || coarse;
    }

    function openAuxPage(url) {
      if (!url) return;
      if (isProbablyMobilePrintClient()) {
        window.location.assign(url + (url.includes('?') ? '&' : '?') + '_m=' + Date.now());
        return;
      }
      try {
        const w = window.open(url, '_blank', 'noopener');
        if (!w) window.location.href = url;
      } catch (e) {
        window.location.href = url;
      }
    }

    function openLabelForPart(item, partLabel, copiesOverride) {
      if (!item || !partLabel) return;
      const scanUrl = getDisplayBaseUrlForQr() + '?code=' + encodeURIComponent(item.qrText);
      const customer = item.title || item.id;
      const dateIso = String(item.montageDate || item.dueDate || '').slice(0, 10);
      const op = operatorCode(state.actor || '');
      const cleanLabel = String(partLabel || '').replace(/^\\s*\\d+\\)\\s*/, '').trim();
      const sp = splitNonPanzerLabelLines(cleanLabel);
      const payload = {
        qr: scanUrl,
        l1: sp.l1,
        l2: sp.l2,
        l3: '',
        l4: '',
        d: dateIso,
        c: customer,
        op,
        copies: Number.isFinite(copiesOverride) ? copiesOverride : 1,
      };
      const params = [
        'qr=' + encodeURIComponent(String(payload.qr || '')),
        'l1=' + encodeURIComponent(String(payload.l1 || '')),
      ];
      if (payload.l2) params.push('l2=' + encodeURIComponent(String(payload.l2)));
      if (payload.l3) params.push('l3=' + encodeURIComponent(String(payload.l3)));
      if (payload.l4) params.push('l4=' + encodeURIComponent(String(payload.l4)));
      if (payload.d) params.push('d=' + encodeURIComponent(String(payload.d)));
      if (payload.c) params.push('c=' + encodeURIComponent(String(payload.c)));
      if (payload.op) params.push('op=' + encodeURIComponent(String(payload.op)));
      if (Number.isFinite(payload.copies)) params.push('copies=' + encodeURIComponent(String(payload.copies)));
      params.push('ret=' + encodeURIComponent(currentPageReturnTarget()));
      applyAutoPrintParam(params);
      const url =
        '/display/label?' + params.join('&');
      openAuxPage(url);
    }

    function buildPartLabelPayload(item, partLabel, { copies = 1, packageTotal = 1, packageIndex = null } = {}) {
      if (!item || !partLabel) return null;
      const scanUrl = getDisplayBaseUrlForQr() + '?code=' + encodeURIComponent(item.qrText);
      const customer = item.title || item.id;
      const dateIso = String(item.montageDate || item.dueDate || '').slice(0, 10);
      const op = operatorCode(state.actor || '');
      const cleanLabel = String(partLabel || '').replace(/^\\s*\\d+\\)\\s*/, '').trim();
      const sp = splitNonPanzerLabelLines(cleanLabel);
      return {
        qr: scanUrl,
        l1: sp.l1,
        l2: sp.l2,
        l3: '',
        l4: '',
        d: dateIso,
        c: customer,
        op,
        copies: Math.max(1, Math.round(Number(copies) || 1)),
        pkgTotal: Math.max(1, Math.round(Number(packageTotal) || 1)),
        pkgIndex: Number.isFinite(packageIndex) ? Math.max(1, Math.round(packageIndex)) : undefined,
      };
    }

    function openBatchLabelPayloads(payloads) {
      const batch = Array.isArray(payloads) ? payloads.filter(Boolean) : [];
      if (!batch.length) {
        showToast('Keine Paket-Labels erzeugt');
        return;
      }
      const params = [
        'batch=' + encodeURIComponent(JSON.stringify(batch)),
        'ret=' + encodeURIComponent(currentPageReturnTarget()),
      ];
      applyAutoPrintParam(params);
      openAuxPage('/display/label?' + params.join('&'));
    }

    function mapMaterialText(s) {
      const t = normalizeOneLine(s);
      const l = t.toLowerCase();
      if (!l) return '';
      if (l.includes('speedtimer') || l.includes('speed timer')) return 'Rademacher SpeedTimer';
      if (l.includes('somfy') && l.includes('motor')) return 'Somfy Motor';
      if (l.includes('rademacher') && l.includes('motor')) return 'Rademacher Motor';
      if (l.includes('motor')) return l.includes('somfy') ? 'Somfy Motor' : 'Rademacher Motor';
      if (l.includes('jalousie')) return 'Erfal Jalousie';
      if (l.includes('plissee')) return 'Erfal Plissee';
      if (l.includes('rollo')) return 'Erfal Rollo';
      if (l.includes('erfal')) return 'Erfal';
      if (l.includes('rademacher')) return 'Rademacher';
      return '';
    }

    function guessMaterialLines(item, part) {
      const out = [];
      const p = normalizeOneLine(part);
      if (p) {
        return mapMaterialText(p) || p;
      }

      const needs = Array.isArray(item && item.materialNeeds) ? item.materialNeeds : [];
      for (const n of needs) {
        const nn = normalizeOneLine(n);
        if (!nn) continue;
        out.push(mapMaterialText(nn) || nn);
      }

      if (!out.length) {
        const desc = String(item && item.description || '');
        const segs = desc.split(/[\\r\\n,]+/).map(s => String(s || '').trim()).filter(Boolean);
        for (const seg of segs) {
          const mapped = mapMaterialText(seg);
          if (mapped) out.push(mapped);
        }
      }

      if (!out.length && item && item.panzerSummary) out.push(normalizeOneLine(item.panzerSummary));
      return Array.from(new Set(out.map(normalizeOneLine))).filter(Boolean).slice(0, 6).join('\\n');
    }

    function formatTitle(item) {
      if (item && item.isQuestion) {
        const subj = item.questionSubject ? String(item.questionSubject) : '';
        if (subj) return subj;
        const t = String(item.title || item.id || '');
        return t.replace(/^OF\s*:\s*[^\s–-]+\s*(?:[–-]\s*)?/i, '').trim() || t;
      }
      return item.title || item.id;
    }

    function isQuestionAnswered(item) {
      if (!item || !item.isQuestion) return false;
      const desc = String(item.description || '');
      const lower = desc.toLowerCase();
      if (lower.includes('antwort:')) return true;
      return false;
    }

    function formatStatus(item) {
      if (item.statusLabel) return String(item.statusLabel);
      const s = String(item.status || '');
      if (s === 'offen' || s === 'not_started') return 'Offen';
      if (s === 'bestellt') return 'Bestellt';
      if (s === 'angenommen') return 'Angenommen';
      if (s === 'in_bearbeitung' || s === 'in_progress') return 'In Bearbeitung';
      return s || '-';
    }

    function formatDateShort(iso) {
      if (!iso) return '';
      const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
      if (!isFinite(d.getTime())) return '';
      return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    }

    function badge(label, cls) {
      return el('span', { class: 'badge ' + (cls || '') }, [text(label)]);
    }

    function itemHaystack(item) {
      const hasOpenMat = item && Array.isArray(item.openMaterial) && item.openMaterial.length > 0;
      const hasMatNeeds = item && Array.isArray(item.materialNeeds) && item.materialNeeds.length > 0;
      const isOrdered = item && String(item.status || '') === 'bestellt';
      const viewed = isMatViewed(item && item.id);
      const isCheck = !!(item && !item.emergency && !hasOpenMat && !isOrdered && hasMatNeeds && !viewed);
      const parts = [
        item.id,
        item.title,
        item.origin,
        item.statusLabel,
        item.status,
        item.description,
        item.cutInfo,
        item.panzerSummary,
        item.dueDate,
        item.montageDate,
        item.localProgress ? (item.localProgress.label || '') : '',
        item.localProgress ? (item.localProgress.actor || '') : '',
        item.localProgress ? (item.localProgress.station || '') : '',
        item.endleiste ? (item.endleiste.color || '') : '',
        item.endleiste ? (item.endleiste.drilled === true ? 'gebohrt' : item.endleiste.drilled === false ? 'nicht gebohrt' : (item.endleiste.drilled || '')) : '',
        item.vorsatz ? (item.vorsatz.summary || '') : '',
        item.vorsatz ? (item.vorsatz.colorLabel || '') : '',
        item.vorsatz ? (item.vorsatz.dimensions || '') : '',
        item.vorsatz ? (item.vorsatz.rolloColorLabel || '') : '',
        item.vorsatz ? (item.vorsatz.rolloProfileLabel || '') : '',
        item.vorsatzElement && item.vorsatzElement.boxLine ? item.vorsatzElement.boxLine : '',
        item.vorsatzElement && item.vorsatzElement.controlLine ? item.vorsatzElement.controlLine : '',
        item.vorsatzElement && item.vorsatzElement.panzerLine ? item.vorsatzElement.panzerLine : '',
        item.vorsatzBoxOnly && item.vorsatzBoxOnly.boxLine ? item.vorsatzBoxOnly.boxLine : '',
        item.vorsatzBoxOnly && item.vorsatzBoxOnly.controlLine ? item.vorsatzBoxOnly.controlLine : '',
        item.emergency ? 'NOTFALL notfall dringend emergency' : '',
        hasOpenMat ? ('material fehlt fehlend materialfehlt orange ' + (item.openMaterial || []).join(' ')) : '',
        isCheck ? 'material prüfen materialprüfen prüfen grün' : '',
        viewed ? 'material geprüft materialgeprüft geprüft erledigt' : '',
        isOrdered ? 'material bestellt bestellt blau' : ''
      ];
      return parts.filter(Boolean).join(' ').toLowerCase();
    }

    function normalizeSawSegment(seg) {
      const s = normalizeOneLine(seg);
      if (!s) return '';
      const l = s.toLowerCase();
      const hasCutType = /(stab|stäbe|staebe|lamelle|lamellen|welle)/i.test(s);
      if (!hasCutType) return s;
      const qtyMatch =
        s.match(/(?:^|[\\s,;|])(\\d+)\\s*(?:x|×)\\b/i) ||
        s.match(/^(\\d+)\\s+(?:lamellen?|stäbe?|staebe?|stab)\\b/i) ||
        s.match(/\\b(\\d+)\\s*(?:lamellen?|stäbe?|staebe?|stab)\\b/i);
      const lenMatch = s.match(/(?:je\\s*)?(\\d{2,5}(?:[.,]\\d+)?)\\s*(mm|cm|m)\\b/i);
      const type = /welle/i.test(s) ? 'Welle' : 'Stab';
      const qty = qtyMatch ? String(qtyMatch[1]) : '';
      if (!lenMatch) return s;
      const rawVal = String(lenMatch[1] || '').replace(',', '.');
      const unit = String(lenMatch[2] || '').toLowerCase();
      const lenVal = unit === 'mm' ? String(Math.round(Number(rawVal))) : rawVal;
      const len = lenVal + ' ' + unit;
      return ((qty ? (qty + 'x ') : '') + type + ' ' + len).trim();
    }

    function hasSawWork(item) {
      if (item && item.isQuestion) return false;
      const pcs = Array.isArray(item && item.panzerConfigs) ? item.panzerConfigs : [];
      if (pcs.length) return true;
      const parts = parseParts(item);
      if (!parts.length) return false;
      return parts.some((p) => /(stab|stäbe|staebe|lamelle|lamellen|welle)/i.test(String(p || '')));
    }

    function applyFilter(items) {
      let out = items || [];
      if (effectiveOnlySaw()) out = out.filter(hasSawWork);
      const q = String(state.filter || '').trim().toLowerCase();
      if (!q) return out;
      return out.filter(it => itemHaystack(it).includes(q));
    }

    function setScanValue(value) {
      const scan = document.getElementById('scan');
      if (!scan) return;
      scan.value = value || '';
      scan.focus();
      scan.select();
    }

    function parseParts(item) {
      const desc = String(item && item.description || '').trim();
      if (!desc) return [];
      const parts = [];

      function splitByCommaKeepingDecimal(text) {
        const s = String(text || '');
        const out = [];
        let cur = '';
        const isDigit = (ch) => /\d/.test(String(ch || ''));
        const isSpace = (ch) => /[\s\u00A0\u200B\u200C\u200D\uFEFF]/.test(String(ch || ''));
        const prevNonSpaceIndex = (idx) => {
          let j = idx - 1;
          while (j >= 0 && isSpace(s[j])) j -= 1;
          return j;
        };
        const nextNonSpaceIndex = (idx) => {
          let j = idx + 1;
          while (j < s.length && isSpace(s[j])) j += 1;
          return j;
        };
        for (let i = 0; i < s.length; i += 1) {
          const ch = s[i];
          if (ch === ',') {
            const pi = prevNonSpaceIndex(i);
            const ni = nextNonSpaceIndex(i);
            const prev = pi >= 0 ? s[pi] : '';
            const next = ni < s.length ? s[ni] : '';
            if (isDigit(prev) && isDigit(next)) {
              cur += ch;
            } else {
              const t = cur.trim();
              if (t) out.push(t);
              cur = '';
            }
            continue;
          }
          cur += ch;
        }
        const t = cur.trim();
        if (t) out.push(t);
        return out;
      }

      const plusParts = desc.split('+').map(s => s.trim()).filter(Boolean);
      if (plusParts.length > 1) {
        for (let i = 1; i < plusParts.length; i += 1) parts.push(plusParts[i]);
      }
      const keywords = ['gurt', 'welle', 'stab', 'stäbe', 'staebe', 'lamelle', 'lamellen', 'wickler', 'schwenkwickler', 'abdeckplatte', 'teleskop', 'walzen', 'kapsel', 'gurtscheibe', 'drahtseil', 'einlauf', 'insektenschutz', 'motor', 'm-line', 'rollo', 'jalousie', 'plissee', 'kurbel'];
      const commaParts = splitByCommaKeepingDecimal(desc);
      for (const seg of commaParts) {
        const segParts = String(seg).split('+').map(s => s.trim()).filter(Boolean);
        const candidates = segParts.length ? segParts : [String(seg).trim()];
        for (const c of candidates) {
          const l = c.toLowerCase();
          if (!keywords.some(k => l.includes(k))) continue;
          const mit = c.split(/\\s+\\bmit\\b\\s+/i).map(s => s.trim()).filter(Boolean);
          if (mit.length === 2) {
            const a = mit[0];
            const b = mit[1];
            const la = a.toLowerCase();
            const lb = b.toLowerCase();
            const aOk = keywords.some(k => la.includes(k));
            const bOk = keywords.some(k => lb.includes(k));
            if (aOk && bOk) {
              if (/\\bwickler\\b/i.test(la) && /^\\s*gurt\\b/i.test(b)) {
                parts.push(normalizeSawSegment(c));
                continue;
              }
              parts.push(normalizeSawSegment(a));
              parts.push(normalizeSawSegment(b));
              continue;
            }
          }
          parts.push(normalizeSawSegment(c));
        }
      }
      return Array.from(new Set(parts.map(normalizeOneLine).filter(Boolean))).slice(0, 20);
    }

    function isProductionDetailLine(line) {
      return /^(Schnittmaß SP-B 35|Stabilisierungsprofil \(Profilsäge\)|Schlitten auf |Bürste\b|Federstifte aktiv\b)/i.test(String(line || '').trim());
    }

    function parsePositions(item) {
      const desc = String(item && item.description || '').replace(/\\r\\n/g, '\\n').trim();
      if (!desc) return [];
      const lines = desc.split('\\n').map(l => String(l || '').trim()).filter(Boolean);
      if (!lines.length) return [];

      const out = [];
      let cur = null;

      const flush = () => {
        if (!cur) return;
        const t = normalizeOneLine(cur.text);
        if (t) out.push(cur.idx + ') ' + t);
        cur = null;
      };

      for (const ln of lines) {
        const m = /^\\s*(\\d{1,3})\\s*[).]\\s*(.+)\\s*$/.exec(ln);
        if (m) {
          flush();
          cur = { idx: String(m[1]), text: String(m[2] || '').trim() };
          continue;
        }
        if (cur) {
          if (isProductionDetailLine(ln)) continue;
          cur.text = (cur.text ? (cur.text + ' ' + ln) : ln).trim();
        }
      }
      flush();
      return out.slice(0, 60);
    }

    function getResidualPositions(item) {
      const all = parsePositions(item);
      const pcs = Array.isArray(item && item.panzerConfigs) ? item.panzerConfigs : [];
      if (!pcs.length) return all;
      if (all.length <= pcs.length) return [];
      return all.slice(pcs.length);
    }

    function parsePositionBlocks(item) {
      const desc = String(item && item.description || '').replace(/\\r\\n/g, '\\n').trim();
      if (!desc) return [];
      const lines = desc.split('\\n').map(l => String(l || '').trim()).filter(Boolean);
      if (!lines.length) return [];
      const out = [];
      let cur = null;
      const flush = () => {
        if (!cur) return;
        const headerText = normalizeOneLine(cur.header || '');
        if (headerText) out.push({
          idx: cur.idx,
          header: cur.idx + ') ' + headerText,
          headerText,
          details: cur.details.slice(0, 20),
        });
        cur = null;
      };
      for (const ln of lines) {
        const m = /^\\s*(\\d{1,3})\\s*[).]\\s*(.+)\\s*$/.exec(ln);
        if (m) {
          flush();
          cur = { idx: String(m[1]), header: String(m[2] || '').trim(), details: [] };
          continue;
        }
        if (!cur) continue;
        const trimmed = normalizeOneLine(ln.replace(/^\\s{1,6}/, ''));
        if (!trimmed) continue;
        if (isProductionDetailLine(trimmed)) cur.details.push(trimmed);
        else cur.header = (cur.header ? (cur.header + ' ' + trimmed) : trimmed).trim();
      }
      flush();
      return out.slice(0, 20);
    }

    function getPrimaryIssBlock(item) {
      const blocks = parsePositionBlocks(item);
      return blocks.find(b => /sp-b\\s*35/i.test(String(b && b.headerText || ''))) || null;
    }

    function parseIssHeaderMeta(headerText) {
      const raw = normalizeOneLine(headerText);
      if (!raw) return null;
      const body = raw.replace(/^Insektenschutz\\s*[–-]\\s*/i, '').trim();
      const segs = body.split(',').map(s => normalizeOneLine(s)).filter(Boolean);
      if (!segs.length) return null;
      const model = segs[0] || '';
      const subtype = segs[1] || '';
      const dims = segs.find(s => /\\d{2,4}\\s*x\\s*\\d{2,4}\\s*mm/i.test(s)) || '';
      const color = (segs.find(s => /^Farbe:/i.test(s)) || '').replace(/^Farbe:\\s*/i, '').trim();
      const mesh = (segs.find(s => /^Gaze:/i.test(s)) || '').replace(/^Gaze:\\s*/i, '').trim();
      const position = segs.find(s => /innenliegend|außenliegend|aussenliegend/i.test(s)) || '';
      const hook = segs.find(s => /^Hakenmaß X:/i.test(s)) || '';
      return { model, subtype, dims, color, mesh, position, hook, body };
    }

    function parseMmPair(text) {
      const m = /(\\d{2,5})\\s*x\\s*(\\d{2,5})\\s*mm/i.exec(String(text || ''));
      if (!m) return null;
      return {
        width: Number(m[1]),
        height: Number(m[2]),
      };
    }

    function parseSpB35FrameCutValues(text) {
      const m = /2\\s*x\\s*(\\d{2,5})\\s*mm\\s*x\\s*2\\s*x\\s*(\\d{2,5})\\s*mm/i.exec(String(text || ''));
      if (!m) return null;
      return {
        widthCut: Number(m[1]),
        heightCut: Number(m[2]),
      };
    }

    function parseFertigmaßLine(detailsLines) {
      const lines = Array.isArray(detailsLines) ? detailsLines : [];
      const line = lines.find(l => /^Fertigmaß:\s*\d/i.test(String(l || '').trim()));
      if (!line) return null;
      const raw = String(line).replace(/^Fertigmaß:\s*/i, '').trim();
      return parseMmPair(raw);
    }

    function buildSpB35SawDisplay(meta, frameLine, blockDetails) {
      const fertig = parseFertigmaßLine(blockDetails);
      const dims = fertig || parseMmPair(meta && meta.dims);
      const cuts = parseSpB35FrameCutValues(frameLine);
      const formatMachineMm = (value) => Number.isFinite(value) ? (String(value).replace('.', ',') + ',0 mm') : '';
      const lines = [
        'Modus: OP',
        'Nummer: 1',
        'Parameter: 70 mm (Abzug)',
        'Schwenken: 44°',
      ];
      if (cuts && Number.isFinite(cuts.widthCut)) {
        lines.push(
          'Sollwert Breite: ' +
          formatMachineMm(cuts.widthCut) +
          (dims && Number.isFinite(dims.width) ? (' (Elementbreite ' + formatMachineMm(dims.width) + ')') : '')
        );
      }
      if (cuts && Number.isFinite(cuts.heightCut)) {
        lines.push(
          'Sollwert Höhe: ' +
          formatMachineMm(cuts.heightCut) +
          (dims && Number.isFinite(dims.height) ? (' (Elementhöhe ' + formatMachineMm(dims.height) + ')') : '')
        );
      }
      if (!cuts) lines.push('Sollwert: Außenkante laut Schnittmaß SP-B 35 einstellen');
      lines.push('Istwert: zeigt den kürzeren Teil des gesägten Stücks an');
      lines.push('Stück: ignorieren');
      return lines.join('\\n');
    }

    function parseSpB35StabiLine(text) {
      const m = /Stabilisierungsprofil \(Profilsäge\):\s*1\s*x\s*(\d{2,5})\s*mm,\s*Einklebepunkt\s*(\d{2,5})\s*mm\s*vom\s*Innenrand/i.exec(String(text || ''));
      if (!m) return null;
      return {
        cutMm: Number(m[1]),
        centerFromInnerEdgeMm: Number(m[2]),
      };
    }

    function buildSpB35StabiDisplay(stabiLine) {
      const stabi = parseSpB35StabiLine(stabiLine);
      if (!stabi) return 'Sollwert: laut Stabilisierungsprofil-Zuschnitt einstellen';
      const formatMachineMm = (value) => Number.isFinite(value) ? (String(value).replace('.', ',') + ',0 mm') : '';
      return [
        'Sollwert: ' + formatMachineMm(stabi.cutMm),
        'Stückzahl: 1',
        'Einklebepunkt: ' + formatMachineMm(stabi.centerFromInnerEdgeMm) + ' vom Innenrand markieren',
        'Danach Profil mittig zur Markierung bereitlegen',
      ].join('\\n');
    }

    function parseSpB35SlideLine(text) {
      const raw = String(text || '').trim();
      if (!raw) return null;
      const base = /^Schlitten auf (.+?) jeweils (\d+)/i.exec(raw);
      if (!base) return null;
      const extra = /plus jeweils (\d+) Schlitten für jeweils (\d+) Grifflasche/i.exec(raw);
      return {
        sideLabel: String(base[1] || '').trim(),
        slidesPerSide: Number(base[2]),
        extraSlidesPerGrip: extra ? Number(extra[1]) : 0,
        gripsPerSide: extra ? Number(extra[2]) : 0,
      };
    }

    function buildSpB35SlideGuide(meta, slideLine, blockDetails) {
      const fertig = parseFertigmaßLine(blockDetails);
      const dims = fertig || parseMmPair(meta && meta.dims);
      const slide = parseSpB35SlideLine(slideLine);
      const lines = [];
      if (slide && Number.isFinite(slide.slidesPerSide)) {
        lines.push('Je Seite ' + String(slide.slidesPerSide) + ' Schlitten auf der ' + slide.sideLabel + ' vormontieren');
        if (slide.extraSlidesPerGrip > 0) {
          lines.push('Je Grifflasche ' + String(slide.extraSlidesPerGrip) + ' zusätzlichen Schlitten vorsehen');
        }
      } else {
        lines.push('Schlitten laut Arbeitsanweisung bereitlegen und nach Seite sortieren');
      }
      if (dims && Number.isFinite(dims.height)) {
        if (dims.height < 1000) lines.push('Griffleiste in der Höhe mittig positionieren');
        else lines.push('Griffleiste auf etwa 2/5 von unten positionieren');
        if (dims.height >= 1300) {
          lines.push('Mittige Arretierung prüfen und bei Bedarf Platte für Mittelarretierung bereitlegen');
        }
      }
      return lines.join('\\n');
    }

    function parseSpB35BrushLine(text) {
      const raw = String(text || '').trim();
      if (!raw) return null;
      const m = /^Bürste\s+(.+?)(?:,\s*(\d{1,2})\s*mm)?$/i.exec(raw);
      if (!m) return null;
      return {
        position: String(m[1] || '').trim(),
        lengthMm: m[2] ? Number(m[2]) : null,
      };
    }

    function buildSpB35BrushGuide(brushLine) {
      const brush = parseSpB35BrushLine(brushLine);
      if (!brush) return 'Bürste passend zum Auftrag bereitlegen und Lage vor dem Einziehen prüfen';
      const lines = [];
      if (brush.position) lines.push('Lage: ' + brush.position);
      if (Number.isFinite(brush.lengthMm)) lines.push('Bürstenlänge: ' + String(brush.lengthMm) + ' mm');
      else if (/zum Fenster/i.test(brush.position)) lines.push('Standardausführung für SP-B 35 verwenden');
      lines.push('Bürste vor dem Einziehen an allen Profilseiten auf gleiche Lage prüfen');
      lines.push('Nach dem Einziehen auf sauberen Sitz ohne Verdrehung kontrollieren');
      return lines.join('\\n');
    }

    function buildLabelSummary(item) {
      const iss = getPrimaryIssBlock(item);
      if (iss) {
        const meta = parseIssHeaderMeta(iss.headerText);
        if (meta) {
          const fertigLine = (Array.isArray(iss.details) ? iss.details : []).find(l => /^Fertigmaß:\s*\d/i.test(String(l || '').trim()));
          const fertigDims = fertigLine ? String(fertigLine).replace(/^Fertigmaß:\s*/i, '').trim() : '';
          return {
            l1: [meta.model, meta.subtype].filter(Boolean).join(' '),
            l2: fertigDims || meta.dims || '',
            l3: [meta.color, meta.mesh].filter(Boolean).join(' • '),
            l4: '',
          };
        }
      }
      return null;
    }

    function buildIssWorkSteps(item) {
      const block = getPrimaryIssBlock(item);
      if (!block) return [];
      const meta = parseIssHeaderMeta(block.headerText) || {};
      const color = meta.color || 'passender Farbe';
      const frameLine = block.details.find(l => /^Schnittmaß SP-B 35/i.test(l)) || '';
      const stabiLine = block.details.find(l => /^Stabilisierungsprofil \\(Profilsäge\\)/i.test(l)) || '';
      const slideLine = block.details.find(l => /^Schlitten auf /i.test(l)) || '';
      const brushLine = block.details.find(l => /^Bürste\\b/i.test(l)) || '';
      const frameSawDisplay = buildSpB35SawDisplay(meta, frameLine, block.details);
      const stabiSawDisplay = buildSpB35StabiDisplay(stabiLine);
      const slideGuide = buildSpB35SlideGuide(meta, slideLine, block.details);
      const brushGuide = buildSpB35BrushGuide(brushLine);
      const steps = [];
      if (frameLine) {
        steps.push({
          title: 'Rahmenprofil sägen',
          material: '1 Stab (6 m) SP-B 35 in ' + color + ' holen und auf die Gehrungssäge legen.',
          machine: 'Gehrungssäge',
          machineSetup: frameSawDisplay,
          setting: frameLine,
          result: 'Du hast jetzt die 4 Außenteile des Spannrahmens. Als Nächstes kommt das Stabilisierungsprofil dran.',
          visual: 'Bildbereich: Gehrungssäge / Display mit OP, 1, 70, 44 / Profil auflegen / Anschlag prüfen',
        });
      }
      if (stabiLine) {
        steps.push({
          title: 'Stabilisierungsprofil sägen',
          material: '1 Stabilisierungsprofil und 2 Verbinder bereitlegen. Das Profil auf die Profilsäge legen.',
          machine: 'Profilsäge',
          machineSetup: stabiSawDisplay,
          setting: stabiLine,
          result: 'Stabilisierungsprofil zugeschnitten. Der Einklebepunkt ist markiert und das Teil ist für den Einbau vorbereitet.',
          visual: 'Bildbereich: Profilsäge / Stabiprofil / Maßband am Innenrand / Markierung Einklebepunkt',
        });
      }
      if (slideLine) {
        steps.push({
          title: 'Schlitten und Griffleisten vorbereiten',
          material: 'Schlitten 1 mm, Griffleiste(n) und bei Bedarf Material für die Mittelarretierung bereitlegen.',
          machine: 'Montageplatz',
          machineSetupTitle: 'Montagehinweise',
          machineSetup: slideGuide,
          setting: slideLine,
          result: 'Schlitten sitzen auf der richtigen Seite und die Position der Griffleiste ist festgelegt.',
          visual: 'Bildbereich: Schlitten / Griffleiste / Hakenseite / Position mittig oder 2/5 von unten',
        });
      }
      if (brushLine) {
        steps.push({
          title: 'Bürste vorbereiten',
          material: 'Passende Bürste in der gewählten Länge bereitlegen und die Einbaulage am Profil prüfen.',
          machine: 'Montageplatz',
          machineSetupTitle: 'Montagehinweise',
          machineSetup: brushGuide,
          setting: brushLine,
          result: 'Bürste ist in der richtigen Lage vorbereitet und kann ohne Verdrehung eingezogen werden.',
          visual: 'Bildbereich: Bürstenlage zum Fenster oder nach unten / Profilquerschnitt / Sitzkontrolle',
        });
      }
      return steps;
    }

    function getPartDoneInfo(item, partLabel) {
      const map = item && item.partStates && typeof item.partStates === 'object' ? item.partStates : null;
      if (!map) return null;
      const key = normalizeOneLine(partLabel).slice(0, 280);
      if (!key) return null;
      const st = map[key];
      return st && st.done ? st.done : null;
    }

    async function postJson(url, body, { timeoutMs = 12000 } = {}) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const headers = { 'Content-Type': 'application/json' };
        const ak = String(state.adminKey || '').trim();
        if (ak) headers['x-admin-key'] = ak;
        const res = await fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers,
          body: JSON.stringify(body || {}),
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => null);
        return { ok: res.ok && data && data.ok !== false, status: res.status, data };
      } finally {
        clearTimeout(timer);
      }
    }

    async function postJsonWithRetry(url, body, { retries = 1, delayMs = 350 } = {}) {
      let attempt = 0;
      while (true) {
        try {
          const out = await postJson(url, body);
          const err = out && out.data && out.data.error ? String(out.data.error) : '';
          const transient = err === 'ratelimited' || err === 'internal_error' || err === 'fatal_error';
          if (out.ok) return out;
          if (!transient || attempt >= retries) return out;
        } catch (e) {
          if (attempt >= retries) throw e;
        }
        attempt += 1;
        await new Promise(r => setTimeout(r, delayMs * attempt));
      }
    }

    function card(item) {
      const scanUrl = getDisplayBaseUrlForQr() + '?code=' + encodeURIComponent(item.qrText);
      const qrUrl = '/api/qr?text=' + encodeURIComponent(scanUrl);
      const copyBtn = el('button', { class: 'copy-btn', type: 'button' }, [text('Scan')]);
      copyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setScanValue(item.qrText || '');
        showToast('Code übernommen');
      });
      const materialBtn = el('button', { class: 'copy-btn', type: 'button' }, [text('Material')]);
      materialBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openMaterialConfirm(item, '');
      });
      const noteBtn = el('button', { class: 'copy-btn', type: 'button' }, [text('Notiz')]);
      noteBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const current = item && item.note && item.note.text ? String(item.note.text) : '';
        const next = window.prompt('Notiz (max 200 Zeichen)', current);
        if (next == null) return;
        const cleaned = String(next || '').slice(0, 200);
        showToast('Notiz speichern…');
        const out = await postJsonWithRetry('/api/production/note', { itemId: item.id, note: cleaned, actor: state.actor || '', station: state.station || '' }, { retries: 0 });
        if (out.ok && out.data && out.data.ok) {
          const stored = (out.data && typeof out.data.note === 'string') ? out.data.note : cleaned;
          const data = state.last;
          const updated = findItemByIdFromData(data, item.id);
          if (updated) {
            if (stored) updated.note = { text: stored, ts: new Date().toISOString(), actor: state.actor || '', station: state.station || '' };
            else updated.note = null;
            render(data);
            highlightItem(item.id);
          }
          showToast(stored ? 'Notiz gespeichert' : 'Notiz gelöscht');
        } else {
          const err = out && out.data && out.data.error ? String(out.data.error) : 'fehlgeschlagen';
          showToast('Notiz: ' + err);
        }
      });
      const pcs = Array.isArray(item && item.panzerConfigs) ? item.panzerConfigs : [];
      const parts = parseParts(item);
      const positions = !pcs.length ? parsePositions(item) : [];
      const issBlock = !pcs.length ? getPrimaryIssBlock(item) : null;
      const issWorkPreview = issBlock ? issBlock.details.slice(0, 2) : [];
      const noteText = item && item.note && item.note.text ? String(item.note.text) : '';
      const isQuestion = !!(item && item.isQuestion);
      const itemUrl = findItemUrl(item);
      const linkBtn = itemUrl ? el('button', { class: 'copy-btn', type: 'button' }, [text('Link')]) : null;
      if (linkBtn) {
        linkBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          try { window.open(itemUrl, '_blank', 'noopener'); } catch (e2) { window.location.href = itemUrl; }
        });
      }
      const expected = isQuestion
        ? []
        : (pcs.length
        ? pcs.map((cfg, idx) => {
          const dims = (cfg && cfg.widthMm && cfg.heightMm) ? (cfg.widthMm + ' x ' + cfg.heightMm + ' mm') : '';
          const mat = cfg && cfg.material ? cfg.material : '';
          const prof = cfg && cfg.profileHeight ? (cfg.profileHeight + 'er') : '';
          const col = cfg && cfg.color ? cfg.color : '';
          return ['Panzer ' + (idx + 1) + ':', dims, mat, prof, col].filter(Boolean).join(' ');
        })
        : (positions.length ? positions : parts));
      const doneCount = expected.filter(l => !!getPartDoneInfo(item, l)).length;
      const partsSummary = expected.length > 1 ? ('Teile fertig: ' + String(doneCount) + '/' + String(expected.length)) : '';
      const isNonPanzerSingle = !isQuestion && !pcs.length && parts.length <= 1;
      const singlePartDone = isNonPanzerSingle && parts[0] ? !!getPartDoneInfo(item, parts[0]) : false;
      const isDone = String(item && item.status || '').toLowerCase().includes('fertig');
      const qWorkdays = isQuestion ? workdaysUntilDateIso(item && item.dueDate) : null;
      const qUrgent = isQuestion && (qWorkdays != null) && (qWorkdays < 0 || qWorkdays <= 3);
      const doneBtn = el('button', { class: 'copy-btn', type: 'button' }, [text('Fertig')]);
      doneBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openConfirm({ code: item.qrText, stage: 2, itemId: item.id, item, part: parts[0] || '', partial: false });
      });
      const openMat = Array.isArray(item.openMaterial) ? item.openMaterial : [];
      const showMatHint = openMat.length && (item.status === 'offen' || item.status === 'bestellt' || item.status === 'angenommen' || item.status === 'in_bearbeitung');
      const matLabel = showMatHint
        ? ('Material offen: ' + openMat[0] + (openMat.length > 1 ? (' +' + (openMat.length - 1)) : ''))
        : '';
      const lp = item && item.localProgress ? item.localProgress : null;
      const lpLabel = lp && lp.label
        ? (String(lp.label) + (lp.actor ? (' (' + String(lp.actor) + ')') : '') + (lp.station ? (' @ ' + String(lp.station)) : ''))
        : '';
      const montageShown = item.montageDate || item.dueDate || '';

      const showSubtasks = !isQuestion && expected.length > 1 && expected.length <= 12;
      const subtasks = showSubtasks ? (() => {
        const box = el('div', { class: 'card-subtasks' }, []);
        box.appendChild(el('div', { class: 'card-subtasks-title' }, [text('Teilaufgaben')]));
        expected.forEach(l => {
          const done = getPartDoneInfo(item, l);
          const shown = done ? (l + ' • ' + String(done.label || 'Fertig')) : l;
          box.appendChild(el('div', { class: 'card-subtask' + (done ? ' done' : '') }, [text(shown)]));
        });
        return box;
      })() : null;

      const hasOpenMat = item && Array.isArray(item.openMaterial) && item.openMaterial.length > 0;
      const hasMatNeeds = item && Array.isArray(item.materialNeeds) && item.materialNeeds.length > 0;
      const isMatOrdered = String(item.status || '') === 'bestellt';
      const matViewed = isMatViewed(item && item.id);
      const isMatCheck = !item.emergency && !hasOpenMat && !isMatOrdered && hasMatNeeds && !matViewed;
      const missingBadgeLabel = hasOpenMat
        ? ('Material fehlt' + (item.openMaterial.length > 1 ? (' ' + String(item.openMaterial.length) + 'x') : ''))
        : '';

      const header = el('div', { class: 'card-header' }, [
        el('div', { class: 'card-title' }, [text(formatTitle(item))]),
        el('div', { class: 'card-badges' }, [
          item.emergency ? badge('NOTFALL', 'b-emergency') : el('span'),
          hasOpenMat ? badge(missingBadgeLabel, 'b-mat-missing') : el('span'),
          isMatOrdered ? badge('Material bestellt', 'b-mat-ordered') : el('span'),
          isMatCheck ? badge('Material prüfen', 'b-mat-check') : el('span'),
          matViewed && !hasOpenMat && !isMatOrdered && hasMatNeeds ? badge('Material geprüft', 'b-mat-viewed') : el('span'),
          badge(item.origin || '-', item.origin === 'ReWo' ? 'b-rewo' : ''),
          isQuestion ? badge('Offene Frage' + (item.questionTo ? (' → ' + item.questionTo) : ''), 'b-q') : el('span'),
          badge(formatStatus(item), 'b-status'),
          lpLabel ? badge(lpLabel, 'b-local') : el('span'),
          showMatHint ? badge(matLabel, 'b-mat') : el('span'),
          item.dueDate ? badge('Fällig ' + formatDateShort(item.dueDate), 'b-date') : el('span'),
          montageShown ? badge('Montage ' + formatDateShort(montageShown), 'b-date') : el('span'),
          item.urgent ? badge('Eilig', 'b-urgent') : el('span'),
          copyBtn
          ,materialBtn, noteBtn, (linkBtn || el('span')),
          (isNonPanzerSingle && !isDone && !singlePartDone) ? doneBtn : el('span')
        ])
      ]);

      const cut = item.cutInfo ? el('div', { class: 'card-cut' }, [text(item.cutInfo)]) : null;
      const body = el('div', { class: 'card-body' }, [
        el('div', { class: 'card-desc' }, [
          el('div', { class: 'card-id' }, [text(item.id)]),
          issBlock
            ? el('div', { class: 'card-group' }, [
              el('div', { class: 'card-group-title' }, [text('Produkt')]),
              el('div', { class: 'card-group-text' }, [text(issBlock.headerText)]),
            ])
            : el('div', null, [text(item.description || '')]),
          issBlock && issWorkPreview.length
            ? el('div', { class: 'card-group' }, [
              el('div', { class: 'card-group-title' }, [text('Arbeit')]),
              el('div', { class: 'card-group-text' }, [text(issWorkPreview.join('\\n'))]),
              issBlock.details.length > issWorkPreview.length
                ? el('div', { class: 'card-note' }, [text('+' + String(issBlock.details.length - issWorkPreview.length) + ' weitere Schritte in der Detailansicht')])
                : el('span'),
            ])
            : el('span'),
          cut ? cut : el('span'),
          subtasks ? subtasks : el('span'),
          partsSummary ? el('div', { class: 'card-note' }, [text(partsSummary)]) : el('span'),
          noteText ? el('div', { class: 'card-note' }, [text('Notiz: ' + noteText)]) : el('span')
        ]),
        el('img', { class: 'qr', src: qrUrl, alt: 'QR' })
      ]);

      const selected = state.detailsItemId && String(item.id) === String(state.detailsItemId);
      const isReWo = item && item.origin === 'ReWo';
      const rootCls =
        'card' +
        (item.emergency ? ' emergency' : '') +
        (hasOpenMat ? ' material-missing' : '') +
        (isMatOrdered ? ' material-ordered' : '') +
        (isMatCheck ? ' material-check' : '') +
        (isQuestion ? ' question' : (isReWo ? ' rewo' : ' nonrewo')) +
        (item.urgent ? ' urgent' : '') +
        (qUrgent ? ' q-urgent' : '') +
        (selected ? ' selected' : '');
      const root = el('div', { class: rootCls, 'data-item-id': item.id }, [header, body]);
      root.addEventListener('click', (e) => {
        const t = e.target;
        if (t && (t.closest && t.closest('button'))) return;
        openDetails(item);
      });
      return root;
    }

    function column(title, items) {
      const filtered = applyFilter(items);
      return el('div', { class: 'col' }, [
        el('div', { class: 'col-title' }, [
          el('span', { class: 'col-title-text' }, [text(title)]),
          el('span', { class: 'col-count' }, [text(String((filtered || []).length))])
        ]),
        el('div', { class: 'col-items' }, filtered.map(card))
      ]);
    }

    function showToast(message) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      toast.textContent = message;
      toast.classList.add('show');
      if (state.toastTimeout) clearTimeout(state.toastTimeout);
      state.toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
    }

    function highlightItem(itemId) {
      const selector = '[data-item-id="' + String(itemId) + '"]';
      const node = document.querySelector(selector);
      if (!node) return;
      node.classList.add('flash');
      try { node.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
      setTimeout(() => node.classList.remove('flash'), 1600);
    }

    function findItemByIdFromData(data, itemId) {
      const id = String(itemId || '').trim();
      if (!id) return null;
      const b = data && data.buckets ? data.buckets : null;
      const all = b ? []
        .concat(b.today || [])
        .concat(b.tomorrow || [])
        .concat(b.later || [])
        .concat((data && data.questions) || [])
        : [];
      return all.find(x => x && String(x.id) === id) || null;
    }

    function patchSingleCard(itemId) {
      const id = String(itemId || '').trim();
      if (!id) return false;
      const data = state.last;
      const item = data ? findItemByIdFromData(data, id) : null;
      if (!item) return false;
      const sel = document.querySelector('.card[data-item-id="' + CSS.escape(id) + '"]');
      if (!sel) return false;
      try {
        const fresh = card(item);
        if (!fresh) return false;
        fresh.setAttribute('data-item-id', id);
        sel.parentNode.replaceChild(fresh, sel);
        return true;
      } catch (e) { return false; }
    }

    function patchAllCardsMaterialStatus() {
      try {
        const cards = document.querySelectorAll('.card[data-item-id]');
        if (!cards || !cards.length) return false;
        let changed = false;
        cards.forEach((cardEl) => {
          const id = cardEl.getAttribute ? String(cardEl.getAttribute('data-item-id') || '') : '';
          if (!id) return;
          const item = state.last ? findItemByIdFromData(state.last, id) : null;
          if (!item) return;
          try {
            const fresh = card(item);
            if (!fresh) return;
            fresh.setAttribute('data-item-id', id);
            cardEl.parentNode.replaceChild(fresh, cardEl);
            changed = true;
          } catch (e) {}
        });
        return changed;
      } catch (e) { return false; }
    }

    function resolveItemFromCode(code) {
      const m = String(code || '').trim().match(/^rwjob:(Rec[0-9A-Za-z]+)$/);
      if (!m) return null;
      const id = m[1];
      const item = findItemByIdFromData(state.last, id);
      return { id, item };
    }

    function inferQcEligible(item, part) {
      const pcs = Array.isArray(item && item.panzerConfigs) ? item.panzerConfigs : [];
      if (pcs.length) return true;
      const hay = [
        item && item.title ? String(item.title) : '',
        item && item.description ? String(item.description) : '',
        part ? String(part) : '',
      ].join(' ').toLowerCase();
      if (!hay.trim()) return false;
      if (hay.includes('vorsatz')) return true;
      if (/\\bvsk\\b/.test(hay)) return true;
      if (/\\bvse\\b/.test(hay)) return true;
      return false;
    }

    function qcStateFromPending(pending) {
      const stage = Number(pending && pending.stage || 0);
      const partial = !!(pending && pending.partial);
      const origin = pending && pending.origin ? String(pending.origin) : '';
      const isReWo = origin === 'ReWo';
      const eligible = !!(pending && pending.qcEligible);
      const required = eligible && !partial && stage === 2 && !isReWo;
      return { required };
    }

    function readQcChecks() {
      const a = document.getElementById('qcMaterial');
      const b = document.getElementById('qcProfil');
      const c = document.getElementById('qcFarbe');
      const d = document.getElementById('qcMasse');
      return {
        material: !!(a && a.checked),
        profil: !!(b && b.checked),
        farbe: !!(c && c.checked),
        masse: !!(d && d.checked),
      };
    }

    function setQcUiFromPending(pending) {
      const wrap = document.getElementById('qcWrap');
      const yesBtn = document.getElementById('confirmYes');
      if (!wrap || !yesBtn) return;
      const qc = qcStateFromPending(pending);
      wrap.style.display = qc.required ? 'block' : 'none';

      const a = document.getElementById('qcMaterial');
      const b = document.getElementById('qcProfil');
      const c = document.getElementById('qcFarbe');
      const d = document.getElementById('qcMasse');
      if (a) a.checked = false;
      if (b) b.checked = false;
      if (c) c.checked = false;
      if (d) d.checked = false;

      if (!qc.required) {
        yesBtn.disabled = false;
        return;
      }
      const checks = readQcChecks();
      yesBtn.disabled = !(checks.material && checks.profil && checks.farbe && checks.masse);
    }

    function updateConfirmYesEnabled() {
      const yesBtn = document.getElementById('confirmYes');
      if (!yesBtn) return;
      const pending = state.pending;
      const qc = qcStateFromPending(pending);
      if (!qc.required) {
        yesBtn.disabled = false;
        return;
      }
      const checks = readQcChecks();
      yesBtn.disabled = !(checks.material && checks.profil && checks.farbe && checks.masse);
    }

    function openConfirm({ code, stage, itemId, item, part, partial }) {
      state.pending = { code, stage, itemId, part: part || '', partial: partial === true, origin: item && item.origin ? String(item.origin) : '', qcEligible: inferQcEligible(item, part) };
      const modal = document.getElementById('confirm');
      const title = document.getElementById('confirmTitle');
      const details = document.getElementById('confirmDetails');
      const isReWo = !!(item && item.origin === 'ReWo');
      const stageLabel = (partial === true)
        ? (stage === 1 ? 'Säge (Teil → In Bearbeitung)' : stage === 2 ? 'Fertig (Teil → bleibt In Bearbeitung)' : 'Kurier (Teil → bleibt In Bearbeitung)')
        : (stage === 1 ? 'Säge (Gesägt)' : stage === 2 ? (isReWo ? 'Arretieren (Arretiert)' : 'Fertig (Fertig)') : 'Kurier (Fertig)');

      title.textContent = 'Scan bestätigen';
      const lines = [];
      lines.push('Aktion: ' + stageLabel);
      lines.push('ID: ' + itemId);
      if (state.actor) lines.push('Mitarbeiter: ' + operatorCode(state.actor));
      if (part) lines.push('Teil: ' + part);
      if (item) {
        lines.push('Aufgabe: ' + (item.title || ''));
        if (item.origin) lines.push('Herkunft: ' + item.origin);
        if (item.dueDate) lines.push('Fällig: ' + item.dueDate);
        if (item.montageDate) lines.push('Montage: ' + item.montageDate);
        if (item.description) lines.push('Details: ' + item.description);
      } else {
        lines.push('Hinweis: Auftrag ist nicht im aktuellen Board geladen.');
      }
      details.textContent = lines.join('\\n');
      setQcUiFromPending(state.pending);
      modal.classList.add('open');
      document.body.classList.add('modal-open');
      const qc = qcStateFromPending(state.pending);
      if (qc.required) {
        try { document.getElementById('qcMaterial').focus(); } catch (e) {}
      } else {
        document.getElementById('confirmYes').focus();
      }
    }

    function buildMaterialText(item, part) {
      const lines = [];
      lines.push('Auftrag: ' + (item.title || ''));
      lines.push('ID: ' + (item.id || ''));
      if (item.origin) lines.push('Herkunft: ' + item.origin);
      if (item.dueDate) lines.push('Fällig: ' + item.dueDate);
      if (item.montageDate) lines.push('Montage: ' + item.montageDate);
      if (item.endleiste) {
        const c = item.endleiste.color ? String(item.endleiste.color) : '';
        const d = item.endleiste.drilled === true ? 'ja' : item.endleiste.drilled === false ? 'nein' : (item.endleiste.drilled ? String(item.endleiste.drilled) : '');
        const segs = [];
        if (c) segs.push('Farbe ' + c);
        if (d) segs.push('gebohrt ' + d);
        if (segs.length) lines.push('Endleiste: ' + segs.join(', '));
      }
      if (item.vorsatz && item.vorsatz.enabled) {
        const v = item.vorsatz;
        const vsegs = [];
        if (v.colorLabel) vsegs.push('Farbe ' + String(v.colorLabel));
        if (v.dimensions) vsegs.push(String(v.dimensions));
        if (v.rails === true) vsegs.push('Schienen ja');
        else if (v.rails === false) vsegs.push('Schienen nein');
        if (v.rolloColorLabel) vsegs.push('Rollladenfarbe ' + String(v.rolloColorLabel));
        if (v.rolloProfileLabel) vsegs.push('Rollladenprofil ' + String(v.rolloProfileLabel));
        if (vsegs.length) lines.push('Vorsatzelement: ' + vsegs.join(', '));
      }
      if (item.vorsatzElement && item.vorsatzElement.enabled) {
        const ve = item.vorsatzElement;
        if (ve.boxLine) lines.push('Vorsatz-Kasten: ' + String(ve.boxLine));
        if (ve.controlLine) lines.push('Vorsatz-Bedienung: ' + String(ve.controlLine));
        if (ve.panzerLine) lines.push('Vorsatz-Panzer: ' + String(ve.panzerLine));
      }
      if (item.vorsatzBoxOnly && item.vorsatzBoxOnly.enabled) {
        const vb = item.vorsatzBoxOnly;
        if (vb.boxLine) lines.push('Vorsatzkasten: ' + String(vb.boxLine));
        if (vb.controlLine) lines.push('Vorsatzkasten-Bedienung: ' + String(vb.controlLine));
      }
      if (part) lines.push('Position: ' + part);
      lines.push('');
      lines.push('Material / Profil / Farbe:');
      if (part) {
        const only = normalizeOneLine(part);
        lines.push('- ' + (mapMaterialText(only) || only));
      } else {
        const pcs = Array.isArray(item.panzerConfigs) ? item.panzerConfigs : [];
        if (pcs.length) {
          pcs.forEach(cfg => {
            const c = cfg && cfg.count ? cfg.count : 1;
            const mat = cfg && cfg.material ? cfg.material : '';
            const prof = cfg && cfg.profileHeight ? (cfg.profileHeight + 'er') : '';
            const col = cfg && cfg.color ? cfg.color : '';
            const dims = (cfg && cfg.widthMm && cfg.heightMm) ? (cfg.widthMm + ' x ' + cfg.heightMm + ' mm') : '';
            const parts = [String(c) + 'x', mat, prof, col, dims].filter(Boolean);
            lines.push('- ' + parts.join(' '));
          });
        } else if (item.panzerSummary) {
          lines.push('- ' + String(item.panzerSummary));
        } else {
          lines.push('- (keine Panzer-Infos erkannt)');
        }
      }
      if (!part) {
        lines.push('');
        lines.push('Details:');
        if (item.description) lines.push(String(item.description));
        if (item.cutInfo) lines.push('\\nSchnitt: \\n' + String(item.cutInfo));
      }
      return lines.join('\\n');
    }

    async function sendMaterialToSlack(item, part, partMaterial) {
      showToast('Material wird angelegt…');
      try {
        const scopedByPart = !!String(part || '').trim();
        const out = await postJsonWithRetry('/api/production/material', {
          itemId: item.id,
          title: item.title,
          part: part || '',
          partMaterial: partMaterial || part || '',
          panzerConfigs: scopedByPart ? [] : (Array.isArray(item.panzerConfigs) ? item.panzerConfigs : []),
          dueDate: item.dueDate || '',
          montageDate: item.montageDate || '',
        }, { retries: 1 });
        if (out.ok && out.data && out.data.ok) {
          const n = typeof out.data.created === 'number' ? out.data.created : null;
          showToast(n != null ? ('Material-Bestellung aufgegeben (' + n + ')') : 'Material-Bestellung aufgegeben');
        } else {
          const err = out && out.data && out.data.error ? String(out.data.error) : 'fehlgeschlagen';
          const needed = out && out.data && out.data.details && out.data.details.needed ? (' (needed: ' + out.data.details.needed + ')') : '';
          showToast('Material: ' + err + needed);
          try { console.error('Material error', out); } catch (e) {}
        }
      } catch (e) {
        showToast('Material: Verbindung fehlgeschlagen');
      }
    }

    function openMaterialConfirm(item, part) {
      state.pending = { type: 'material', item, part: part || '' };
      const modal = document.getElementById('material');
      const title = document.getElementById('materialTitle');
      const details = document.getElementById('materialDetails');
      const input = document.getElementById('materialInput');
      const body = buildMaterialText(item, part);
      title.textContent = 'Material bestellen';
      details.textContent = body;
      if (input) input.value = guessMaterialLines(item, part);
      modal.classList.add('open');
      document.body.classList.add('modal-open');
      document.getElementById('materialYes').focus();
    }

    function closeMaterialConfirm() {
      const modal = document.getElementById('material');
      modal.classList.remove('open');
      state.pending = null;
      if (
        !(document.getElementById('confirm') && document.getElementById('confirm').classList.contains('open')) &&
        !(document.getElementById('scanPick') && document.getElementById('scanPick').classList.contains('open')) &&
        !(document.getElementById('details') && document.getElementById('details').classList.contains('open')) &&
        !(document.getElementById('edit') && document.getElementById('edit').classList.contains('open'))
      ) {
        document.body.classList.remove('modal-open');
      }
    }

    function closeConfirm() {
      const modal = document.getElementById('confirm');
      modal.classList.remove('open');
      state.pending = null;
      if (
        !(document.getElementById('material') && document.getElementById('material').classList.contains('open')) &&
        !(document.getElementById('scanPick') && document.getElementById('scanPick').classList.contains('open')) &&
        !(document.getElementById('details') && document.getElementById('details').classList.contains('open')) &&
        !(document.getElementById('edit') && document.getElementById('edit').classList.contains('open'))
      ) {
        document.body.classList.remove('modal-open');
      }
    }

    function openEdit(item) {
      if (!item) return;
      if (!state.adminKey) {
        try { state.adminKey = String(localStorage.getItem('adminKey') || '').trim(); } catch (e) {}
      }
      if (!String(state.adminKey || '').trim()) {
        showToast('Admin-Key fehlt (oben eintragen)');
        try { document.getElementById('adminKey').focus(); } catch (e) {}
        return;
      }

      const modal = document.getElementById('edit');
      const t = document.getElementById('editTitleInput');
      const d = document.getElementById('editDescInput');
      const p = document.getElementById('editCutPreview');
      if (!modal || !t || !d) return;
      state.pending = { type: 'edit', itemId: item.id };
      t.value = String(item.title || '');
      d.value = String(item.description || '');
      if (p) p.textContent = item.cutInfo ? String(item.cutInfo) : '';
      modal.classList.add('open');
      document.body.classList.add('modal-open');
      try { t.focus(); t.select(); } catch (e) {}
    }

    function closeEdit() {
      const modal = document.getElementById('edit');
      if (modal) modal.classList.remove('open');
      if (state.pending && state.pending.type === 'edit') state.pending = null;
      try {
        const p = document.getElementById('editCutPreview');
        if (p) p.textContent = '';
      } catch (e) {}
      if (
        !(document.getElementById('material') && document.getElementById('material').classList.contains('open')) &&
        !(document.getElementById('scanPick') && document.getElementById('scanPick').classList.contains('open')) &&
        !(document.getElementById('confirm') && document.getElementById('confirm').classList.contains('open')) &&
        !(document.getElementById('details') && document.getElementById('details').classList.contains('open'))
      ) {
        document.body.classList.remove('modal-open');
      }
    }

    function openScanPick(code) {
      const modal = document.getElementById('scanPick');
      const details = document.getElementById('scanPickDetails');
      const btn2 = document.getElementById('scanPick2');
      if (!modal || !details || !btn2) return;

      const resolved = resolveItemFromCode(code);
      const item = resolved ? resolved.item : null;
      const action2 = item && item.origin === 'ReWo' ? 'Arretieren' : 'Fertig';
      btn2.textContent = action2;

      const lines = [];
      lines.push('Code: ' + String(code));
      if (item) {
        lines.push('Auftrag: ' + (item.title || item.id));
        if (item.origin) lines.push('Herkunft: ' + item.origin);
        if (item.dueDate) lines.push('Fällig: ' + item.dueDate);
        if (item.montageDate) lines.push('Montage: ' + item.montageDate);
      }
      details.textContent = lines.join('\\n');

      state.pending = { type: 'scanPick', code: String(code) };
      modal.classList.add('open');
      document.body.classList.add('modal-open');
      try { btn2.focus(); } catch (e) {}
    }

    function closeScanPick() {
      const modal = document.getElementById('scanPick');
      if (modal) modal.classList.remove('open');
      if (state.pending && state.pending.type === 'scanPick') state.pending = null;
      if (
        !(document.getElementById('material') && document.getElementById('material').classList.contains('open')) &&
        !(document.getElementById('confirm') && document.getElementById('confirm').classList.contains('open')) &&
        !(document.getElementById('details') && document.getElementById('details').classList.contains('open')) &&
        !(document.getElementById('edit') && document.getElementById('edit').classList.contains('open'))
      ) {
        document.body.classList.remove('modal-open');
      }
    }

    function openDetails(item) {
      state.detailsItem = item;
      state.detailsItemId = item && item.id ? String(item.id) : null;

      const pendingMark = item && item.id ? markMatViewed(item.id).then((justViewed) => {
        if (justViewed) patchSingleCard(item.id);
      }).catch(() => {}) : Promise.resolve();

      const modal = document.getElementById('details');
      const title = document.getElementById('detailsTitle');
      const body = document.getElementById('detailsBody');
      const btnLabel = document.getElementById('detailsLabel');
      const btnLabelSingle = document.getElementById('detailsLabelSingle');
      const btnLabelIphone = document.getElementById('detailsLabelIphone');
      const btnLabelPlain = document.getElementById('detailsLabelPlain');
      const btnIssWork = document.getElementById('detailsIssWork');
      const btnMontagebericht = document.getElementById('detailsMontagebericht');
      const btnEdit = document.getElementById('detailsEdit');
      const btnAnswer = document.getElementById('detailsAnswer');
      const btnLink = document.getElementById('detailsLink');
      const btnResetMatViewed = document.getElementById('detailsResetMatViewed');
      const btnUnmatViewed = document.getElementById('detailsUnmarkMatViewed');
      const detailsCardEl = modal ? modal.querySelector('.modal-card.details-card') : null;
      const isQuestion = !!(item && item.isQuestion);
      const thisIsViewed = !!(item && item.id && isMatViewed(item.id));
      if (detailsCardEl) {
        detailsCardEl.classList.toggle('emergency', !!(item && item.emergency));
        detailsCardEl.classList.toggle('q-urgent', !!(item && isQuestion));
      }
      if (btnUnmatViewed) {
        const hasMat = !!(item && Array.isArray(item.materialNeeds) && item.materialNeeds.length);
        btnUnmatViewed.classList.toggle('hidden', !(hasMat && thisIsViewed));
        btnUnmatViewed.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!item || !item.id) return;
          unmarkMatChecked(item.id).then((ok) => {
            showToast(ok ? 'Markierung "Material geprüft" für diesen Auftrag entfernt (Kachel wird wieder grün!)' : 'Markierung entfernt');
            patchSingleCard(item.id);
            if (btnUnmatViewed) {
              const hasMat = !!(Array.isArray(item.materialNeeds) && item.materialNeeds.length);
              btnUnmatViewed.classList.toggle('hidden', hasMat && !isMatViewed(item.id));
            }
          });
        };
      }
      if (btnResetMatViewed) {
        btnResetMatViewed.classList.toggle('hidden', !(item && Array.isArray(item.materialNeeds) && item.materialNeeds.length));
        btnResetMatViewed.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          resetMatViewedIds().then((ok) => {
            patchAllCardsMaterialStatus();
            showToast(ok ? 'Alle "Material geprüft" Markierungen wurden serverweit zurückgesetzt' : 'Markierungen zurückgesetzt');
          });
        };
      }
      const itemUrl = findItemUrl(item);
      const issBlock = getPrimaryIssBlock(item);
      const hasReparatur = !isQuestion && parsePositions(item).some(p => {
        const t = String(p || '').toLowerCase();
        return t.includes(') reparatur') || t.includes(')reparatur');
      });

      if (btnLabel) btnLabel.classList.toggle('hidden', isQuestion);
      if (btnLabelSingle) btnLabelSingle.classList.toggle('hidden', isQuestion);
      if (btnLabelIphone) btnLabelIphone.classList.toggle('hidden', isQuestion);
      if (btnLabelPlain) btnLabelPlain.classList.toggle('hidden', isQuestion);
      if (btnIssWork) btnIssWork.classList.toggle('hidden', isQuestion || !issBlock);
      if (btnMontagebericht) btnMontagebericht.classList.toggle('hidden', isQuestion || !hasReparatur);
      if (btnAnswer) btnAnswer.classList.toggle('hidden', !isQuestion);
      if (btnLink) btnLink.classList.toggle('hidden', !itemUrl);
      if (btnLink) btnLink.disabled = !itemUrl;
      if (btnEdit) btnEdit.classList.toggle('hidden', false);

      title.textContent = (item && item.emergency ? ('NOTFALL – ') : '') + (item.title || item.id);
      body.innerHTML = '';

      const metaLines = [];
      if (item && item.emergency) metaLines.push('NOTFALL: JA (Alarm wurde ausgelöst)');
      const matOpenCnt = item && Array.isArray(item.openMaterial) ? item.openMaterial.length : 0;
      const matNeedsCnt = item && Array.isArray(item.materialNeeds) ? item.materialNeeds.length : 0;
      const stBestellt = item && String(item.status || '') === 'bestellt';
      const istPruefen = item && !item.emergency && matOpenCnt === 0 && !stBestellt && matNeedsCnt > 0 && !isMatViewed(item && item.id);
      const viewedNow = item && matNeedsCnt > 0 && !stBestellt && matOpenCnt === 0 && isMatViewed(item && item.id);
      if (matOpenCnt > 0) metaLines.push('Material: FEHLT (' + String(matOpenCnt) + ' Position' + (matOpenCnt === 1 ? '' : 'en') + ' → ' + item.openMaterial.slice(0,3).join(', ') + (item.openMaterial.length > 3 ? ' ...' : '') + ')');
      if (stBestellt) metaLines.push('Material: BESTELLT (Status wurde im Slack auf "Bestellt" gesetzt)');
      if (istPruefen) metaLines.push('Material: PRÜFEN (Mindestens ' + String(matNeedsCnt) + ' Material-Position offen → Kachel öffnen & Bestand prüfen)');
      if (viewedNow) metaLines.push('Material: GEPRÜFT ✓ (Du hast die Kachel bereits geöffnet – falls etwas fehlt, trägst Du es in die Slack-Materialliste ein)');
      metaLines.push('ID: ' + item.id);
      if (item.origin) metaLines.push('Herkunft: ' + item.origin);
      if (item.statusLabel) metaLines.push('Status: ' + item.statusLabel);
      if (item.dueDate) metaLines.push('Fällig: ' + item.dueDate);
      if (item.montageDate || item.dueDate) metaLines.push('Montage: ' + (item.montageDate || item.dueDate));
      if (item.endleiste) {
        const c = item.endleiste.color ? String(item.endleiste.color) : '';
        const d = item.endleiste.drilled === true ? 'ja' : item.endleiste.drilled === false ? 'nein' : (item.endleiste.drilled ? String(item.endleiste.drilled) : '');
        const segs = [];
        if (c) segs.push('Farbe ' + c);
        if (d) segs.push('gebohrt ' + d);
        if (segs.length) metaLines.push('Endleiste: ' + segs.join(', '));
      }
      if (item.vorsatz && item.vorsatz.enabled) {
        const v = item.vorsatz;
        const vsegs = [];
        if (v.colorLabel) vsegs.push('Farbe ' + String(v.colorLabel));
        if (v.dimensions) vsegs.push(String(v.dimensions));
        if (v.rails === true) vsegs.push('Schienen ja');
        else if (v.rails === false) vsegs.push('Schienen nein');
        if (v.rolloColorLabel) vsegs.push('Rollladenfarbe ' + String(v.rolloColorLabel));
        if (v.rolloProfileLabel) vsegs.push('Rollladenprofil ' + String(v.rolloProfileLabel));
        if (vsegs.length) metaLines.push('Vorsatzelement: ' + vsegs.join(', '));
      }
      if (item.vorsatzElement && item.vorsatzElement.enabled) {
        const ve = item.vorsatzElement;
        if (ve.boxLine) metaLines.push('Vorsatz-Kasten: ' + String(ve.boxLine));
        if (ve.controlLine) metaLines.push('Vorsatz-Bedienung: ' + String(ve.controlLine));
        if (ve.panzerLine) metaLines.push('Vorsatz-Panzer: ' + String(ve.panzerLine));
      }
      if (item.vorsatzBoxOnly && item.vorsatzBoxOnly.enabled) {
        const vb = item.vorsatzBoxOnly;
        if (vb.boxLine) metaLines.push('Vorsatzkasten: ' + String(vb.boxLine));
        if (vb.controlLine) metaLines.push('Vorsatzkasten-Bedienung: ' + String(vb.controlLine));
      }
      if (item.localProgress && item.localProgress.label) {
        const lp = String(item.localProgress.label) + (item.localProgress.actor ? (' (' + String(item.localProgress.actor) + ')') : '') + (item.localProgress.station ? (' @ ' + String(item.localProgress.station)) : '');
        metaLines.push('Stand: ' + lp);
      }
      body.appendChild(el('pre', { class: 'details-pre' }, [text(metaLines.join('\\n'))]));
      const posBlocks = parsePositionBlocks(item);
      if (posBlocks.length) {
        const hasMultiple = posBlocks.length > 1;
        posBlocks.forEach((pb, pbi) => {
          body.appendChild(el('div', { class: 'details-section' }, [
            el('div', { class: 'details-section-title' }, [text(hasMultiple ? ('Position ' + pb.idx + ') Produkt') : 'Produkt')]),
            el('pre', { class: 'details-pre' }, [text(pb.header)]),
          ]));
          if (pb.details && pb.details.length) {
            body.appendChild(el('div', { class: 'details-section' }, [
              el('div', { class: 'details-section-title' }, [text(hasMultiple ? ('Position ' + pb.idx + ') Arbeitsanweisung') : 'Arbeitsanweisung')]),
              el('pre', { class: 'details-pre' }, [text(pb.details.join('\\n\\n'))]),
            ]));
          }
          if (hasMultiple && pbi < posBlocks.length - 1) {
            body.appendChild(el('hr', { class: 'details-divider' }));
          }
        });
      } else if (item.description) body.appendChild(el('pre', { class: 'details-pre' }, [text(item.description)]));
      if (item.cutInfo) body.appendChild(el('pre', { class: 'details-pre' }, [text(item.cutInfo)]));

      const openMat = Array.isArray(item.openMaterial) ? item.openMaterial : [];
      if (openMat.length && (item.status === 'offen' || item.status === 'bestellt' || item.status === 'angenommen' || item.status === 'in_bearbeitung')) {
        body.appendChild(el('div', { class: 'details-section' }, [
          el('div', { class: 'details-section-title' }, [text('Material offen')]),
          el('pre', { class: 'details-pre' }, [text(openMat.join('\\n'))]),
        ]));
      }

      (async () => {
        try {
          const res = await fetch('/api/production/logs?limit=250').then(r => r.json()).catch(() => null);
          const lines = res && Array.isArray(res.lines) ? res.lines : [];
          const items = [];
          for (const ln of lines) {
            const obj = parseJsonSafe(ln);
            if (!obj) continue;
            if (obj.itemId && String(obj.itemId) !== String(item.id)) continue;
            if (!obj.event) continue;
            if (String(obj.event).startsWith('edit_') || String(obj.event).startsWith('scan_')) {
              const ts = obj.ts ? String(obj.ts) : '';
              const what = obj.event;
              const extra =
                obj.event === 'edit_request'
                  ? ['Titel', obj.updateTitle ? 'ja' : 'nein', 'Details', obj.updateDescription ? 'ja' : 'nein'].join(' ')
                  : obj.event === 'scan_update_ok'
                  ? (obj.selectValue ? ('→ ' + obj.selectValue) : '')
                  : '';
              items.push((ts ? (ts + ' – ') : '') + what + (extra ? (' ' + extra) : ''));
            }
          }
          if (items.length) {
            body.appendChild(el('div', { class: 'details-section' }, [
              el('div', { class: 'details-section-title' }, [text('Historie')]),
              el('pre', { class: 'details-pre' }, [text(items.join('\\n'))]),
            ]));
          }
        } catch (e) {}
      })();

      if (item && item.isQuestion) {
        modal.classList.add('open');
        document.body.classList.add('modal-open');
        document.getElementById('detailsClose').focus();

        if (state.detailsItemId) {
          document.querySelectorAll('.card.selected').forEach(n => n.classList.remove('selected'));
          const selected = document.querySelector('[data-item-id="' + state.detailsItemId + '"]');
          if (selected) selected.classList.add('selected');
        }
        return;
      }

      const parts = parseParts(item);
      const panzerConfigs = Array.isArray(item.panzerConfigs) ? item.panzerConfigs : [];
      const positions = getResidualPositions(item);
      const effectiveParts = positions.length ? [] : parts;
      const totalActionRows = (panzerConfigs.length || 0) + (positions.length ? positions.length : (effectiveParts.length || 0));
      const isSingleRowOrder = totalActionRows === 1;
      if (panzerConfigs.length) {
        const list = el('div', { class: 'details-list' }, []);
        panzerConfigs.forEach((cfg, idx) => {
          const dims = (cfg && cfg.widthMm && cfg.heightMm) ? (cfg.widthMm + ' x ' + cfg.heightMm + ' mm') : '';
          const mat = cfg && cfg.material ? cfg.material : '';
          const prof = cfg && cfg.profileHeight ? (cfg.profileHeight + 'er') : '';
          const col = cfg && cfg.color ? cfg.color : '';
          const label = ['Panzer ' + (idx + 1) + ':', dims, mat, prof, col].filter(Boolean).join(' ');
          const materialOnly = [mat, prof, col].filter(Boolean).join(' ');
          const done = getPartDoneInfo(item, label);
          const shown = done ? (label + ' • ' + String(done.label || 'Fertig')) : label;

          const row = el('div', { class: 'details-row' }, [
            el('div', { class: 'details-row-text' }, [text(shown)]),
            el('div', { class: 'details-row-actions' }, [
              el('button', { class: 'btn', type: 'button' }, [text('Etikett')]),
              el('button', { class: 'btn', type: 'button' }, [text('Aufdruck')]),
              el('button', { class: 'btn', type: 'button' }, [text('Säge')]),
              el('button', { class: 'btn', type: 'button' }, [text('Fertig')]),
              el('button', { class: 'btn', type: 'button' }, [text('Material')]),
            ])
          ]);
          const btns = row.querySelectorAll('button');
          btns[0].addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openLabelForPart(item, label, 1); });
          btns[1].addEventListener('click', (e) => {
            e.preventDefault();
            const custom = window.prompt('Aufdruck (Etikett)', String(label || ''));
            if (custom == null) return;
            const t = normalizeOneLine(custom);
            openLabelForPart(item, t || label, 1);
          });
          btns[2].addEventListener('click', (e) => { e.preventDefault(); if (done) { showToast('Teil ist bereits fertig'); return; } openConfirm({ code: item.qrText, stage: 1, itemId: item.id, item, part: label, partial: !isSingleRowOrder }); });
          btns[3].addEventListener('click', (e) => { e.preventDefault(); if (done) { showToast('Teil ist bereits fertig'); return; } openConfirm({ code: item.qrText, stage: 2, itemId: item.id, item, part: label, partial: !isSingleRowOrder }); });
          btns[4].addEventListener('click', (e) => { e.preventDefault(); openMaterialConfirm(item, materialOnly || label); });
          if (done) {
            row.classList.add('done');
            btns[2].setAttribute('disabled', 'disabled');
            btns[3].setAttribute('disabled', 'disabled');
          }
          list.appendChild(row);
        });
        body.appendChild(el('div', { class: 'details-section' }, [
          el('div', { class: 'details-section-title' }, [text('Panzer')]),
          list
        ]));
      }
      if (positions.length) {
        const list = el('div', { class: 'details-list' }, []);
        positions.forEach(p => {
          const done = getPartDoneInfo(item, p);
          const shown = done ? (p + ' • ' + String(done.label || 'Fertig')) : p;
          const row = el('div', { class: 'details-row' }, [
            el('div', { class: 'details-row-text' }, [text(shown)]),
            el('div', { class: 'details-row-actions' }, [
              el('button', { class: 'btn', type: 'button' }, [text('Etikett')]),
              el('button', { class: 'btn', type: 'button' }, [text('Aufdruck')]),
              el('button', { class: 'btn', type: 'button' }, [text('Säge')]),
              el('button', { class: 'btn', type: 'button' }, [text('Fertig')]),
              el('button', { class: 'btn', type: 'button' }, [text('Material')]),
            ])
          ]);
          const btns = row.querySelectorAll('button');
          btns[0].addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openLabelForPart(item, p, 1); });
          btns[1].addEventListener('click', (e) => {
            e.preventDefault();
            const custom = window.prompt('Aufdruck (Etikett)', String(p || ''));
            if (custom == null) return;
            const t = normalizeOneLine(custom);
            openLabelForPart(item, t || p, 1);
          });
          btns[2].addEventListener('click', (e) => { e.preventDefault(); if (done) { showToast('Teil ist bereits fertig'); return; } openConfirm({ code: item.qrText, stage: 1, itemId: item.id, item, part: p, partial: !isSingleRowOrder }); });
          btns[3].addEventListener('click', (e) => { e.preventDefault(); if (done) { showToast('Teil ist bereits fertig'); return; } openConfirm({ code: item.qrText, stage: 2, itemId: item.id, item, part: p, partial: !isSingleRowOrder }); });
          btns[4].addEventListener('click', (e) => { e.preventDefault(); openMaterialConfirm(item, p); });
          if (done) {
            row.classList.add('done');
            btns[2].setAttribute('disabled', 'disabled');
            btns[3].setAttribute('disabled', 'disabled');
          }
          list.appendChild(row);
        });
        body.appendChild(el('div', { class: 'details-section' }, [
          el('div', { class: 'details-section-title' }, [text('Positionen')]),
          list
        ]));
      } else if (effectiveParts.length) {
        const list = el('div', { class: 'details-list' }, []);
        effectiveParts.forEach(p => {
          const done = getPartDoneInfo(item, p);
          const shown = done ? (p + ' • ' + String(done.label || 'Fertig')) : p;
          const row = el('div', { class: 'details-row' }, [
            el('div', { class: 'details-row-text' }, [text(shown)]),
            el('div', { class: 'details-row-actions' }, [
              el('button', { class: 'btn', type: 'button' }, [text('Etikett')]),
              el('button', { class: 'btn', type: 'button' }, [text('Aufdruck')]),
              el('button', { class: 'btn', type: 'button' }, [text('Säge')]),
              el('button', { class: 'btn', type: 'button' }, [text('Fertig')]),
              el('button', { class: 'btn', type: 'button' }, [text('Material')]),
            ])
          ]);
          const btns = row.querySelectorAll('button');
          btns[0].addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openLabelForPart(item, p, 1); });
          btns[1].addEventListener('click', (e) => {
            e.preventDefault();
            const custom = window.prompt('Aufdruck (Etikett)', String(p || ''));
            if (custom == null) return;
            const t = normalizeOneLine(custom);
            openLabelForPart(item, t || p, 1);
          });
          btns[2].addEventListener('click', (e) => { e.preventDefault(); if (done) { showToast('Teil ist bereits fertig'); return; } openConfirm({ code: item.qrText, stage: 1, itemId: item.id, item, part: p, partial: !isSingleRowOrder }); });
          btns[3].addEventListener('click', (e) => { e.preventDefault(); if (done) { showToast('Teil ist bereits fertig'); return; } openConfirm({ code: item.qrText, stage: 2, itemId: item.id, item, part: p, partial: !isSingleRowOrder }); });
          btns[4].addEventListener('click', (e) => { e.preventDefault(); openMaterialConfirm(item, p); });
          if (done) {
            row.classList.add('done');
            btns[2].setAttribute('disabled', 'disabled');
            btns[3].setAttribute('disabled', 'disabled');
          }
          list.appendChild(row);
        });
        body.appendChild(el('div', { class: 'details-section' }, [
          el('div', { class: 'details-section-title' }, [text('Teile')]),
          list
        ]));
      }

      modal.classList.add('open');
      document.body.classList.add('modal-open');
      document.getElementById('detailsClose').focus();

      if (state.detailsItemId) {
        document.querySelectorAll('.card.selected').forEach(n => n.classList.remove('selected'));
        const selected = document.querySelector('[data-item-id="' + state.detailsItemId + '"]');
        if (selected) selected.classList.add('selected');
      }
    }

    function closeDetails() {
      const modal = document.getElementById('details');
      modal.classList.remove('open');
      state.detailsItem = null;
      state.detailsItemId = null;
      document.querySelectorAll('.card.selected').forEach(n => n.classList.remove('selected'));
      if (
        !(document.getElementById('material') && document.getElementById('material').classList.contains('open')) &&
        !(document.getElementById('scanPick') && document.getElementById('scanPick').classList.contains('open')) &&
        !(document.getElementById('confirm') && document.getElementById('confirm').classList.contains('open')) &&
        !(document.getElementById('edit') && document.getElementById('edit').classList.contains('open'))
      ) {
        document.body.classList.remove('modal-open');
      }
    }

    function closeDoneToday() {
      const modal = document.getElementById('doneToday');
      if (!modal) return;
      modal.classList.remove('open');
      if (
        !(document.getElementById('material') && document.getElementById('material').classList.contains('open')) &&
        !(document.getElementById('scanPick') && document.getElementById('scanPick').classList.contains('open')) &&
        !(document.getElementById('confirm') && document.getElementById('confirm').classList.contains('open')) &&
        !(document.getElementById('edit') && document.getElementById('edit').classList.contains('open')) &&
        !(document.getElementById('details') && document.getElementById('details').classList.contains('open'))
      ) {
        document.body.classList.remove('modal-open');
      }
    }

    function renderDoneTodayData(data) {
      const meta = document.getElementById('doneTodayMeta');
      const body = document.getElementById('doneTodayBody');
      if (!meta || !body) return;

      const items = Array.isArray(data && data.items) ? data.items : [];
      const date = data && data.date ? String(data.date) : '';
      meta.textContent = items.length
        ? (String(items.length) + ' Auftrag' + (items.length === 1 ? '' : 'e') + (date ? (' • ' + formatDateShort(date)) : ''))
        : (date ? ('Keine Einträge • ' + formatDateShort(date)) : 'Keine Einträge');

      body.innerHTML = '';
      if (!items.length) {
        body.appendChild(el('div', { class: 'done-today-empty' }, [text('Heute wurde noch nichts als Fertig markiert.')]));
        return;
      }

      const list = el('div', { class: 'done-today-list' }, []);
      items.forEach(item => {
        const latestTs = item && item.latestTs
          ? new Date(String(item.latestTs)).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
          : '';
        const timing = normalizeOneLine(item && (item.montageDate || item.dueDate) ? formatDateShort(item.montageDate || item.dueDate) : '');
        const metaParts = [item && item.itemId ? String(item.itemId) : ''];
        if (timing) metaParts.push('Termin ' + timing);
        if (item && item.origin) metaParts.push(String(item.origin));

        const card = el('div', { class: 'done-today-item' }, [
          el('div', { class: 'done-today-head' }, [
            el('div', { class: 'done-today-title' }, [text(normalizeOneLine(item && item.title ? item.title : item && item.itemId ? item.itemId : ''))]),
            el('div', { class: 'done-today-time' }, [text(latestTs || 'Heute')]),
          ]),
          el('div', { class: 'done-today-meta' }, [text(metaParts.filter(Boolean).join(' • '))]),
        ]);

        const desc = normalizeOneLine(item && item.description ? item.description : '');
        if (desc) card.appendChild(el('div', { class: 'done-today-desc' }, [text(desc)]));

        const actions = el('div', { class: 'done-today-actions' }, []);
        const reopenBtn = el('button', { class: 'btn', type: 'button' }, [text('Wieder öffnen')]);
        reopenBtn.onclick = () => reopenDoneToday(item && item.itemId ? item.itemId : '', reopenBtn);
        actions.appendChild(reopenBtn);
        card.appendChild(actions);

        const eventsWrap = el('div', { class: 'done-today-events' }, []);
        (Array.isArray(item && item.events) ? item.events : []).forEach(ev => {
          const time = ev && ev.ts
            ? new Date(String(ev.ts)).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
            : '';
          const headParts = [];
          if (time) headParts.push(time);
          if (ev && ev.actionLabel) headParts.push(String(ev.actionLabel));
          if (ev && ev.actor) headParts.push(String(ev.actor));
          if (ev && ev.station) headParts.push('@ ' + String(ev.station));
          const eventNode = el('div', { class: 'done-today-event' }, [
            el('div', { class: 'done-today-event-head' }, [text(headParts.join(' • '))]),
          ]);
          const part = normalizeOneLine(ev && ev.part ? ev.part : '');
          if (part) eventNode.appendChild(el('div', { class: 'done-today-part' }, [text(part)]));
          eventsWrap.appendChild(eventNode);
        });
        card.appendChild(eventsWrap);
        list.appendChild(card);
      });
      body.appendChild(list);
    }

    function reopenDoneToday(itemId, btn) {
      const id = String(itemId || '').trim();
      if (!id) return;
      if (!state.adminKey) {
        showToast('Admin-Key fehlt');
        return;
      }
      const ok = window.confirm('Auftrag wieder öffnen?\\n\\n' + id);
      if (!ok) return;

      if (btn) btn.disabled = true;
      fetch('/api/production/reopen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': state.adminKey,
        },
        body: JSON.stringify({
          itemId: id,
          actor: state.actor || '',
          station: state.station || '',
        }),
      }).then(r => r.json()).then(j => {
        if (j && j.ok) {
          showToast('Wieder geöffnet');
          return openDoneToday().then(() => { load(); });
        }
        showToast((j && j.error) ? String(j.error) : 'Fehler');
      }).catch(() => {
        showToast('Fehler');
      }).then(() => {
        if (btn) btn.disabled = false;
      });
    }

    function openDoneToday() {
      const modal = document.getElementById('doneToday');
      const body = document.getElementById('doneTodayBody');
      const meta = document.getElementById('doneTodayMeta');
      const openBtn = document.getElementById('doneTodayOpen');
      if (!modal || !body || !meta) return;

      modal.classList.add('open');
      document.body.classList.add('modal-open');
      body.innerHTML = '';
      body.appendChild(el('div', { class: 'done-today-empty' }, [text('Lade...')]));
      meta.textContent = 'Daten werden geladen...';
      if (openBtn) openBtn.disabled = true;

      return fetch('/api/production/done-today')
        .then(r => r.json())
        .then(data => {
          state.doneTodayData = data;
          renderDoneTodayData(data);
        })
        .catch(() => {
          meta.textContent = 'Fehler';
          body.innerHTML = '';
          body.appendChild(el('div', { class: 'done-today-empty' }, [text('Die heutige Fertig-Liste konnte nicht geladen werden.')]));
        })
        .then(() => {
          if (openBtn) openBtn.disabled = false;
        });
    }

    function render(data) {
      const prev = document.activeElement;
      const prevId = prev && prev.id ? String(prev.id) : '';
      const prevSelStart = (prevId === 'search' || prevId === 'scan' || prevId === 'station' || prevId === 'actor' || prevId === 'adminKey') && typeof prev.selectionStart === 'number' ? prev.selectionStart : null;
      const prevSelEnd = (prevId === 'search' || prevId === 'scan' || prevId === 'station' || prevId === 'actor' || prevId === 'adminKey') && typeof prev.selectionEnd === 'number' ? prev.selectionEnd : null;

      const root = document.getElementById('root');
      root.innerHTML = '';
      const pivot = data && data.pivotDate ? String(data.pivotDate) : '';
      const pivotTomorrow = data && data.pivotTomorrow ? String(data.pivotTomorrow) : '';
      const pivotNextWorkday = data && data.pivotNextWorkday ? String(data.pivotNextWorkday) : '';
      const top = el('div', { class: 'top' }, [
        el('div', { class: 'top-title' }, [text('Produktion')]),
        el('div', { class: 'top-meta' }, [text('Stand: ' + new Date(data.generatedAt).toLocaleString('de-DE') + (pivot ? (' • Plan: ' + formatDateShort(pivot)) : ''))])
      ]);

      const buckets = data.buckets || { today: [], tomorrow: [], later: [] };
      const questionsAll = Array.isArray(data.questions) ? data.questions : [];
      const questionsOpen = questionsAll.filter(q => !isQuestionAnswered(q));

      const todayTitle = (pivot && pivotTomorrow)
        ? ('Heute + nächster Werktag (' + formatDateShort(pivot) + ' & ' + formatDateShort(pivotTomorrow) + ')')
        : (pivot ? ('Heute (' + formatDateShort(pivot) + ')') : 'Heute');
      const tomorrowTitle = pivotNextWorkday
        ? ('Nächster Werktag (' + formatDateShort(pivotNextWorkday) + ')')
        : (pivotTomorrow ? ('Nächster Werktag (' + formatDateShort(pivotTomorrow) + ')') : 'Nächster Werktag');
      const gridCols = [];
      if (questionsOpen.length) gridCols.push(column('Offene Fragen', questionsOpen));
      gridCols.push(column(todayTitle, buckets.today || []));
      gridCols.push(column(tomorrowTitle, buckets.tomorrow || []));
      gridCols.push(column('Später', buckets.later || []));
      const grid = el('div', { class: 'grid' }, gridCols);

      const bar = el('div', { class: 'bar' }, [
        el('input', { id: 'search', placeholder: 'Suche…', autocomplete: 'off' }),
        el('input', { id: 'scan', placeholder: 'Scan…', autocomplete: 'off' }),
        el('input', { id: 'station', placeholder: 'Standort…', autocomplete: 'off' }),
        el('input', { id: 'actor', placeholder: 'Kürzel…', autocomplete: 'off' }),
        el('input', { id: 'adminKey', placeholder: 'Admin-Key…', type: 'password', autocomplete: 'off' }),
        el('button', { id: 'refresh' }, [text('Aktualisieren')]),
        el('button', { id: 'autoPrintToggle' }, [text('Auto-Druck: AUS')]),
        el('button', { id: 'materials' }, [text('Materialübersicht')]),
        el('button', { id: 'doneTodayOpen' }, [text('Heute fertig')]),
        el('button', { id: 'onlySaw' }, [text('Nur Säge-Teile')]),
        el('button', { id: 'scan1' }, [text('Säge')]),
        el('button', { id: 'scan2' }, [text('Arret./Fertig')]),
        el('button', { id: 'scan3' }, [text('Kurier')])
      ]);

      const toast = el('div', { id: 'toast', class: 'toast' }, []);
      const confirm = el('div', { id: 'confirm', class: 'modal' }, [
        el('div', { class: 'modal-card' }, [
          el('div', { class: 'modal-title', id: 'confirmTitle' }, [text('')]),
          el('pre', { class: 'modal-pre', id: 'confirmDetails' }, [text('')]),
          el('div', { id: 'qcWrap', class: 'qc' }, [
            el('div', { class: 'qc-title' }, [text('Qualitätskontrolle')]),
            el('label', { class: 'qc-row' }, [
              el('input', { id: 'qcMaterial', type: 'checkbox' }, []),
              text('Material')
            ]),
            el('label', { class: 'qc-row' }, [
              el('input', { id: 'qcProfil', type: 'checkbox' }, []),
              text('Profil')
            ]),
            el('label', { class: 'qc-row' }, [
              el('input', { id: 'qcFarbe', type: 'checkbox' }, []),
              text('Farbe')
            ]),
            el('label', { class: 'qc-row' }, [
              el('input', { id: 'qcMasse', type: 'checkbox' }, []),
              text('Maße (Breite × Höhe)')
            ]),
          ]),
          el('div', { class: 'modal-actions' }, [
            el('button', { id: 'confirmNo', class: 'btn' }, [text('Abbrechen')]),
            el('button', { id: 'confirmYes', class: 'btn primary' }, [text('Bestätigen')])
          ])
        ])
      ]);
      const scanPick = el('div', { id: 'scanPick', class: 'modal' }, [
        el('div', { class: 'modal-card' }, [
          el('div', { class: 'modal-title', id: 'scanPickTitle' }, [text('Scan')]),
          el('pre', { class: 'modal-pre', id: 'scanPickDetails' }, [text('')]),
          el('div', { class: 'modal-actions' }, [
            el('button', { id: 'scanPickNo', class: 'btn' }, [text('Abbrechen')]),
            el('button', { id: 'scanPick1', class: 'btn' }, [text('Säge')]),
            el('button', { id: 'scanPick2', class: 'btn primary' }, [text('Arret./Fertig')]),
            el('button', { id: 'scanPick3', class: 'btn' }, [text('Kurier')])
          ])
        ])
      ]);
      const material = el('div', { id: 'material', class: 'modal' }, [
        el('div', { class: 'modal-card' }, [
          el('div', { class: 'modal-title', id: 'materialTitle' }, [text('')]),
          el('pre', { class: 'modal-pre', id: 'materialDetails' }, [text('')]),
          el('div', { class: 'modal-title', id: 'materialSub' }, [text('Material (bearbeitbar)')]),
          el('textarea', { id: 'materialInput' }, []),
          el('div', { class: 'modal-actions' }, [
            el('button', { id: 'materialNo', class: 'btn' }, [text('Abbrechen')]),
            el('button', { id: 'materialYes', class: 'btn primary' }, [text('In Slack senden')])
          ])
        ])
      ]);
      const details = el('div', { id: 'details', class: 'modal' }, [
        el('div', { class: 'modal-card details-card' }, [
          el('div', { class: 'details-header' }, [
            el('div', { class: 'modal-title', id: 'detailsTitle' }, [text('')]),
            el('button', { id: 'detailsLabel', class: 'btn', type: 'button' }, [text('Etikett')]),
              el('button', { id: 'detailsLabelPackages', class: 'btn', type: 'button' }, [text('Etikett (Pakete)')]),
            el('button', { id: 'detailsLabelSingle', class: 'btn', type: 'button' }, [text('Etikett (1x)')]),
            el('button', { id: 'detailsLabelIphone', class: 'btn', type: 'button' }, [text('Etikett (iPhone)')]),
            el('button', { id: 'detailsLabelPlain', class: 'btn', type: 'button' }, [text('Etikett (ohne QR/Datum)')]),
            el('button', { id: 'detailsIssWork', class: 'btn', type: 'button' }, [text('ISS-Arbeit')]),
            el('button', { id: 'detailsMontagebericht', class: 'btn', type: 'button' }, [text('Montagebericht')]),
            el('button', { id: 'detailsLink', class: 'btn', type: 'button' }, [text('Link')]),
            el('button', { id: 'detailsAnswer', class: 'btn', type: 'button' }, [text('Antwort')]),
            el('button', { id: 'detailsEdit', class: 'btn', type: 'button' }, [text('Bearbeiten')]),
            el('button', { id: 'detailsUnmarkMatViewed', class: 'btn', type: 'button', title: 'OOPSIE: Markierung "Material geprüft" nur für DIESEN Auftrag zurücksetzen → Kachel wird wieder grün' }, [text('OOPSIE – ungeprüft')]),
            el('button', { id: 'detailsResetMatViewed', class: 'btn', type: 'button', title: '"Material geprüft" Markierungen serverweit für ALLE Aufträge löschen' }, [text('Alle Mat. Prüf. zurück.')]),
            el('button', { id: 'detailsClose', class: 'btn', type: 'button' }, [text('Schließen')])
          ]),
          el('div', { id: 'detailsBody', class: 'details-body' }, [])
        ])
      ]);
      const edit = el('div', { id: 'edit', class: 'modal' }, [
        el('div', { class: 'modal-card' }, [
          el('div', { class: 'modal-title', id: 'editTitle' }, [text('Bearbeiten')]),
          el('div', { class: 'modal-actions' }, [
            el('button', { id: 'editNo', class: 'btn' }, [text('Abbrechen')]),
            el('button', { id: 'editRecalc', class: 'btn', type: 'button' }, [text('Stäbe neu berechnen')]),
            el('button', { id: 'editYes', class: 'btn primary' }, [text('Speichern')])
          ]),
          el('div', { class: 'modal-title', id: 'editSub1' }, [text('Titel')]),
          el('input', { id: 'editTitleInput', autocomplete: 'off' }, []),
          el('div', { class: 'modal-title', id: 'editSub2' }, [text('Details')]),
          el('textarea', { id: 'editDescInput' }, []),
          el('div', { class: 'modal-title', id: 'editSub3' }, [text('Berechnung (Vorschau)')]),
          el('pre', { class: 'modal-pre', id: 'editCutPreview' }, [text('')]),
        ])
      ]);
      const doneToday = el('div', { id: 'doneToday', class: 'modal' }, [
        el('div', { class: 'modal-card done-today-card' }, [
          el('div', { class: 'done-today-toolbar' }, [
            el('div', { class: 'done-today-toolbar-main' }, [
              el('div', { class: 'modal-title' }, [text('Heute fertig')]),
              el('div', { id: 'doneTodayMeta', class: 'top-meta' }, [text('')]),
            ]),
            el('div', { class: 'modal-actions' }, [
              el('button', { id: 'doneTodayReload', class: 'btn', type: 'button' }, [text('Aktualisieren')]),
              el('button', { id: 'doneTodayClose', class: 'btn', type: 'button' }, [text('Schließen')]),
            ]),
          ]),
          el('div', { id: 'doneTodayBody', class: 'done-today-body' }, []),
        ])
      ]);

      root.appendChild(top);
      root.appendChild(bar);
      root.appendChild(toast);
      root.appendChild(confirm);
      root.appendChild(scanPick);
      root.appendChild(material);
      root.appendChild(details);
      root.appendChild(edit);
      root.appendChild(doneToday);
      root.appendChild(grid);

      const scanInput = document.getElementById('scan');
      const searchInput = document.getElementById('search');
      const stationInput = document.getElementById('station');
      const actorInput = document.getElementById('actor');
      const adminKeyInput = document.getElementById('adminKey');
      const onlySawBtn = document.getElementById('onlySaw');
      const autoPrintBtn = document.getElementById('autoPrintToggle');
      const doneTodayBtn = document.getElementById('doneTodayOpen');

      searchInput.value = state.filter || '';
      searchInput.addEventListener('input', () => {
        state.filter = String(searchInput.value || '');
        if (state.last) render(state.last);
      });

      const code = currentUserCode();
      const rule = code ? VIEW_RULES[code] : null;
      if (!rule || !rule.lockOnlySaw) {
        if (state.onlySaw == null) {
          try { state.onlySaw = localStorage.getItem(onlySawStorageKey()) === '1'; } catch (e) { state.onlySaw = false; }
        }
      } else {
        state.onlySaw = false;
      }
      const onlySawOn = effectiveOnlySaw();
      onlySawBtn.textContent = onlySawOn ? 'Nur Säge-Teile: AN' : 'Nur Säge-Teile: AUS';
      onlySawBtn.className = onlySawOn ? 'btn primary' : 'btn';
      if (rule && rule.lockOnlySaw) onlySawBtn.setAttribute('disabled', 'disabled');
      else onlySawBtn.removeAttribute('disabled');
      onlySawBtn.onclick = () => {
        if (rule && rule.lockOnlySaw) return;
        state.onlySaw = !state.onlySaw;
        try { localStorage.setItem(onlySawStorageKey(), state.onlySaw ? '1' : '0'); } catch (e) {}
        if (state.last) render(state.last);
      };

      if (!state.station) {
        try { state.station = String(localStorage.getItem('station') || '').trim(); } catch (e) {}
      }
      stationInput.value = state.station || '';
      stationInput.addEventListener('input', () => {
        state.station = String(stationInput.value || '');
        try { localStorage.setItem('station', state.station); } catch (e) {}
      });

      if (!state.actor) {
        try { state.actor = String(localStorage.getItem('actor') || '').trim(); } catch (e) {}
      }
      actorInput.value = state.actor || '';
      actorInput.disabled = false;
      actorInput.addEventListener('input', () => {
        state.actor = String(actorInput.value || '');
        try { localStorage.setItem('actor', state.actor); } catch (e) {}
        state.onlySaw = null;
        if (state.last) render(state.last);
      });

      if (state.autoPrint == null) {
        try { state.autoPrint = localStorage.getItem('autoPrint') === '1'; } catch (e) { state.autoPrint = false; }
      }
      autoPrintBtn.textContent = state.autoPrint ? 'Auto-Druck: AN' : 'Auto-Druck: AUS';
      autoPrintBtn.className = state.autoPrint ? 'btn primary' : 'btn';
      autoPrintBtn.onclick = () => {
        state.autoPrint = !state.autoPrint;
        try { localStorage.setItem('autoPrint', state.autoPrint ? '1' : '0'); } catch (e) {}
        autoPrintBtn.textContent = state.autoPrint ? 'Auto-Druck: AN' : 'Auto-Druck: AUS';
        autoPrintBtn.className = state.autoPrint ? 'btn primary' : 'btn';
        showToast(state.autoPrint ? 'Auto-Druck aktiv' : 'Auto-Druck aus');
      };

      doneTodayBtn.onclick = () => { openDoneToday(); };
      document.getElementById('doneTodayReload').onclick = () => { openDoneToday(); };
      document.getElementById('doneTodayClose').onclick = () => { closeDoneToday(); };
      document.getElementById('doneToday').addEventListener('click', (e) => {
        if (e.target && e.target.id === 'doneToday') closeDoneToday();
      });

      if (!state.adminKey) {
        try { state.adminKey = String(localStorage.getItem('adminKey') || '').trim(); } catch (e) {}
      }
      adminKeyInput.value = state.adminKey || '';
      adminKeyInput.addEventListener('input', () => {
        state.adminKey = String(adminKeyInput.value || '').trim();
        try { localStorage.setItem('adminKey', state.adminKey); } catch (e) {}
      });

      if (prevId === 'search') {
        try {
          searchInput.focus();
          if (prevSelStart != null && prevSelEnd != null) searchInput.setSelectionRange(prevSelStart, prevSelEnd);
        } catch (e) {}
      } else if (prevId === 'scan') {
        try {
          scanInput.focus();
          if (prevSelStart != null && prevSelEnd != null) scanInput.setSelectionRange(prevSelStart, prevSelEnd);
        } catch (e) {}
      } else if (prevId === 'station') {
        try {
          stationInput.focus();
          if (prevSelStart != null && prevSelEnd != null) stationInput.setSelectionRange(prevSelStart, prevSelEnd);
        } catch (e) {}
      } else if (prevId === 'actor') {
        try {
          actorInput.focus();
          if (prevSelStart != null && prevSelEnd != null) actorInput.setSelectionRange(prevSelStart, prevSelEnd);
        } catch (e) {}
      } else if (prevId === 'adminKey') {
        try {
          adminKeyInput.focus();
          if (prevSelStart != null && prevSelEnd != null) adminKeyInput.setSelectionRange(prevSelStart, prevSelEnd);
        } catch (e) {}
      }

      async function doSend(pending) {
        const code = String(pending && pending.code || '').trim();
        const stage = Number(pending && pending.stage || 0);
        if (!code) return;
        const part = pending && pending.part ? String(pending.part) : '';
        const partial = !!(pending && pending.partial);
        const origin = pending && pending.origin ? String(pending.origin) : '';
        const station = String(state.station || '').trim();
        const actor = operatorCode(state.actor || '');
        const out = await postJsonWithRetry('/api/production/scan', { code, stage, part, partial, origin, station, actor }, { retries: 1 });
        if (out.ok && out.data && out.data.ok) {
          showToast('Status gesetzt');
          highlightItem(out.data.itemId);
        } else {
          const err = out && out.data && out.data.error ? out.data.error : null;
          showToast(err ? ('Scan: ' + err) : 'Scan fehlgeschlagen');
        }
        load();
        scanInput.value = '';
        if (document.activeElement && document.activeElement.id === 'scan') scanInput.focus();
      }

      function requestSend(stage, part) {
        const code = String(scanInput.value || '').trim();
        if (!code) return;
        const resolved = resolveItemFromCode(code);
        if (!resolved) {
          showToast('Ungültiger Code');
          scanInput.select();
          return;
        }
        openConfirm({ code, stage, itemId: resolved.id, item: resolved.item, part: part || '', partial: false });
      }

      document.getElementById('scan1').onclick = () => requestSend(1);
      document.getElementById('scan2').onclick = () => requestSend(2);
      document.getElementById('scan3').onclick = () => requestSend(3);
      document.getElementById('refresh').onclick = () => load({ forceMaterials: true });
      document.getElementById('materials').onclick = () => { window.location.href = '/display/materials'; };
      scanInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') requestSend(1);
      });

      document.getElementById('scanPickNo').onclick = () => {
        closeScanPick();
        scanInput.focus();
      };
      document.getElementById('scanPick1').onclick = () => {
        const p = state.pending;
        const code = p && p.type === 'scanPick' ? String(p.code || '') : '';
        if (!code) return;
        closeScanPick();
        const resolved = resolveItemFromCode(code);
        openConfirm({ code, stage: 1, itemId: resolved ? resolved.id : '', item: resolved ? resolved.item : null, part: '', partial: false });
      };
      document.getElementById('scanPick2').onclick = () => {
        const p = state.pending;
        const code = p && p.type === 'scanPick' ? String(p.code || '') : '';
        if (!code) return;
        closeScanPick();
        const resolved = resolveItemFromCode(code);
        openConfirm({ code, stage: 2, itemId: resolved ? resolved.id : '', item: resolved ? resolved.item : null, part: '', partial: false });
      };
      document.getElementById('scanPick3').onclick = () => {
        const p = state.pending;
        const code = p && p.type === 'scanPick' ? String(p.code || '') : '';
        if (!code) return;
        closeScanPick();
        const resolved = resolveItemFromCode(code);
        openConfirm({ code, stage: 3, itemId: resolved ? resolved.id : '', item: resolved ? resolved.item : null, part: '', partial: false });
      };
      document.getElementById('scanPick').addEventListener('click', (e) => {
        if (e.target && e.target.id === 'scanPick') {
          closeScanPick();
          scanInput.focus();
        }
      });
      document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('scanPick');
        if (modal && modal.classList.contains('open')) {
          if (e.key === 'Escape') {
            e.preventDefault();
            closeScanPick();
            scanInput.focus();
          }
        }
      });

      document.getElementById('confirmNo').onclick = () => {
        closeConfirm();
        scanInput.focus();
      };
      document.getElementById('confirmYes').onclick = () => {
        const p = state.pending;
        if (!p) return;
        const qc = qcStateFromPending(p);
        if (qc.required) {
          const checks = readQcChecks();
          if (!(checks.material && checks.profil && checks.farbe && checks.masse)) {
            showToast('QC: bitte alle vier Haken setzen');
            updateConfirmYesEnabled();
            return;
          }
        }
        closeConfirm();
        doSend({ code: p.code, stage: p.stage, part: p.part, partial: p.partial, origin: p.origin });
      };
      const qcMaterial = document.getElementById('qcMaterial');
      const qcProfil = document.getElementById('qcProfil');
      const qcFarbe = document.getElementById('qcFarbe');
      const qcMasse = document.getElementById('qcMasse');
      if (qcMaterial) qcMaterial.onchange = updateConfirmYesEnabled;
      if (qcProfil) qcProfil.onchange = updateConfirmYesEnabled;
      if (qcFarbe) qcFarbe.onchange = updateConfirmYesEnabled;
      if (qcMasse) qcMasse.onchange = updateConfirmYesEnabled;
      document.getElementById('confirm').addEventListener('click', (e) => {
        if (e.target && e.target.id === 'confirm') {
          closeConfirm();
          scanInput.focus();
        }
      });
      document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('confirm');
        if (modal && modal.classList.contains('open')) {
          if (e.key === 'Escape') {
            e.preventDefault();
            closeConfirm();
            scanInput.focus();
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            const yes = document.getElementById('confirmYes');
            if (yes && !yes.disabled) yes.click();
          }
        }
      });

      document.getElementById('materialNo').onclick = () => {
        closeMaterialConfirm();
        scanInput.focus();
      };
      document.getElementById('materialYes').onclick = () => {
        const p = state.pending;
        if (!p || !p.item) {
          closeMaterialConfirm();
          return;
        }
        const item = p.item;
        const part = p.part || '';
        const input = document.getElementById('materialInput');
        const materialText = input ? String(input.value || '').trim() : '';
        closeMaterialConfirm();
        sendMaterialToSlack(item, part, materialText);
      };
      document.getElementById('material').addEventListener('click', (e) => {
        if (e.target && e.target.id === 'material') {
          closeMaterialConfirm();
          scanInput.focus();
        }
      });

      document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('material');
        if (modal && modal.classList.contains('open')) {
          if (e.key === 'Escape') {
            e.preventDefault();
            closeMaterialConfirm();
            scanInput.focus();
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('materialYes').click();
          }
        }
      });

      document.getElementById('detailsClose').onclick = () => {
        closeDetails();
        if (state.last) render(state.last);
      };

      function openLabelForItem(item, copiesOverride, opts) {
        if (!item) return;
        const withQr = !(opts && opts.withQr === false);
        const withDate = !(opts && opts.withDate === false);
        const packageTotal = Number.isFinite(opts && opts.packageTotal)
          ? Math.min(20, Math.max(1, Math.round(opts.packageTotal)))
          : 1;
        const scanUrl = getDisplayBaseUrlForQr() + '?code=' + encodeURIComponent(item.qrText);
        const op = operatorCode(state.actor || '');
        const pc = Array.isArray(item.panzerConfigs) && item.panzerConfigs[0] ? item.panzerConfigs[0] : null;
        const mat = pc && pc.material ? String(pc.material) : '';
        const prof = pc && pc.profileHeight ? (Number(pc.profileHeight) === 37 ? 'Mini' : Number(pc.profileHeight) === 52 ? 'Maxi' : (String(pc.profileHeight) + 'er')) : '';
        const col = pc && pc.color ? String(pc.color) : (item.panzerSummary ? String(item.panzerSummary) : '');
        const dims = pc && pc.widthMm && pc.heightMm ? (String(pc.widthMm) + ' x ' + String(pc.heightMm) + ' mm') : '';
        const panzerLine = [mat, prof, col].filter(Boolean).join(' ').trim();
        const parts = parseParts(item);
        const descOneLine = normalizeOneLine(item && item.description ? String(item.description) : '');
        const descOneLineClean = stripSupplierInfo(descOneLine);
        const partLabel =
          (!panzerLine && Array.isArray(parts) && parts.length === 1)
            ? String(parts[0])
            : (!panzerLine && !parts.length && descOneLineClean && descOneLineClean.length <= 60)
              ? descOneLineClean
              : '';
        const elc = item.endleiste && item.endleiste.color ? String(item.endleiste.color) : '';
        const isDrilled = item.endleiste && item.endleiste.drilled === true;
        const eld = isDrilled ? 'gebohrt' : item.endleiste && item.endleiste.drilled === false ? 'nicht gebohrt' : '';
        const elLine = (elc || eld) ? ('EL ' + [elc, eld].filter(Boolean).join(' ')) : '';
        const dateIso = withDate ? String(item.montageDate || item.dueDate || '').slice(0, 10) : '';
        const customer = item.title || item.id;
        const custParts = String(customer || '').split(/\s+[–-]\s+/).map(s => String(s || '').trim()).filter(Boolean);
        const top = [custParts[0] || '', custParts[1] || ''].filter(Boolean).join(' – ');
        const rest = custParts.slice(2);
        const street = rest.find(t => /\d/.test(t)) || '';
        const person = rest.find(t => t && t !== street) || '';
        const cust1 = top || String(customer || '');
        const cust2 = street ? street : person;
        const cust3 = street ? person : '';
        const labelSummary = buildLabelSummary(item);
        let l1 = (labelSummary && labelSummary.l1) || panzerLine || (item.title || item.id);
        let l2 = (labelSummary && labelSummary.l2) || dims || partLabel;
        if (!labelSummary && !panzerLine && partLabel) {
          const split = splitNonPanzerLabelLines(stripSupplierInfo(partLabel));
          l1 = split.l1 || l1;
          l2 = split.l2 || '';
        }
        const l3 = (labelSummary && labelSummary.l3) || elLine;
        const l4 = (labelSummary && labelSummary.l4) || '';
        const params = [];
        if (withQr) params.push('qr=' + encodeURIComponent(scanUrl));
        params.push('l1=' + encodeURIComponent(String(l1)));
        if (l2) params.push('l2=' + encodeURIComponent(String(l2)));
        if (l3) params.push('l3=' + encodeURIComponent(String(l3)));
        if (l4) params.push('l4=' + encodeURIComponent(String(l4)));
        if (dateIso) params.push('d=' + encodeURIComponent(dateIso));
        if (cust1) params.push('c1=' + encodeURIComponent(String(cust1)));
        if (cust2) params.push('c2=' + encodeURIComponent(String(cust2)));
        if (cust3) params.push('c3=' + encodeURIComponent(String(cust3)));
        if (op) params.push('op=' + encodeURIComponent(String(op)));
        if (packageTotal > 1) params.push('pkgTotal=' + encodeURIComponent(String(packageTotal)));
        else if (Number.isFinite(copiesOverride)) params.push('copies=' + encodeURIComponent(String(copiesOverride)));
        params.push('ret=' + encodeURIComponent(currentPageReturnTarget()));
        applyAutoPrintParam(params);
        const url = '/display/label?' + params.join('&');
        openAuxPage(url);
      }

      function askPackageTotal(initialValue) {
        const raw = window.prompt('Wie viele Pakete bzw. Versandstücke hat dieser Auftrag?', String(initialValue || 1));
        if (raw == null) return null;
        const value = Number.parseInt(String(raw).trim(), 10);
        if (!Number.isFinite(value) || value < 1 || value > 20) {
          showToast('Bitte eine Paketanzahl zwischen 1 und 20 eingeben.');
          return null;
        }
        return value;
      }

      function openPackageLabelsForItem(item) {
        if (!item) return;
        const panzerConfigs = Array.isArray(item.panzerConfigs) ? item.panzerConfigs : [];
        const positions = getResidualPositions(item);
        const parts = parseParts(item);
        const effectiveParts = positions.length ? [] : parts;
        const packageEntries = [];
        panzerConfigs.forEach((cfg, idx) => {
          const dims = (cfg && cfg.widthMm && cfg.heightMm) ? (cfg.widthMm + ' x ' + cfg.heightMm + ' mm') : '';
          const mat = cfg && cfg.material ? cfg.material : '';
          const prof = cfg && cfg.profileHeight ? (cfg.profileHeight + 'er') : '';
          const col = cfg && cfg.color ? cfg.color : '';
          packageEntries.push({
            label: ['Panzer ' + (idx + 1) + ':', dims, mat, prof, col].filter(Boolean).join(' '),
            copies: 2,
          });
        });
        (positions.length ? positions : effectiveParts).forEach((label) => {
          packageEntries.push({ label, copies: 1 });
        });
        if (!packageEntries.length) {
          showToast('Keine Positionen fuer Paket-Labels erkannt');
          return;
        }
        const packageTotal = packageEntries.length;
        const batch = packageEntries.map((entry, idx) =>
          buildPartLabelPayload(item, entry.label, {
            copies: entry.copies,
            packageTotal,
            packageIndex: idx + 1,
          })
        );
        openBatchLabelPayloads(batch);
      }

    function openIssWorkPage(item) {
      if (!item) return;
      const block = getPrimaryIssBlock(item);
      if (!block) {
        showToast('Keine ISS-Arbeitsanweisung gefunden');
        return;
      }
      const meta = parseIssHeaderMeta(block.headerText) || {};
      const steps = buildIssWorkSteps(item);
      const esc = (s) => String(s || '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
      const fertigLine = (Array.isArray(block.details) ? block.details : []).find(l => /^Fertigmaß:\s*\d/i.test(String(l || '').trim()));
      const fertigDims = fertigLine ? String(fertigLine).replace(/^Fertigmaß:\s*/i, '').trim() : '';
      const metaParts = [fertigDims || meta.dims, meta.color, meta.mesh].filter(Boolean);
      const sawDisplayPhotoUrl = '/display/iss-assets/' + encodeURIComponent('GehrungsDisplay.jpg');
      const parseSetupMap = (text) => {
        const out = {};
        String(text || '').split(/\\r?\\n/).forEach((line) => {
          const idx = line.indexOf(':');
          if (idx <= 0) return;
          const key = normalizeOneLine(line.slice(0, idx)).toLowerCase();
          const value = normalizeOneLine(line.slice(idx + 1));
          if (!key) return;
          out[key] = value;
        });
        return out;
      };
      const pickFirstNumber = (text, { decimalComma = false } = {}) => {
        const m = /-?\\d+(?:[.,]\\d+)?/.exec(String(text || ''));
        if (!m) return '';
        const raw = String(m[0] || '');
        return decimalComma ? raw.replace('.', ',') : raw.replace(',', '.');
      };
      const buildSawVisualHtml = (step) => {
        const setup = parseSetupMap(step && step.machineSetup);
        const mode = setup.modus || 'OP';
        const parameter = pickFirstNumber(setup.parameter) || '70';
        const angle = pickFirstNumber(setup.schwenken) || '44';
        const number = pickFirstNumber(setup.nummer) || '1';
        const width = pickFirstNumber(setup['sollwert breite'], { decimalComma: true }) || '';
        const height = pickFirstNumber(setup['sollwert höhe'], { decimalComma: true }) || '';
        const istwert = setup.istwert || 'kürzerer Teil';
        return '<div class="illustration illustration-photo">' +
          '<img class="machine-photo" src="' + sawDisplayPhotoUrl + '" alt="Gehrungssaegen-Display">' +
          '<div class="display-tag display-mode">' + esc(mode) + '</div>' +
          '<div class="display-tag display-ist">Istwert: ' + esc(istwert) + '</div>' +
          '<div class="display-tag display-parameter">' + esc(parameter) + '</div>' +
          '<div class="display-led display-angle">' + esc(angle) + '</div>' +
          '<div class="display-led display-target">' +
            (width ? ('<span>B ' + esc(width) + '</span>') : '<span>B -</span>') +
            (height ? ('<span>H ' + esc(height) + '</span>') : '<span>H -</span>') +
          '</div>' +
          '<div class="display-led display-number">' + esc(number) + '</div>' +
          '<div class="display-note display-piece">Stueck ignorieren</div>' +
          '<div class="display-note display-hint">Hybrid ist hier am lesbarsten: helle Feldlabels, dunkle LED-Fenster mit roten Werten.</div>' +
        '</div>';
      };
      const buildStepVisualHtml = (step) => {
        const title = normalizeOneLine(step && step.title);
        if (/Rahmenprofil saegen|Rahmenprofil sägen/i.test(title) && /Gehrungssäge/i.test(String(step && step.machine || ''))) {
          return buildSawVisualHtml(step);
        }
        return '<div class="illustration">' + esc(step && step.visual || 'Bildmaterial folgt') + '</div>';
      };
      const stepsMarkup = steps.length
        ? steps.map((step, index) => {
            const infoText =
              'Material\\n' + String(step.material || '') +
              '\\n\\nMaschine\\n' + String(step.machine || '') +
              (step.machineSetup ? ('\\n\\n' + String(step.machineSetupTitle || 'Maschinenanzeige') + '\\n' + String(step.machineSetup || '')) : '') +
              '\\n\\nEinstellung / Maß\\n' + String(step.setting || '') +
              '\\n\\nErgebnis\\n' + String(step.result || '');
            return '<section class="step">' +
              '<div class="step-top">' +
                '<div>' +
                  '<div class="step-count">Schritt ' + String(index + 1) + ' von ' + String(steps.length) + '</div>' +
                  '<h2>' + esc(step.title || 'Arbeitsschritt') + '</h2>' +
                '</div>' +
              '</div>' +
              '<div class="step-grid">' +
                '<div class="panel"><div class="panel-title">Arbeitsanweisung</div><pre>' + esc(infoText) + '</pre></div>' +
                buildStepVisualHtml(step) +
              '</div>' +
            '</section>';
          }).join('')
        : '<section class="step"><div class="panel"><div class="panel-title">Hinweis</div><pre>Für diese Position ist noch keine ISS-Arbeitsanweisung vorhanden.</pre></div></section>';
      const html = \`<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ISS-Arbeit</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: #07111f; color: #f5f7fb; }
    .page { max-width: 1080px; margin: 0 auto; padding: 18px; }
    .hero { border: 1px solid rgba(255,255,255,.12); border-radius: 16px; background: rgba(255,255,255,.04); padding: 16px; margin-bottom: 14px; }
    .hero h1 { margin: 0 0 8px; font-size: 24px; }
    .hero .product { font-size: 18px; font-weight: 700; line-height: 1.35; }
    .hero .meta { margin-top: 8px; font-size: 13px; opacity: .85; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .btn { padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,.16); background: #13203a; color: #fff; cursor: pointer; }
    .btn.primary { border-color: rgba(65,196,255,.55); background: #0f2b4c; }
    .step { display: grid; gap: 14px; border: 1px solid rgba(255,255,255,.12); border-radius: 16px; background: rgba(255,255,255,.04); padding: 16px; margin-bottom: 14px; }
    .step-top { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .step-count { font-size: 12px; opacity: .78; }
    .step h2 { margin: 0 0 6px; font-size: 22px; }
    .step-grid { display: grid; grid-template-columns: 1.25fr .85fr; gap: 14px; }
    .panel { border: 1px solid rgba(255,255,255,.10); border-radius: 14px; background: #0d182c; padding: 14px; }
    .panel-title { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; opacity: .72; margin-bottom: 10px; }
    .panel pre { margin: 0; white-space: pre-wrap; font: inherit; line-height: 1.45; }
    .illustration { min-height: 240px; border: 1px dashed rgba(255,255,255,.22); border-radius: 14px; background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02)); display: flex; align-items: center; justify-content: center; text-align: center; padding: 18px; color: rgba(255,255,255,.82); overflow: hidden; }
    .illustration-photo { position: relative; padding: 0; border-style: solid; background: #050b14; }
    .machine-photo { width: 100%; height: 100%; object-fit: cover; display: block; }
    .display-tag { position: absolute; background: rgba(255,255,255,.84); color: #121720; border-radius: 6px; padding: 3px 6px; font-size: 11px; font-weight: 800; box-shadow: 0 2px 8px rgba(0,0,0,.28); }
    .display-led { position: absolute; background: rgba(38,0,0,.88); color: #ff4d62; border: 1px solid rgba(255,255,255,.08); border-radius: 6px; font-family: Consolas, 'Courier New', monospace; font-weight: 800; text-shadow: 0 0 8px rgba(255,77,98,.38); box-shadow: inset 0 0 10px rgba(0,0,0,.35); }
    .display-note { position: absolute; background: rgba(7,17,31,.82); color: #f5f7fb; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; padding: 4px 7px; font-size: 11px; line-height: 1.25; box-shadow: 0 2px 8px rgba(0,0,0,.28); }
    .display-mode { left: 49.4%; top: 22.2%; min-width: 8.5%; text-align: center; }
    .display-ist { left: 59.1%; top: 22.1%; width: 18.4%; }
    .display-parameter { left: 80.2%; top: 22.2%; min-width: 11.3%; text-align: center; }
    .display-angle { left: 48.4%; top: 31.9%; width: 10.1%; text-align: center; padding: 4px 0; font-size: 25px; }
    .display-target { left: 61.1%; top: 32.3%; width: 18.5%; min-height: 8.2%; display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 4px 6px; font-size: 16px; line-height: 1.05; }
    .display-target span { display: block; }
    .display-number { left: 80.4%; top: 35.0%; width: 6.5%; text-align: center; padding: 5px 0; font-size: 23px; }
    .display-piece { right: 6.5%; top: 34.0%; }
    .display-hint { left: 4.5%; right: 4.5%; bottom: 5.5%; text-align: center; }
    .step-actions { display: flex; justify-content: space-between; gap: 10px; }
    @media (max-width: 800px) {
      .step-grid { grid-template-columns: 1fr; }
      .step-top { flex-direction: column; }
      .step-actions { flex-direction: column; }
      .step-actions .btn { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="hero">
      <h1>ISS-Arbeitsseite</h1>
      <div class="product">\${esc(block.header)}</div>
      <div class="meta">\${esc(metaParts.join(' • '))}</div>
      <div class="toolbar">
        <button class="btn" type="button" onclick="window.print()">Drucken</button>
        <button class="btn" type="button" onclick="window.close()">Schließen</button>
      </div>
    </div>
    \${stepsMarkup}
  </div>
</body>
</html>\`;
      const win = window.open('about:blank', '_blank');
      if (!win) {
        showToast('Popup blockiert');
        return;
      }
      try {
        try { win.opener = null; } catch (err) {}
        win.document.open();
        win.document.write(html);
        win.document.close();
      } catch (e) {
        try { win.close(); } catch (err) {}
        showToast('ISS-Arbeitsseite konnte nicht geöffnet werden');
      }
    }
      function openMontageberichtForItem(item) {
        if (!item) return;
        const url = '/display/montagebericht?itemId=' + encodeURIComponent(String(item.id || ''));
        openAuxPage(url);
      }
      function defaultLabelCopies(item) {
        const pcs = Array.isArray(item && item.panzerConfigs) ? item.panzerConfigs : [];
        if (pcs.length) return 2;
        const descLc = String(item && item.description || '').toLowerCase();
        if (descLc.includes('welle')) return 1;
        const ps = item && typeof item.panzerSummary === 'string' ? item.panzerSummary.trim() : '';
        if (ps && (ps.toLowerCase().includes('panzer') || /\d{3,4}\s*(?:x|×)\s*\d{3,4}/i.test(ps))) return 2;
        return 1;
      }
      document.getElementById('detailsLabel').onclick = (e) => { if (e) e.stopPropagation(); openLabelForItem(state.detailsItem, defaultLabelCopies(state.detailsItem)); };
      document.getElementById('detailsLabelPackages').onclick = (e) => {
        if (e) e.stopPropagation();
        openPackageLabelsForItem(state.detailsItem);
      };
      document.getElementById('detailsLabelSingle').onclick = (e) => { if (e) e.stopPropagation(); openLabelForItem(state.detailsItem, 1); };
      document.getElementById('detailsLabelIphone').onclick = (e) => { if (e) e.stopPropagation(); openLabelForItem(state.detailsItem, 1); };
      document.getElementById('detailsLabelPlain').onclick = (e) => { if (e) e.stopPropagation(); openLabelForItem(state.detailsItem, defaultLabelCopies(state.detailsItem), { withQr: false, withDate: false }); };
      document.getElementById('detailsIssWork').onclick = (e) => { if (e) e.stopPropagation(); openIssWorkPage(state.detailsItem); };
      document.getElementById('detailsMontagebericht').onclick = () => openMontageberichtForItem(state.detailsItem);
      document.getElementById('detailsLink').onclick = () => {
        const item = state.detailsItem;
        const url = findItemUrl(item);
        if (!url) {
          showToast('Kein Link gefunden');
          return;
        }
        try { window.open(url, '_blank', 'noopener'); } catch (e) { window.location.href = url; }
      };
      document.getElementById('detailsAnswer').onclick = async () => {
        const item = state.detailsItem;
        if (!item) return;
        if (!item.isQuestion) return;
        const next = window.prompt('Antwort (wird in Slack gespeichert)', '');
        if (next == null) return;
        const answer = String(next || '').trim();
        if (!answer) return;
        showToast('Antwort speichern…');
        const out = await postJsonWithRetry('/api/production/question/answer', { itemId: item.id, answer, actor: state.actor || '', station: state.station || '' }, { retries: 0 });
        if (out.ok && out.data && out.data.ok) {
          const cols = out.data && Array.isArray(out.data.columns) ? out.data.columns.map(String).filter(Boolean) : [];
          showToast('Antwort gespeichert' + (cols.length ? (' (' + cols.join(', ') + ')') : ''));
          load();
        } else {
          const err = out && out.data && out.data.error ? String(out.data.error) : 'fehlgeschlagen';
          showToast('Antwort: ' + err);
        }
      };
      document.getElementById('detailsEdit').onclick = () => {
        if (!state.detailsItem) return;
        openEdit(state.detailsItem);
      };
      document.getElementById('editNo').onclick = () => {
        closeEdit();
      };
      document.getElementById('editRecalc').onclick = async () => {
        const descInput = document.getElementById('editDescInput');
        const preview = document.getElementById('editCutPreview');
        const description = descInput ? String(descInput.value || '').trim() : '';
        if (!description) {
          if (preview) preview.textContent = '';
          showToast('Details fehlen');
          return;
        }
        showToast('Berechne…');
        const out = await postJsonWithRetry('/api/production/recalc', { description }, { retries: 0 });
        if (out.ok && out.data && out.data.ok) {
          const ci = out.data.cutInfo ? String(out.data.cutInfo) : '';
          if (preview) preview.textContent = ci || '(keine Panzer erkannt)';
          showToast('Berechnet');
        } else {
          const err = out && out.data && out.data.error ? String(out.data.error) : 'fehlgeschlagen';
          showToast('Berechnung: ' + err);
        }
      };
      document.getElementById('editYes').onclick = async () => {
        const p = state.pending;
        const itemId = p && p.type === 'edit' ? String(p.itemId || '') : '';
        if (!itemId) return;
        const titleInput = document.getElementById('editTitleInput');
        const descInput = document.getElementById('editDescInput');
        const title = titleInput ? String(titleInput.value || '').trim() : '';
        const description = descInput ? String(descInput.value || '').trim() : '';
        showToast('Speichern…');
        const out = await postJsonWithRetry('/api/production/edit', { itemId, title, description, actor: state.actor || '', station: state.station || '' }, { retries: 0 });
        if (out.ok && out.data && out.data.ok) {
          closeEdit();
          showToast('Gespeichert');
          try {
            const rec = await postJsonWithRetry('/api/production/recalc', { description }, { retries: 0 });
            const data = state.last;
            const updated = findItemByIdFromData(data, itemId);
            if (updated) {
              updated.title = title;
              updated.description = description;
              if (rec && rec.ok && rec.data && rec.data.ok) {
                updated.cutInfo = rec.data.cutInfo || null;
                updated.panzerConfigs = rec.data.panzerConfigs || null;
                updated.panzerSummary = rec.data.panzerSummary || null;
                updated.materialNeeds = rec.data.materialNeeds || null;
                updated.endleiste = rec.data.endleiste || null;
                updated.vorsatz = rec.data.vorsatz || null;
                updated.vorsatzElement = rec.data.vorsatzElement || null;
                updated.vorsatzBoxOnly = rec.data.vorsatzBoxOnly || null;
              }
              render(data);
              openDetails(updated);
              highlightItem(itemId);
            }
          } catch (e) {}
          setTimeout(() => load(), 900);
        } else {
          if (out.status === 401) {
            state.adminKey = '';
            try { localStorage.removeItem('adminKey'); } catch (e) {}
            showToast('Admin-Key falsch');
            try { document.getElementById('adminKey').value = ''; document.getElementById('adminKey').focus(); } catch (e) {}
          } else if (out.status === 501) {
            showToast('Admin-Key am Server fehlt');
          } else {
            const err = out && out.data && out.data.error ? String(out.data.error) : 'fehlgeschlagen';
            showToast('Speichern: ' + err);
          }
        }
      };
      document.getElementById('edit').addEventListener('click', (e) => {
        if (e.target && e.target.id === 'edit') closeEdit();
      });
      document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('edit');
        if (modal && modal.classList.contains('open')) {
          if (e.key === 'Escape') {
            e.preventDefault();
            closeEdit();
          }
        }
      });
      document.getElementById('details').addEventListener('click', (e) => {
        if (e.target && e.target.id === 'details') {
          closeDetails();
          if (state.last) render(state.last);
        }
      });
      document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('details');
        if (modal && modal.classList.contains('open')) {
          if (e.key === 'Escape') {
            e.preventDefault();
            closeDetails();
            if (state.last) render(state.last);
          }
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
        if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
          e.preventDefault();
          scanInput.focus();
          scanInput.select();
        }
      });

      if (state.urlCode && !state.urlCodeHandled) {
        const c = String(state.urlCode || '').trim();
        state.urlCodeHandled = true;
        if (c) {
          setScanValue(c);
          openScanPick(c);
          try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
        }
      }
    }

    function injectCss() {
      const css = \`
        html, body { height: 100%; }
        body { margin:0; font-family: Arial, sans-serif; background:#0b0c10; color:#f5f5f5; overflow:hidden; }
        #root { height: 100vh; display:flex; flex-direction:column; }
        .top { display:flex; justify-content:space-between; padding:16px 20px; border-bottom:1px solid rgba(255,255,255,.12); }
        .top-title { font-size:22px; font-weight:700; }
        .top-meta { font-size:12px; opacity:.8; }
        .bar { display:flex; gap:8px; padding:12px 20px; border-bottom:1px solid rgba(255,255,255,.12); }
        .bar input { padding:10px 12px; border-radius:8px; border:1px solid rgba(255,255,255,.2); background:#11131a; color:#fff; }
        #search { flex: 1.2; }
        #scan { flex: 1; }
        #station { flex: .8; }
        #actor { flex: .7; }
        #adminKey { flex: .7; }
        .bar button { padding:10px 12px; border-radius:8px; border:1px solid rgba(255,255,255,.2); background:#151827; color:#fff; cursor:pointer; }
        .toast { position: fixed; left: 50%; top: 70px; transform: translateX(-50%); background: rgba(20,24,39,.92); border: 1px solid rgba(255,255,255,.18); padding: 10px 14px; border-radius: 10px; font-size: 13px; opacity: 0; pointer-events:none; transition: opacity .15s ease; z-index: 10040; }
        .toast.show { opacity: 1; }
        .hidden { display: none !important; }
        .modal { position: fixed; inset: 0; background: rgba(0,0,0,1); display:none; align-items:center; justify-content:center; padding: 18px; z-index: 10000; }
        #doneToday.modal { z-index: 10008; }
        #details.modal { z-index: 10010; }
        #material.modal { z-index: 10020; }
        #scanPick.modal { z-index: 10025; }
        #edit.modal { z-index: 10027; }
        #confirm.modal { z-index: 10030; }
        #login.modal { z-index: 10035; }
        #pw.modal { z-index: 10036; }
        .modal.open { display:flex; }
        .modal-card { width: min(760px, 96vw); background: #11131a; border: 1px solid rgba(255,255,255,.22); border-radius: 14px; padding: 14px; box-shadow: 0 24px 90px rgba(0,0,0,.75); }
        .modal-title { font-weight: 700; margin-bottom: 10px; }
        .modal-pre { white-space: pre-wrap; font-family: inherit; font-size: 13px; opacity: .95; background: #11131a; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 10px; margin: 0 0 12px 0; max-height: 46vh; overflow:auto; }
        #qcWrap { display:none; }
        .qc { background: #0f1118; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 10px; margin: 0 0 12px 0; }
        .qc-title { font-weight: 700; margin: 0 0 8px 0; }
        .qc-row { display:flex; align-items:center; gap: 10px; font-size: 13px; padding: 6px 0; cursor: pointer; user-select: none; }
        .qc-row input { width: 18px; height: 18px; }
        .modal-actions { display:flex; justify-content:flex-end; gap: 8px; }
        .btn { padding:10px 12px; border-radius:8px; border:1px solid rgba(255,255,255,.2); background:#151827; color:#fff; cursor:pointer; }
        .btn.primary { border-color: rgba(65,196,255,.6); }
        #edit input, #edit textarea, #material textarea, #login input, #pw input, #login select { width: 100%; box-sizing: border-box; padding:10px 12px; border-radius:8px; border:1px solid rgba(255,255,255,.2); background:#11131a; color:#fff; margin: 0 0 12px 0; font-family: inherit; }
        #edit textarea { min-height: 240px; resize: vertical; }
        #material textarea { min-height: 120px; resize: vertical; }
        .done-today-card { width: min(980px, 96vw); }
        .done-today-toolbar { display:flex; justify-content:space-between; align-items:flex-start; gap: 12px; margin-bottom: 12px; }
        .done-today-toolbar-main { min-width: 0; }
        .done-today-body { max-height: 70vh; overflow:auto; }
        .done-today-list { display:grid; gap: 10px; }
        .done-today-item { border: 1px solid rgba(255,255,255,.12); border-radius: 12px; background: #0f1118; padding: 12px; }
        .done-today-head { display:flex; justify-content:space-between; align-items:flex-start; gap: 10px; }
        .done-today-title { font-weight: 700; line-height: 1.25; }
        .done-today-time { white-space: nowrap; font-size: 12px; opacity: .85; }
        .done-today-meta { font-size: 12px; opacity: .72; margin-top: 6px; }
        .done-today-desc { font-size: 13px; opacity: .92; margin-top: 8px; white-space: pre-wrap; }
        .done-today-actions { margin-top: 10px; display:flex; justify-content:flex-end; }
        .done-today-events { display:grid; gap: 8px; margin-top: 10px; }
        .done-today-event { padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.03); }
        .done-today-event-head { font-size: 12px; opacity: .82; }
        .done-today-part { font-size: 13px; margin-top: 4px; }
        .done-today-empty { border: 1px dashed rgba(255,255,255,.18); border-radius: 12px; padding: 18px; color: rgba(255,255,255,.82); }
        .details-card { width: min(980px, 98vw); padding: 0; border-color: rgba(65,196,255,.65); }
        .details-header { display:flex; justify-content:space-between; align-items:center; gap: 10px; padding: 14px; border-bottom: 1px solid rgba(255,255,255,.12); }
        .details-body { padding: 14px; max-height: 70vh; overflow:auto; }
        .details-pre { white-space: pre-wrap; font-family: inherit; font-size: 13px; opacity: .95; background: #11131a; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 10px; margin: 0 0 12px 0; }
        .details-section-title { font-weight: 700; margin: 6px 0 10px; }
        .details-list { display:flex; flex-direction:column; gap: 8px; }
        .details-row { display:flex; justify-content:space-between; gap: 10px; align-items:center; padding: 10px; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; background: #0f1118; }
        .details-row-text { font-size: 13px; opacity: .95; }
        .details-row.done .details-row-text { text-decoration: line-through; text-decoration-thickness: 2px; opacity: .6; }
        .details-row-actions { display:flex; gap: 8px; }
        .card-subtasks { margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,.14); display: grid; gap: 4px; }
        .card-subtasks-title { font-size: 12px; font-weight: 700; opacity: .95; }
        .card-subtask { font-size: 12px; opacity: .92; white-space: pre-wrap; }
        .card-subtask.done { text-decoration: line-through; text-decoration-thickness: 2px; opacity: .55; }
        .card-group { margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,.14); }
        .card-group-title { font-size: 12px; font-weight: 700; opacity: .88; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .04em; }
        .card-group-text { font-size: 13px; opacity: .95; white-space: pre-wrap; }
        .grid { display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:14px; padding:14px; flex:1; overflow:hidden; }
        .col { background:#0f1118; border:1px solid rgba(255,255,255,.12); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; min-height: 0; }
        .col-title { padding:12px 14px; font-weight:700; border-bottom:1px solid rgba(255,255,255,.12); display:flex; justify-content:space-between; align-items:center; gap:10px; }
        .col-title-text { display:inline-block; }
        .col-count { display:inline-block; min-width: 2.2em; text-align:center; padding:2px 8px; border-radius:999px; font-size:12px; border:1px solid rgba(255,255,255,.18); opacity:.9; }
        .col-items { display:flex; flex-direction:column; gap:10px; padding:12px; overflow-y:auto; min-height: 0; }
        .card { background:#121624; opacity: 1; border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:12px; }
        .card.rewo { background: rgba(20, 32, 72, .92); border-color: rgba(65,196,255,.22); }
        .card.nonrewo { background: rgba(8, 44, 46, .9); border-color: rgba(64, 224, 208, .22); }
        .card.question { background: rgba(18, 60, 18, .78); border-color: rgba(120, 255, 140, .25); }
        .card.question.q-urgent { background: rgba(92, 12, 18, .88); border-color: rgba(255, 120, 120, .35); }
        .card.urgent { border-color: rgba(255,85,85,.7); }

        .card.material-missing {
          position: relative;
          background: linear-gradient(180deg, rgba(124, 45, 18, .95) 0%, rgba(154, 52, 18, .92) 40%, rgba(69, 26, 3, .96) 100%);
          border: 2px solid rgba(251, 146, 60, .88);
          box-shadow: 0 8px 30px rgba(234, 88, 12, .20), inset 0 0 0 1px rgba(255, 237, 213, .16);
        }
        .card.material-missing::before {
          content: "";
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 4px;
          background: repeating-linear-gradient(90deg, #ea580c 0px, #ea580c 12px, #fbbf24 12px, #fbbf24 24px);
          border-bottom: 1px solid rgba(255, 237, 213, .22);
        }
        .card.material-missing .card-title { color: #fff7ed; }
        .card.material-missing .card-id { color: rgba(255, 237, 213, .82); }
        .card.material-missing .card-desc { color: #fff7ed; opacity: .97; }
        .card.material-missing .card-cut { color: #fff7ed; border-color: rgba(255, 237, 213, .32); }
        .card.emergency.material-missing {
          background: linear-gradient(180deg, rgba(127, 29, 29, .97) 0%, rgba(154, 52, 18, .94) 55%, rgba(69, 26, 3, .98) 100%);
          border-color: rgba(248, 113, 113, .92);
        }
        .card.material-missing.question {
          background: linear-gradient(180deg, rgba(124, 45, 18, .95) 0%, rgba(154, 52, 18, .92) 55%, rgba(18, 60, 18, .85) 100%);
        }
        .card.material-missing.rewo {
          background: linear-gradient(180deg, rgba(124, 45, 18, .95) 0%, rgba(154, 52, 18, .92) 60%, rgba(20, 32, 72, .90) 100%);
        }
        .card.material-missing.nonrewo {
          background: linear-gradient(180deg, rgba(124, 45, 18, .95) 0%, rgba(154, 52, 18, .92) 60%, rgba(8, 44, 46, .88) 100%);
        }

        .card.material-check {
          position: relative;
          background: linear-gradient(180deg, rgba(20, 83, 45, .92) 0%, rgba(22, 101, 52, .88) 45%, rgba(6, 42, 22, .95) 100%);
          border: 2px solid rgba(134, 239, 172, .78);
          box-shadow: 0 6px 24px rgba(34, 197, 94, .14), inset 0 0 0 1px rgba(220, 252, 231, .14);
        }
        .card.material-check::before {
          content: "";
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #4ade80, #22c55e, #4ade80);
          border-bottom: 1px solid rgba(220, 252, 231, .20);
        }
        .card.material-check .card-title { color: #f0fdf4; }
        .card.material-check .card-id { color: rgba(220, 252, 231, .82); }
        .card.material-check .card-desc { color: #f0fdf4; opacity: .96; }
        .card.emergency.material-check {
          background: linear-gradient(180deg, rgba(127, 29, 29, .97) 0%, rgba(153, 27, 27, .95) 55%, rgba(20, 83, 45, .90) 100%);
          border-color: rgba(248, 113, 113, .92);
        }
        .card.material-check.question {
          background: linear-gradient(180deg, rgba(20, 83, 45, .93) 0%, rgba(22, 101, 52, .90) 55%, rgba(18, 60, 18, .88) 100%);
        }
        .card.material-check.rewo {
          background: linear-gradient(180deg, rgba(20, 83, 45, .93) 0%, rgba(22, 101, 52, .90) 60%, rgba(20, 32, 72, .90) 100%);
        }
        .card.material-check.nonrewo {
          background: linear-gradient(180deg, rgba(20, 83, 45, .93) 0%, rgba(22, 101, 52, .90) 60%, rgba(8, 44, 46, .88) 100%);
        }

        .card.material-ordered {
          position: relative;
          background: linear-gradient(180deg, rgba(30, 58, 138, .93) 0%, rgba(37, 99, 235, .86) 45%, rgba(15, 23, 42, .96) 100%);
          border: 2px solid rgba(147, 197, 253, .82);
          box-shadow: 0 6px 24px rgba(59, 130, 246, .16), inset 0 0 0 1px rgba(219, 234, 254, .14);
        }
        .card.material-ordered::before {
          content: "";
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #60a5fa, #3b82f6, #60a5fa);
          border-bottom: 1px solid rgba(219, 234, 254, .20);
        }
        .card.material-ordered .card-title { color: #eff6ff; }
        .card.material-ordered .card-id { color: rgba(219, 234, 254, .82); }
        .card.material-ordered .card-desc { color: #eff6ff; opacity: .96; }
        .card.emergency.material-ordered {
          background: linear-gradient(180deg, rgba(127, 29, 29, .97) 0%, rgba(153, 27, 27, .95) 55%, rgba(30, 58, 138, .92) 100%);
          border-color: rgba(248, 113, 113, .92);
        }
        .card.material-ordered.question {
          background: linear-gradient(180deg, rgba(30, 58, 138, .94) 0%, rgba(37, 99, 235, .88) 55%, rgba(18, 60, 18, .88) 100%);
        }
        .card.material-ordered.rewo {
          background: linear-gradient(180deg, rgba(30, 58, 138, .94) 0%, rgba(37, 99, 235, .88) 60%, rgba(20, 32, 72, .90) 100%);
        }
        .card.material-ordered.nonrewo {
          background: linear-gradient(180deg, rgba(30, 58, 138, .94) 0%, rgba(37, 99, 235, .88) 60%, rgba(8, 44, 46, .88) 100%);
        }

        .b-mat-missing {
          background: linear-gradient(180deg, #f97316 0%, #ea580c 100%);
          color: #fff7ed;
          font-weight: 800;
          padding: 4px 9px;
          border: 1px solid #fdba74;
          box-shadow: 0 3px 12px rgba(234, 88, 12, .28);
          font-size: 11px;
        }
        .b-mat-check {
          background: linear-gradient(180deg, #4ade80 0%, #22c55e 100%);
          color: #052e16;
          font-weight: 800;
          padding: 4px 9px;
          border: 1px solid #86efac;
          box-shadow: 0 3px 12px rgba(34, 197, 94, .24);
          font-size: 11px;
        }
        .b-mat-ordered {
          background: linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%);
          color: #eff6ff;
          font-weight: 800;
          padding: 4px 9px;
          border: 1px solid #93c5fd;
          box-shadow: 0 3px 12px rgba(59, 130, 246, .24);
          font-size: 11px;
        }
        .b-mat-viewed {
          background: linear-gradient(180deg, #cbd5e1 0%, #94a3b8 100%);
          color: #0f172a;
          font-weight: 700;
          padding: 4px 9px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 2px 8px rgba(148, 163, 184, .22);
          font-size: 11px;
        }
        .card.emergency {
          position: relative;
          background: linear-gradient(180deg, rgba(127, 29, 29, .96) 0%, rgba(153, 27, 27, .94) 24%, rgba(69, 10, 10, .98) 100%);
          border: 2px solid rgba(248, 113, 113, .92);
          box-shadow: 0 10px 36px rgba(220, 38, 38, .28), inset 0 0 0 1px rgba(254, 202, 202, .18);
        }
        .card.emergency::before {
          content: "";
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 5px;
          background: repeating-linear-gradient(
            90deg,
            #dc2626 0px, #dc2626 14px,
            #fca5a5 14px, #fca5a5 28px
          );
          border-bottom: 1px solid rgba(254, 202, 202, .25);
        }
        .card.emergency .card-title { color: #fff5f5; }
        .card.emergency .card-id { color: rgba(254, 226, 226, .82); }
        .card.emergency .card-desc { color: #fff5f5; opacity: .96; }
        .card.emergency .card-group-title { color: rgba(254, 202, 202, .96); opacity: 1; }
        .card.emergency .card-group-text { color: #fff5f5; opacity: .97; }
        .card.emergency .card-cut { border-color: rgba(254, 202, 202, .35); color: #fff; }
        .card.emergency .card-note { color: #fee2e2; }
        .card.emergency.question {
          background: linear-gradient(180deg, rgba(127, 29, 29, .96) 0%, rgba(153, 27, 27, .94) 50%, rgba(18, 60, 18, .90) 100%);
        }
        .card.emergency.rewo {
          background: linear-gradient(180deg, rgba(127, 29, 29, .96) 0%, rgba(153, 27, 27, .94) 60%, rgba(20, 32, 72, .92) 100%);
        }
        .card.emergency.nonrewo {
          background: linear-gradient(180deg, rgba(127, 29, 29, .96) 0%, rgba(153, 27, 27, .94) 60%, rgba(8, 44, 46, .9) 100%);
        }
        .b-emergency {
          background: linear-gradient(180deg, #ef4444 0%, #dc2626 100%);
          color: #fff;
          border: 1px solid #fca5a5;
          font-weight: 900;
          letter-spacing: .06em;
          padding: 4px 10px;
          font-size: 11px;
          text-transform: uppercase;
          box-shadow: 0 4px 14px rgba(220, 38, 38, .35);
        }
        .details-card.emergency {
          background: linear-gradient(180deg, rgba(127, 29, 29, .98) 0%, rgba(23, 3, 3, .99) 100%);
          border: 2px solid rgba(248, 113, 113, .92);
          box-shadow: 0 24px 110px rgba(220, 38, 38, .38);
        }
        .details-card.emergency .details-header {
          background: repeating-linear-gradient(
            90deg,
            rgba(220, 38, 38, .95) 0px, rgba(220, 38, 38, .95) 16px,
            rgba(153, 27, 27, .98) 16px, rgba(153, 27, 27, .98) 32px
          );
          border-bottom: 1px solid rgba(254, 202, 202, .28);
        }
        .details-card.emergency .details-pre { background: rgba(0, 0, 0, .35); border-color: rgba(254, 202, 202, .2); color: #fff5f5; }
        .details-card.emergency .details-section-title { color: #fecaca; }
        .details-card.emergency .details-row { background: rgba(0,0,0,.32); border-color: rgba(254, 202, 202, .22); color: #fff; }
        .details-card.emergency .modal-title { color: #fff5f5; font-weight: 900; letter-spacing: .01em; }
        .card.selected { border-color: rgba(65,196,255,.95); box-shadow: 0 0 0 5px rgba(65,196,255,.16), 0 18px 60px rgba(0,0,0,.35); }
        .card.flash { outline: 2px solid rgba(65,196,255,.85); box-shadow: 0 0 0 4px rgba(65,196,255,.12); }
        .card-header { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
        .card-title { font-weight:700; line-height:1.2; }
        .card-badges { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
        .badge { display:inline-block; padding:3px 8px; border-radius:999px; font-size:11px; border:1px solid rgba(255,255,255,.18); }
        .copy-btn { padding:3px 8px; border-radius:999px; font-size:11px; border:1px solid rgba(255,255,255,.18); background: transparent; color:#fff; cursor:pointer; }
        .b-rewo { border-color: rgba(65,196,255,.6); }
        .b-status { opacity:.85; }
        .b-local { border-color: rgba(140,255,140,.55); color: rgba(210,255,210,.95); }
        .b-mat { border-color: rgba(255,196,65,.75); color: rgba(255,230,170,.95); }
        .b-date { opacity:.85; }
        .b-urgent { border-color: rgba(255,85,85,.7); }
        .b-q { border-color: rgba(255, 255, 255, .32); opacity: .9; }
        .card-body { margin-top:10px; display:grid; grid-template-columns: 1fr 80px; gap:10px; align-items:start; }
        .card-desc { font-size:12px; opacity:.9; white-space:pre-wrap; }
        .card-id { font-size:11px; opacity:.7; margin-bottom:6px; }
        .card-cut { font-size:12px; margin-top:8px; padding-top:8px; border-top:1px dashed rgba(255,255,255,.18); }
        .card-note { font-size: 12px; margin-top: 8px; opacity: .95; }
        .qr { width:80px; height:80px; background:#fff; border-radius:8px; padding:6px; box-sizing:border-box; }
        .btn[disabled], .copy-btn[disabled], .bar button[disabled] { opacity: .45; cursor: not-allowed; }
        @media (max-width: 1100px) { body { overflow:auto; } #root { height:auto; } .grid { grid-template-columns: 1fr; overflow:visible; } .col { min-height:auto; } .col-items { overflow:visible; } .toast { top: 120px; } }
        @media (max-width: 700px) {
          .top { padding: 14px 14px; }
          .bar { padding: 10px 14px; flex-wrap: wrap; }
          .bar input { width: 100%; flex: 1 1 100%; min-width: 0; }
          #search { flex: 1 1 100%; }
          #scan { flex: 1 1 100%; }
          #station { flex: 1 1 100%; }
          #actor { flex: 1 1 100%; }
          #adminKey { flex: 1 1 100%; }
          .bar button { flex: 1 1 calc(33.33% - 6px); }
          .done-today-toolbar { flex-direction: column; }
          .card-header { flex-direction: column; align-items: stretch; }
          .card-badges { justify-content: flex-start; }
          .copy-btn { padding: 8px 10px; font-size: 12px; }
          .details-row { flex-direction: column; align-items: stretch; }
          .details-row-actions { flex-wrap: wrap; justify-content: flex-end; }
          .details-row-actions .btn { flex: 1 1 calc(33.33% - 8px); }
        }
      \`;
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }

    function hasOpenModal() {
      return !!document.querySelector('.modal.open');
    }

    function load({ forceMaterials } = {}) {
      const url = forceMaterials ? '/api/production/board?forceMaterials=1' : '/api/production/board';
      const pBoard = fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
      const pMat = loadMatCheckedIds().then(() => true).catch(() => false);
      Promise.allSettled([pBoard, pMat]).then((results) => {
        const d = results[0].status === 'fulfilled' ? results[0].value : null;
        if (d) {
          state.last = d;
          const sigAt = d && d.materialSignalsAt ? String(d.materialSignalsAt) : null;
          if (sigAt && sigAt !== state.materialSignalsAt) {
            state.materialSignalsAt = sigAt;
            const closed = d && d.materialSignals && Array.isArray(d.materialSignals.closed) ? d.materialSignals.closed : [];
            if (closed.length) showToast('Material geliefert/archiviert: ' + closed[0] + (closed.length > 1 ? (' +' + (closed.length - 1)) : ''));
          }
        }
        const activeId = document.activeElement && document.activeElement.id ? String(document.activeElement.id) : '';
        const busy =
          activeId === 'search' ||
          activeId === 'scan' ||
          hasOpenModal();
        if (state.last && !busy) {
          render(state.last);
        }
      }).catch(() => {
        if (state.last && !hasOpenModal()) render(state.last);
      });
    }

    injectCss();
    load();
    setInterval(load, 60000);

    try {
      const boot = document.getElementById('boot');
      if (boot) boot.remove();
    } catch (e) {}
  </script>
</body>
</html>`;
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

router.get('/materialcheck/:token', (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!isMaterialStatusTokenValid(token)) {
    return res.status(404).send('Not found');
  }

  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Materialfreigabe</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: #0b0f19; color: #e6eaf2; }
    a { color: inherit; }
    .wrap { max-width: 1440px; margin: 0 auto; padding: 16px; }
    .top { display:flex; justify-content:space-between; align-items:flex-start; gap: 12px; margin-bottom: 12px; }
    .title { font-size: 22px; font-weight: 800; }
    .meta { font-size: 12px; color: #d1d9e6; margin-top: 4px; }
    .bar { display:flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .btn, .bar a { padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.18); background: rgba(18,28,46,.92); color: #f4f7fb; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
    .btn:hover, .bar a:hover { background: rgba(35,48,73,.98); }
    .btn.small { padding: 7px 10px; border-radius: 10px; font-size: 12px; }
    .btn.ok { border-color: rgba(34,197,94,.55); background: rgba(22,163,74,.16); }
    .btn.err { border-color: rgba(239,68,68,.55); background: rgba(220,38,38,.16); }
    .btn.primary { background: #1d4ed8; border-color: #2563eb; color: #fff; }
    input, select, textarea { width: 100%; padding: 9px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,.18); background: #1a2436; color: #f8fbff; }
    input::placeholder, textarea::placeholder { color: #b8c4d7; }
    input:focus, select:focus, textarea:focus { outline: 2px solid #60a5fa; outline-offset: 1px; border-color: #60a5fa; background: #202c42; }
    textarea { min-height: 42px; resize: vertical; }
    .grid { display:grid; gap: 12px; grid-template-columns: 1fr; align-items: start; }
    .card { border: 1px solid rgba(255,255,255,.12); border-radius: 14px; background: rgba(15,24,39,.96); overflow: hidden; box-shadow: 0 6px 18px rgba(0,0,0,.24); }
    .card-h { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.10); display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
    .card-b { padding: 12px; }
    .h { font-weight: 800; }
    .m { font-size: 12px; color: #d1d9e6; margin-top: 4px; white-space: pre-wrap; }
    .pill { display:inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: #f4f7fb; }
    .pill.red { background: rgba(153,27,27,.24); }
    .pill.green { background: rgba(22,163,74,.20); }
    .pill.yellow { background: rgba(234,179,8,.18); }
    .pill.gray { background: rgba(148,163,184,.14); }
    .dot { display:inline-block; width: 10px; height: 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,.26); margin-right: 6px; vertical-align: middle; }
    .dot.red { background: #ef4444; }
    .dot.yellow { background: #f59e0b; }
    .dot.green { background: #22c55e; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { text-align: left; padding: 8px 8px; border-bottom: 1px solid rgba(255,255,255,.07); vertical-align: top; }
    th { font-size: 12px; color: #d1d9e6; font-weight: 700; white-space: nowrap; }
    td { font-size: 13px; color: #f4f7fb; }
    td input, td textarea { font-size: 12px; }
    .dangerRow td { background: rgba(153,27,27,.18); }
    .warnRow td { background: rgba(8,145,178,.18); }
    .actions { display:flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .muted { color: #d1d9e6; opacity: .9; font-size: 12px; }
    .summary { display:flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .stat { padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,.18); background: rgba(18,28,46,.92); color: #f4f7fb; font-size: 12px; font-weight: 700; display:inline-flex; align-items: center; }
    .stat.red { border-color: rgba(239,68,68,.55); background: rgba(220,38,38,.16); }
    .stat.yellow { border-color: rgba(245,158,11,.60); background: rgba(234,179,8,.16); }
    .stat.green { border-color: rgba(34,197,94,.55); background: rgba(22,163,74,.14); }
    .stat.gray { border-color: rgba(148,163,184,.35); background: rgba(148,163,184,.10); }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title">Materialfreigabe</div>
        <div class="meta" id="meta"></div>
      </div>
      <div class="bar">
        <a href="/display">Monitor</a>
        <a href="/display/bestand">Bestandsansicht</a>
        <a href="/display/materialstatus/${escapeHtml(token)}">Materialstatus</a>
      </div>
    </div>

    <div class="bar">
      <div style="min-width: 220px;">
        <label class="muted">Zähler (optional)</label>
        <input id="actor" placeholder="z. B. BS" />
      </div>
      <div style="min-width: 220px;">
        <label class="muted">Filter</label>
        <select id="filter">
          <option value="all">Alle</option>
          <option value="pending">Nur ungeprüft</option>
          <option value="approved">Nur freigegeben</option>
          <option value="rejected">Nur abgelehnt</option>
        </select>
      </div>
      <button class="btn" id="reload" type="button">Neu laden</button>
    </div>

    <div id="summary" class="summary"></div>
    <div id="root" class="grid"></div>
  </div>

  <script>
    const token = ${JSON.stringify(token)};
    const state = { last: null };

    function el(tag, attrs, children) {
      const node = document.createElement(tag);
      if (attrs) {
        Object.entries(attrs).forEach(([k, v]) => {
          if (k === 'class') node.className = v;
          else if (k === 'html') node.innerHTML = v;
          else node.setAttribute(k, v);
        });
      }
      (children || []).forEach(c => node.appendChild(c));
      return node;
    }

    function text(s) { return document.createTextNode(s); }
    function fmt(n) {
      const x = Number(n || 0);
      if (!Number.isFinite(x)) return '0';
      return String(Math.round(x * 100) / 100);
    }

    async function fetchJson(url, opts) {
      const res = await fetch(url, opts || {});
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.ok === false) {
        const msg = data && data.error ? data.error : ('HTTP ' + res.status);
        throw new Error(msg);
      }
      return data;
    }

    function decisionPill(item) {
      const d = String(item && item.decision || '');
      if (d === 'approved') return el('span', { class: 'pill green' }, [text('Freigegeben')]);
      if (d === 'rejected') return el('span', { class: 'pill red' }, [text('Abgelehnt')]);
      return el('span', { class: 'pill gray' }, [text('Ungeprüft')]);
    }

    function trafficLevel(item) {
      const missing = Number(item && item.missingCount || 0);
      const untracked = Number(item && item.untrackedCount || 0);
      if (missing > 0) return 'red';
      if (untracked > 0) return 'yellow';
      return 'green';
    }

    function trafficPill(item) {
      const lvl = String(item && item.traffic || '') || trafficLevel(item);
      if (lvl === 'red') return el('span', { class: 'pill red' }, [el('span', { class: 'dot red' }, []), text('Material fehlt')]);
      if (lvl === 'yellow') return el('span', { class: 'pill yellow' }, [el('span', { class: 'dot yellow' }, []), text('Material neu')]);
      return el('span', { class: 'pill green' }, [el('span', { class: 'dot green' }, []), text('Material OK')]);
    }

    function statChip(label, cls) {
      return el('div', { class: 'stat ' + cls }, [text(label)]);
    }

    function renderSummary(items, totalCount) {
      const summary = document.getElementById('summary');
      if (!summary) return;
      summary.innerHTML = '';

      const traffic = { red: 0, yellow: 0, green: 0 };
      const decisions = { pending: 0, approved: 0, rejected: 0 };
      items.forEach((it) => {
        const lvl = String(it && it.traffic || '') || trafficLevel(it);
        if (lvl === 'red') traffic.red += 1;
        else if (lvl === 'yellow') traffic.yellow += 1;
        else traffic.green += 1;

        const d = String(it && it.decision || '');
        if (!d) decisions.pending += 1;
        else if (d === 'approved') decisions.approved += 1;
        else if (d === 'rejected') decisions.rejected += 1;
        else decisions.pending += 1;
      });

      summary.appendChild(statChip('Rot: ' + String(traffic.red), 'red'));
      summary.appendChild(statChip('Gelb: ' + String(traffic.yellow), 'yellow'));
      summary.appendChild(statChip('Grün: ' + String(traffic.green), 'green'));
      summary.appendChild(statChip('Ungeprüft: ' + String(decisions.pending), 'gray'));
      summary.appendChild(statChip('Freigegeben: ' + String(decisions.approved), 'green'));
      summary.appendChild(statChip('Abgelehnt: ' + String(decisions.rejected), 'red'));

      if (typeof totalCount === 'number' && totalCount > items.length) {
        summary.appendChild(statChip('Gefiltert: ' + String(items.length) + ' / ' + String(totalCount), 'gray'));
      }
    }

    function buildDemandTable(item) {
      const rows = Array.isArray(item.demandRows) ? item.demandRows : [];
      if (!rows.length) return el('div', { class: 'muted' }, [text('Kein berechneter Bedarf vorhanden (oder nicht erkannt).')]);

      const table = el('table', null, [
        el('thead', null, [
          el('tr', null, [
            el('th', null, [text('Material')]),
            el('th', null, [text('VE')]),
            el('th', null, [text('Bestand VE')]),
            el('th', null, [text('Verfügbar')]),
            el('th', null, [text('Bedarf')]),
            el('th', null, [text('Fehlt')]),
            el('th', null, [text('Notiz')]),
          ])
        ]),
        el('tbody', null, rows.map((r) => {
          const cls = r.status === 'missing' ? 'dangerRow' : (r.status === 'untracked' ? 'warnRow' : '');
          const packSize = el('input', { type: 'number', min: '1', step: '1', value: String(r.packSize || 1), 'data-k': r.inventoryKey, 'data-f': 'packSize' }, []);
          const stockPacks = el('input', { type: 'number', min: '0', step: '1', value: String(r.stockPacks || 0), 'data-k': r.inventoryKey, 'data-f': 'stockPacks' }, []);
          const notes = el('textarea', { rows: '2', placeholder: 'optional', 'data-k': r.inventoryKey, 'data-f': 'notes' }, []);
          notes.value = String(r.notes || '');

          const unit = el('input', { type: 'text', value: String(r.unit || ''), placeholder: 'Stk/Stangen', 'data-k': r.inventoryKey, 'data-f': 'unit' }, []);
          const label = el('input', { type: 'text', value: String(r.label || ''), 'data-k': r.inventoryKey, 'data-f': 'label' }, []);

          return el('tr', { class: cls }, [
            el('td', null, [
              el('div', { class: 'muted' }, [text(r.tracked ? 'geführt' : 'neu')]),
              label,
              el('div', { style: 'margin-top:6px;' }, [unit]),
            ]),
            el('td', null, [packSize]),
            el('td', null, [stockPacks]),
            el('td', null, [text(fmt(r.availableUnits))]),
            el('td', null, [text(fmt(r.neededUnits))]),
            el('td', null, [text(fmt(r.missingUnits))]),
            el('td', null, [notes]),
          ]);
        }))
      ]);

      return table;
    }

    function collectInventoryEditsForItem(itemId) {
      const root = document.querySelector('[data-item-root="' + itemId + '"]');
      if (!root) return [];
      const inputs = root.querySelectorAll('[data-k][data-f]');
      const byKey = new Map();
      inputs.forEach((inp) => {
        const k = String(inp.getAttribute('data-k') || '').trim();
        const f = String(inp.getAttribute('data-f') || '').trim();
        if (!k || !f) return;
        if (!byKey.has(k)) byKey.set(k, {});
        const obj = byKey.get(k);
        if (inp.tagName === 'TEXTAREA' || inp.type === 'text') obj[f] = String(inp.value || '');
        else obj[f] = Number(inp.value || 0);
      });
      const out = [];
      byKey.forEach((obj, key) => {
        out.push({
          key,
          label: String(obj.label || '').trim(),
          unit: String(obj.unit || '').trim(),
          packSize: obj.packSize,
          stockPacks: obj.stockPacks,
          notes: String(obj.notes || '').trim(),
        });
      });
      return out;
    }

    async function saveInventoryForItem(itemId, btn) {
      const records = collectInventoryEditsForItem(itemId);
      if (!records.length) return;
      if (btn) btn.setAttribute('disabled', 'disabled');
      try {
        await fetchJson('/api/production/material-status/upsert-inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, records })
        });
        await load();
      } finally {
        if (btn) btn.removeAttribute('disabled');
      }
    }

    async function setDecision(itemId, decision, btn) {
      const actor = String((document.getElementById('actor') || {}).value || '').trim();
      const note = prompt(decision === 'rejected' ? 'Kurze Notiz (optional):' : 'Notiz (optional):', '') || '';
      if (btn) btn.setAttribute('disabled', 'disabled');
      try {
        await fetchJson('/api/production/material-check/decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, itemId, decision, actor, note })
        });
        await load();
      } finally {
        if (btn) btn.removeAttribute('disabled');
      }
    }

    function render(data) {
      state.last = data;
      const root = document.getElementById('root');
      root.innerHTML = '';

      const itemsRaw = data && Array.isArray(data.items) ? data.items : [];
      const filter = String((document.getElementById('filter') || {}).value || 'all');
      const items = itemsRaw.filter((it) => {
        const d = String(it.decision || '');
        if (filter === 'pending') return !d;
        if (filter === 'approved') return d === 'approved';
        if (filter === 'rejected') return d === 'rejected';
        return true;
      });

      renderSummary(items, itemsRaw.length);

      document.getElementById('meta').textContent =
        'Stand: ' + (data && data.updatedAt ? new Date(data.updatedAt).toLocaleString('de-DE') : new Date().toLocaleString('de-DE')) +
        ' • Aufträge: ' + String(items.length) + (filter === 'all' ? '' : (' von ' + String(itemsRaw.length)));

      if (!items.length) {
        root.appendChild(el('div', { class: 'muted' }, [text('Keine passenden Aufträge gefunden.')]));
        return;
      }

      items.forEach((item) => {
        const saveBtn = el('button', { class: 'btn small', type: 'button' }, [text('Bestand speichern')]);
        saveBtn.addEventListener('click', () => saveInventoryForItem(item.itemId, saveBtn));

        const okBtn = el('button', { class: 'btn small ok', type: 'button' }, [text('Freigeben')]);
        okBtn.addEventListener('click', () => setDecision(item.itemId, 'approved', okBtn));

        const noBtn = el('button', { class: 'btn small err', type: 'button' }, [text('Ablehnen')]);
        noBtn.addEventListener('click', () => setDecision(item.itemId, 'rejected', noBtn));

        const headerRight = el('div', { style: 'text-align:right;' }, [
          el('div', { style: 'display:flex; gap:6px; justify-content:flex-end; flex-wrap:wrap;' }, [
            trafficPill(item),
            decisionPill(item),
          ]),
          el('div', { class: 'muted', style: 'margin-top:6px;' }, [
            text('Fehlt: ' + String(item.missingCount || 0) + ' • Neu: ' + String(item.untrackedCount || 0))
          ])
        ]);

        const card = el('div', { class: 'card', 'data-item-root': item.itemId }, [
          el('div', { class: 'card-h' }, [
            el('div', null, [
              el('div', { class: 'h' }, [text(item.title || item.itemId || '')]),
              el('div', { class: 'm' }, [text((item.status || '') + (item.effectiveDate ? (' • ' + String(item.effectiveDate)) : ''))]),
              item.panzerSummary ? el('div', { class: 'm' }, [text('Panzer: ' + item.panzerSummary)]) : el('span'),
            ]),
            headerRight,
          ]),
          el('div', { class: 'card-b' }, [
            item.orderOverview ? el('div', { class: 'm' }, [text(item.orderOverview)]) : el('span'),
            el('div', { style: 'margin-top:10px;' }, [buildDemandTable(item)]),
            el('div', { class: 'actions', style: 'margin-top:10px;' }, [saveBtn, okBtn, noBtn]),
          ])
        ]);
        root.appendChild(card);
      });
    }

    async function load() {
      const data = await fetchJson('/api/production/material-check?token=' + encodeURIComponent(token) + '&_ts=' + Date.now());
      render(data);
    }

    document.getElementById('reload').addEventListener('click', load);
    document.getElementById('filter').addEventListener('change', () => { if (state.last) render(state.last); });
    load();
    setInterval(load, 60000);
  </script>
</body>
</html>`;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

module.exports = router;
