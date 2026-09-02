const express = require('express');
const fs = require('fs');
const path = require('path');
const { monitorHttpAuthMiddleware } = require('../middleware');
const { postMessage, listColumns, listItems, listSchema, createItem } = require('../slack');

const router = express.Router();
router.use(monitorHttpAuthMiddleware);

function loadJsonFromData(fileName, fallback) {
  try {
    const filePath = path.join(__dirname, '..', '..', 'data', fileName);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

const SP_B35_PARTS = loadJsonFromData('sp-b35-parts.json', { parts: [], rules: {} });
const SP_B35_HOOKS = loadJsonFromData('sp-b35-hook-lookup.json', { standardHooks: [], federhakenHooks: [] });
const SP_B35_PARTS_BY_POS = new Map((Array.isArray(SP_B35_PARTS.parts) ? SP_B35_PARTS.parts : []).map((part) => [Number(part.pos), part]));
const PRODUCTION_PARTS_FILE = path.join(__dirname, '..', '..', 'data', 'production-parts.json');

function readJsonObject(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : fallback;
  } catch (err) {
    return fallback;
  }
}

function writeJsonObject(filePath, obj) {
  try { fs.mkdirSync(path.dirname(filePath), { recursive: true }); } catch (err) {}
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj || {}, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function persistSpB35Consumption(itemId, payload) {
  const key = normalize(itemId);
  if (!key) return;
  const items = Array.isArray(payload && payload.items) ? payload.items : [];
  const consumptionItems = items
    .map((item, idx) => {
      const details = item && item.details && typeof item.details === 'object' ? item.details : null;
      const spb35 = details && details.spb35 && typeof details.spb35 === 'object' ? details.spb35 : null;
      const entries = spb35 && Array.isArray(spb35.consumption) ? spb35.consumption : [];
      if (!entries.length) return null;
      return {
        position: idx + 1,
        model: spb35.model || 'SP-B 35',
        entries,
      };
    })
    .filter(Boolean);
  if (!consumptionItems.length) return;

  const all = readJsonObject(PRODUCTION_PARTS_FILE, {});
  const entry = (all[key] && typeof all[key] === 'object') ? all[key] : {};
  entry.__consumption = {
    generatedAt: new Date().toISOString(),
    source: 'intake-sp-b35',
    items: consumptionItems,
  };
  all[key] = entry;
  writeJsonObject(PRODUCTION_PARTS_FILE, all);
}

function normalize(s) {
  return String(s ?? '')
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function must(v, label) {
  const t = normalize(v);
  if (!t) {
    const err = new Error(`Missing ${label}`);
    err.status = 400;
    throw err;
  }
  return t;
}

function asInt(v) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : NaN;
}

function hasAnyText(...vals) {
  return vals.some(v => normalize(v));
}

function getSpB35Part(pos) {
  return SP_B35_PARTS_BY_POS.get(Number(pos)) || null;
}

function formatSizeMm(widthMm, heightMm) {
  const w = Number(widthMm);
  const h = Number(heightMm);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return '';
  return `${Math.round(w)} x ${Math.round(h)} mm`;
}

function parseMmValue(value) {
  const n = asInt(value);
  return Number.isFinite(n) ? n : null;
}

function formatCountedCut(count, sizeMm) {
  const n = Number(sizeMm);
  if (!Number.isFinite(n)) return '';
  return `${count} x ${Math.round(n)} mm`;
}

function isInsidePosition(value) {
  const s = normalize(value).toLowerCase();
  return s === 'innenliegend';
}

function isOutsidePosition(value) {
  const s = normalize(value).toLowerCase();
  return s === 'außenliegend' || s === 'aussenliegend';
}

function lookupSpB35HookEntry(xMm, useFederhaken) {
  if (!Number.isFinite(Number(xMm))) return null;
  const list = Array.isArray(useFederhaken ? SP_B35_HOOKS.federhakenHooks : SP_B35_HOOKS.standardHooks)
    ? (useFederhaken ? SP_B35_HOOKS.federhakenHooks : SP_B35_HOOKS.standardHooks)
    : [];
  return list.find((entry) => Number(entry && entry.xMm) === Number(xMm)) || null;
}

function resolveSpB35Keder(meshLabel) {
  const mesh = normalize(meshLabel).toLowerCase();
  if (!mesh) return null;
  if (mesh === 'standard' || mesh === 'durchblick' || mesh === 'pollenschutz') {
    return { partPos: 5, label: 'PVC Keder Ø5,1 mm', articleNo: '300135300 / 300135400' };
  }
  if (mesh === 'reißfest' || mesh === 'reissfest' || mesh === 'edelstahl') {
    return { partPos: 6, label: 'PVC Keder Ø4,7 mm', articleNo: '300235300 / 300235400' };
  }
  return null;
}

function resolveSpB35Consumption(details, calc) {
  const d = details || {};
  const c = calc || {};
  const parts = [];
  const pushPart = (label, qty, extra = {}) => {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) return;
    parts.push({ label, qty: Math.round(n), ...extra });
  };
  const brushLengthMm = Number.isFinite(Number(c.brushLengthMm)) ? Number(c.brushLengthMm) : null;
  const useFederhaken = !!c.useFederhaken;
  const needsMiddleLatch = !!c.needsMiddleLatch;
  const needsStabilization = !!c.needsStabilization;
  const mesh = normalize(d.insectMesh);
  const keder = resolveSpB35Keder(mesh);

  pushPart('SP-B 35 Profil', 4, { unit: 'Stk', articleNo: '3001023FF' });
  pushPart('Eckverbinder', 4, { unit: 'Stk', articleNo: '300130500' });
  pushPart('Schlitten 1 mm', useFederhaken ? 6 : 4, { unit: 'Stk', articleNo: '300141200' });
  pushPart('Griffleiste zum Anschrauben', 2, { unit: 'Stk', articleNo: '300138200' });
  if (needsMiddleLatch) {
    pushPart('Schlitten 1 mm', 2, { unit: 'Stk', articleNo: '300141200', reason: 'Grifflasche/Mittelarretierung' });
    pushPart('Platte für Mittelarretierung', 2, { unit: 'Stk', articleNo: '300141300' });
  }
  if (useFederhaken) {
    pushPart('AL-IS Federhakenaufnahme', 2, { unit: 'Stk', articleNo: '300140100' });
  } else {
    pushPart('Haken lang', needsMiddleLatch ? 4 : 2, { unit: 'Stk', articleNo: c.hookArticleNo || '3001420xx' });
    pushPart('Haken kurz', 2, { unit: 'Stk', articleNo: '3001450xx' });
  }
  if (keder) pushPart(keder.label, 1, { unit: 'Satz', articleNo: keder.articleNo });
  if (needsStabilization) {
    pushPart('Stabilisierungsprofil', 1, { unit: 'Stk', articleNo: '3001030FF' });
    pushPart('Verbinder für Stabilisierungsprofil', 2, { unit: 'Stk', articleNo: '300130200' });
  }
  if (brushLengthMm) pushPart(`Bürste ${Math.round(brushLengthMm)} mm`, 1, { unit: 'Satz' });

  return parts;
}

function calculateSpB35(details) {
  const d = details || {};
  if (normalize(d.insectSubtype) !== 'Spannrahmen') return null;

  const widthMm = parseMmValue(d.insectWidthMm);
  const heightMm = parseMmValue(d.insectHeightMm);
  const xRawMm = parseMmValue(d.spannHakenLengthMm);
  const position = normalize(d.spannPosition);
  const useFederhaken = normalize(d.spannFederstifte).toLowerCase() === 'ja';
  const xMm = useFederhaken ? null : (Number.isFinite(xRawMm) ? xRawMm : 4);
  const mesh = normalize(d.insectMesh);
  const color = normalize(d.insectColor);
  const brushPosition = normalize(d.spannBrushPosition) || 'zum Fenster';
  const brushLengthMm = parseMmValue(d.spannBrushLengthMm) || 8;
  const stabilizationMode = normalize(d.spannStabilizationMode) || 'Auto';

  let finishedWidthMm = null;
  let finishedHeightMm = null;
  if (Number.isFinite(widthMm) && Number.isFinite(heightMm)) {
    if (useFederhaken) {
      if (isOutsidePosition(position)) {
        finishedWidthMm = (widthMm + 36) - 6;
        finishedHeightMm = (heightMm + 40) - 6;
      } else {
        finishedWidthMm = widthMm - 6;
        finishedHeightMm = heightMm - 6;
      }
    } else if (isInsidePosition(position)) {
      finishedWidthMm = widthMm - 4;
      finishedHeightMm = heightMm - 4;
    } else if (isOutsidePosition(position)) {
      finishedWidthMm = widthMm + 36;
      finishedHeightMm = heightMm + 40;
    }
  }

  let warning = '';
  if (useFederhaken) {
    if (!(Number.isFinite(finishedWidthMm) && Number.isFinite(finishedHeightMm))) {
      warning = 'Federstifte aktiv: Fertigmaß-Basis bitte noch fachlich bestätigen.';
    } else if (!isInsidePosition(position) && !isOutsidePosition(position)) {
      warning = 'Federstifte aktiv: Lage wurde automatisch auf innenliegend angenommen (Standard-Abzug -6 mm). Bitte fachlich bestätigen.';
    }
  }

  const autoNeedsStabilization = Number.isFinite(heightMm) ? heightMm >= 1250 : null;
  let needsStabilization = autoNeedsStabilization;
  if (autoNeedsStabilization === true) needsStabilization = true;
  else if (stabilizationMode === 'Ja') needsStabilization = true;
  else if (stabilizationMode === 'Nein') needsStabilization = false;
  const needsMiddleLatch = Number.isFinite(heightMm) ? heightMm >= 1300 : null;
  const gripPosition = Number.isFinite(heightMm)
    ? (heightMm < 1000 ? 'Mitte' : '2/5 von unten')
    : '';
  const keder = resolveSpB35Keder(mesh);
  const hookEntry = useFederhaken ? null : lookupSpB35HookEntry(xMm, false);

  const frameCutLine = Number.isFinite(finishedWidthMm) && Number.isFinite(finishedHeightMm)
    ? `Schnittmaß SP-B 35 (Gehrungssäge): ${formatCountedCut(2, finishedWidthMm)} x ${formatCountedCut(2, finishedHeightMm)}`
    : '';
  const stabilizationCutMm = needsStabilization && Number.isFinite(finishedWidthMm)
    ? finishedWidthMm - 70
    : null;
  const stabilizationCenterFromInnerEdgeMm = needsStabilization && Number.isFinite(finishedHeightMm)
    ? Math.round((finishedHeightMm - 70) / 2)
    : null;
  const stabilizationLine = Number.isFinite(stabilizationCutMm)
    ? `Stabilisierungsprofil (Profilsäge): ${formatCountedCut(1, stabilizationCutMm)}, Einklebepunkt ${Math.round(stabilizationCenterFromInnerEdgeMm)} mm vom Innenrand`
    : '';
  const slideLine = useFederhaken
    ? 'Schlitten auf Federhakenseite jeweils 3'
    : `Schlitten auf Hakenseite jeweils 2${needsMiddleLatch ? ' plus jeweils 1 Schlitten für jeweils 1 Grifflasche' : ''}`;
  const brushLine = brushPosition === 'zum Fenster' && brushLengthMm === 8
    ? 'Bürste zum Fenster'
    : `Bürste ${brushPosition}, ${Math.round(brushLengthMm)} mm`;
  const productionLines = [
    frameCutLine,
    stabilizationLine,
    slideLine,
    brushLine,
    warning,
  ].filter(Boolean);

  const consumption = resolveSpB35Consumption(d, {
    useFederhaken,
    needsMiddleLatch,
    needsStabilization,
    brushLengthMm,
    hookArticleNo: hookEntry ? normalize(hookEntry.hookLongArticleNo) : '',
    kederLabel: keder ? keder.label : '',
    kederArticleNo: keder ? keder.articleNo : '',
  });

  return {
    model: 'SP-B 35',
    widthMm,
    heightMm,
    xMm,
    position,
    useFederhaken,
    finishedWidthMm,
    finishedHeightMm,
    finishedSizeLabel: formatSizeMm(finishedWidthMm, finishedHeightMm),
    brushPosition,
    brushLengthMm,
    stabilizationMode,
    kederLabel: keder ? keder.label : '',
    kederArticleNo: keder ? keder.articleNo : '',
    needsStabilization,
    autoNeedsStabilization,
    needsMiddleLatch,
    gripPosition,
    hookArticleNo: hookEntry ? normalize(hookEntry.hookLongArticleNo) : '',
    stabilizationCutMm,
    stabilizationCenterFromInnerEdgeMm,
    consumption,
    warning,
    productionLines,
  };
}

function enrichPayloadWithSpB35(payload) {
  const items = Array.isArray(payload && payload.items) ? payload.items : [];
  items.forEach((item) => {
    const type = normalize(item && item.type).toLowerCase();
    const details = item && item.details && typeof item.details === 'object' ? item.details : null;
    if (type !== 'insektenschutz' || !details) return;
    const calc = calculateSpB35(details);
    if (calc) details.spb35 = calc;
  });
}

function buildInsectSummary(details) {
  const d = details || {};
  const sub = normalize(d.insectSubtype);
  const w = normalize(d.insectWidthMm);
  const h = normalize(d.insectHeightMm);
  const dims =
    w && h ? `${w} x ${h} mm` :
      w ? `Breite ${w} mm` :
        h ? `Höhe ${h} mm` : '';
  const color = normalize(d.insectColor);
  const mesh = normalize(d.insectMesh);

  const attrs = [];
  const notes = [];

  if (sub === 'Spannrahmen') {
    const pos = normalize(d.spannPosition);
    const spb35 = d && d.spb35 && typeof d.spb35 === 'object' ? d.spb35 : null;
    const haken = normalize(d.spannHakenLengthMm)
      || ((spb35 && !spb35.useFederhaken && Number.isFinite(spb35.xMm)) ? String(Math.round(spb35.xMm)) : '');
    if (spb35 && spb35.model) attrs.unshift(spb35.model);
    if (sub) attrs.push(sub);
    const cutDims = spb35 && spb35.finishedSizeLabel ? spb35.finishedSizeLabel : dims;
    if (cutDims) attrs.push(cutDims);
    if (color) attrs.push(`Farbe: ${color}`);
    if (mesh) attrs.push(`Gaze: ${mesh}`);
    if (pos) attrs.push(pos);
    if (spb35 && spb35.useFederhaken) attrs.push('Federstifte');
    else if (haken) attrs.push(`Hakenmaß X: ${haken} mm`);
    if (dims && spb35 && spb35.finishedSizeLabel && dims !== spb35.finishedSizeLabel) {
      notes.push(`Fertigmaß: ${dims}`);
    }
    const n = normalize(d.spannNotes);
    if (spb35 && Array.isArray(spb35.productionLines)) notes.push(...spb35.productionLines);
    if (n) notes.push(n);
  } else {
    if (sub) attrs.push(sub);
    if (dims) attrs.push(dims);
    if (color) attrs.push(`Farbe: ${color}`);
    if (mesh) attrs.push(`Gaze: ${mesh}`);
    if (sub === 'Rollo') {
      const cassette = normalize(d.rolloCassette);
      const fs = normalize(d.rolloFsAbschluss);
      const griff = normalize(d.rolloGripSli);
      const stop = normalize(d.rolloStopFromBottomMm);
      const mounting = normalize(d.rolloMounting);
      if (cassette) attrs.push(`Kassette: ${cassette}`);
      if (fs) attrs.push(`FS-Abschluss: ${fs}`);
      if (griff) attrs.push(`Griff SL-I: ${griff}`);
      if (stop) attrs.push(`Stopp unten: ${stop} mm`);
      if (mounting) attrs.push(`Montage: ${mounting}`);
      const n = normalize(d.rolloNotes);
      if (n) notes.push(n);
    } else if (sub === 'Tür') {
      const kind = normalize(d.doorKind);
      const kick = normalize(d.doorKickplate);
      const pet = normalize(d.doorPetFlap);
      if (kind) attrs.push(kind);
      if (kick) attrs.push(`Trittschutz: ${kick}`);
      if (pet) attrs.push(`Klappe: ${pet}`);
      if (kind === 'Schiebetür') {
        const wings = normalize(d.doorWingCount);
        const top = normalize(d.doorRailTopMm);
        const bottom = normalize(d.doorRailBottomMm);
        if (wings) attrs.push(wings);
        if (top) attrs.push(`Schiene oben: ${top} mm`);
        if (bottom) attrs.push(`Schiene unten: ${bottom} mm`);
      }
      const frame = normalize(d.doorFrameNotes);
      if (frame) notes.push(frame);
      const n = normalize(d.doorNotes);
      if (n) notes.push(n);
    }
  }

  return { attrs, notes };
}

function formatDateDe(iso) {
  const s = normalize(iso);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function parseIsoDateLocal(iso) {
  const s = normalize(iso);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!Number.isFinite(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatIsoDate(d) {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  x.setHours(0, 0, 0, 0);
  return x;
}

function computeDueDate(montageIso) {
  const montage = parseIsoDateLocal(montageIso);
  if (!montage) return '';
  const today = startOfToday();
  const oneWeekBefore = addDays(montage, -7);
  const due = oneWeekBefore.getTime() < today.getTime() ? today : oneWeekBefore;
  return formatIsoDate(due);
}

function richText(text) {
  return [{
    type: 'rich_text',
    elements: [{
      type: 'rich_text_section',
      elements: [{ type: 'text', text: String(text || '') }],
    }],
  }];
}

function toOperatorCode(input) {
  const t = normalize(input)
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

function extractFromRichText(rich) {
  if (!Array.isArray(rich)) return '';
  const parts = [];
  for (const el of rich) {
    if (!el || typeof el !== 'object') continue;
    if (el.type === 'rich_text_section' && Array.isArray(el.elements)) {
      for (const x of el.elements) {
        if (x && x.type === 'text' && typeof x.text === 'string') parts.push(x.text);
        if (x && x.type === 'link' && typeof x.url === 'string') parts.push(x.url);
      }
    }
    if (el.type === 'rich_text' && Array.isArray(el.elements)) {
      for (const sec of el.elements) {
        if (sec && sec.type === 'rich_text_section' && Array.isArray(sec.elements)) {
          for (const x of sec.elements) {
            if (x && x.type === 'text' && typeof x.text === 'string') parts.push(x.text);
            if (x && x.type === 'link' && typeof x.url === 'string') parts.push(x.url);
          }
        }
      }
    }
  }
  return parts.join('');
}

function getFieldByColumnId(item, columnId) {
  if (!item || !columnId) return null;
  return (item.fields || []).find(f => f && f.column_id === columnId) || null;
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

function findFirstUrl(text) {
  const t = String(text || '');
  const m = /(https?:\/\/[^\s)]+)(?:\)|\s|$)/i.exec(t);
  return m ? String(m[1]) : '';
}

function findColumn(columns, { key, nameIncludes, primary } = {}) {
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
  return null;
}

async function getColumns(listId) {
  try {
    const data = await listColumns({ listId });
    return data.columns || [];
  } catch (err) {
    const slackError = err?.details?.error;
    const reqMethod = err?.details?.req_method;
    if (slackError === 'unknown_method' && reqMethod === 'slackLists.columns.list') {
      const schema = await listSchema({ listId });
      return schema.map(c => ({
        id: c.id,
        key: c.key,
        name: c.name,
        type: c.type,
        is_primary_column: !!c.is_primary_column,
        options: c.options,
      }));
    }
    throw err;
  }
}

function buildOrderDescription(payload, { montageIso, createdIso, dueIso }) {
  const customerType = normalize(payload.customerType);
  const isBusiness = customerType === 'business';
  const customer = payload.customer || {};
  const orderRef = normalize(payload.orderRef);
  const notes = normalize(payload.notes);

  const company = isBusiness ? normalize(customer.company || customer.companyOther) : '';
  const name = normalize(customer.name);
  const email = normalize(customer.email);
  const phone = normalize(customer.phone);
  const street = normalize(customer.street);
  const zip = normalize(customer.zip);
  const city = normalize(customer.city);

  const headerLines = [];
  if (createdIso) headerLines.push(`Bestelleingang: ${formatDateDe(createdIso)}`);
  if (montageIso) headerLines.push(`Montagetermin: ${formatDateDe(montageIso)}`);
  if (dueIso) headerLines.push(`Fälligkeit: ${formatDateDe(dueIso)}`);
  headerLines.push('');

  if (isBusiness && company) headerLines.push(`Firma: ${company}`);
  if (name) headerLines.push(`Name: ${name}`);
  if (orderRef) headerLines.push(`Auftragsreferenz: ${orderRef}`);
  const addr = isBusiness ? [street, city].filter(Boolean).join(', ') : [street, [zip, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (addr) headerLines.push(`Adresse: ${addr}`);
  if (!isBusiness && email) headerLines.push(`E-Mail: ${email}`);
  if (!isBusiness && phone) headerLines.push(`Telefon: ${phone}`);

  const out = headerLines.concat(['', 'Positionen:']);
  const items = Array.isArray(payload.items) ? payload.items : [];

  items.forEach((it, idx) => {
    const type = normalize(it.type) || 'Unbekannt';
    const details = it.details || {};
    const free = normalize(details.freeText || it.freeText);

    if (normalize(type).toLowerCase() === 'rollladenpanzer') {
      const material = normalize(details.material);
      const materialLabel = material === 'pvc' ? 'PVC' : (material === 'alu' ? 'Alu' : material);
      const profileCode = normalize(details.profile);
      const profileHeight = profileCode === 'mini' ? 37 : (profileCode === 'midi' ? 45 : (profileCode === 'maxi' ? 52 : null));
      const colorLabel = normalize(details.colorLabel) || normalize(details.colorId);
      const dimsRaw = normalize(details.dimensions).replace(/mm/gi, '').trim();
      const dims = dimsRaw.replace(/×/g, 'x').replace(/\s*x\s*/g, ' x ');

      const lineParts = [];
      if (materialLabel) lineParts.push(materialLabel);
      if (profileHeight) lineParts.push(`${profileHeight}er`);
      if (colorLabel) lineParts.push(colorLabel);
      if (dims) lineParts.push(`${dims} mm`);

      const endleisteEnabled = details.endleisteEnabled !== false;
      const endleisteColor = normalize(details.endleisteColorLabel) || normalize(details.endleisteColorId) || 'Silber eloxiert';
      const endleisteHoles = details.endleisteHoles !== false;
      if (endleisteEnabled) {
        lineParts.push(`Endleiste Farbe: ${endleisteColor}`);
        lineParts.push(`Endleiste gebohrt: ${endleisteHoles ? 'Ja' : 'Nein'}`);
      } else {
        lineParts.push('Endleiste: keine');
      }

      const vorsatz = buildVorsatzSummary(details);
      if (vorsatz.enabled) {
        out.push(`${idx + 1}) ${type}`);
        if (lineParts.length) out.push(lineParts.join(', '));
        out.push(`Vorsatzelement: ${vorsatz.shortParts.join(', ')}`);
        if (free) out.push(free);
      } else {
        out.push(`${idx + 1}) ${type}`);
        if (lineParts.length) out.push(lineParts.join(', '));
        if (free) out.push(free);
      }
    } else if (normalize(type).toLowerCase() === 'insektenschutz') {
      const { attrs, notes: extraNotes } = buildInsectSummary(details);
      out.push(`${idx + 1}) ${type}`);
      if (attrs.length) out.push(attrs.join(', '));
      const notes = extraNotes.concat(free ? [free] : []);
      if (notes.length) out.push('');
      notes.forEach((line, noteIdx) => {
        out.push(line);
        if (noteIdx < notes.length - 1) out.push('');
      });
    } else if (normalize(type).toLowerCase() === 'vorsatzelement') {
      const v = buildVorsatzElementSummary(details);
      out.push(`${idx + 1}) ${type}`);
      if (v.boxParts.length) out.push(v.boxParts.join(', '));
      if (v.controlParts.length) out.push(v.controlParts.join(', '));
      if (v.panzerParts.length) out.push(v.panzerParts.join(', '));
      if (free) out.push(free);
    } else if (normalize(type).toLowerCase().startsWith('vorsatzkasten')) {
      const v = buildVorsatzBoxOnlySummary(details);
      out.push(`${idx + 1}) ${type}`);
      if (v.boxParts.length) out.push(v.boxParts.join(', '));
      if (v.controlParts.length) out.push(v.controlParts.join(', '));
      if (free) out.push(free);
    } else {
      out.push(`${idx + 1}) ${type}`);
      if (free) out.push(free);
    }

    out.push('');
  });

  if (notes) {
    out.push('Hinweise:');
    out.push(notes);
  }

  return out.join('\n').trim();
}

function buildVorsatzSummary(details) {
  const result = { enabled: false, shortParts: [], longParts: [] };
  if (!details || details.vorsatzEnabled !== true) return result;

  result.enabled = true;

  const colorLabel = normalize(details.vorsatzColorLabel) || normalize(details.vorsatzColorId);
  const dimsRaw = normalize(details.vorsatzDimensions).replace(/mm/gi, '').trim();
  const dims = dimsRaw.replace(/×/g, 'x').replace(/\s*x\s*/g, ' x ');
  const rails = normalize(details.vorsatzRails);
  const rolloColorLabel = normalize(details.vorsatzRolloColorLabel) || normalize(details.vorsatzRolloColorId);
  const rolloProfileLabel = normalize(details.vorsatzRolloProfileLabel) || normalize(details.vorsatzRolloProfileId);

  if (colorLabel) result.shortParts.push(colorLabel);
  if (dims) result.shortParts.push(dims + ' mm');
  if (rails) result.shortParts.push('Schienen: ' + rails);
  if (rolloColorLabel) result.shortParts.push('Rollladenfarbe: ' + rolloColorLabel);
  if (rolloProfileLabel) result.shortParts.push('Rollladenprofil: ' + rolloProfileLabel);

  result.longParts = result.shortParts.slice();

  return result;
}

const VORSATZ_BOX_SIZES = [100, 125, 138, 150, 165, 180, 205, 220, 235, 250];
const VORSATZ_CONTROL = { strap: 'Gurt / Kordel', motor: 'Motor' };
const VORSATZ_STRAP_SIZE_LABEL = {
  s12: '12 mm', s14: '14 mm', s18: '18 mm', s23: '23 mm', cord: 'Kordel'
};
const VORSATZ_EXIT_LABEL = { hinten: 'Hinten', unten: 'Unten', oben: 'Oben', seite: 'Seite' };
const VORSATZ_SIDE_LABEL = { links: 'Links', rechts: 'Rechts' };
const VORSATZ_ROLLSIDE_LABEL = {
  links: 'Linksroller (Ansicht von innen)',
  rechts: 'Rechtsroller (Ansicht von innen)'
};
const VORSATZ_PROFILE_MAX_HEIGHT = {
  mini_37: {
    w40: { 100: 640, 125: 1300, 138: 1600, 150: 2120, 165: 2750, 180: 3420, 205: 4490, 220: null, 235: null, 250: null },
    w60: { 100: null, 125: 1020, 138: 1360, 150: 1930, 165: 2530, 180: 3160, 205: 4300, 220: null, 235: null, 250: null }
  },
  midi_45: null,
  maxi_52: {
    w40: { 100: null, 125: null, 138: null, 150: null, 165: null, 180: null, 205: null, 220: null, 235: null, 250: null },
    w60: { 100: null, 125: null, 138: 900, 150: 1250, 165: 1500, 180: 2200, 205: 2800, 220: null, 235: null, 250: null }
  }
};
VORSATZ_PROFILE_MAX_HEIGHT.midi_45 = VORSATZ_PROFILE_MAX_HEIGHT.mini_37;

function buildVorsatzControlLine(details, prefix) {
  prefix = prefix || 'vorsatz';
  const controlKey = prefix + 'Control';
  const strapSizeKey = prefix + 'StrapSize';
  const strapSizeLabelKey = prefix + 'StrapSizeLabel';
  const strapExitKey = prefix + 'StrapExit';
  const strapExitLabelKey = prefix + 'StrapExitLabel';
  const motorExitKey = prefix + 'MotorExit';
  const motorExitLabelKey = prefix + 'MotorExitLabel';
  const operatingSideKey = prefix + 'OperatingSide';
  const operatingSideLabelKey = prefix + 'OperatingSideLabel';
  const rollSideKey = prefix + 'RollSide';
  const rollSideLabelKey = prefix + 'RollSideLabel';

  const control = normalize(details[controlKey]) || 'strap';
  const strapSize =
    normalize(details[strapSizeLabelKey]) ||
    VORSATZ_STRAP_SIZE_LABEL[normalize(details[strapSizeKey])] ||
    normalize(details[strapSizeKey]);
  const strapExit =
    normalize(details[strapExitLabelKey]) ||
    VORSATZ_EXIT_LABEL[normalize(details[strapExitKey])] ||
    normalize(details[strapExitKey]);
  const motorExit =
    normalize(details[motorExitLabelKey]) ||
    VORSATZ_EXIT_LABEL[normalize(details[motorExitKey])] ||
    normalize(details[motorExitKey]);
  const operatingSide =
    normalize(details[operatingSideLabelKey]) ||
    VORSATZ_SIDE_LABEL[normalize(details[operatingSideKey])] ||
    normalize(details[operatingSideKey]);
  const rollSide =
    normalize(details[rollSideLabelKey]) ||
    VORSATZ_ROLLSIDE_LABEL[normalize(details[rollSideKey])] ||
    normalize(details[rollSideKey]);

  const parts = [];
  if (rollSide) parts.push(rollSide);
  if (control === 'motor') {
    parts.push('Motor');
    if (operatingSide) parts.push('Bedienseite: ' + operatingSide);
    if (motorExit) parts.push('Kabelaustritt: ' + motorExit);
  } else {
    parts.push(strapSize ? (VORSATZ_CONTROL.strap + ' ' + strapSize) : VORSATZ_CONTROL.strap);
    if (operatingSide) parts.push('Bedienseite: ' + operatingSide);
    if (strapExit) parts.push('Gurtaustritt: ' + strapExit);
  }
  return parts;
}

function buildVorsatzElementSummary(details) {
  const result = { enabled: true, boxParts: [], controlParts: [], panzerParts: [], shortParts: [], longParts: [], panzerDims: null };
  if (!details) {
    result.enabled = false;
    return result;
  }

  const elementDims = normalize(details.vorsatzElementDims);
  const boxSizeMm = Number(details.vorsatzBoxSizeMm) || null;
  const boxColorLabel = normalize(details.vorsatzBoxColorLabel) || normalize(details.vorsatzBoxColorId);
  const shaftLabel = normalize(details.vorsatzShaftLabel) || normalize(details.vorsatzShaftId);
  const rails = normalize(details.vorsatzElementRails) || 'nein';
  const railLengthMm = Number(details.vorsatzRailLengthMm) || null;

  if (elementDims) result.boxParts.push(elementDims);
  if (boxSizeMm) result.boxParts.push(boxSizeMm + 'er Kasten');
  if (boxColorLabel) result.boxParts.push('Kasten ' + boxColorLabel);
  if (shaftLabel) result.boxParts.push(shaftLabel);
  if (rails.toLowerCase() === 'ja') {
    result.boxParts.push('Schienen: Ja' + (railLengthMm ? (' (' + railLengthMm + ' mm)') : ''));
  } else {
    result.boxParts.push('Schienen: Nein');
  }

  result.controlParts = buildVorsatzControlLine(details, 'vorsatz');

  const panzerMaterial = normalize(details.vorsatzPanzerMaterial);
  const panzerMatLabel = panzerMaterial === 'pvc' ? 'PVC' : (panzerMaterial === 'alu' ? 'Alu' : panzerMaterial);
  const panzerProfileLabel = normalize(details.vorsatzPanzerProfileLabel) || normalize(details.vorsatzPanzerProfileId);
  const panzerColorLabel = normalize(details.vorsatzPanzerColorLabel) || normalize(details.vorsatzPanzerColorId);
  const panzerDims = normalize(details.vorsatzPanzerDimensions);
  const endEnabled = details.vorsatzPanzerEndleisteEnabled !== false;
  const endColor = normalize(details.vorsatzPanzerEndleisteColorLabel) || normalize(details.vorsatzPanzerEndleisteColorId) || 'Silber eloxiert';
  const endHoles = details.vorsatzPanzerEndleisteHoles !== false;

  if (panzerMatLabel) result.panzerParts.push('Panzer ' + panzerMatLabel);
  if (panzerProfileLabel) result.panzerParts.push(panzerProfileLabel);
  if (panzerColorLabel) result.panzerParts.push(panzerColorLabel);
  if (panzerDims) {
    result.panzerParts.push(panzerDims);
    result.panzerDims = panzerDims;
  }
  if (!endEnabled) result.panzerParts.push('ohne Endleiste');
  else result.panzerParts.push(`Endleiste ${endColor}${endHoles ? ' gebohrt' : ' nicht gebohrt'}`);

  result.shortParts = result.boxParts.slice();
  if (result.controlParts.length) result.shortParts.push(result.controlParts.join(', '));
  if (result.panzerParts.length) result.shortParts.push(result.panzerParts.join(', '));
  result.longParts = result.shortParts.slice();
  return result;
}

function buildVorsatzBoxOnlySummary(details) {
  const result = { enabled: true, boxParts: [], controlParts: [], shortParts: [], longParts: [] };
  if (!details) {
    result.enabled = false;
    return result;
  }
  const boxWidthMm = Number(details.vorsatzBoxOnlyBoxWidthMm) || null;
  const boxSizeMm = Number(details.vorsatzBoxOnlyBoxSizeMm) || null;
  const boxColorLabel = normalize(details.vorsatzBoxOnlyBoxColorLabel) || normalize(details.vorsatzBoxOnlyBoxColorId);
  const rails = normalize(details.vorsatzBoxOnlyRails) || 'nein';
  const railLengthMm = Number(details.vorsatzBoxOnlyRailLengthMm) || null;

  if (boxWidthMm) result.boxParts.push('Kastenbreite: ' + boxWidthMm + ' mm (gesamt, mit Endkappen)');
  if (boxSizeMm) result.boxParts.push(boxSizeMm + 'er Kasten');
  if (boxColorLabel) result.boxParts.push('Kasten ' + boxColorLabel);
  if (rails.toLowerCase() === 'ja') {
    result.boxParts.push('Schienen: Ja' + (railLengthMm ? (' (' + railLengthMm + ' mm)') : ''));
  } else {
    result.boxParts.push('Schienen: Nein');
  }

  result.controlParts = buildVorsatzControlLine(details, 'vorsatzBoxOnly');

  result.shortParts = result.boxParts.slice();
  if (result.controlParts.length) result.shortParts.push(result.controlParts.join(', '));
  result.longParts = result.shortParts.slice();
  return result;
}

function buildPositionsText(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const out = [];

  items.forEach((it, idx) => {
    const type = normalize(it.type) || 'Unbekannt';
    const details = it.details || {};
    const free = normalize(details.freeText || it.freeText);

    if (normalize(type).toLowerCase() === 'rollladenpanzer') {
      const material = normalize(details.material);
      const materialLabel = material === 'pvc' ? 'PVC' : (material === 'alu' ? 'Alu' : material);
      const profileCode = normalize(details.profile);
      const profileHeight = profileCode === 'mini' ? 37 : (profileCode === 'midi' ? 45 : (profileCode === 'maxi' ? 52 : null));
      const colorLabel = normalize(details.colorLabel) || normalize(details.colorId);
      const dimsRaw = normalize(details.dimensions).replace(/mm/gi, '').trim();
      const dims = dimsRaw.replace(/×/g, 'x').replace(/\s*x\s*/g, ' x ');

      const lineParts = [];
      if (materialLabel) lineParts.push(materialLabel);
      if (profileHeight) lineParts.push(`${profileHeight}er`);
      if (colorLabel) lineParts.push(colorLabel);
      if (dims) lineParts.push(`${dims} mm`);

      const endleisteEnabled = details.endleisteEnabled !== false;
      const endleisteColor = normalize(details.endleisteColorLabel) || normalize(details.endleisteColorId) || 'Silber eloxiert';
      const endleisteHoles = details.endleisteHoles !== false;
      if (endleisteEnabled) lineParts.push(`Endleiste ${endleisteColor}${endleisteHoles ? ' gebohrt' : ' nicht gebohrt'}`);
      else lineParts.push('Endleiste keine');

      const vorsatz = buildVorsatzSummary(details);
      if (vorsatz.enabled) lineParts.push(`Vorsatz ${vorsatz.shortParts.join(', ')}`);

      out.push(`${idx + 1}) ${type}${lineParts.length ? (': ' + lineParts.join(', ')) : ''}`);
      if (free) out.push(`   ${free}`);
    } else {
      if (normalize(type).toLowerCase() === 'insektenschutz') {
        const { attrs, notes } = buildInsectSummary(details);
        out.push(`${idx + 1}) ${type}${attrs.length ? (' – ' + attrs.join(', ')) : ''}`);
        const detailLines = notes.concat(free ? [free] : []).filter(Boolean);
        detailLines.forEach((line) => {
          out.push(`   ${line}`);
        });
      } else if (normalize(type).toLowerCase() === 'vorsatzelement') {
        const v = buildVorsatzElementSummary(details);
        const line = [];
        if (v.boxParts.length) line.push(v.boxParts.join(', '));
        if (v.controlParts.length) line.push(v.controlParts.join(', '));
        if (v.panzerParts.length) line.push(v.panzerParts.join(', '));
        out.push(`${idx + 1}) ${type}${line.length ? (': ' + line.join(' | ')) : ''}`);
        if (free) out.push(`   ${free}`);
      } else if (normalize(type).toLowerCase().startsWith('vorsatzkasten')) {
        const v = buildVorsatzBoxOnlySummary(details);
        const line = [];
        if (v.boxParts.length) line.push(v.boxParts.join(', '));
        if (v.controlParts.length) line.push(v.controlParts.join(', '));
        out.push(`${idx + 1}) ${type}${line.length ? (': ' + line.join(' | ')) : ''}`);
        if (free) out.push(`   ${free}`);
      } else {
        const extra =
          normalize(type).toLowerCase() === 'einzelteile'
            ? normalize(details.partsVendor)
            : '';
        out.push(`${idx + 1}) ${type}${extra ? (' – ' + extra) : ''}`);
        if (free) out.push(`   ${free}`);
      }
    }
  });

  return out.join('\n').trim();
}

function buildInfoText(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const lines = [];
  if (payload?.emergency) lines.push('NOTFALL');
  items.forEach((it, idx) => {
    const type = normalize(it?.type);
    const details = it?.details || {};
    const free = normalize(details.freeText || it?.freeText);
    if (type.toLowerCase() === 'reparatur') {
      if (!free) return;
      const line = /^reparatur\b/i.test(free) ? free : (`Reparatur: ${free}`);
      lines.push(line);
      return;
    }
    const spb35 = details && details.spb35 && typeof details.spb35 === 'object' ? details.spb35 : null;
    if (spb35 && Array.isArray(spb35.productionLines) && spb35.productionLines.length) {
      if (lines.length) lines.push('');
      lines.push(`Position ${idx + 1} - SP-B 35`);
      spb35.productionLines.forEach((line) => lines.push(`- ${line}`));
    }
  });
  const notes = normalize(payload?.notes);
  if (notes) {
    if (lines.length) lines.push('');
    lines.push(notes);
  }
  return lines.join('\n').trim();
}

function buildEmergencyAlertBlocks({ payload, title, itemId, montageIso }) {
  const customer = payload.customer || {};
  const isBusiness = normalize(payload.customerType) === 'business';
  const company = normalize(customer.company || customer.companyOther);
  const name = normalize(customer.name);
  const street = normalize(customer.street);
  const zip = normalize(customer.zip);
  const city = normalize(customer.city);
  const orderRef = normalize(payload.orderRef);
  const addr = isBusiness
    ? [street, city].filter(Boolean).join(', ')
    : [street, [zip, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const firstItem = Array.isArray(payload.items) && payload.items[0]
    ? `${normalize(payload.items[0].type)} ${normalize(payload.items[0].details?.freeText || payload.items[0].freeText)}`.trim()
    : '';
  const mention = normalize(process.env.SLACK_EMERGENCY_MENTION) || '<!channel>';
  const lines = [
    `${mention} :rotating_light: *NOTFALL*`,
    title ? `*Vorgang:* ${title}` : '',
    orderRef ? `*Referenz:* ${orderRef}` : '',
    montageIso ? `*Montage:* ${formatDateDe(montageIso)}` : '',
    (company || name) ? `*Kunde:* ${[company, name].filter(Boolean).join(' - ')}` : '',
    addr ? `*Adresse:* ${addr}` : '',
    firstItem ? `*Details:* ${firstItem}` : '',
    itemId ? `*Item:* \`${itemId}\`` : '',
  ].filter(Boolean);

  return [
    { type: 'header', text: { type: 'plain_text', text: 'NOTFALL', emoji: false } },
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ];
}

function buildBlocks(payload) {
  const customerType = normalize(payload.customerType);
  const isBusiness = customerType === 'business';
  const montageDate = normalize(payload.date);
  const createdDate = normalize(payload.createdDate);
  const dueDate = normalize(payload.dueDate);

  const customer = payload.customer || {};
  const orderRef = normalize(payload.orderRef);
  const notes = normalize(payload.notes);

  const company = isBusiness ? normalize(customer.company || customer.companyOther) : '';
  const name = normalize(customer.name);
  const email = normalize(customer.email);
  const phone = normalize(customer.phone);
  const street = normalize(customer.street);
  const zip = normalize(customer.zip);
  const city = normalize(customer.city);

  const header = isBusiness ? `Neue Anfrage (Geschäftskunde)` : `Neue Anfrage (Privatkunde)`;
  const emergency = !!payload.emergency;

  const lines = [];
  if (emergency) lines.push(':rotating_light: *NOTFALL*');
  if (createdDate) lines.push(`*Bestelleingang:* ${formatDateDe(createdDate)}`);
  if (montageDate) lines.push(`*Montagetermin:* ${formatDateDe(montageDate)}`);
  if (dueDate) lines.push(`*Fälligkeit:* ${formatDateDe(dueDate)}`);
  if (isBusiness && company) lines.push(`*Firma:* ${company}`);
  if (name) lines.push(`*Name:* ${name}`);
  if (orderRef) lines.push(`*Auftragsreferenz:* ${orderRef}`);
  if (street || zip || city) {
    const addr = isBusiness
      ? [street, city].filter(Boolean).join(', ')
      : [street, [zip, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    if (addr) lines.push(`*Adresse:* ${addr}`);
  }
  if (!isBusiness && email) lines.push(`*E-Mail:* ${email}`);
  if (!isBusiness && phone) lines.push(`*Telefon:* ${phone}`);

  const items = Array.isArray(payload.items) ? payload.items : [];

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: emergency ? `${header} - NOTFALL` : header, emoji: false } },
    { type: 'section', text: { type: 'mrkdwn', text: lines.length ? lines.join('\n') : '—' } },
  ];

  if (items.length) {
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*Positionen*' } });
  }

  items.slice(0, 25).forEach((it, idx) => {
    const type = normalize(it.type) || 'Unbekannt';
    const details = it.details || {};

    const parts = [`*${idx + 1}.* ${type}`];

    const material = normalize(details.material);
    const profileLabel = normalize(details.profileLabel) || normalize(details.profile);
    const colorLabel = normalize(details.colorLabel) || normalize(details.color) || normalize(details.colorId);
    const dimensions = normalize(details.dimensions);
    const endleisteEnabled = details.endleisteEnabled !== false;
    const endleisteColorLabel =
      normalize(details.endleisteColorLabel) ||
      normalize(details.endleisteColorId) ||
      'Silber eloxiert';
    const endleisteHoles = details.endleisteHoles !== false;
    const free = normalize(details.freeText || it.freeText);
    const insect = normalize(type).toLowerCase() === 'insektenschutz';
    const { attrs: insectAttrs, notes: insectNotes } = insect ? buildInsectSummary(details) : { attrs: [], notes: [] };
    const extra =
      insect
        ? ''
        : normalize(type).toLowerCase() === 'einzelteile'
          ? normalize(details.partsVendor)
          : '';

    const attrs = [];
    if (material) attrs.push(material === 'pvc' ? 'PVC' : (material === 'alu' ? 'Alu' : material));
    if (profileLabel) attrs.push(profileLabel);
    if (colorLabel) attrs.push(colorLabel);
    if (dimensions) attrs.push(dimensions.replace(/×/g, 'x') + ' mm');
    if (normalize(details.material) || normalize(details.profile) || normalize(details.colorId) || normalize(details.dimensions)) {
      if (!endleisteEnabled) attrs.push('Endleiste: keine');
      else attrs.push(`Endleiste: ${endleisteColorLabel}${endleisteHoles ? ', gebohrt' : ', nicht gebohrt'}`);
    }
    const vorsatz = buildVorsatzSummary(details);
    if (vorsatz.enabled) attrs.push('Vorsatz: ' + vorsatz.shortParts.join(', '));
    const typeKey = normalize(type).toLowerCase();
    const vorsatzElement = typeKey === 'vorsatzelement' ? buildVorsatzElementSummary(details) : null;
    const vorsatzBoxOnly = typeKey.startsWith('vorsatzkasten') ? buildVorsatzBoxOnlySummary(details) : null;
    if (vorsatzElement) {
      if (vorsatzElement.boxParts.length) attrs.push(vorsatzElement.boxParts.join(', '));
      if (vorsatzElement.controlParts.length) attrs.push(vorsatzElement.controlParts.join(', '));
      if (vorsatzElement.panzerParts.length) attrs.push(vorsatzElement.panzerParts.join(', '));
    }
    if (vorsatzBoxOnly) {
      if (vorsatzBoxOnly.boxParts.length) attrs.push(vorsatzBoxOnly.boxParts.join(', '));
      if (vorsatzBoxOnly.controlParts.length) attrs.push(vorsatzBoxOnly.controlParts.join(', '));
    }
    if (extra) attrs.push(extra);
    if (insectAttrs.length) attrs.push(insectAttrs.join(', '));
    if (attrs.length) parts.push(`_${attrs.join(', ')}_`);
    const noteLines = insectNotes.concat(free ? [free] : []).filter(Boolean);
    if (noteLines.length) parts.push(noteLines.join('\n\n'));

    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: parts.join('\n') } });
  });

  if (notes) {
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Hinweise*\n${notes}` } });
  }

  return blocks;
}

router.post('/order', async (req, res, next) => {
  try {
    const payload = req.body || {};
    const customerType = must(payload.customerType, 'customerType');
    payload.emergency = !!payload.emergency;
    must(payload.date, 'date');
    if (!['private', 'business'].includes(customerType)) {
      const err = new Error('Invalid customerType');
      err.status = 400;
      throw err;
    }

    const customer = payload.customer || {};
    if (customerType === 'business') {
      must(customer.company || customer.companyOther, 'customer.company');
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) {
      const err = new Error('At least one item is required');
      err.status = 400;
      throw err;
    }

    const invalid = items.find(it => {
      const t = normalize(it?.type);
      const d = it?.details || {};
      const free = normalize(d.freeText || it?.freeText);
      return !hasAnyText(t, free);
    });
    if (invalid) {
      const err = new Error('Each item must have a type or freeText');
      err.status = 400;
      throw err;
    }

    const montageIso = normalize(payload.date);
    const createdIso = normalize(payload.createdDate) || formatIsoDate(startOfToday());
    const dueIso = normalize(payload.dueDate) || computeDueDate(montageIso);
    enrichPayloadWithSpB35(payload);

    const listId = normalize(process.env.SLACK_LIST_ID);
    if (!listId) {
      const err = new Error('SLACK_LIST_ID is not set');
      err.status = 500;
      throw err;
    }

    const cols = await getColumns(listId);
    const statusCol =
      findColumn(cols, { key: 'status' }) ||
      findColumn(cols, { nameIncludes: 'status' }) ||
      null;
    const titleCol =
      findColumn(cols, { nameIncludes: 'aufgabe' }) ||
      findColumn(cols, { primary: true }) ||
      findColumn(cols, { key: 'title' }) ||
      findColumn(cols, { key: 'rich_text_notes' }) ||
      null;
    const dueCol =
      findColumn(cols, { nameIncludes: 'fälligkeit' }) ||
      findColumn(cols, { key: 'date' }) ||
      findColumn(cols, { key: 'todo_due_date' }) ||
      null;
    const montageCol = findColumn(cols, { nameIncludes: 'montage' }) || null;
    const positionsCol =
      findColumn(cols, { nameIncludes: 'position' }) ||
      findColumn(cols, { nameIncludes: 'bestellung' }) ||
      findColumn(cols, { nameIncludes: 'materialbestellung' }) ||
      findColumn(cols, { nameIncludes: 'beschreibung' }) ||
      null;
    const infoCol =
      findColumn(cols, { nameIncludes: 'info' }) ||
      null;

    const titleBits = [];
    const company = normalize(customer.company || customer.companyOther);
    const name = normalize(customer.name);
    const street = normalize(customer.street);
    const ref = normalize(payload.orderRef);
    if (company) titleBits.push(company);
    if (ref) titleBits.push(ref);
    if (name) titleBits.push(name);
    if (street) titleBits.push(street);
    const title = titleBits.filter(Boolean).join(' – ') || `Montage ${formatDateDe(montageIso)}`;

    const orderText = buildPositionsText(payload);
    const infoText = buildInfoText(payload);

    let statusValue = '';
    const choices = statusCol?.options?.choices || [];
    if (statusCol && Array.isArray(choices) && choices.length) {
      const open = choices.find(ch => /offen/i.test(String(ch?.label || ch?.value || ''))) || choices[0];
      statusValue = open?.id || open?.value || '';
    }

    const cells = [];
    if (titleCol) cells.push({ column_id: titleCol.id, rich_text: richText(title) });
    if (positionsCol) cells.push({ column_id: positionsCol.id, rich_text: richText(orderText) });
    if (infoCol && infoText) cells.push({ column_id: infoCol.id, rich_text: richText(infoText) });
    if (montageCol) cells.push({ column_id: montageCol.id, date: [montageIso] });
    if (dueCol && dueIso) cells.push({ column_id: dueCol.id, date: [dueIso] });
    if (statusCol && statusValue) cells.push({ column_id: statusCol.id, select: [statusValue] });

    let createdItem = null;
    try {
      createdItem = await createItem({ listId, initial_fields: cells });
    } catch (err) {
      return res.status(502).json({
        ok: false,
        error: err?.details?.error || err.message || 'slack_list_create_failed',
        details: err?.details || null,
      });
    }

    const channel =
      normalize(process.env.SLACK_ORDER_INTAKE_CHANNEL) ||
      normalize(process.env.SLACK_ACTIVITY_CHANNEL);
    let ts = '';
    if (channel) {
      try {
        const blocks = buildBlocks({ ...payload, createdDate: createdIso, dueDate: dueIso });
        const text = payload.emergency ? 'NOTFALL - Neue Anfrage' : 'Neue Anfrage';
        const r = await postMessage({ channel, text, blocks });
        ts = r?.ts || '';
      } catch (err) {}
    }

    if (payload.emergency) {
      const emergencyChannel =
        normalize(process.env.SLACK_EMERGENCY_CHANNEL) ||
        normalize(process.env.SLACK_ORDER_INTAKE_CHANNEL) ||
        normalize(process.env.SLACK_ACTIVITY_CHANNEL);
      if (emergencyChannel) {
        try {
          const alertBlocks = buildEmergencyAlertBlocks({
            payload,
            title,
            itemId: createdItem?.item?.id || createdItem?.id || '',
            montageIso,
          });
          await postMessage({
            channel: emergencyChannel,
            text: 'NOTFALL',
            blocks: alertBlocks,
          });
        } catch (err) {}
      }
    }

    try {
      persistSpB35Consumption(createdItem?.item?.id || createdItem?.id || '', payload);
    } catch (err) {}

    res.json({ ok: true, itemId: createdItem?.item?.id || createdItem?.id || '', ts: ts || '' });
  } catch (e) {
    next(e);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const q = normalize(req.query.q || '');
    if (q.length < 3) return res.json({ ok: true, q, results: [] });
    const limit = Math.max(1, Math.min(20, Number(req.query.limit || 12)));
    const qLower = q.toLowerCase();

    const listId = normalize(process.env.SLACK_LIST_ID);
    if (!listId) return res.status(500).json({ ok: false, error: 'SLACK_LIST_ID is not set' });

    const cols = await getColumns(listId);
    const titleCol =
      findColumn(cols, { nameIncludes: 'aufgabe' }) ||
      findColumn(cols, { primary: true }) ||
      findColumn(cols, { key: 'title' }) ||
      findColumn(cols, { key: 'rich_text_notes' }) ||
      null;
    const dueCol =
      findColumn(cols, { nameIncludes: 'fälligkeit' }) ||
      findColumn(cols, { key: 'date' }) ||
      findColumn(cols, { key: 'todo_due_date' }) ||
      null;
    const montageCol = findColumn(cols, { nameIncludes: 'montage' }) || null;
    const orderCol =
      findColumn(cols, { nameIncludes: 'position' }) ||
      findColumn(cols, { nameIncludes: 'bestellung' }) ||
      findColumn(cols, { nameIncludes: 'materialbestellung' }) ||
      findColumn(cols, { nameIncludes: 'beschreibung' }) ||
      null;
    const infoCol =
      findColumn(cols, { nameIncludes: 'info' }) ||
      null;

    let cursor = '';
    const results = [];
    for (let pageNo = 0; pageNo < 6; pageNo += 1) {
      const page = await listItems({ listId, cursor });
      for (const it of page.items || []) {
        if (results.length >= limit) break;
        const titleField = getFieldByColumnId(it, titleCol?.id);
        const detailsField = getFieldByColumnId(it, orderCol?.id);
        const infoField = getFieldByColumnId(it, infoCol?.id);
        const title = getFieldText(titleField) || '';
        const details = getFieldText(detailsField) || '';
        const info = getFieldText(infoField) || '';
        const hay = (title + '\n' + details + '\n' + info).toLowerCase();
        if (!hay.includes(qLower)) continue;

        const dueField = getFieldByColumnId(it, dueCol?.id);
        const dueDate = Array.isArray(dueField?.date) && dueField.date[0] ? String(dueField.date[0]) : (typeof dueField?.value === 'string' ? String(dueField.value) : '');
        const montageField = getFieldByColumnId(it, montageCol?.id);
        const montageDate = Array.isArray(montageField?.date) && montageField.date[0] ? String(montageField.date[0]) : (typeof montageField?.value === 'string' ? String(montageField.value) : '');
        const url = findFirstUrl(details) || findFirstUrl(info) || findFirstUrl(title) || '';
        const excerpt = normalize([details, info].filter(Boolean).join('\n')).slice(0, 220);
        results.push({
          id: String(it.id || ''),
          title,
          dueDate: dueDate ? String(dueDate).slice(0, 10) : '',
          montageDate: montageDate ? String(montageDate).slice(0, 10) : '',
          url,
          excerpt,
        });
      }
      if (results.length >= limit) break;
      cursor = page.response_metadata?.next_cursor || '';
      if (!cursor) break;
    }

    res.json({ ok: true, q, results });
  } catch (e) {
    next(e);
  }
});

router.post('/question', async (req, res, next) => {
  try {
    const payload = req.body || {};
    const customerType = must(payload.customerType, 'customerType');
    if (!['private', 'business'].includes(customerType)) {
      const err = new Error('Invalid customerType');
      err.status = 400;
      throw err;
    }

    const assignee = toOperatorCode(must(payload.assignee, 'assignee'));
    const question = must(payload.question, 'question');

    const customer = payload.customer || {};
    const company = normalize(customer.company || customer.companyOther);
    const name = normalize(customer.name);
    const street = normalize(customer.street);
    const ref = normalize(payload.orderRef);
    const url = normalize(payload.url);
    const notes = normalize(payload.notes);

    const createdIso = normalize(payload.createdDate) || formatIsoDate(startOfToday());
    const dueIso = normalize(payload.dueDate);

    const listId = normalize(process.env.SLACK_LIST_ID);
    if (!listId) {
      const err = new Error('SLACK_LIST_ID is not set');
      err.status = 500;
      throw err;
    }

    const cols = await getColumns(listId);
    const statusCol =
      findColumn(cols, { key: 'status' }) ||
      findColumn(cols, { nameIncludes: 'status' }) ||
      null;
    const titleCol =
      findColumn(cols, { nameIncludes: 'aufgabe' }) ||
      findColumn(cols, { primary: true }) ||
      findColumn(cols, { key: 'title' }) ||
      findColumn(cols, { key: 'rich_text_notes' }) ||
      null;
    const dueCol =
      findColumn(cols, { nameIncludes: 'fälligkeit' }) ||
      findColumn(cols, { key: 'date' }) ||
      findColumn(cols, { key: 'todo_due_date' }) ||
      null;
    const orderCol =
      findColumn(cols, { nameIncludes: 'bestellung' }) ||
      findColumn(cols, { nameIncludes: 'materialbestellung' }) ||
      findColumn(cols, { nameIncludes: 'beschreibung' }) ||
      null;

    const titleBits = [];
    if (ref) titleBits.push(ref);
    if (company) titleBits.push(company);
    if (name) titleBits.push(name);
    if (street) titleBits.push(street);
    const subject = titleBits.filter(Boolean).join(' – ');
    const title = `OF: ${assignee}` + (subject ? (' – ' + subject) : '');

    const lines = [];
    lines.push(`Offene Frage an: ${assignee}`);
    lines.push(`Erfasst: ${formatDateDe(createdIso)}`);
    if (dueIso) lines.push(`Dringlichkeit: ${formatDateDe(dueIso)}`);
    if (url) lines.push(`Link: ${url}`);
    lines.push('');
    lines.push('Frage:');
    lines.push(question);
    if (notes) {
      lines.push('');
      lines.push('Notiz:');
      lines.push(notes);
    }
    const text = lines.join('\n').trim();

    let statusValue = '';
    const choices = statusCol?.options?.choices || [];
    if (statusCol && Array.isArray(choices) && choices.length) {
      const open = choices.find(ch => /offen/i.test(String(ch?.label || ch?.value || ''))) || choices[0];
      statusValue = open?.id || open?.value || '';
    }

    const cells = [];
    if (titleCol) cells.push({ column_id: titleCol.id, rich_text: richText(title) });
    if (orderCol) cells.push({ column_id: orderCol.id, rich_text: richText(text) });
    if (dueCol && dueIso) cells.push({ column_id: dueCol.id, date: [dueIso] });
    if (statusCol && statusValue) cells.push({ column_id: statusCol.id, select: [statusValue] });

    let createdItem = null;
    try {
      createdItem = await createItem({ listId, initial_fields: cells });
    } catch (err) {
      return res.status(502).json({
        ok: false,
        error: err?.details?.error || err.message || 'slack_list_create_failed',
        details: err?.details || null,
      });
    }

    res.json({ ok: true, itemId: createdItem?.item?.id || createdItem?.id || '' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
