const express = require('express');
const fs = require('fs');
const path = require('path');
const { listColumns, listItems, listSchema, itemInfo, updateItem, postMessage, createItem } = require('../slack');
const { isMaterialStatusTokenValid, loadMaterialStatusState, saveMaterialStatusState } = require('../material-status');
const { monitorHttpAuthMiddleware } = require('../middleware');
const {
  normalize: spb35Normalize,
  calculateSpB35,
  parseSpB35InputsFromHeader,
  parsePositionBlocksFromText,
  rebuildPositionHeader,
  rebuildInfoBlock,
  parseMmPair,
} = require('../spb35');

const router = express.Router();
const PRODUCT_TYPE_OPTIONS = [
  'Rollladenpanzer',
  'Insektenschutz',
  'Gurt / Wickler',
  'Motor / Antrieb',
  'Jalousie',
  'Plissee',
  'Rollo',
  'Office / Frage',
  'Sonstiges',
];
const STAT_FIELD_OPTIONS = [
  'Rollladenpanzer',
  'Nachschneiden im selben Auftrag',
  'ISS - Spannrahmen',
  'ISS - Rollo',
  'ISS - Tür',
  'Reparatur',
  'Vorsatz-/Aufsatzelement',
  'Bestellware Erfal',
  'Bestellware Delta Dore/Rademacher',
  'Bestellware Sonstige',
  'Schnittware',
];
const MATERIAL_CATEGORY_OPTIONS = [
  'Panzerstäbe',
  'Endleisten',
  'Clips',
  'Ersatzteile',
  'Schnittware',
  'Sonstiges',
];
router.use(monitorHttpAuthMiddleware);

function makeMaterialPreset(category, label, extra = {}) {
  return {
    category,
    label,
    key: normalizeMaterialKey(label),
    unit: extra.unit || 'Stk',
    packSize: Number(extra.packSize || 1),
    minPacks: Number(extra.minPacks || 0),
    notes: String(extra.notes || ''),
  };
}

function buildMaterialCatalogPresets() {
  const presets = [];
  const aluColors = ['Grau', 'Weiß', 'Silber'];
  const pvcColors = ['Grau', 'Weiß'];
  const profiles = [37, 45, 52];

  for (const profile of profiles) {
    for (const color of aluColors) {
      presets.push(makeMaterialPreset('Panzerstäbe', `Panzerstab Alu ${profile}er gelocht 6m ${color}`, { unit: 'Stangen', packSize: 20 }));
      presets.push(makeMaterialPreset('Panzerstäbe', `Panzerstab Alu ${profile}er ungelocht 6m ${color}`, { unit: 'Stangen', packSize: 20 }));
      presets.push(makeMaterialPreset('Endleisten', `Endleiste Alu ${profile}er gebohrt 6m ${color}`, { unit: 'Stk', packSize: 10 }));
      presets.push(makeMaterialPreset('Endleisten', `Endleiste Alu ${profile}er ungebohrt 6m ${color}`, { unit: 'Stk', packSize: 10 }));
    }
    for (const color of pvcColors) {
      presets.push(makeMaterialPreset('Panzerstäbe', `Panzerstab PVC ${profile}er gelocht 6m ${color}`, { unit: 'Stangen', packSize: 20 }));
      presets.push(makeMaterialPreset('Panzerstäbe', `Panzerstab PVC ${profile}er ungelocht 6m ${color}`, { unit: 'Stangen', packSize: 20 }));
    }
    presets.push(makeMaterialPreset('Clips', `Arretierungsclips ${profile}er`, { unit: 'Stk', packSize: 200 }));
  }

  presets.push(makeMaterialPreset('Ersatzteile', 'Trittschutzblech', { unit: 'Stk', packSize: 1 }));
  presets.push(makeMaterialPreset('Ersatzteile', 'Federstift', { unit: 'Stk', packSize: 50 }));
  presets.push(makeMaterialPreset('Ersatzteile', 'Haken', { unit: 'Stk', packSize: 50 }));
  presets.push(makeMaterialPreset('Schnittware', 'Achtkantwelle', { unit: 'Stk', packSize: 1 }));
  presets.push(makeMaterialPreset('Schnittware', 'Koemerplatte', { unit: 'Stk', packSize: 1 }));

  return presets.sort((a, b) =>
    String(a.category || '').localeCompare(String(b.category || ''))
    || String(a.label || '').localeCompare(String(b.label || ''))
  );
}

const MATERIAL_CATALOG_PRESETS = buildMaterialCatalogPresets();

function getListId() {
  const listId = process.env.SLACK_LIST_ID;
  if (!listId) {
    const err = new Error('SLACK_LIST_ID is not set');
    err.status = 500;
    throw err;
  }
  return listId;
}

function formatDateIso(date) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function parseIsoDate(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isDateFromPreviousYear(date) {
  if (!date) return false;
  const currentYear = new Date().getFullYear();
  return date.getFullYear() < currentYear;
}

function getField(item, key) {
  return (item.fields || []).find(f => f && f.key === key) || null;
}

function getText(item, key) {
  const f = getField(item, key);
  if (!f) return '';
  return String(f.text || f.value || '').trim();
}

function getDateValue(item) {
  const f = getField(item, 'date');
  if (!f) return null;
  if (Array.isArray(f.date) && f.date[0]) return f.date[0];
  if (typeof f.value === 'string') return f.value;
  return null;
}

function getStatusValue(item) {
  const f = getField(item, 'status');
  if (!f) return 'not_started';
  if (Array.isArray(f.select) && f.select[0]) return f.select[0];
  if (typeof f.value === 'string' && f.value) return f.value;
  return 'not_started';
}

function normalizeStatusText(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function canonicalStatus(raw) {
  const s = normalizeStatusText(raw);
  if (!s) return 'offen';
  if (s === 'not_started') return 'offen';
  if (s === 'in_progress') return 'in_bearbeitung';
  if (s === 'completed' || s === 'done') return 'fertig';
  if (s.includes('archiv')) return 'archiv';
  if (s.includes('fertig')) return 'fertig';
  if (s.includes('bearbeit')) return 'in_bearbeitung';
  if (s.includes('bestell')) return 'bestellt';
  if (s.includes('angenomm')) return 'angenommen';
  if (s.includes('offen')) return 'offen';
  return s;
}

function displayStatusFromCanonical(c) {
  if (c === 'offen') return 'Offen';
  if (c === 'bestellt') return 'Bestellt';
  if (c === 'angenommen') return 'Angenommen';
  if (c === 'in_bearbeitung') return 'In Bearbeitung';
  if (c === 'fertig') return 'Fertig';
  return c;
}

function resolveStatusInfo(item, statusCol) {
  const field = (statusCol && statusCol.id)
    ? ((item.fields || []).find(f => f && f.column_id === statusCol.id) || null)
    : (getField(item, 'status') || (item.fields || []).find(f => String(f?.key || '').toLowerCase().includes('status')) || null);

  const selectId = Array.isArray(field?.select) && field.select[0] ? String(field.select[0]) : '';
  const raw = selectId || String(field?.value || field?.text || 'not_started');

  const choices = statusCol?.options?.choices;
  let choice = null;
  if (Array.isArray(choices) && selectId) {
    choice = choices.find(c => c && (c.id === selectId || c.value === selectId)) || null;
  }

  const textForCanonical = choice?.label || choice?.value || raw;
  const canonical = canonicalStatus(textForCanonical);

  return {
    raw,
    canonical,
    label: displayStatusFromCanonical(canonical),
    selectId: choice?.id || (selectId || null),
  };
}

function isArchivedItem(item, statusCol) {
  const c = resolveStatusInfo(item, statusCol).canonical;
  if (c === 'archiv') return true;

  for (const f of item.fields || []) {
    const key = String(f?.key || '').toLowerCase();
    if (key.includes('archiv')) {
      if (f.checkbox === true) return true;
      const v = String(f.value || f.text || '').toLowerCase();
      if (v && (v === '1' || v === 'true' || v.includes('archiv'))) return true;
    }
    const t = String(f?.text || '').toLowerCase();
    if (t.includes('archiv')) return true;
    const v = typeof f?.value === 'string' ? f.value.toLowerCase() : '';
    if (v && v.includes('archiv')) return true;
  }

  return false;
}

function isAllowedStatus(item, statusCol) {
  const c = resolveStatusInfo(item, statusCol).canonical;
  return c === 'offen' || c === 'bestellt' || c === 'angenommen' || c === 'in_bearbeitung';
}

function inferOrigin(title) {
  const t = String(title || '').trim();
  if (!t) return '';
  const prefix = t.split(/\s|-/)[0];
  if (prefix.toLowerCase().startsWith('rowe')) return 'ReWo';
  return prefix;
}

function parseOpenQuestionTitle(title) {
  const t = String(title || '').trim();
  const m = /^of\s*:\s*([0-9a-zäöüß]{1,8})\s*(?:[–-]\s*)?(.*)$/i.exec(t);
  if (!m) return null;
  const code = String(m[1] || '').toUpperCase();
  const subject = String(m[2] || '').trim();
  return { code, subject };
}

function hasStandardColors(text) {
  const t = String(text || '').toLowerCase();
  const standards = ['weiß', 'weiss', 'beige', 'grau'];
  return standards.some(s => t.includes(s));
}

function isDueUrgent(dueDate, { today, tomorrow }) {
  if (!dueDate) return false;
  if (sameDay(dueDate, today)) return true;
  if (sameDay(dueDate, tomorrow)) return true;
  return dueDate.getTime() < today.getTime();
}

function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

const holidayCacheByYear = new Map();

function easterSunday(year) {
  const y = Number(year);
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

function holidaySetForYear(year) {
  const y = Number(year);
  if (holidayCacheByYear.has(y)) return holidayCacheByYear.get(y);

  const set = new Set();
  const addIso = (d) => {
    if (!d) return;
    const iso = formatDateIso(d);
    if (iso) set.add(iso);
  };

  addIso(new Date(y, 0, 1));
  addIso(new Date(y, 4, 1));
  addIso(new Date(y, 9, 3));
  addIso(new Date(y, 11, 25));
  addIso(new Date(y, 11, 26));

  const easter = easterSunday(y);
  addIso(addDays(easter, -2));
  addIso(addDays(easter, 1));
  addIso(addDays(easter, 39));
  addIso(addDays(easter, 50));

  const extraRaw = String(process.env.GERMAN_HOLIDAYS_EXTRA || '').trim();
  if (extraRaw) {
    extraRaw
      .split(/[,;\n\r]+/g)
      .map(s => String(s || '').trim())
      .filter(Boolean)
      .forEach(s => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (m && Number(m[1]) === y) set.add(s);
      });
  }

  holidayCacheByYear.set(y, set);
  return set;
}

function isHoliday(d) {
  const iso = formatDateIso(d);
  if (!iso) return false;
  const y = d.getFullYear();
  return holidaySetForYear(y).has(iso);
}

function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + Number(n || 0));
  return d;
}

function nextWorkday(date, offset = 0) {
  let d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let remaining = Math.max(0, Number(offset || 0));
  while (true) {
    if (!isWeekend(d) && !isHoliday(d)) {
      if (remaining === 0) return d;
      remaining -= 1;
    }
    d = addDays(d, 1);
  }
}

function normalizeMaterialKey(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeMaterialKeyLoose(s) {
  let t = String(s || '').trim().toLowerCase();
  t = t.replace(/\|#[\w-]+/g, ' ');
  t = t.replace(/^\s*\(?\s*\d+\s*[\)\.\:]\s*-?\s*/g, '');
  t = t.replace(/(^|\s)(einzelteile|panzer\s*\d*|teile)\s*[:\-–]?\s*/g, '$1');
  t = t.replace(/(^|\s)\d+\s*[x×\*]\s*/g, '$1');
  t = t.replace(/(^|\s)\d+\s*(stk|stücke|stuecke|stück|stueck|x)\b/gi, '$1');
  t = t.replace(/\b(je|à|a|pro|für|fur)\b/gi, ' ');
  t = t.replace(/\b\d{2,4}\s*(?:mm|cm|m)\b/gi, ' ');
  t = t.replace(/\b\d{2,4}\s*[x×]\s*\d{2,4}\s*(?:mm|cm|m)?\b/gi, ' ');
  t = t.replace(/\bral\s*\d{3,5}\b/gi, ' ');
  t = t.replace(/[,\.\-:;–—]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function extractItemIdFromMaterialText(s) {
  const text = String(s || '');
  const markerMatch = text.match(/\|#([\w-]+)/);
  if (markerMatch && markerMatch[1]) return markerMatch[1].trim();
  const recMatch = text.match(/\b(Rec[\w]{8,})\b/i);
  if (recMatch && recMatch[1]) return recMatch[1].trim();
  return null;
}

function splitMaterialSegments(input) {
  const text = String(input || '');
  const out = [];
  let cur = '';

  const isDigit = (ch) => /\d/.test(String(ch || ''));
  const isSpace = (ch) => /[\s\u00A0\u200B\u200C\u200D\uFEFF]/.test(String(ch || ''));
  const prevNonSpaceIndex = (idx) => {
    let j = idx - 1;
    while (j >= 0 && isSpace(text[j])) j -= 1;
    return j;
  };
  const nextNonSpaceIndex = (idx) => {
    let j = idx + 1;
    while (j < text.length && isSpace(text[j])) j += 1;
    return j;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === ',') {
      const pi = prevNonSpaceIndex(i);
      const ni = nextNonSpaceIndex(i);
      const prev = pi >= 0 ? text[pi] : '';
      const next = ni < text.length ? text[ni] : '';
      if (isDigit(prev) && isDigit(next)) {
        cur += ch;
      } else {
        const t = cur.trim();
        if (t) out.push(t);
        cur = '';
      }
      continue;
    }

    if (ch === ';' || ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      const t = cur.trim();
      if (t) out.push(t);
      cur = '';
      continue;
    }

    cur += ch;
  }

  const t = cur.trim();
  if (t) out.push(t);
  return out;
}

function splitCompoundPositionText(input) {
  const text = String(input || '').trim();
  if (!text) return [];

  const byNewline = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const qtyMarker = /^\s*(\d+)\s*(?:x|X|stk|Stk|Stück|St|teil|Teile|teilig)?[\s\.)\-–,:：]+/;
  const protectedCommaSplit = (seg) => {
    const out = [];
    let cur = '';
    let parenDepth = 0;
    for (let i = 0; i < seg.length; i += 1) {
      const ch = seg[i];
      if (ch === '(' || ch === '[' || ch === '{') { parenDepth += 1; cur += ch; continue; }
      if (ch === ')' || ch === ']' || ch === '}') { parenDepth = Math.max(0, parenDepth - 1); cur += ch; continue; }
      if (parenDepth === 0 && (ch === ';' || ch === ',')) {
        const peekAfter = i + 1;
        let digitAfter = false;
        for (let j = peekAfter; j < seg.length; j += 1) {
          if (/\s/.test(seg[j])) continue;
          if (/\d/.test(seg[j])) { digitAfter = true; }
          break;
        }
        const peekBefore = i - 1;
        let digitBefore = false;
        for (let j = peekBefore; j >= 0; j -= 1) {
          if (/\s/.test(seg[j])) continue;
          if (/\d/.test(seg[j])) { digitBefore = true; }
          break;
        }
        if (ch === ',' && digitBefore && digitAfter) {
          cur += ch;
          continue;
        }
        const trimmed = cur.trim();
        if (trimmed) out.push(trimmed);
        cur = '';
        continue;
      }
      cur += ch;
    }
    const trimmed = cur.trim();
    if (trimmed) out.push(trimmed);
    return out;
  };

  const rawSegments = [];
  for (const line of byNewline) {
    for (const semi of protectedCommaSplit(line)) {
      const parts = [];
      const prefixMatch = semi.match(qtyMarker);
      let rest = prefixMatch ? semi.slice(prefixMatch[0].length).trim() : semi;
      const qty = prefixMatch ? Number(prefixMatch[1]) : 1;
      const subSplits = protectedCommaSplit(rest);
      if (subSplits.length <= 1) {
        rawSegments.push({ qty, text: semi });
      } else {
        for (const ss of subSplits) {
          rawSegments.push({ qty: 1, text: ss });
        }
      }
    }
  }

  const normalized = rawSegments.map(s => normalizeOneLine(s.text)).filter(Boolean);
  const dedup = Array.from(new Set(normalized));
  return dedup.length ? dedup : [normalizeOneLine(text)].filter(Boolean);
}

function materialLineFromConfig(cfg) {
  if (!cfg) return '';
  const mat = cfg.material ? String(cfg.material).trim() : '';
  const prof = cfg.profileHeight ? `${Number(cfg.profileHeight)}er` : '';
  const col = cfg.color ? String(cfg.color).trim() : '';
  return [mat, prof, col].filter(Boolean).join(' ').trim();
}

function normalizeRodStockColor(material, color) {
  const mat = normalizeForMatch(material);
  const col = normalizeForMatch(color);
  if (!col) return '';
  const isGray = /\b(grau|grau matt|anthrazit|anthrazitgrau|7016)\b/.test(col);
  const isWhite = /\b(weiss|weiß|reinweiss|reinweiß|9016)\b/.test(col);
  const isSilver = /\b(silber|silber eloxiert|elox|aluminiumfarbig)\b/.test(col);

  if (/\b(alu|aluminium)\b/.test(mat)) {
    if (isGray) return 'Grau';
    if (isWhite) return 'Weiß';
    if (isSilver) return 'Silber';
  }
  if (/\bpvc\b/.test(mat)) {
    if (isGray) return 'Grau';
    if (isWhite) return 'Weiß';
  }
  return '';
}

function sanitizePegMode(input) {
  const s = normalizeForMatch(input);
  if (s === 'packs' || s === 've') return 'packs';
  if (s === 'units' || s === 'stk' || s === 'stueck' || s === 'stück') return 'units';
  return '';
}

function inferDefaultPegMode({ category, label, unit, packSize }) {
  const hay = normalizeForMatch([category, label, unit].filter(Boolean).join(' '));
  if (/\b(motor|antrieb|wickler)\b/.test(hay)) return 'units';
  if (/\bclip\b/.test(hay)) return 'packs';
  if (Number(packSize || 1) > 1) return 'packs';
  return 'units';
}

function trimPegHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(x => x && typeof x === 'object')
    .map(x => ({
      at: typeof x.at === 'string' ? x.at : '',
      mode: sanitizePegMode(x.mode) || '',
      value: Math.max(0, Number(x.value || 0)),
      actor: typeof x.actor === 'string' ? x.actor : '',
      note: typeof x.note === 'string' ? x.note : '',
    }))
    .filter(x => x.at && Number.isFinite(x.value))
    .slice(-20);
}

function appendPegHistory(prevHistory, { at, mode, value, actor, note }) {
  const next = trimPegHistory(prevHistory);
  const entry = {
    at: typeof at === 'string' ? at : new Date().toISOString(),
    mode: sanitizePegMode(mode) || 'units',
    value: Math.max(0, Number(value || 0)),
    actor: typeof actor === 'string' ? actor : '',
    note: typeof note === 'string' ? note : '',
  };
  next.push(entry);
  return next.slice(-80);
}

function buildRodDemandLabels(cfg, drilled) {
  const profile = cfg && cfg.profileHeight ? `${Number(cfg.profileHeight)}er` : '';
  const material = cfg && cfg.material ? String(cfg.material).trim() : 'Panzer';
  const holeText = drilled ? 'gelocht' : 'ungelocht';
  const baseLabel = `Panzerstab ${material} ${profile} ${holeText} 6m`.trim();
  const stockColor = normalizeRodStockColor(material, cfg && cfg.color);
  return {
    key: stockColor ? `${baseLabel} ${stockColor}`.trim() : baseLabel,
    label: buildCompactRodDisplayLabel(material, profile, stockColor, drilled),
    fallbackKey: baseLabel,
  };
}

function buildCompactRodDisplayLabel(material, profile, stockColor, drilled) {
  const matNorm = normalizeForMatch(material);
  const matShort = /\bpvc\b/.test(matNorm) ? 'PVC' : (/\b(alu|aluminium)\b/.test(matNorm) ? 'Alu' : String(material || '').trim());
  const profShort = String(profile || '').replace(/er$/i, '').trim();
  const drillShort = drilled ? 'gel.' : 'ungel.';
  return [matShort, profShort, stockColor].filter(Boolean).join(' ') + ', ' + drillShort;
}

function buildEndleisteDemandLabels(cfg, endleiste) {
  const profile = cfg && cfg.profileHeight ? `${Number(cfg.profileHeight)}er` : '';
  const material = 'Alu';
  const drilledRaw = endleiste && Object.prototype.hasOwnProperty.call(endleiste, 'drilled') ? endleiste.drilled : null;
  const drilled = typeof drilledRaw === 'boolean' ? drilledRaw : true;
  const drillText = drilled ? 'gebohrt' : 'ungebohrt';
  const colorRaw = endleiste && endleiste.color ? String(endleiste.color).trim() : '';
  const stockColor = normalizeRodStockColor(material, colorRaw);
  const baseLabel = `Endleiste ${material} ${profile} ${drillText} 6m`.trim();
  return {
    key: stockColor ? `${baseLabel} ${stockColor}`.trim() : baseLabel,
    label: buildCompactEndleisteDisplayLabel(material, profile, stockColor, drilled),
    fallbackKey: baseLabel,
  };
}

function buildCompactEndleisteDisplayLabel(material, profile, stockColor, drilled) {
  const matNorm = normalizeForMatch(material);
  const matShort = /\b(alu|aluminium)\b/.test(matNorm) ? 'Alu' : String(material || '').trim();
  const profShort = String(profile || '').replace(/er$/i, '').trim();
  const drillShort = drilled ? 'geb.' : 'ung.';
  return ['EL', matShort, profShort, stockColor].filter(Boolean).join(' ') + ', ' + drillShort;
}

function compactMaterialLabel(label, key) {
  const src = String(label || key || '').trim();
  const m = /^Panzerstab\s+(.+?)\s+(\d{2,3}er)\s+(gelocht|ungelocht)\s+6m(?:\s+([A-Za-zÄÖÜäöüß]+)|\s+\(([A-Za-zÄÖÜäöüß]+)\))?$/i.exec(src);
  if (m) {
    const material = m[1] || '';
    const profile = m[2] || '';
    const drilled = /gelocht/i.test(m[3] || '');
    const color = (m[4] || m[5] || '').trim();
    return buildCompactRodDisplayLabel(material, profile, color, drilled);
  }

  const e = /^Endleiste\s+(.+?)\s+(\d{2,3}er)\s+(gebohrt|ungebohrt|nicht\s+gebohrt)\s+6m(?:\s+([A-Za-zÄÖÜäöüß]+)|\s+\(([A-Za-zÄÖÜäöüß]+)\))?$/i.exec(src);
  if (!e) return src;
  const material = e[1] || '';
  const profile = e[2] || '';
  const drilled = !/nicht/i.test(e[3] || '') && !/ungebohrt/i.test(e[3] || '');
  const color = (e[4] || e[5] || '').trim();
  return buildCompactEndleisteDisplayLabel(material, profile, color, drilled);
}

function extractPartsMaterialNeeds(description) {
  const desc = String(description || '').trim();
  if (!desc) return [];

  const keywords = [
    'gurt', 'gurtscheibe', 'gurtwickler', 'wickler', 'schwenkwickler',
    'welle', 'stahlwelle', 'achtung', 'lager', 'halter', 'konsole',
    'einlauf', 'führung', 'fuehrung', 'anschlag', 'stopper',
    'kurbel', 'motor', 'somfy', 'rademacher', 'speedtimer', 'erfal', 'drahtseil', 'feder', 'kapsel',
    'abdeckplatte', 'deckel', 'teleskop', 'rollo', 'jalousie', 'plissee',
    'insektenschutz',
  ];

  function mapMaterialSeg(seg) {
    const t = String(seg || '').trim();
    const l = t.toLowerCase();
    if (!l) return '';
    if (l.includes('speedtimer') || l.includes('speed timer')) return 'Rademacher SpeedTimer';
    if (l.includes('somfy') && l.includes('motor')) return 'Somfy Motor';
    if (l.includes('rademacher') && l.includes('motor')) return 'Rademacher Motor';
    if (l.includes('motor')) return l.includes('somfy') ? 'Somfy Motor' : 'Rademacher Motor';
    if (l.includes('jalousie')) return l.includes('erfal') ? 'Erfal Jalousie' : 'Erfal Jalousie';
    if (l.includes('plissee')) return l.includes('erfal') ? 'Erfal Plissee' : 'Erfal Plissee';
    if (l.includes('rollo')) return l.includes('erfal') ? 'Erfal Rollo' : 'Erfal Rollo';
    if (l.includes('erfal')) return 'Erfal';
    if (l.includes('rademacher')) return 'Rademacher';
    return '';
  }

  const out = [];
  const lines = desc.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  for (const line of lines) {
    const l = line.toLowerCase();
    if (l.includes('schnitt') || l.includes('schnittmaß')) continue;

    const plusParts = line.split('+').map(s => s.trim()).filter(Boolean);
    if (plusParts.length > 1) {
      for (let i = 1; i < plusParts.length; i += 1) out.push(plusParts[i]);
    }

    const commaParts = splitMaterialSegments(line);
    for (const seg of commaParts) {
      const segLower = seg.toLowerCase();
      if (keywords.some(k => segLower.includes(k))) out.push(mapMaterialSeg(seg) || seg);
    }
  }

  return Array.from(new Set(out)).slice(0, 30);
}

function extractEndleisteInfo(description) {
  const text = String(description || '');
  if (!text) return null;

  const colorMatch = text.match(/(?:farbe\s*(?:endleiste|el)|(?:endleiste|el)\s*farbe)\s*:\s*([^,\n\r]+)/i);
  const drilledMatch = text.match(/(?:el|endleiste)\s*(?:gebohrt|geb\.?|loch(?:ung)?|gelocht)\s*:\s*([^,\n\r]+)/i);

  let colorRaw = colorMatch ? String(colorMatch[1] || '').trim() : '';
  const drilledRaw = drilledMatch ? String(drilledMatch[1] || '').trim() : '';

  let drilled = null;
  if (drilledRaw) {
    const d = drilledRaw.toLowerCase();
    if (d === 'ja' || d === 'yes' || d === 'true' || d === '1' || d === 'geb' || d === 'geb.' || d.includes('gebohrt') || d.includes('gelocht')) drilled = true;
    else if (d === 'nein' || d === 'no' || d === 'false' || d === '0' || d === 'nicht' || d.includes('ungebohrt') || d.includes('nicht gebohrt') || d.includes('nicht gelocht')) drilled = false;
    else drilled = drilledRaw;
  }

  if (!colorRaw || drilled == null) {
    const fragMatch = text.match(/(?:^|[,\n\r])\s*(?:el|endleiste)\s+([^,\n\r]+)/i);
    if (fragMatch) {
      const frag = String(fragMatch[1] || '').trim();
      if (!colorRaw) {
        const c = detectShopifyColor(frag);
        colorRaw = c || '';
      }
      if (drilled == null && frag) {
        const f = frag.toLowerCase();
        if (/\bungebohrt\b/.test(f) || (f.includes('nicht') && (f.includes('gebohrt') || f.includes('gelocht') || /\bgeb\.?\b/.test(f)))) drilled = false;
        else if (/\bgeb\.?\b/.test(f) || f.includes('gebohrt') || f.includes('gelocht') || f.includes('loch')) drilled = true;
      }
    }
  }

  if (drilled == null) {
    const lines = String(text).split(/\r?\n/);
    for (const line of lines) {
      const l = String(line || '').toLowerCase();
      if (!l) continue;
      if (!(l.includes(' el ') || l.startsWith('el ') || l.includes('endleiste'))) continue;
      if (/\bungebohrt\b/.test(l) || (l.includes('nicht') && (l.includes('gebohrt') || l.includes('gelocht') || /\bgeb\.?\b/.test(l)))) {
        drilled = false;
        break;
      }
      if (/\bgeb\.?\b/.test(l) || l.includes('gebohrt') || l.includes('gelocht') || l.includes('loch')) {
        drilled = true;
        break;
      }
    }
  }

  if (!colorRaw && drilled == null) return null;
  return { color: colorRaw || null, drilled };
}

function extractVorsatzInfo(description) {
  const text = String(description || '');
  if (!text) return null;

  const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  const vorsatzBlockMatch = text.match(/Vorsatzelement\s*[:：]\s*([^\n\r]+)(?:\n|$)/i);
  const vorsatzInlineMatch = text.match(/(?:^|[,\n\r])\s*Vorsatz\s+([^,\n\r]+)/i);
  const raw = normalize(vorsatzBlockMatch ? vorsatzBlockMatch[1] : (vorsatzInlineMatch ? vorsatzInlineMatch[1] : ''));
  if (!raw) return null;

  const enabled = !/kein|keine|ohne/i.test(raw);
  if (!enabled) return null;

  const segments = raw.split(/[,;|]/).map(normalize).filter(Boolean);
  const pick = (pattern) => {
    const hit = segments.find(s => pattern.test(s));
    return hit ? normalize(hit.replace(pattern, '')) : '';
  };

  let colorLabel = pick(/^(?:Farbe|Vorsatzfarbe)\s*[:：]\s*/i);
  if (!colorLabel) {
    const c = detectShopifyColor(raw);
    colorLabel = c || '';
  }

  let dimensions = '';
  const dimsMatch = raw.match(/(\d{3,4})\s*(?:mm)?\s*(?:x|×)\s*(\d{3,4})\s*(?:mm)?/i);
  if (dimsMatch) dimensions = `${dimsMatch[1]} x ${dimsMatch[2]} mm`;

  let rails = null;
  if (/\b(?:Schienen|Rail)\b\s*[:：]?\s*(ja|yes|1|wahr|true|mit)\b/i.test(raw)) rails = true;
  else if (/\b(?:Schienen|Rail)\b\s*[:：]?\s*(nein|no|0|falsch|false|ohne)\b/i.test(raw)) rails = false;
  else if (/\b(?:mit\s+)?Schienen\b/i.test(raw)) rails = true;
  else if (/\bohne\s+Schienen\b/i.test(raw)) rails = false;

  let rolloColorLabel = pick(/^(?:Rollladenfarbe|Rolladenfarbe|Rollofarbe)\s*[:：]\s*/i);
  if (!rolloColorLabel) {
    const rcSegments = segments.filter(s => /(?:Rollladenfarbe|Rolladenfarbe|Rollofarbe)/i.test(s));
    if (rcSegments.length) {
      const rc = rcSegments[rcSegments.length - 1];
      const m = rc.match(/(?:Rollladenfarbe|Rolladenfarbe|Rollofarbe)\s*[:：]\s*([^,;|]+)/i);
      rolloColorLabel = m ? normalize(m[1]) : detectShopifyColor(rc) || '';
    }
  }

  let rolloProfileLabel = pick(/^(?:Rollladenprofil|Rolladenprofil|Rolloprofil)\s*[:：]\s*/i);
  if (!rolloProfileLabel) {
    const rpSegments = segments.filter(s => /(?:Rollladenprofil|Rolladenprofil|Rolloprofil)/i.test(s));
    if (rpSegments.length) {
      const rp = rpSegments[rpSegments.length - 1];
      const m = rp.match(/(?:Rollladenprofil|Rolladenprofil|Rolloprofil)\s*[:：]\s*([^,;|]+)/i);
      rolloProfileLabel = m ? normalize(m[1]) : '';
    }
    if (!rolloProfileLabel) {
      const l = raw.toLowerCase();
      if (/\b37\b.*\bmini\b|\bmini\b.*\b37\b/.test(l)) rolloProfileLabel = '37 / Mini';
      else if (/\b45\b.*\bmidi\b|\bmidi\b.*\b45\b/.test(l)) rolloProfileLabel = '45 / Midi';
      else if (/\b52\b.*\bmaxi\b|\bmaxi\b.*\b52\b/.test(l)) rolloProfileLabel = '52 / Maxi';
      else if (/\bmini\b/.test(l)) rolloProfileLabel = '37 / Mini';
      else if (/\bmidi\b/.test(l)) rolloProfileLabel = '45 / Midi';
      else if (/\bmaxi\b/.test(l)) rolloProfileLabel = '52 / Maxi';
    }
  }

  if (!colorLabel && !dimensions && rails == null && !rolloColorLabel && !rolloProfileLabel) return null;
  return {
    enabled: true,
    colorLabel: colorLabel || null,
    dimensions: dimensions || null,
    rails,
    rolloColorLabel: rolloColorLabel || null,
    rolloProfileLabel: rolloProfileLabel || null,
    summary: raw,
  };
}

const prodLogDir = path.resolve(__dirname, '..', '..', '..', 'logs');
const prodLogFile = path.join(prodLogDir, 'production.log');

function prodLog(event, payload) {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...(payload || {}) });
  try { fs.mkdirSync(prodLogDir, { recursive: true }); } catch (e) {}
  try { fs.appendFileSync(prodLogFile, line + '\n', 'utf8'); } catch (e) {}
  try { console.log(line); } catch (e) {}
}

function readProductionLogLines() {
  try {
    return fs.readFileSync(prodLogFile, 'utf8').split(/\r?\n/).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function parseProductionLogLine(line) {
  try {
    const parsed = JSON.parse(String(line || ''));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    return null;
  }
}

function buildDoneTodayEvents(lines, datePrefix) {
  const pendingByItemId = new Map();
  const out = [];

  for (const line of lines || []) {
    const entry = parseProductionLogLine(line);
    if (!entry || !entry.ts || !String(entry.ts).startsWith(datePrefix)) continue;

    if (entry.event === 'scan_request') {
      const itemId = String(entry.itemId || '').trim();
      const stage = Number(entry.stage || 0);
      const targetCanonical = canonicalStatus(entry.targetCanonical);
      if (!itemId || targetCanonical !== 'fertig' || (stage !== 2 && stage !== 3)) continue;

      const queue = pendingByItemId.get(itemId) || [];
      queue.push({
        itemId,
        ts: String(entry.ts),
        stage,
        partial: entry.partial === true,
        part: entry.part ? String(entry.part) : '',
        actor: entry.actor ? String(entry.actor) : '',
        station: entry.station ? String(entry.station) : '',
        actionLabel: stage === 2 ? 'Fertig' : 'Kurier',
      });
      pendingByItemId.set(itemId, queue);
      continue;
    }

    if (entry.event === 'scan_update_ok') {
      const itemId = String(entry.itemId || '').trim();
      if (!itemId || canonicalStatus(entry.selectValue) !== 'fertig') continue;
      const queue = pendingByItemId.get(itemId);
      if (!queue || !queue.length) continue;

      const pending = queue.shift();
      if (!queue.length) pendingByItemId.delete(itemId);
      out.push({
        ...pending,
        updatedTs: entry.ts ? String(entry.ts) : pending.ts,
      });
    }
  }

  return out.sort((a, b) => String(b.updatedTs || b.ts || '').localeCompare(String(a.updatedTs || a.ts || '')));
}

function buildDoneEventsInRange(lines, { from, to } = {}) {
  const pendingByItemId = new Map();
  const out = [];
  const fromIso = String(from || '').slice(0, 10);
  const toIso = String(to || '').slice(0, 10);

  function inRange(ts) {
    const day = String(ts || '').slice(0, 10);
    if (!day) return false;
    if (fromIso && day < fromIso) return false;
    if (toIso && day > toIso) return false;
    return true;
  }

  for (const line of lines || []) {
    const entry = parseProductionLogLine(line);
    if (!entry || !entry.ts) continue;

    if (entry.event === 'scan_request') {
      const itemId = String(entry.itemId || '').trim();
      const stage = Number(entry.stage || 0);
      const targetCanonical = canonicalStatus(entry.targetCanonical);
      if (!itemId || targetCanonical !== 'fertig' || (stage !== 2 && stage !== 3)) continue;
      const queue = pendingByItemId.get(itemId) || [];
      queue.push({
        itemId,
        ts: String(entry.ts),
        stage,
        partial: entry.partial === true,
        part: entry.part ? String(entry.part) : '',
        actor: entry.actor ? String(entry.actor) : '',
        station: entry.station ? String(entry.station) : '',
        actionLabel: stage === 2 ? 'Fertig' : 'Kurier',
      });
      pendingByItemId.set(itemId, queue);
      continue;
    }

    if (entry.event === 'scan_update_ok') {
      const itemId = String(entry.itemId || '').trim();
      if (!itemId || canonicalStatus(entry.selectValue) !== 'fertig') continue;
      const queue = pendingByItemId.get(itemId);
      if (!queue || !queue.length) continue;

      const pending = queue.shift();
      if (!queue.length) pendingByItemId.delete(itemId);
      const updatedTs = entry.ts ? String(entry.ts) : pending.ts;
      if (!inRange(updatedTs)) continue;
      out.push({ ...pending, updatedTs });
    }
  }

  return out.sort((a, b) => String(b.updatedTs || b.ts || '').localeCompare(String(a.updatedTs || a.ts || '')));
}

const prodDataDir = path.resolve(__dirname, '..', '..', 'data');
const prodNotesFile = path.join(prodDataDir, 'production-notes.json');
const prodPartsFile = path.join(prodDataDir, 'production-parts.json');
const prodMatCheckedFile = path.join(prodDataDir, 'production-mat-checked.json');
const prodSplitsFile = path.join(prodDataDir, 'position-splits.json');

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJsonFile(filePath, obj) {
  try { fs.mkdirSync(path.dirname(filePath), { recursive: true }); } catch (e) {}
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj || {}, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function normalizeOneLine(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function normalizePartKey(s) {
  return normalizeOneLine(s).slice(0, 280);
}

function loadNotes() {
  return readJsonFile(prodNotesFile, {});
}

function saveNotes(obj) {
  writeJsonFile(prodNotesFile, obj || {});
}

function loadParts() {
  return readJsonFile(prodPartsFile, {});
}

function saveParts(obj) {
  writeJsonFile(prodPartsFile, obj || {});
}

function loadMatChecked() {
  const raw = readJsonFile(prodMatCheckedFile, { ids: [], updatedAt: '' });
  const ids = Array.isArray(raw && raw.ids) ? raw.ids.filter(x => typeof x === 'string' && x) : [];
  const clean = Array.from(new Set(ids)).slice(-3000);
  return { ids: clean, updatedAt: String((raw && typeof raw === 'object' && raw.updatedAt) ? raw.updatedAt : '') };
}

function saveMatChecked(ids) {
  const arr = Array.isArray(ids) ? ids.filter(x => typeof x === 'string' && x) : [];
  const clean = Array.from(new Set(arr)).slice(-3000);
  const updatedAt = new Date().toISOString();
  writeJsonFile(prodMatCheckedFile, { ids: clean, updatedAt });
  return { updatedAt, ids: clean };
}

function loadSplits() {
  return readJsonFile(prodSplitsFile, {});
}

function saveSplits(obj) {
  writeJsonFile(prodSplitsFile, obj || {});
}

function getConsumptionMeta(partsMap, itemId) {
  const map = partsMap && typeof partsMap === 'object' ? partsMap : null;
  if (!map) return null;
  const entry = map[String(itemId || '').trim()];
  if (!entry || typeof entry !== 'object') return null;
  const meta = entry.__consumption;
  return meta && typeof meta === 'object' ? meta : null;
}

function getConsumptionMaterialNeeds(meta) {
  const items = Array.isArray(meta && meta.items) ? meta.items : [];
  const out = [];
  for (const item of items) {
    const entries = Array.isArray(item && item.entries) ? item.entries : [];
    for (const entry of entries) {
      const label = normalizeOneLine(entry && entry.label ? entry.label : '');
      if (label) out.push(label);
    }
  }
  return Array.from(new Set(out));
}

const localProgressByItemId = new Map();

function setLocalProgress({ itemId, label, station, actor }) {
  const now = Date.now();
  const ttlMs = label === 'Gesägt' ? 6 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  localProgressByItemId.set(String(itemId), {
    label: String(label),
    station: station ? String(station) : '',
    actor: actor ? String(actor) : '',
    ts: new Date(now).toISOString(),
    expiresAt: now + ttlMs,
  });
}

function getLocalProgress(itemId) {
  const v = localProgressByItemId.get(String(itemId));
  if (!v) return null;
  if (typeof v.expiresAt === 'number' && Date.now() > v.expiresAt) {
    localProgressByItemId.delete(String(itemId));
    return null;
  }
  return { label: v.label, station: v.station || '', actor: v.actor || '', ts: v.ts };
}

let shopifyColorCandidates = null;

function normalizeUmlauts(s) {
  return String(s || '')
    .replace(/ä/gi, m => (m === 'Ä' ? 'Ae' : 'ae'))
    .replace(/ö/gi, m => (m === 'Ö' ? 'Oe' : 'oe'))
    .replace(/ü/gi, m => (m === 'Ü' ? 'Ue' : 'ue'))
    .replace(/ß/g, 'ss');
}

function normalizeForMatch(s) {
  return normalizeUmlauts(String(s || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function loadShopifyColorsFromCsvFiles() {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  let files = [];
  try {
    files = fs.readdirSync(repoRoot)
      .filter(f => /^shopify_import_.*\.csv$/i.test(f))
      .map(f => path.join(repoRoot, f));
  } catch (e) {
    files = [];
  }

  const rawColors = new Map();

  for (const file of files) {
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (e) {
      continue;
    }

    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) continue;
    const header = parseCsvLine(lines[0]);
    const idx = new Map();
    header.forEach((h, i) => idx.set(String(h || '').trim(), i));

    function get(row, key) {
      const i = idx.get(key);
      if (typeof i !== 'number') return '';
      return row[i] != null ? String(row[i]).trim() : '';
    }

    for (let li = 1; li < lines.length; li += 1) {
      const row = parseCsvLine(lines[li]);
      for (let oi = 1; oi <= 10; oi += 1) {
        const n = get(row, `Option${oi} Name`);
        if (!n) continue;
        if (normalizeForMatch(n) !== 'farbe') continue;
        const v = get(row, `Option${oi} Value`);
        if (!v) continue;
        const base = String(v).replace(/\s*\([^)]*\)\s*/g, '').trim();
        if (!base) continue;
        const norm = normalizeForMatch(base);
        if (!norm) continue;
        if (!rawColors.has(norm)) rawColors.set(norm, base);
      }
    }
  }

  const candidates = [];
  for (const [norm, canonical] of rawColors.entries()) {
    candidates.push({ norm, canonical });

    const spaced = canonical.replace(/([a-zäöüß])([A-ZÄÖÜ])/g, '$1 $2').trim();
    const spacedNorm = normalizeForMatch(spaced);
    if (spacedNorm && spacedNorm !== norm && !rawColors.has(spacedNorm)) {
      candidates.push({ norm: spacedNorm, canonical });
    }
  }

  if (!candidates.length) {
    const fallback = ['weiß', 'weiss', 'grau', 'beige', 'silber', 'anthrazit', 'schwarz', 'braun', 'creme'];
    for (const c of fallback) candidates.push({ norm: normalizeForMatch(c), canonical: c });
  }

  candidates.sort((a, b) => b.norm.length - a.norm.length);
  return candidates;
}

function detectShopifyColor(text) {
  if (!shopifyColorCandidates) shopifyColorCandidates = loadShopifyColorsFromCsvFiles();
  const hay = normalizeForMatch(text);
  if (!hay) return '';
  const padded = ` ${hay} `;
  for (const c of shopifyColorCandidates) {
    if (!c.norm) continue;
    if (padded.includes(` ${c.norm} `)) return c.canonical;
  }
  return '';
}

let cachedMaterialSignalsAt = 0;
let cachedMaterialOpenSet = null;
let cachedMaterialOrderedSet = null;
let cachedMaterialOpenItemIds = null;
let cachedMaterialOrderedItemIds = null;
let cachedMaterialSignals = { opened: [], closed: [] };

async function getMaterialOpenSetCached({ force } = {}) {
  const materialListId = process.env.SLACK_MATERIAL_LIST_ID;
  if (!materialListId) return { open: null, ordered: null, openItemIds: null, orderedItemIds: null };

  const now = Date.now();
  if (!force && cachedMaterialOpenSet && cachedMaterialOrderedSet && now - cachedMaterialSignalsAt < 60_000) {
    return {
      open: cachedMaterialOpenSet,
      ordered: cachedMaterialOrderedSet,
      openItemIds: cachedMaterialOpenItemIds,
      orderedItemIds: cachedMaterialOrderedItemIds,
    };
  }

  const schema = await listSchema({ listId: materialListId });
  const cols = Array.isArray(schema) ? schema : [];
  const byNameIncludes = (needle) => cols.find(c => c && typeof c.name === 'string' && c.name.toLowerCase().includes(needle));
  const materialCol = byNameIncludes('material') || cols.find(c => c && c.is_primary_column) || null;
  const kommissCol = byNameIncludes('kommission') || byNameIncludes('projekt') || byNameIncludes('auftrag') || null;
  const statusCol = cols.find(c => c && c.key === 'status') || byNameIncludes('status') || null;
  const closedIds = new Set();
  const orderedIds = new Set();
  if (statusCol && Array.isArray(statusCol.options?.choices)) {
    for (const ch of statusCol.options.choices) {
      const label = String(ch?.label || ch?.value || '').toLowerCase();
      if (label.includes('geliefert') || label.includes('archiv')) {
        if (ch?.id) closedIds.add(String(ch.id));
        if (ch?.value) closedIds.add(String(ch.value));
      } else if (label.includes('bestellt') || label.includes('angefragt') || label.includes('anfrage')) {
        if (ch?.id) orderedIds.add(String(ch.id));
        if (ch?.value) orderedIds.add(String(ch.value));
      }
    }
  }

  const openSet = new Set();
  const orderedSet = new Set();
  const openItemIds = new Set();
  const orderedItemIds = new Set();
  let cursor = '';
  for (let i = 0; i < 10; i += 1) {
    const page = await listItems({ listId: materialListId, cursor });
    for (const it of page.items || []) {
      const materialField = materialCol ? getFieldByColumnId(it, materialCol.id) : null;
      const materialText = getFieldText(materialField);
      const kommissField = kommissCol ? getFieldByColumnId(it, kommissCol.id) : null;
      const kommissText = getFieldText(kommissField);

      let isOpen = true;
      let isOrdered = false;
      if (statusCol) {
        const statusField = getFieldByColumnId(it, statusCol.id);
        const sel = Array.isArray(statusField?.select) && statusField.select[0] ? String(statusField.select[0]) : '';
        if (sel && closedIds.has(sel)) isOpen = false;
        const choices = statusCol.options?.choices;
        const match = sel && Array.isArray(choices) ? (choices.find(c => c && (c.id === sel || c.value === sel)) || null) : null;
        const label = String(match?.label || match?.value || statusField?.text || statusField?.value || '').toLowerCase();
        if (label.includes('geliefert') || label.includes('archiv')) isOpen = false;
        if (label.includes('bestellt') || label.includes('angefragt') || label.includes('anfrage')) {
          isOrdered = true;
          isOpen = false;
          if (sel) { orderedIds.add(String(sel)); closedIds.delete(String(sel)); }
          if (match?.id) orderedIds.add(String(match.id));
          if (match?.value) orderedIds.add(String(match.value));
        } else if (label.includes('geliefert') || label.includes('archiv')) {
          if (sel) { closedIds.add(String(sel)); orderedIds.delete(String(sel)); }
        }
        if (sel && orderedIds.has(sel)) {
          isOrdered = true;
          isOpen = false;
        }
      }

      const idCandidates = [];
      if (materialText) {
        const m1 = extractItemIdFromMaterialText(materialText);
        if (m1) idCandidates.push(m1);
        const key = normalizeMaterialKey(materialText);
        if (isOpen) openSet.add(key);
        if (isOrdered) orderedSet.add(key);
      }
      if (kommissText) {
        const m2 = extractItemIdFromMaterialText(kommissText);
        if (m2) idCandidates.push(m2);
        const keyK = normalizeMaterialKey(kommissText);
        if (keyK) {
          if (isOpen) openSet.add(keyK);
          if (isOrdered) orderedSet.add(keyK);
        }
      }
      for (const iid of idCandidates) {
        if (!iid) continue;
        const normId = iid.toLowerCase();
        if (isOpen) openItemIds.add(normId);
        if (isOrdered) orderedItemIds.add(normId);
      }
    }
    cursor = page.response_metadata?.next_cursor || '';
    if (!cursor) break;
  }

  if (cachedMaterialOpenSet) {
    const opened = [];
    const closed = [];
    for (const m of openSet) if (!cachedMaterialOpenSet.has(m)) opened.push(m);
    for (const m of cachedMaterialOpenSet) if (!openSet.has(m)) closed.push(m);
    cachedMaterialSignals = { opened, closed };
  } else {
    cachedMaterialSignals = { opened: [], closed: [] };
  }

  cachedMaterialOpenSet = openSet;
  cachedMaterialOrderedSet = orderedSet;
  cachedMaterialOpenItemIds = openItemIds;
  cachedMaterialOrderedItemIds = orderedItemIds;
  cachedMaterialSignalsAt = now;
  return { open: openSet, ordered: orderedSet, openItemIds, orderedItemIds };
}

function parsePanzerConfigs(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];

  function normalize(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function stripEndleisteClause(s) {
    const t = String(s || '');
    const withoutTagged =
      t.replace(/(?:,|\s)\s*(?:farbe\s*(?:endleiste|el)|(?:endleiste|el)\s*farbe)\s*:\s*[^,\n\r]*/ig, '')
       .replace(/(?:,|\s)\s*(?:el|endleiste)\s*(?:gebohrt|geb\.?|loch(?:ung)?|gelocht)\s*:\s*[^,\n\r]*/ig, '');
    const withoutLoose = withoutTagged.replace(/(?:,|\s)\s*(?:endleiste|el)\b[^,\n\r]*(?:,\s*)?/ig, '');
    return withoutLoose.trim();
  }

  function extractCommonAttrs(s) {
    const t = normalize(stripEndleisteClause(s));
    const countMatch = t.match(/^\s*(\d+)\s*(?:x|×)\s*/i);
    const count = countMatch ? Math.max(1, Number(countMatch[1])) : 1;

    const isAlu = /\b(alu|aluminium)\b/i.test(t);
    const isPvc = /\bpvc\b/i.test(t);

    const profileMatch =
      t.match(/\b(37|45|52)\s*er\b/i) ||
      t.match(/\b(37|45|52)\s*mm\b/i) ||
      t.match(/\b(37|45|52)\b/i);
    const profileHeight = profileMatch
      ? Number(profileMatch[1])
      : (/\bmidi\b/i.test(t) ? 45 : (/\bmaxi\b/i.test(t) ? 52 : (/\bmini\b/i.test(t) ? 37 : null)));

    const color = detectShopifyColor(t);

    return {
      count,
      material: isAlu && !isPvc ? 'Alu' : (isPvc && !isAlu ? 'PVC' : ''),
      profileHeight,
      color,
    };
  }

  const baseAttrs = extractCommonAttrs(raw);
  const baseCount = baseAttrs.count || 1;
  const baseProfileHeight = baseAttrs.profileHeight || null;
  const baseMaterial = baseAttrs.material || '';
  const baseColor = baseAttrs.color || '';

  const insertNewlines = (s) =>
    String(s || '')
      .replace(/(\b\d+\)\s*rollladenpanzer\b)/ig, '\n$1')
      .replace(/(\brollladenpanzer\s*:)/ig, '\n$1');

  const blocksRaw = insertNewlines(raw).split(/\n+/).map(x => String(x || '').trim()).filter(Boolean);
  const segments = blocksRaw.length ? blocksRaw : [raw];
  const configs = [];

  for (const seg of segments) {
    const attrs = extractCommonAttrs(seg);
    const profileHeight = attrs.profileHeight || baseProfileHeight;
    if (!profileHeight) continue;
    const material = attrs.material || baseMaterial;
    const color = attrs.color || baseColor || '';

    const t = normalize(stripEndleisteClause(seg));
    const re = /(\d{3,4})\s*(?:mm)?\s*(?:x|×)\s*(\d{3,4})\s*(?:mm)?/ig;
    let m;
    while ((m = re.exec(t)) != null) {
      const widthMm = Number(m[1]);
      const heightMm = Number(m[2]);
      if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) continue;
      configs.push({
        count: baseCount,
        widthMm,
        heightMm,
        material,
        profileHeight,
        color,
      });
    }
  }

  // ------------------------------------------------------------------
  // FIX 2026-09-11: DEDUPLIZIERUNG IDENTISCHER PANZER-KONFIGURATIONEN!
  // Problem 1: Vorsatz-Beschreibungen haben oft MEHRERE ZEILEN mit GLEICHEN
  //   Maßen ("Vorsatzelement: ... 2700x2940mm" + "Vorsatz-Kasten: 2700x2940 ...")
  //   → BEIDE beziehen sich auf DEN GLEICHEN Panzer! Früher wurden 2 Panzer erstellt!
  // Problem 2: DIESELBE RAL-Farbe wird durch detectShopifyColor() mit zwei
  //   verschiedenen Labels gefunden ("Silber (= RAL 9006)" vs. "Anthrazit (RAL 9006)")
  //   → Selbe RAL-Nummer = Selbe Farbe! Deshalb RAL-Nummer extrahieren als Key!
  // ------------------------------------------------------------------
  function normalizeColorKey(c) {
    const raw = String(c || '').trim();
    if (!raw) return '';
    const ral = raw.match(/RAL\s*(\d{4})/i);
    if (ral && ral[1]) return 'RAL' + ral[1];
    return raw;
  }
  const seen = new Map();
  for (const cfg of configs) {
    const normColor = normalizeColorKey(cfg.color || '');
    const key = `${cfg.widthMm}x${cfg.heightMm}|${cfg.material || ''}|${cfg.profileHeight || ''}|${normColor}|${cfg.count || 1}`;
    if (!seen.has(key)) {
      seen.set(key, cfg);
    } else {
      // Selber Panzer nochmal gefunden: Wenn count höher, aktualisieren (selten)
      const prev = seen.get(key);
      if ((cfg.count || 1) > (prev.count || 1)) prev.count = cfg.count;
    }
  }
  const deduped = Array.from(seen.values());
  return deduped;
}

function computePanzerCuts(config) {
  if (!config) return null;

  const endleisteHoehe = 50;
  const sawKerf = 2;
  const barLength = 6000;

  const netHeight = Math.max(0, config.heightMm - endleisteHoehe);
  const rods = Math.ceil(netHeight / config.profileHeight);
  const rodsInt = Math.max(0, rods);

  const unperforated = Math.min(8, rodsInt);
  const perforated = Math.max(0, rodsInt - unperforated);

  const cutWidth = Math.max(0, config.material === 'Alu' ? config.widthMm - 10 : config.widthMm);
  const cutWithKerf = cutWidth + sawKerf;
  const piecesPerBar = Math.max(1, Math.floor(barLength / cutWithKerf));

  const rodsTotal = rodsInt * config.count;
  const unperforatedTotal = unperforated * config.count;
  const perforatedTotal = perforated * config.count;

  const unperforatedBars = Math.ceil(unperforatedTotal / piecesPerBar);
  const perforatedBars = Math.ceil(perforatedTotal / piecesPerBar);

  return {
    cutWidth,
    rodsTotal,
    unperforatedTotal,
    perforatedTotal,
    unperforatedBars,
    perforatedBars,
  };
}

let cachedColumns = null;
let cachedColumnsAt = 0;

async function getColumnsCached(listId) {
  const now = Date.now();
  if (cachedColumns && now - cachedColumnsAt < 60_000) return cachedColumns;
  try {
    const data = await listColumns({ listId });
    cachedColumns = data.columns || [];
  } catch (err) {
    const slackError = err?.details?.error;
    const reqMethod = err?.details?.req_method;
    if (slackError === 'unknown_method' && reqMethod === 'slackLists.columns.list') {
      const schema = await listSchema({ listId });
      cachedColumns = schema.map(c => ({
        id: c.id,
        key: c.key,
        name: c.name,
        type: c.type,
        is_primary_column: !!c.is_primary_column,
        options: c.options,
      }));
    } else {
      throw err;
    }
  }
  cachedColumnsAt = now;
  return cachedColumns;
}

function buildColumnLookup(columns) {
  const byKey = new Map();
  const byName = new Map();
  for (const c of columns || []) {
    if (c && c.key) byKey.set(String(c.key), c);
    if (c && c.name) byName.set(String(c.name).toLowerCase(), c);
  }
  return { byKey, byName };
}

function findColumn(columns, { key, nameIncludes, type, primary } = {}) {
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
    const c = cols.find(col => col && col.type === type);
    if (c) return c;
  }
  return null;
}

function getFieldByColumnId(item, columnId) {
  if (!columnId) return null;
  return (item.fields || []).find(f => f && f.column_id === columnId) || null;
}

function getFieldText(field) {
  if (!field) return '';
  if (field.text) return String(field.text).trim();

  const rich = field.rich_text;
  const val = field.value;

  function collectFromElements(elements, out) {
    for (const el of elements || []) {
      if (!el) continue;
      if (el.type === 'text' && typeof el.text === 'string') out.push(el.text);
      if (Array.isArray(el.elements)) collectFromElements(el.elements, out);
    }
  }

  function extractFromRichText(richText) {
    const out = [];
    for (const block of richText || []) {
      if (!block) continue;
      if (Array.isArray(block.elements)) collectFromElements(block.elements, out);
    }
    return out.join('').trim();
  }

  if (Array.isArray(rich)) {
    const t = extractFromRichText(rich);
    if (t) return t;
  }

  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return '';
    if ((s.startsWith('[') || s.startsWith('{')) && s.includes('"type"')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          const t = extractFromRichText(parsed);
          if (t) return t;
        }
      } catch (e) {}
    }
    return s;
  }

  if (val != null && typeof val !== 'object') return String(val).trim();
  return '';
}

function getAnyTextFromFields(item) {
  for (const f of item.fields || []) {
    const t = getFieldText(f);
    if (t) return t;
  }
  return '';
}

function getDateFromField(field) {
  if (!field) return null;
  if (Array.isArray(field.date) && field.date[0]) return String(field.date[0]);
  if (typeof field.value === 'string' && field.value) return field.value;
  return null;
}

function buildBoardItem(item, { columns, titleCol, dueCol, montageCol, originCol, detailsCol, statusCol, partsMap } = {}) {
  const titleField = getFieldByColumnId(item, titleCol?.id);
  const titleFromColumn = getFieldText(titleField);
  const titleFallback = getText(item, 'rich_text_notes') || getAnyTextFromFields(item);
  const statusInfo = resolveStatusInfo(item, statusCol);
  const detailsField = getFieldByColumnId(item, detailsCol?.id);
  const detailsText = getFieldText(detailsField);
  const infosCol = findColumn(columns, { nameIncludes: 'infos' });
  const slackInfos = getFieldText(getFieldByColumnId(item, infosCol?.id));
  const dueField = getFieldByColumnId(item, dueCol?.id) || getField(item, 'date');
  const dueIso = getDateFromField(dueField) || getDateValue(item);

  const montageField = getFieldByColumnId(item, montageCol?.id);
  const montageIso = getDateFromField(montageField);

  const originField = getFieldByColumnId(item, originCol?.id);
  const originFromCol = getFieldText(originField);
  let description = detailsText || getText(item, 'description');
  const title = titleFromColumn || titleFallback || description || String(item.id || '');
  const qInfo = parseOpenQuestionTitle(title);
  const isQuestion = !!qInfo;
  if (isQuestion) {
    const infosCol = findColumn(columns, { nameIncludes: 'infos' });
    const bestellungCol = findColumn(columns, { key: 'description' }) || findColumn(columns, { nameIncludes: 'bestellung' });
    const materialCol = findColumn(columns, { nameIncludes: 'materialbestellung' });
    const infosText = getFieldText(getFieldByColumnId(item, infosCol?.id));
    const bestellungText = getFieldText(getFieldByColumnId(item, bestellungCol?.id)) || detailsText || getText(item, 'description');

    const b = String(bestellungText || '').trim();
    const i = String(infosText || '').trim();
    if (b && i && b.includes(i)) description = b;
    else description = [b, i].filter(Boolean).join('\n\n');
  }

  let spb35Blocks = null;
  if (false && description && /sp-b\s*35/i.test(description)) {
    try {
      const blocks = parsePositionBlocksFromText(description);
      const rebuiltBlocks = [];
      let hasAnyRecalc = false;
      for (const b of blocks) {
        const inputs = parseSpB35InputsFromHeader(b.headerText);
        if (!inputs) { rebuiltBlocks.push({ ...b, recalc: null }); continue; }
        const calc = calculateSpB35(inputs);
        if (!calc) { rebuiltBlocks.push({ ...b, recalc: null }); continue; }
        hasAnyRecalc = true;
        const newHeader = rebuildPositionHeader(inputs, calc) || b.headerText;
        const notesLines = rebuildInfoBlock(inputs, calc);
        rebuiltBlocks.push({
          idx: b.idx,
          header: b.idx + ') ' + newHeader,
          headerText: newHeader,
          details: notesLines,
          recalc: calc,
          inputs,
        });
      }
      if (hasAnyRecalc && rebuiltBlocks.length) {
        const keptTopLines = [];
        const firstBlockIdx = (function() {
          const desc = String(description || '').replace(/\r\n/g, '\n');
          const lines = desc.split('\n').map(l => l.trim());
          for (let i = 0; i < lines.length; i += 1) {
            if (/^\s*\d{1,3}\s*[).]/.test(lines[i])) return i;
            keptTopLines.push(lines[i]);
          }
          return 0;
        })();
        const rebuiltDescParts = [];
        for (const t of keptTopLines) if (String(t || '').trim()) rebuiltDescParts.push(t);
        for (const rb of rebuiltBlocks) {
          rebuiltDescParts.push(rb.header);
          if (rb.details && rb.details.length) rebuiltDescParts.push(...rb.details);
        }
        const rebuiltDesc = rebuiltDescParts.join('\n');
        if (rebuiltDesc) description = rebuiltDesc;
        spb35Blocks = rebuiltBlocks.map(rb => ({
          idx: rb.idx,
          header: rb.header,
          headerText: rb.headerText,
          details: rb.details,
          spb35: rb.recalc ? {
            model: rb.recalc.model,
            widthMm: rb.recalc.widthMm,
            heightMm: rb.recalc.heightMm,
            finishedWidthMm: rb.recalc.finishedWidthMm,
            finishedHeightMm: rb.recalc.finishedHeightMm,
            finishedSizeLabel: rb.recalc.finishedSizeLabel,
            useFederhaken: rb.recalc.useFederhaken,
            xMm: rb.recalc.xMm,
            position: rb.recalc.position,
            productionLines: rb.recalc.productionLines,
            needsStabilization: rb.recalc.needsStabilization,
            needsMiddleLatch: rb.recalc.needsMiddleLatch,
            brushPosition: rb.recalc.brushPosition,
            brushLengthMm: rb.recalc.brushLengthMm,
          } : null,
        }));
      }
    } catch (e) {}
  }

  const origin = isQuestion ? 'OF' : (originFromCol || inferOrigin(title));
  const qrText = `rwjob:${item.id}`;
  const emergency = (function detectEmergency() {
    try {
      const parts = [];
      parts.push(String(title || ''));
      parts.push(String(description || ''));
      for (const f of Array.isArray(item.fields) ? item.fields : []) {
        if (!f) continue;
        if (typeof f.text === 'string' && f.text) { parts.push(f.text); continue; }
        if (Array.isArray(f.text) && f.text.length) { const s = f.text.map(x => typeof x === 'string' ? x : (x && (x.text || x.plain_text || ''))).join(' '); if (s) { parts.push(s); continue; } }
        if (typeof f.value === 'string' && f.value) { parts.push(f.value); continue; }
        if (typeof f.label === 'string' && f.label) parts.push(f.label);
        if (Array.isArray(f.select) && f.select.length) {
          parts.push(f.select.map(s => typeof s === 'string' ? s : (s && (s.label || s.value || ''))).filter(Boolean).join(' '));
        }
        if (typeof f.rich_text === 'string' && f.rich_text) { parts.push(f.rich_text); continue; }
        if (!Array.isArray(f.rich_text) || !f.rich_text.length) continue;
        try {
          const stack = [f.rich_text];
          while (stack.length) {
            const node = stack.shift();
            if (!node) continue;
            if (typeof node === 'string') { if (node) parts.push(node); continue; }
            if (typeof node !== 'object') continue;
            if (typeof node.text === 'string' && node.text) { parts.push(node.text); }
            if (typeof node.plain_text === 'string' && node.plain_text) { parts.push(node.plain_text); }
            const arrProps = ['elements', 'children', 'blocks'];
            for (const p of arrProps) if (Array.isArray(node[p]) && node[p].length) stack.push(node[p]);
          }
        } catch (e) {}
      }
      const hay = parts.filter(Boolean).join('\n');
      if (/\bNOTFALL\b/i.test(hay)) return true;
      if (/^NOTFALL$/im.test(hay)) return true;
      return false;
    } catch (e) {
      return false;
    }
  })();

  const panzerConfigs = parsePanzerConfigs(description);
  const cutLines = panzerConfigs
    .map(cfg => {
      const cuts = computePanzerCuts(cfg);
      if (!cuts) return null;
      const prefix = panzerConfigs.length > 1 ? `${cfg.widthMm} x ${cfg.heightMm} mm: ` : '';
      return `${prefix}Schnittmaß ${cuts.cutWidth} mm, Stäbe ${cuts.rodsTotal} (${cuts.unperforatedTotal} ungelocht (${cuts.unperforatedBars} x 6m), ${cuts.perforatedTotal} gelocht (${cuts.perforatedBars} x 6m))`;
    })
    .filter(Boolean);
  const cutInfo = cutLines.length ? cutLines.join('\n') : null;
  const panzerSummary = panzerConfigs.length
    ? panzerConfigs
        .map(cfg => {
          const parts = [];
          if (cfg.material) parts.push(cfg.material);
          if (cfg.profileHeight) parts.push(`${cfg.profileHeight}er`);
          if (cfg.color) parts.push(cfg.color);
          return parts.join(' ');
        })
        .filter(Boolean)
        .join(' / ')
    : null;
  const materialNeeds = Array.from(new Set(
    panzerConfigs.map(materialLineFromConfig).filter(Boolean)
      .concat(extractPartsMaterialNeeds(description))
      .concat(getConsumptionMaterialNeeds(getConsumptionMeta(partsMap, item.id)))
  ));
  const endleiste = extractEndleisteInfo(description);
  const vorsatz = extractVorsatzInfo(description);
  const vorsatzElement = extractVorsatzElementInfo(description);
  const vorsatzBoxOnly = extractVorsatzBoxOnlyInfo(description);
  const consumption = getConsumptionMeta(partsMap, item.id);

  const overview = buildOrderOverview({ title, description, panzerConfigs: panzerConfigs.length ? panzerConfigs : null, materialNeeds });
  return {
    id: item.id,
    title: title || '',
    origin,
    isQuestion,
    questionTo: qInfo ? qInfo.code : '',
    questionSubject: qInfo ? qInfo.subject : '',
    status: statusInfo.canonical,
    statusLabel: statusInfo.label,
    dueDate: dueIso || null,
    montageDate: montageIso || null,
    description,
    slackInfos,
    cutInfo,
    panzerConfigs: panzerConfigs.length ? panzerConfigs : null,
    panzerSummary,
    materialNeeds,
    consumption,
    endleiste,
    vorsatz,
    vorsatzElement,
    vorsatzBoxOnly,
    standardColors: hasStandardColors(description),
    spb35Blocks,
    qrText,
    emergency,
    orderOverview: overview,
    partDone: annotatePartDone(item.id, overview, partsMap),
  };
}

function extractVorsatzElementInfo(description) {
  const text = String(description || '');
  if (!text) return null;
  if (!/Vorsatzelement/i.test(text)) return null;
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const vIdx = lines.findIndex(l => /^\s*\d+\)\s*Vorsatzelement/i.test(l));
  if (vIdx < 0) return null;
  const boxLine = lines[vIdx + 1] || '';
  const second = lines[vIdx + 2] || '';
  const third = lines[vIdx + 3] || '';
  const hasPanzerLine = /Alu|PVC|Panzer|Endleiste|ohne Rollladenpanzer|\d+\s*(?:x|×)\s*\d+/i.test(second);
  const controlLine = hasPanzerLine ? null : second;
  const panzerLine = hasPanzerLine ? second : (third ? third : '');
  return {
    enabled: true,
    boxLine,
    controlLine: controlLine || '',
    panzerLine: panzerLine || '',
  };
}

function extractVorsatzBoxOnlyInfo(description) {
  const text = String(description || '');
  if (!text) return null;
  if (!/Vorsatzkasten/i.test(text)) return null;
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const vIdx = lines.findIndex(l => /^\s*\d+\)\s*Vorsatzkasten/i.test(l));
  if (vIdx < 0) return null;
  const boxLine = lines[vIdx + 1] || '';
  const controlLine = lines[vIdx + 2] || '';
  return {
    enabled: true,
    boxLine,
    controlLine,
  };
}

async function getBoardBuildContext() {
  const listId = getListId();
  const cols = await getColumnsCached(listId);
  const lookup = buildColumnLookup(cols);
  const statusCol = findColumn(cols, { key: 'status' }) || findColumn(cols, { nameIncludes: 'status' });
  const titleCol =
    findColumn(cols, { nameIncludes: 'aufgabe' }) ||
    findColumn(cols, { primary: true }) ||
    findColumn(cols, { key: 'title' }) ||
    findColumn(cols, { key: 'rich_text_notes' }) ||
    findColumn(cols, { type: 'text' });
  const dueCol =
    findColumn(cols, { nameIncludes: 'fälligkeit' }) ||
    findColumn(cols, { key: 'date' }) ||
    findColumn(cols, { key: 'todo_due_date' });
  const montageCol = findColumn(cols, { nameIncludes: 'montage' });
  const originCol = findColumn(cols, { nameIncludes: 'herkunft' });
  const detailsCol =
    findColumn(cols, { nameIncludes: 'materialbestellung' }) ||
    findColumn(cols, { nameIncludes: 'bestellung' }) ||
    findColumn(cols, { nameIncludes: 'infos' }) ||
    lookup.byName.get('beschreibung') ||
    null;
  return { listId, cols, lookup, statusCol, titleCol, dueCol, montageCol, originCol, detailsCol, partsMap: loadParts() };
}

async function fetchBoardItemsForAnalysis() {
  const ctx = await getBoardBuildContext();
  const items = [];
  const questions = [];
  let cursor = '';
  for (let i = 0; i < 10; i += 1) {
    const page = await listItems({ listId: ctx.listId, cursor });
    for (const it of page.items || []) {
      if (isArchivedItem(it, ctx.statusCol)) continue;
      if (!isAllowedStatus(it, ctx.statusCol)) continue;
      const built = buildBoardItem(it, ctx);
      if (!built) continue;
      if (built.isQuestion) questions.push(built);
      else items.push(built);
    }
    cursor = page.response_metadata?.next_cursor || '';
    if (!cursor) break;
  }
  return { ...ctx, items, questions };
}

function inferProductType(item) {
  if (!item) return 'Sonstiges';
  if (Array.isArray(item.panzerConfigs) && item.panzerConfigs.length) return 'Rollladenpanzer';
  const rawText = `${item.title || ''}\n${item.description || ''}`;
  const text = rawText.toLowerCase();
  const norm = normalizeForMatch(rawText);
  const hasPanzerWord =
    norm.includes('panzer') ||
    norm.includes('rollladenpanzer') ||
    norm.includes('endleiste') ||
    norm.includes('arretierungsclip') ||
    norm.includes('arretierungsclips') ||
    norm.includes('panzerstab');
  const hasRollladenMaterial = /\b(alu|aluminium|pvc)\b/.test(norm);
  const hasRollladenProfile =
    /\b(37|45|52)(er|mm)?\b/.test(norm) ||
    /\bmini\b/.test(norm) ||
    /\bmidi\b/.test(norm) ||
    /\bmaxi\b/.test(norm);
  const hasDimensions = /\b\d{3,4}\s*x\s*\d{3,4}\b/.test(norm);
  if (hasPanzerWord || (hasRollladenMaterial && hasRollladenProfile) || (hasDimensions && hasRollladenProfile)) {
    return 'Rollladenpanzer';
  }
  if (text.includes('insekt') || text.includes('fliegengitter') || text.includes('insektenschutz')) return 'Insektenschutz';
  if (text.includes('gurt') || text.includes('gurtwickler')) return 'Gurt / Wickler';
  if (text.includes('motor') || text.includes('somfy') || text.includes('rademacher')) return 'Motor / Antrieb';
  if (text.includes('jalousie')) return 'Jalousie';
  if (text.includes('plissee')) return 'Plissee';
  if (text.includes('rollo')) return 'Rollo';
  return item.origin === 'OF' ? 'Office / Frage' : 'Sonstiges';
}

function looksLikeRecordId(value) {
  return /^Rec[0-9A-Za-z]+$/.test(String(value || '').trim());
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
    const t = normalizeOneLine(cur.text);
    if (t) out.push(cur.idx + ') ' + t);
    cur = null;
  };
  const isProductionDetailLine = (line) => /^(Fertigmaß:\s*\d|Schnittmaß SP-B 35|Stabilisierungsprofil \(Profilsäge\)|Schlitten auf |Haken in (Außennut|Mittelnut)$|Bürste\b|Federstifte aktiv\b)/i.test(String(line || '').trim());
  for (const ln of lines) {
    const m = /^\s*(\d{1,3})\s*[).]\s*(.+)\s*$/.exec(ln);
    if (m) {
      flush();
      cur = { idx: String(m[1]), text: String(m[2] || '').trim() };
      continue;
    }
    if (cur && !isProductionDetailLine(ln)) cur.text = (cur.text ? (cur.text + ' ' + ln) : ln).trim();
  }
  flush();
  return out.slice(0, 60);
}

function sanitizeStatsMap(raw, { keepZero = false } = {}) {
  const out = {};
  const src = raw && typeof raw === 'object' ? raw : {};
  for (const key of STAT_FIELD_OPTIONS) {
    const value = Number(src[key] || 0);
    if (!Number.isFinite(value)) continue;
    if (!keepZero && value <= 0) continue;
    if (keepZero && value < 0) continue;
    out[key] = Math.max(0, Math.round(value));
  }
  return out;
}

function getItemStatsOverride(state, itemId) {
  const itemStats = state && typeof state.itemStats === 'object' ? state.itemStats : {};
  return sanitizeStatsMap(itemStats[String(itemId || '').trim()], { keepZero: true });
}

function mergeDetectedAndOverrideStats(detected, override) {
  const out = {};
  const det = sanitizeStatsMap(detected);
  const over = sanitizeStatsMap(override, { keepZero: true });
  for (const key of STAT_FIELD_OPTIONS) {
    if (Object.prototype.hasOwnProperty.call(over, key)) out[key] = over[key];
    else out[key] = det[key] || 0;
  }
  return out;
}

function buildOrderOverview(item) {
  // FIX 2026-09-11: IMMER frisch parsen + dedup! Auch alt gespeicherte
  // panzerConfigs[] aus MongoDB (VOR dem Dedup Fix) hatten doppelte Einträge!
  if (item && typeof item === 'object') {
    const desc = String(item.description || item.title || '');
    item.panzerConfigs = parsePanzerConfigs(desc);
  }
  const overview = [];
  const panzerConfigs = Array.isArray(item && item.panzerConfigs) ? item.panzerConfigs : [];
  if (panzerConfigs.length) {
    panzerConfigs.forEach((cfg, idx) => {
      const dims = (cfg && cfg.widthMm && cfg.heightMm) ? `${cfg.widthMm} x ${cfg.heightMm} mm` : '';
      const mat = cfg && cfg.material ? String(cfg.material).trim() : '';
      const prof = cfg && cfg.profileHeight ? `${Number(cfg.profileHeight)}er` : '';
      const col = cfg && cfg.color ? String(cfg.color).trim() : '';
      overview.push(['Panzer ' + (idx + 1), dims, mat, prof, col].filter(Boolean).join(': ').replace(': ', ' '));
    });
  }
  const positions = parsePositionsFromDescription(item && item.description);
  if (positions.length) overview.push(...positions);
  const genericNeeds = Array.isArray(item && item.materialNeeds) ? item.materialNeeds : [];
  if (!overview.length && genericNeeds.length) overview.push('Materialhinweise: ' + genericNeeds.join(', '));
  if (!overview.length && item && item.description) {
    const fallback = normalizeOneLine(String(item.description || ''));
    if (fallback) overview.push(fallback.slice(0, 220));
  }
  return overview.slice(0, 12);
}

function normalizePartDoneKey(s) {
  return String(s == null ? '' : s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\b(der|die|das|und|oder|mit|ohne|fur|für|von|zum|zu|am|an|in|auf|aus|nach|vor)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function annotatePartDone(itemId, orderOverview, partsMap) {
  const out = {};
  if (!Array.isArray(orderOverview) || !orderOverview.length) return out;
  const map = partsMap && typeof partsMap === 'object' ? partsMap : {};
  const entry = map[String(itemId || '').trim()];
  if (!entry || typeof entry !== 'object') return out;
  const rawKeys = Object.keys(entry);
  if (!rawKeys.length) return out;
  const normMap = new Map();
  for (const rk of rawKeys) {
    const nk = normalizePartDoneKey(rk);
    if (!nk) continue;
    if (!normMap.has(nk)) normMap.set(nk, rk);
  }
  const normTokens = (text) => normalizePartDoneKey(text).split(' ').filter(x => x.length >= 3);
  overview: for (let i = 0; i < orderOverview.length; i += 1) {
    const ov = String(orderOverview[i] || '');
    const nk = normalizePartDoneKey(ov);
    if (!nk) continue;
    if (normMap.has(nk)) {
      const originalKey = normMap.get(nk);
      const rec = entry[originalKey];
      const done = rec && rec.done && typeof rec.done === 'object' ? rec.done : null;
      if (done) {
        out[i] = { ts: String(done.ts || ''), actor: String(done.actor || ''), label: String(done.label || 'Fertig'), keyOriginal: String(originalKey || '') };
      }
      continue overview;
    }
    const tokens = normTokens(ov);
    if (tokens.length < 2) continue overview;
    let bestKey = null;
    let bestScore = 0;
    for (const rk of rawKeys) {
      const tk = normTokens(rk);
      if (tk.length < 2) continue;
      let hit = 0;
      const tset = new Set(tk);
      for (const t of tokens) if (tset.has(t)) hit += 1;
      const score = hit / Math.max(3, Math.min(tokens.length, tk.length));
      if (score > bestScore && hit >= 2) { bestScore = score; bestKey = rk; }
    }
    if (bestKey) {
      const rec = entry[bestKey];
      const done = rec && rec.done && typeof rec.done === 'object' ? rec.done : null;
      if (done) {
        out[i] = { ts: String(done.ts || ''), actor: String(done.actor || ''), label: String(done.label || 'Fertig'), keyOriginal: String(bestKey || ''), match: 'fuzzy-' + Math.round(bestScore * 100) };
      }
    }
  }
  return out;
}

function detectStatisticCounts(item, productType) {
  const text = `${item && item.title || ''}\n${item && item.description || ''}`;
  // FIX 2026-09-11: IMMER frisch parsen + dedup! Alt gespeicherte panzerConfigs[]
  // aus MongoDB hatten doppelte Einträge vor dem Dedup Fix!
  if (item && typeof item === 'object') {
    item.panzerConfigs = parsePanzerConfigs(String(item.description || item.title || ''));
  }
  const norm = normalizeForMatch(text);
  const counts = {};
  const panzerCount = Array.isArray(item && item.panzerConfigs) && item.panzerConfigs.length
    ? item.panzerConfigs.length
    : (productType === 'Rollladenpanzer' ? 1 : 0);
  if (panzerCount > 0) counts['Rollladenpanzer'] = panzerCount;
  if (/\bnachschneid|nachschnitt|nachschneiden\b/.test(norm)) counts['Nachschneiden im selben Auftrag'] = 1;
  const hasIssContext = /\b(insekt|iss)\b/.test(norm);
  if (hasIssContext && /\bspannrahmen\b/.test(norm)) counts['ISS - Spannrahmen'] = 1;
  if (hasIssContext && /\brollo\b/.test(norm)) counts['ISS - Rollo'] = 1;
  if (hasIssContext && /\b(tur|tuer|schiebetur|drehtur|schwingtur)\b/.test(norm)) counts['ISS - Tür'] = 1;
  if (/\breparatur\b/.test(norm)) counts['Reparatur'] = 1;
  if (/\bvorsatz\b|\baufsatz/.test(norm)) counts['Vorsatz-/Aufsatzelement'] = 1;
  if (/\berfal\b/.test(norm)) counts['Bestellware Erfal'] = 1;
  if (/\bdelta dore\b|\brademacher\b/.test(norm)) counts['Bestellware Delta Dore/Rademacher'] = 1;
  if ((/\bbestell/.test(norm) || /\bkurbelgetriebe\b|\bkurbelstange\b|\bmotor\b/.test(norm)) && !counts['Bestellware Erfal'] && !counts['Bestellware Delta Dore/Rademacher']) {
    counts['Bestellware Sonstige'] = 1;
  }
  if (/\bwelle\b|\bwellen\b|\bkoemer\b|\bkömer\b|\bplatte\b|\bschnittware\b/.test(norm)) counts['Schnittware'] = 1;
  return sanitizeStatsMap(counts);
}

function sanitizeProductTypeOverride(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return PRODUCT_TYPE_OPTIONS.includes(raw) ? raw : '';
}

function getProductTypeOverride(state, itemId) {
  const overrides = state && typeof state.productOverrides === 'object' ? state.productOverrides : {};
  return sanitizeProductTypeOverride(overrides[String(itemId || '').trim()]);
}

function applyProductTypeResolution(state, itemId, detectedProductType) {
  const override = getProductTypeOverride(state, itemId);
  return {
    detectedProductType: detectedProductType || 'Sonstiges',
    productTypeOverride: override,
    productType: override || detectedProductType || 'Sonstiges',
  };
}

function addDemand(map, { key, label, quantity, unit, sourceType } = {}) {
  const normKey = normalizeMaterialKey(key || label);
  const qty = Number(quantity || 0);
  if (!normKey || !Number.isFinite(qty) || qty <= 0) return;
  const current = map.get(normKey) || {
    key: normKey,
    label: String(label || key || '').trim(),
    quantity: 0,
    unit: String(unit || '').trim(),
    sourceTypes: new Set(),
  };
  current.quantity += qty;
  if (!current.label) current.label = String(label || key || '').trim();
  if (!current.unit && unit) current.unit = String(unit).trim();
  if (sourceType) current.sourceTypes.add(String(sourceType));
  map.set(normKey, current);
}

function computePanzerDemandsForItem(item) {
  const demands = [];
  const configs = Array.isArray(item && item.panzerConfigs) ? item.panzerConfigs : [];
  for (const cfg of configs) {
    const cuts = computePanzerCuts(cfg);
    if (!cuts) continue;
    const profile = cfg && cfg.profileHeight ? `${Number(cfg.profileHeight)}er` : '';
    const clipLabel = `Arretierungsclips ${profile}`.trim();
    const unperf = buildRodDemandLabels(cfg, false);
    const perf = buildRodDemandLabels(cfg, true);
    if (cuts.unperforatedBars > 0) demands.push({ key: unperf.key, label: unperf.label, fallbackKey: unperf.fallbackKey, quantity: cuts.unperforatedBars, unit: 'Stangen', sourceType: 'panzer' });
    if (cuts.perforatedBars > 0) demands.push({ key: perf.key, label: perf.label, fallbackKey: perf.fallbackKey, quantity: cuts.perforatedBars, unit: 'Stangen', sourceType: 'panzer' });
    if (cuts.rodsTotal > 0 && profile) demands.push({ key: clipLabel, label: clipLabel, quantity: cuts.rodsTotal, unit: 'Stk', sourceType: 'clips' });
    const endleiste = item && item.endleiste ? item.endleiste : null;
    if (endleiste && profile) {
      const el = buildEndleisteDemandLabels(cfg, endleiste);
      demands.push({ key: el.key, label: el.label, fallbackKey: el.fallbackKey, quantity: 1, unit: 'Stk', sourceType: 'endleiste' });
    }
  }
  return demands;
}

function parseInventoryRecord(raw, fallbackLabel) {
  const packSize = Math.max(1, Number(raw && raw.packSize || 1));
  const stockPacks = Math.max(0, Number(raw && raw.stockPacks || 0));
  const minPacks = Math.max(0, Number(raw && raw.minPacks || 0));
  const pegValue = Math.max(0, Number(raw && raw.pegValue || 0));
  const pegMode = sanitizePegMode(raw && raw.pegMode) || inferDefaultPegMode({
    category: raw && raw.category,
    label: raw && raw.label || fallbackLabel,
    unit: raw && raw.unit,
    packSize,
  });
  const pegHistory = trimPegHistory(raw && raw.pegHistory);
  return {
    label: String(raw && raw.label || fallbackLabel || '').trim(),
    category: String(raw && raw.category || '').trim(),
    unit: String(raw && raw.unit || '').trim(),
    packSize,
    stockPacks,
    minPacks,
    pegValue,
    pegMode,
    pegHistory,
    availableUnits: stockPacks * packSize,
    notes: String(raw && raw.notes || '').trim(),
  };
}

function inferInventoryCategory(raw, fallbackLabel, sourceTypes) {
  const explicit = String(raw && raw.category || '').trim();
  if (explicit) return explicit;

  const key = normalizeMaterialKey(raw && raw.label || fallbackLabel || '');
  const sources = new Set(Array.isArray(sourceTypes) ? sourceTypes : []);

  if (sources.has('endleiste') || key.includes('endleiste')) return 'Endleisten';
  if (sources.has('clips') || key.includes('clip')) return 'Clips';
  if (sources.has('panzer') || key.includes('panzerstab')) return 'Panzerstäbe';
  if (key.includes('welle') || key.includes('koemerplatte') || key.includes('körnerplatte') || key.includes('schnitt')) return 'Schnittware';
  if (key.includes('feder') || key.includes('haken') || key.includes('trittschutz')) return 'Ersatzteile';
  return 'Sonstiges';
}

function resolveDemandInventoryKey(inventoryState, demand) {
  const key = normalizeMaterialKey(demand && demand.key);
  const fallbackKey = normalizeMaterialKey(demand && demand.fallbackKey);
  if (key && inventoryState[key]) return key;
  if (fallbackKey && inventoryState[fallbackKey]) return fallbackKey;
  return key || fallbackKey;
}

function buildMaterialInventoryOverview(items, state) {
  const report = buildMaterialStatusReport(items, state);
  const inventoryState = state && typeof state.inventory === 'object' ? state.inventory : {};
  const itemById = new Map((report.items || []).map(item => [String(item.itemId || '').trim(), item]));
  const usageMap = new Map();

  for (const item of report.items || []) {
    for (const demand of item.demands || []) {
      const usageKey = resolveDemandInventoryKey(inventoryState, demand);
      if (!usageKey) continue;
      if (!usageMap.has(usageKey)) usageMap.set(usageKey, []);
      usageMap.get(usageKey).push({
        itemId: item.itemId,
        title: item.title || item.itemId,
        status: item.status || '',
        effectiveDate: item.effectiveDate || '',
        productType: item.productType || item.detectedProductType || '',
        quantity: Math.max(0, Number(demand.quantity || 0)),
        unit: String(demand.unit || ''),
        label: String(demand.label || ''),
      });
    }
  }

  const rows = (report.rows || []).map((row) => {
    const usageKey = String(row.inventoryKey || row.key || '').trim();
    const usageItems = (usageMap.get(usageKey) || []).slice().sort((a, b) =>
      String(a.effectiveDate || '').localeCompare(String(b.effectiveDate || ''))
      || String(a.title || '').localeCompare(String(b.title || ''))
    );
    const orderCount = new Set(usageItems.map(x => String(x.itemId || '').trim()).filter(Boolean)).size;
    const rawInv = inventoryState[usageKey] || inventoryState[row.key] || null;
    return {
      ...row,
      category: inferInventoryCategory(rawInv, row.label || row.key, row.sourceTypes || []),
      orderCount,
      usageItems,
      usageLabels: usageItems.map((entry) => {
        const linked = itemById.get(String(entry.itemId || '').trim());
        return {
          ...entry,
          orderOverview: linked && Array.isArray(linked.orderOverview) ? linked.orderOverview : [],
        };
      }),
    };
  });

  return {
    updatedAt: state && state.updatedAt ? state.updatedAt : '',
    summary: report.summary || {},
    rows,
    searchTasks: report.searchTasks || [],
    catalog: {
      categories: MATERIAL_CATEGORY_OPTIONS.slice(),
      presets: MATERIAL_CATALOG_PRESETS.slice(),
    },
  };
}

function buildMaterialStatusReport(items, state) {
  const inventoryState = state && typeof state.inventory === 'object' ? state.inventory : {};
  const demandMap = new Map();
  const searchTasks = [];
  const itemSummaries = [];
  const partsMapLocal = loadParts();

  for (const item of items || []) {
    const resolvedType = applyProductTypeResolution(state, item.id, inferProductType(item));
    const productType = resolvedType.productType;
    const detectedStats = detectStatisticCounts(item, productType);
    const statsOverride = getItemStatsOverride(state, item.id);
    const effectiveStats = mergeDetectedAndOverrideStats(detectedStats, statsOverride);
    const demands = [];
    const genericNeeds = Array.isArray(item.materialNeeds) ? item.materialNeeds : [];
    if (Array.isArray(item.panzerConfigs) && item.panzerConfigs.length) {
      for (const need of computePanzerDemandsForItem(item)) {
        demands.push(need);
        addDemand(demandMap, need);
      }
    } else if ((`${item.title || ''}\n${item.description || ''}`).toLowerCase().includes('panzer')) {
      searchTasks.push({
        itemId: item.id,
        title: item.title || item.id,
        productType,
        detectedProductType: resolvedType.detectedProductType,
        productTypeOverride: resolvedType.productTypeOverride,
        material: 'Panzer-Konfiguration',
        reason: 'Panzer erkannt, aber Maßdaten konnten nicht sicher gelesen werden',
      });
    }

    for (const material of genericNeeds) {
      const key = normalizeMaterialKey(material);
      if (!key) continue;
      if (inventoryState[key]) continue;
      searchTasks.push({
        itemId: item.id,
        title: item.title || item.id,
        productType,
        detectedProductType: resolvedType.detectedProductType,
        productTypeOverride: resolvedType.productTypeOverride,
        material,
        reason: 'Materialbedarf erkannt, aber noch keine lokale Bestandsregel gepflegt',
      });
    }

    const overviewMSR = buildOrderOverview(item);
    itemSummaries.push({
      itemId: item.id,
      title: item.title || item.id,
      detectedProductType: resolvedType.detectedProductType,
      productTypeOverride: resolvedType.productTypeOverride,
      productType,
      orderOverview: overviewMSR,
      partDone: annotatePartDone(item.id, overviewMSR, partsMapLocal),
      detectedStats,
      statsOverride,
      effectiveStats,
      status: item.status || '',
      dueDate: item.dueDate || '',
      montageDate: item.montageDate || '',
      effectiveDate: item.effectiveDate || item.montageDate || item.dueDate || '',
      demands: demands.map(d => ({ key: d.key, fallbackKey: d.fallbackKey || '', label: d.label, quantity: d.quantity, unit: d.unit })),
      genericNeeds,
    });
  }

  const keys = new Set([...Object.keys(inventoryState), ...Array.from(demandMap.keys())]);
  const rows = Array.from(keys).map((key) => {
    const demand = demandMap.get(key) || null;
    const fallbackKey = demand && demand.fallbackKey ? normalizeMaterialKey(demand.fallbackKey) : '';
    const inventoryKey = inventoryState[key]
      ? key
      : (fallbackKey && inventoryState[fallbackKey] ? fallbackKey : key);
    const inv = parseInventoryRecord(inventoryState[inventoryKey], demand ? demand.label : key);
    const tracked = !!inventoryState[inventoryKey];
    const neededUnits = demand ? demand.quantity : 0;
    const missingUnits = Math.max(0, neededUnits - inv.availableUnits);
    const remainingUnits = Math.max(0, inv.availableUnits - neededUnits);
    const minUnits = inv.minPacks * inv.packSize;
    let status = 'ok';
    if (neededUnits > 0 && !tracked) status = 'untracked';
    else if (missingUnits > 0) status = 'missing';
    else if (minUnits > 0 && remainingUnits < minUnits) status = 'low';
    return {
      key,
      label: compactMaterialLabel(inv.label || (demand ? demand.label : key), key),
      category: inferInventoryCategory(inventoryState[inventoryKey], inv.label || (demand ? demand.label : key), demand ? Array.from(demand.sourceTypes || []) : []),
      unit: inv.unit || (demand && demand.unit ? demand.unit : 'Stk'),
      packSize: inv.packSize,
      stockPacks: inv.stockPacks,
      minPacks: inv.minPacks,
      pegValue: inv.pegValue,
      pegMode: inv.pegMode,
      pegHistory: inv.pegHistory,
      availableUnits: inv.availableUnits,
      neededUnits,
      missingUnits,
      missingPacks: missingUnits > 0 ? Math.ceil(missingUnits / inv.packSize) : 0,
      remainingUnits,
      notes: inv.notes || '',
      tracked,
      inventoryKey,
      status,
      sourceTypes: demand ? Array.from(demand.sourceTypes || []) : [],
    };
  }).sort((a, b) => {
    const rank = { missing: 0, untracked: 1, low: 2, ok: 3 };
    const ar = rank[a.status] != null ? rank[a.status] : 9;
    const br = rank[b.status] != null ? rank[b.status] : 9;
    if (ar !== br) return ar - br;
    return String(a.label || '').localeCompare(String(b.label || ''));
  });

  return {
    summary: {
      openItems: (items || []).length,
      trackedMaterials: Object.keys(inventoryState).length,
      demandMaterials: rows.filter(r => r.neededUnits > 0).length,
      shortageCount: rows.filter(r => r.status === 'missing').length,
      updateCount: rows.filter(r => r.status === 'low').length,
      searchCount: rows.filter(r => r.status === 'untracked').length + searchTasks.length,
    },
    rows,
    searchTasks,
    items: itemSummaries.sort((a, b) => String(a.effectiveDate || '').localeCompare(String(b.effectiveDate || '')) || String(a.title || '').localeCompare(String(b.title || ''))),
  };
}

function kategorisiereMaterialbedarf(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const tl = t.toLowerCase();
  if (!t) return { typ: 'sonstiges', label: 'Sonstiges' };
  if (/sp[- ]?b\s*[- ]?\s*35|insektenschutz|insektenschutzgitter|spannrahmen/i.test(t)) return { typ: 'spb35', label: 'Insektenschutz SP-B 35' };
  if (/plissee|falten(?:gitter|rollo)?/i.test(t)) return { typ: 'plissee', label: 'Plissee / Faltstore' };
  if (/jalousie|erfal/i.test(t)) return { typ: 'jalousie', label: 'Jalousie (Erfal u.ä.)' };
  if (/handsender|fernbedienung|handsender|wand|taster/i.test(t)) return { typ: 'handsender', label: 'Handsender / Fernbedienung' };
  if (/motor|antrieb|rademacher|dore|delta\s*dore|d\s*öre|drive|solar(?:kit|panel)|funkmotor|akku/i.test(t)) return { typ: 'motor', label: 'Motor / Antrieb (Rademacher / Delta DOre)' };
  if (/welle(?!nleim|nstop)|wellenträger|40er welle|37er welle|55er welle/i.test(t)) return { typ: 'welle', label: 'Welle / Wellenträger' };
  if (/panzer|stäbe|profile|alu(?:minium)?|pvc(?!-?folie)|endleiste|el\b/i.test(t)) return { typ: 'panzer', label: 'Panzer / Profile / Stäbe' };
  if (/gurt|gurtwickler|kurbelseil|seilzug/i.test(t)) return { typ: 'gurt', label: 'Gurt / Seil / Kurbel' };
  if (/schiene|führung|seitenteil|anschlag|klemm|einsatz|keder/i.test(t)) return { typ: 'zubehoer', label: 'Schienen / Zubehör' };
  if (/dicht|bürste|bürste|abdichtung|bürstenleiste|gummierung/i.test(t)) return { typ: 'dichtung', label: 'Dichtungen / Bürsten' };
  if (/schloß|schloss|verriegel|riegel|sicherung|abschluß/i.test(t)) return { typ: 'schloss', label: 'Schlösser / Sicherungen' };
  if (/stabilisierungs|versteifung/i.test(t)) return { typ: 'stabilisierung', label: 'Stabilisierungsprofile' };
  if (/schlitten|wagen|laufwagen|rollwagen|rolle/i.test(t)) return { typ: 'schlitten', label: 'Schlitten / Rollwagen' };
  if (/federstift|stift|klammer/i.test(t)) return { typ: 'stifte', label: 'Federstifte / Klammern' };
  if (/montage|baustahl|schrauben|dübel|kleber|dichtstoff/i.test(t)) return { typ: 'montage', label: 'Montage-Material' };
  if (/etikett|aufkleber|qr|barcode/i.test(t)) return { typ: 'etikett', label: 'Etiketten / QR' };
  return { typ: 'sonstiges', label: 'Sonstiges' };
}

function erzeugeKommissionierZeilen(item, { partsMap } = {}) {
  const rows = [];
  const doneKeys = new Set();
  const id0 = String(item && item.id || '0');
  const overview = Array.isArray(item && item.orderOverview) ? item.orderOverview : buildOrderOverview(item);
  const partDone = (item && typeof item.partDone === 'object' && item.partDone) || annotatePartDone(id0, overview, partsMap || loadParts());
  const idxMatches = [];
  for (let oi = 0; oi < overview.length; oi += 1) {
    if (!partDone[String(oi)]) continue;
    const ovText = String(overview[oi] || '');
    const normOv = normalizePartDoneKey(ovText);
    if (!normOv) continue;
    const tokenBag = new Set(normOv.split(' ').filter(x => x.length >= 3));
    idxMatches.push({ idx: oi, done: partDone[String(oi)], tokens: tokenBag, raw: ovText, norm: normOv });
  }
  const findFertig = (bezeichnung, details, typ) => {
    if (!idxMatches.length) return null;
    const targetText = String(bezeichnung || '') + ' ' + (Array.isArray(details) ? details.join(' ') : '');
    const nTarget = normalizePartDoneKey(targetText);
    if (!nTarget) return null;
    for (let i = 0; i < idxMatches.length; i += 1) {
      if (idxMatches[i].norm && idxMatches[i].norm === nTarget) return idxMatches[i].done;
    }
    if (nTarget.length >= 3) {
      for (let i = 0; i < idxMatches.length; i += 1) {
        const n1 = idxMatches[i].norm; if (!n1) continue;
        if (n1.indexOf(nTarget) !== -1 || nTarget.indexOf(n1) !== -1) return idxMatches[i].done;
      }
    }
    const tTokens = new Set(nTarget.split(' ').filter(x => x.length >= 3));
    if (!tTokens.size) return null;
    let best = null;
    let bestScore = 0;
    const minHits = tTokens.size <= 1 ? 1 : (tTokens.size <= 2 ? 1 : 2);
    for (let i = 0; i < idxMatches.length; i += 1) {
      let hits = 0;
      for (const t of idxMatches[i].tokens) if (tTokens.has(t)) hits += 1;
      const denom = Math.max(1, Math.min(idxMatches[i].tokens.size, tTokens.size));
      const score = hits / Math.max(3, denom);
      if (hits >= minHits && score > bestScore) { bestScore = score; best = idxMatches[i].done; }
    }
    return best;
  };
  const common = {
    auftragId: id0,
    auftragTitel: String(item && item.title || ''),
    montageDatumIso: item && item.montageDate ? String(item.montageDate).slice(0,10) : null,
    dueDate: item && item.dueDate ? String(item.dueDate).slice(0,10) : null,
    origin: String(item && item.origin || ''),
    description: String(item && item.description || ''),
    quelle: 'Produktion',
  };
  const t = String(item && item.title || '');
  const d = String(item && item.description || '');
  const addrMatch = (t + ' ' + d).match(/([A-Za-zÄÖÜäöüß]+\s(?:straße|strasse|weg|allee|damm|ufer|platz|ring|gasse|hain|pfad|berg|hang|höhe|horst|brücke)\b\s*\d+[a-zA-Z\-]*(?:\s*,\s*\d{4,5}\s*[A-Za-zÄÖÜäöüß\- ]+)?)/);
  common.adresse = addrMatch ? addrMatch[1] : t.replace(/^[A-Z]+\d*\s*–\s*/, '').replace(/\s*[:;|].*$/, '').trim() || t;
  const m = common.adresse.match(/^([^,]*\d+[a-zA-Z\-]?)\s*,\s*(\d{4,5})\s*([A-Za-zÄÖÜäöüß\- ]+)$/);
  if (m) {
    common.kurzAdresse = m[1].trim() + ' · ' + m[2].trim() + ' ' + m[3].trim();
  } else {
    const short = common.adresse.length > 55 ? common.adresse.slice(0,52)+'…' : common.adresse;
    common.kurzAdresse = short;
  }

  // FIX 2026-09-11: IMMER frisch parsen + dedup! Alt gespeicherte panzerConfigs[]
  // aus MongoDB hatten doppelte Einträge (vor Dedup Fix!) → Überschreiben!
  const desc = String(item.description || item.title || '');
  item.panzerConfigs = parsePanzerConfigs(desc);
  if (Array.isArray(item.panzerConfigs)) {
    for (let i = 0; i < item.panzerConfigs.length; i += 1) {
      const p = item.panzerConfigs[i] || {};
      const dims = (Number(p.widthMm) || 0) && (Number(p.heightMm) || 0) ? (String(p.widthMm) + '×' + String(p.heightMm) + ' mm') : '';
      const profile = p.profileHeight ? ('Fo ' + String(p.profileHeight)) : '';
      const mat = p.material === 'PVC' ? 'PVC' : p.material === 'Alu' ? 'Alu' : (p.material || '');
      const farbe = p.color ? String(p.color) : '';
      const tokens = [dims, profile, mat, farbe].filter(Boolean);
      const bezeichnung = 'Rollladenpanzer · ' + (tokens.join(' · ') || 'Standard');
      const details = [];
      if (mat) details.push('Material: ' + mat);
      if (profile) details.push('Profilhöhe: ' + String(p.profileHeight) + ' mm');
      if (farbe) details.push('Farbe: ' + farbe);
      const id = id0 + '-panzer-' + String(i);
      if (doneKeys.has(id)) continue;
      doneKeys.add(id);
      const fertig = findFertig(bezeichnung, details, 'panzer');
      rows.push({
        ...common,
        id, typ: 'panzer', kategorieLabel: 'Rollladenpanzer',
        anzahl: Math.max(1, Number(p.count) || 1),
        bezeichnung,
        details,
        materialOffen: item.openMaterial || [],
        materialBestellt: item.orderedMaterial || [],
        teilFertig: !!fertig,
        fertigInfo: fertig || null,
      });
    }
  }
  if (Array.isArray(item.issBlocks) && item.issBlocks.length) {
    for (let i = 0; i < item.issBlocks.length; i += 1) {
      const bl = item.issBlocks[i] || {};
      const dims = (bl.spb35 && Number(bl.spb35.widthMm) && Number(bl.spb35.heightMm))
        ? (String(bl.spb35.widthMm) + '×' + String(bl.spb35.heightMm) + ' mm') : '';
      const bau = bl.spb35 && bl.spb35.model ? bl.spb35.model : (/(Sp-B\s*[- ]?\s*35|Spannrahmen|Pendelmontage|Scherengitter)/i.exec((bl.headerText||'')+' '+(common.description||'')) || [])[0] || 'SP-B 35';
      const lage = /innen|innenliegend|außen|außenliegend/i.test((bl.headerText||'')+' '+(common.description||''))
        ? ((/innen/i.test((bl.headerText||'')+' '+(common.description||'')) ? 'innenliegend' : 'außenliegend')) : '';
      const farbe = (bl.spb35 && bl.spb35.color) ? bl.spb35.color : '';
      const tokens = [bau, dims, lage, farbe].filter(Boolean);
      const bezeichnung = 'Insektenschutz · ' + (tokens.join(' · ') || 'SP-B 35');
      const details = [];
      const detList = Array.isArray(bl.details) ? bl.details : [];
      const fertigMaß = detList.find(l => /^Fertigmaß:/i.test(String(l || '').trim()));
      const schnitt = detList.find(l => /^Schnittmaß\s*SP[- ]?B\s*35/i.test(String(l || '').trim()));
      if (schnitt) details.push(String(schnitt));
      if (fertigMaß) details.push(String(fertigMaß));
      const id = id0 + '-spb35-' + String(i);
      if (doneKeys.has(id)) continue;
      doneKeys.add(id);
      const fertig = findFertig(bezeichnung, details, 'spb35');
      rows.push({
        ...common,
        id, typ: 'spb35', kategorieLabel: 'Insektenschutz SP-B 35',
        anzahl: 1,
        bezeichnung,
        details,
        materialOffen: item.openMaterial || [],
        materialBestellt: item.orderedMaterial || [],
        teilFertig: !!fertig,
        fertigInfo: fertig || null,
      });
    }
  }
  const needs = Array.isArray(item.materialNeeds) ? item.materialNeeds.slice() : [];
  const openArr = Array.isArray(item.openMaterial) ? item.openMaterial : [];
  const bestelltArr = Array.isArray(item.orderedMaterial) ? item.orderedMaterial : [];
  const norm = (s) => normalizeMaterialKey(s);
  const openNorm = new Set(openArr.map(norm).filter(Boolean));
  const bestelltNorm = new Set(bestelltArr.map(norm).filter(Boolean));
  for (let i = 0; i < needs.length; i += 1) {
    const bed = String(needs[i] || '').replace(/\s+/g, ' ').trim();
    if (!bed) continue;
    if (/^([A-Za-z]+\s*[:]?\s*\d+\s*[x×]|panzer|sprofilstäbe?\b|stäbe\b|endleiste\b|el\b)/i.test(bed) && Array.isArray(item.panzerConfigs) && item.panzerConfigs.length > 0) {
      continue;
    }
    const k = kategorisiereMaterialbedarf(bed);
    const bezeichnung = bed.length > 90 ? bed.slice(0, 87) + '…' : bed;
    const nk = norm(bed);
    const offen = nk && openNorm.has(nk) ? [bed] : openArr.filter(x => norm(x) === nk);
    const best = nk && bestelltNorm.has(nk) ? [bed] : bestelltArr.filter(x => norm(x) === nk);
    const id = id0 + '-' + k.typ + '-' + String(i);
    if (doneKeys.has(id)) continue;
    doneKeys.add(id);
    const quelle = /rademacher|delta\s*dore|döre|erfal|plissee|jalousie|handsender|fernbedienung|motor|antrieb|solar/i.test(bed) ? 'Bestellung' : 'Produktion';
    const dets = [];
    const fertig = findFertig(bezeichnung, dets, k.typ);
    rows.push({
      ...common,
      id, typ: k.typ, kategorieLabel: k.label,
      anzahl: 1,
      bezeichnung,
      details: [],
      quelle,
      materialOffen: offen,
      materialBestellt: best,
      teilFertig: !!fertig,
      fertigInfo: fertig || null,
    });
  }
  return rows;
}

async function buildFullBoardSnapshot({ forceMaterials } = {}) {
  const listId = getListId();
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const todayStart = startOfToday();

  const cols = await getColumnsCached(listId);
  const lookup = buildColumnLookup(cols);
  const statusCol = findColumn(cols, { key: 'status' }) || findColumn(cols, { nameIncludes: 'status' });
  const titleCol =
    findColumn(cols, { nameIncludes: 'aufgabe' }) ||
    findColumn(cols, { primary: true }) ||
    findColumn(cols, { key: 'title' }) ||
    findColumn(cols, { key: 'rich_text_notes' }) ||
    findColumn(cols, { type: 'text' });
  const dueCol =
    findColumn(cols, { nameIncludes: 'fälligkeit' }) ||
    findColumn(cols, { key: 'date' }) ||
    findColumn(cols, { key: 'todo_due_date' });
  const montageCol = findColumn(cols, { nameIncludes: 'montage' });
  const originCol = findColumn(cols, { nameIncludes: 'herkunft' });
  const detailsCol =
    findColumn(cols, { nameIncludes: 'materialbestellung' }) ||
    findColumn(cols, { nameIncludes: 'bestellung' }) ||
    findColumn(cols, { nameIncludes: 'infos' }) ||
    lookup.byName.get('beschreibung') ||
    null;

  const hideRejected = String(process.env.MATERIAL_CHECK_HIDE_REJECTED || '').trim() === 'true';
  const checkState = hideRejected ? loadMaterialStatusState() : null;
  const materialChecks = checkState && typeof checkState.materialChecks === 'object' ? checkState.materialChecks : null;
  const partsMap = loadParts();

  const items = [];
  const questions = [];
  let cursor = '';
  for (let i = 0; i < 10; i += 1) {
    let page;
    try {
      page = await listItems({ listId, cursor });
    } catch (e) {
      prodLog('board_list_error', {
        listId,
        cursor: cursor || null,
        error: e?.details?.error || e.message || 'list_failed',
      });
      throw e;
    }
    for (const it of page.items || []) {
      if (isArchivedItem(it, statusCol)) continue;
      if (!isAllowedStatus(it, statusCol)) continue;
      try {
        const built = buildBoardItem(it, { columns: cols, titleCol, dueCol, montageCol, originCol, detailsCol, statusCol, partsMap });
        if (built && hideRejected && materialChecks && materialChecks[String(built.id || '')]?.decision === 'rejected') continue;
        if (built && built.isQuestion) questions.push(built);
        else if (built) items.push(built);
      } catch (e) {
        prodLog('board_item_build_error', {
          itemId: it?.id || null,
          error: e?.message || 'build_failed',
        });
      }
    }
    cursor = page.response_metadata?.next_cursor || '';
    if (!cursor) break;
  }

  const matResult = await getMaterialOpenSetCached({ force: !!forceMaterials });
  const openSet = matResult && matResult.open ? matResult.open : null;
  const orderedSet = matResult && matResult.ordered ? matResult.ordered : null;
  const openItemIds = matResult && matResult.openItemIds ? matResult.openItemIds : null;
  const orderedItemIds = matResult && matResult.orderedItemIds ? matResult.orderedItemIds : null;

  function looseMaterialMatches(needStr, setObj) {
    if (!setObj || !(setObj instanceof Set) || !needStr) return false;
    const looseNeed = normalizeMaterialKeyLoose(needStr);
    if (!looseNeed) return false;
    for (const raw of setObj) {
      const rawStr = String(raw || '');
      const looseRaw = normalizeMaterialKeyLoose(rawStr);
      if (!looseRaw) continue;
      if (looseNeed === looseRaw) return true;
      if (looseNeed.includes(looseRaw) || looseRaw.includes(looseNeed)) return true;
    }
    return false;
  }

  for (const it of items) {
    const needs = Array.isArray(it.materialNeeds) ? it.materialNeeds : [];
    const itemIdNorm = it && it.id ? String(it.id).toLowerCase() : '';

    const openIdHit = openItemIds && openItemIds.size && itemIdNorm && openItemIds.has(itemIdNorm);
    const openHits = (openSet && openSet.size)
      ? needs.filter(m => openSet.has(normalizeMaterialKey(m)) || looseMaterialMatches(m, openSet))
      : [];
    const openFinal = openIdHit
      ? (openHits.length ? openHits : (needs.slice(0, 1) || ['(Materialbestellung offen)']))
      : (openHits.length ? openHits : null);
    if (openFinal && openFinal.length) it.openMaterial = openFinal;

    const ordIdHit = orderedItemIds && orderedItemIds.size && itemIdNorm && orderedItemIds.has(itemIdNorm);
    const ordHits = (orderedSet && orderedSet.size)
      ? needs.filter(m => orderedSet.has(normalizeMaterialKey(m)) || looseMaterialMatches(m, orderedSet))
      : [];
    const ordFinal = ordIdHit
      ? (ordHits.length ? ordHits : (needs.slice(0, 1) || ['(Materialbestellung erfasst)']))
      : (ordHits.length ? ordHits : null);
    if (ordFinal && ordFinal.length) it.orderedMaterial = ordFinal;
  }

  for (const it of items) {
    const lp = getLocalProgress(it.id);
    if (lp) it.localProgress = lp;
  }

  const notes = loadNotes();
  const parts = loadParts();
  for (const it of items.concat(questions)) {
    const note = notes[String(it.id)];
    if (note && typeof note.text === 'string' && note.text.trim()) it.note = { text: String(note.text).trim(), ts: note.ts || '', actor: note.actor || '', station: note.station || '' };
    const ps = parts[String(it.id)];
    if (ps && typeof ps === 'object') it.partStates = ps;
  }

  const autoSyncMontage = String(process.env.AUTO_SYNC_MONTAGE_FROM_DUE || '').trim() === 'true';
  if (autoSyncMontage && montageCol) {
    let synced = 0;
    for (const it of items) {
      if (synced >= 6) break;
      if (it.montageDate) continue;
      if (!it.dueDate) continue;
      const dateIso = String(it.dueDate).slice(0, 10);
      if (!dateIso) continue;
      try {
        await updateItem({
          listId,
          itemId: it.id,
          cells: [{ row_id: it.id, column_id: montageCol.id, date: [dateIso] }],
        });
        synced += 1;
        prodLog('montage_backfill_ok', { itemId: it.id, date: dateIso });
        it.montageDate = dateIso;
      } catch (e) {
        prodLog('montage_backfill_error', { itemId: it.id, error: e?.details?.error || e.message || 'backfill_failed' });
      }
    }
    if (synced) {
      try { cachedColumnsAt = 0; } catch (e) {}
    }
  }

  const buckets = { today: [], tomorrow: [], later: [] };

  function deliveryDateForItem(it) {
    const montage = parseIsoDate(it.montageDate);
    const due = parseIsoDate(it.dueDate);
    return montage || due || null;
  }

  let hasOverdue = false;
  let minFuture = null;
  for (const it of items) {
    const d = deliveryDateForItem(it);
    if (!d) continue;
    if (isDateFromPreviousYear(d)) continue;
    if (d.getTime() < todayStart.getTime()) {
      hasOverdue = true;
      break;
    }
    if (!minFuture || d.getTime() < minFuture.getTime()) minFuture = d;
  }
  const pivotDate = hasOverdue
    ? todayStart
    : (minFuture ? new Date(minFuture.getFullYear(), minFuture.getMonth(), minFuture.getDate()) : todayStart);
  const pivotWorkday1 = nextWorkday(pivotDate, 1);
  const pivotWorkday2 = nextWorkday(pivotDate, 2);

  for (const it of items) {
    const due = parseIsoDate(it.dueDate);
    const montage = parseIsoDate(it.montageDate);
    const delivery = montage || due || null;
    it.effectiveDate = delivery ? formatDateIso(delivery) : null;

    if (isDateFromPreviousYear(delivery)) continue;

    const urgentDate = montage || due || null;
    it.urgent = it.origin === 'ReWo' && isDueUrgent(urgentDate, { today: pivotDate, tomorrow: pivotWorkday1 });
    if (!delivery) {
      buckets.later.push(it);
      continue;
    }
    if (delivery.getTime() < pivotDate.getTime()) buckets.today.push(it);
    else if (sameDay(delivery, pivotDate) || sameDay(delivery, pivotWorkday1)) buckets.today.push(it);
    else if (sameDay(delivery, pivotWorkday2)) buckets.tomorrow.push(it);
    else buckets.later.push(it);
  }

  const sortFn = (a, b) => {
    const delA = deliveryDateForItem(a);
    const delB = deliveryDateForItem(b);
    const delATs = delA ? delA.getTime() : Number.POSITIVE_INFINITY;
    const delBTs = delB ? delB.getTime() : Number.POSITIVE_INFINITY;
    if (delATs !== delBTs) return delATs - delBTs;

    const montageA = parseIsoDate(a.montageDate);
    const montageB = parseIsoDate(b.montageDate);
    const montageATs = montageA ? montageA.getTime() : Number.POSITIVE_INFINITY;
    const montageBTs = montageB ? montageB.getTime() : Number.POSITIVE_INFINITY;
    if (montageATs !== montageBTs) return montageATs - montageBTs;

    const dueA = parseIsoDate(a.dueDate);
    const dueB = parseIsoDate(b.dueDate);
    const dueATs = dueA ? dueA.getTime() : Number.POSITIVE_INFINITY;
    const dueBTs = dueB ? dueB.getTime() : Number.POSITIVE_INFINITY;
    if (dueATs !== dueBTs) return dueATs - dueBTs;

    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return String(a.title).localeCompare(String(b.title));
  };

  buckets.today.sort(sortFn);
  buckets.tomorrow.sort(sortFn);
  buckets.later.sort(sortFn);

  questions.sort((a, b) => {
    const da = parseIsoDate(a && a.dueDate) || null;
    const db = parseIsoDate(b && b.dueDate) || null;
    const ta = da ? da.getTime() : Number.POSITIVE_INFINITY;
    const tb = db ? db.getTime() : Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    const aa = String(a && a.title || '');
    const bb = String(b && b.title || '');
    return aa.localeCompare(bb);
  });

  return {
    listId,
    generatedAt: new Date().toISOString(),
    today: formatDateIso(today),
    pivotDate: formatDateIso(pivotDate),
    pivotTomorrow: formatDateIso(pivotWorkday1),
    pivotNextWorkday: formatDateIso(pivotWorkday2),
    columns: {
      title: titleCol ? { id: titleCol.id, key: titleCol.key, name: titleCol.name, type: titleCol.type } : null,
      due: dueCol ? { id: dueCol.id, key: dueCol.key, name: dueCol.name, type: dueCol.type } : null,
      montage: montageCol ? { id: montageCol.id, key: montageCol.key, name: montageCol.name, type: montageCol.type } : null,
      origin: originCol ? { id: originCol.id, key: originCol.key, name: originCol.name, type: originCol.type } : null,
      details: detailsCol ? { id: detailsCol.id, key: detailsCol.key, name: detailsCol.name, type: detailsCol.type } : null,
    },
    materialSignalsAt: cachedMaterialSignalsAt ? new Date(cachedMaterialSignalsAt).toISOString() : null,
    materialSignals: cachedMaterialSignals,
    questions,
    buckets,
    items,
  };
}

router.get('/board', async (req, res, next) => {
  try {
    const snap = await buildFullBoardSnapshot({ forceMaterials: String(req.query.forceMaterials || '') === '1' });

    if (snap && snap.buckets && typeof snap.buckets === 'object') {
      const allBucketItems = []
        .concat(Array.isArray(snap.buckets.today) ? snap.buckets.today : [])
        .concat(Array.isArray(snap.buckets.tomorrow) ? snap.buckets.tomorrow : [])
        .concat(Array.isArray(snap.buckets.later) ? snap.buckets.later : []);
      for (const it of allBucketItems) {
        if (it && typeof it === 'object') {
          const desc = String(it.description || it.title || '');
          try { it.panzerConfigs = parsePanzerConfigs(desc); } catch (e) {}
        }
      }
      const allQuestions = Array.isArray(snap.questions) ? snap.questions : [];
      for (const it of allQuestions) {
        if (it && typeof it === 'object') {
          const desc = String(it.description || it.title || '');
          try { it.panzerConfigs = parsePanzerConfigs(desc); } catch (e) {}
        }
      }
      if (Array.isArray(snap.items)) {
        for (const it of snap.items) {
          if (it && typeof it === 'object') {
            const desc = String(it.description || it.title || '');
            try { it.panzerConfigs = parsePanzerConfigs(desc); } catch (e) {}
          }
        }
      }
    }

    res.json({
      listId: snap.listId,
      generatedAt: snap.generatedAt,
      today: snap.today,
      pivotDate: snap.pivotDate,
      pivotTomorrow: snap.pivotTomorrow,
      pivotNextWorkday: snap.pivotNextWorkday,
      columns: snap.columns,
      materialSignalsAt: snap.materialSignalsAt,
      materialSignals: snap.materialSignals,
      questions: snap.questions,
      buckets: snap.buckets,
    });
  } catch (err) {
    prodLog('board_error', { error: err?.details?.error || err.message || 'board_failed' });
    next(err);
  }
});

router.get('/kommissionierung-board', async (req, res, next) => {
  try {
    const force = String(req.query.forceMaterials || '') === '1' || String(req.query.force || '') === '1';
    const snap = await buildFullBoardSnapshot({ forceMaterials: force });
    const alle = Array.isArray(snap.items) ? snap.items : [];
    const now = new Date();
    const defaultDatum = nextWorkday(now, 1);
    const requestedRaw = String(req.query.date || '').slice(0,10);
    const requested = requestedRaw && /^\d{4}-\d{2}-\d{2}$/.test(requestedRaw) ? parseIsoDate(requestedRaw) : null;
    const targetDate = requested || defaultDatum;
    const targetIso = formatDateIso(targetDate);
    const dtLabel = targetDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    const filtered = alle.filter(it => {
      const m = parseIsoDate(it.montageDate);
      const d = parseIsoDate(it.dueDate);
      const eff = m || d;
      return eff ? sameDay(eff, targetDate) : false;
    });
    filtered.sort((a, b) => {
      const ma = parseIsoDate(a.montageDate);
      const mb = parseIsoDate(b.montageDate);
      const ta = ma ? ma.getTime() : Number.POSITIVE_INFINITY;
      const tb = mb ? mb.getTime() : Number.POSITIVE_INFINITY;
      if (ta !== tb) return ta - tb;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
    const zeilen = [];
    for (const it of filtered) {
      const rows = erzeugeKommissionierZeilen(it);
      for (const r of rows) zeilen.push(r);
    }
    const aufträge = [];
    const seen = new Set();
    for (const r of zeilen) {
      if (seen.has(r.auftragId)) continue;
      seen.add(r.auftragId);
      aufträge.push({
        id: r.auftragId,
        titel: r.auftragTitel,
        adresse: r.adresse,
        kurzAdresse: r.kurzAdresse,
        montageIso: r.montageDatumIso,
        anzahlZeilen: zeilen.filter(z => z.auftragId === r.auftragId).length,
      });
    }
    const nachKategorie = {};
    for (const r of zeilen) {
      nachKategorie[r.typ] = (nachKategorie[r.typ] || 0) + 1;
    }
    const gesamtOffeneMaterialien = new Set();
    for (const r of zeilen) {
      for (const m of (r.materialOffen || [])) gesamtOffeneMaterialien.add(normalizeMaterialKey(m) || m);
    }
    res.json({
      datumIso: targetIso,
      datumLabel: dtLabel,
      istFeiertag: isHoliday(targetDate),
      istWochenende: isWeekend(targetDate),
      defaultDatumIso: formatDateIso(defaultDatum),
      aufgaben: zeilen,
      statistik: {
        gesamtZeilen: zeilen.length,
        aufträge,
        nachKategorie,
        gesamtOffeneMaterialien: Array.from(gesamtOffeneMaterialien),
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/debug', async (req, res, next) => {
  try {
    const listId = getListId();
    const limit = Math.max(1, Math.min(5, Number(req.query.limit || 1)));
    const cols = await getColumnsCached(listId);
    const page = await listItems({ listId, cursor: '' });
    const items = (page.items || []).slice(0, limit).map(it => ({
      id: it.id,
      list_id: it.list_id,
      date_created: it.date_created,
      updated_timestamp: it.updated_timestamp,
      fields: (it.fields || []).map(f => ({
        key: f.key,
        column_id: f.column_id,
        text: f.text,
        valueType: typeof f.value,
        valuePreview: typeof f.value === 'string' ? f.value.slice(0, 140) : null,
        hasRichText: Array.isArray(f.rich_text) ? f.rich_text.length : 0,
        date: Array.isArray(f.date) ? f.date[0] : null,
        select: Array.isArray(f.select) ? f.select[0] : null,
      })),
    }));
    res.json({
      listId,
      columns: (cols || []).map(c => ({ id: c.id, key: c.key, name: c.name, type: c.type, is_primary_column: !!c.is_primary_column })),
      sample: items,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/logs', (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 200)));
  try {
    const text = fs.readFileSync(prodLogFile, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    res.json({ ok: true, lines: lines.slice(-limit) });
  } catch (e) {
    res.json({ ok: true, lines: [] });
  }
});

router.get('/done-today', async (req, res, next) => {
  try {
    const listId = getListId();
    const date = formatDateIso(new Date());
    const events = buildDoneTodayEvents(readProductionLogLines(), date);
    if (!events.length) {
      return res.json({ ok: true, date, count: 0, items: [] });
    }

    const cols = await getColumnsCached(listId);
    const lookup = buildColumnLookup(cols);
    const statusCol = findColumn(cols, { key: 'status' }) || findColumn(cols, { nameIncludes: 'status' });
    const titleCol =
      findColumn(cols, { nameIncludes: 'aufgabe' }) ||
      findColumn(cols, { primary: true }) ||
      findColumn(cols, { key: 'title' }) ||
      findColumn(cols, { key: 'rich_text_notes' }) ||
      findColumn(cols, { type: 'text' });
    const dueCol =
      findColumn(cols, { nameIncludes: 'fälligkeit' }) ||
      findColumn(cols, { key: 'date' }) ||
      findColumn(cols, { key: 'todo_due_date' });
    const montageCol = findColumn(cols, { nameIncludes: 'montage' });
    const originCol = findColumn(cols, { nameIncludes: 'herkunft' });
    const detailsCol =
      findColumn(cols, { nameIncludes: 'materialbestellung' }) ||
      findColumn(cols, { nameIncludes: 'bestellung' }) ||
      findColumn(cols, { nameIncludes: 'infos' }) ||
      lookup.byName.get('beschreibung') ||
      null;

    const parts = loadParts();
    const uniqueIds = Array.from(new Set(events.map(e => String(e.itemId || '').trim()).filter(Boolean)));
    const infoEntries = await Promise.all(uniqueIds.map(async (itemId) => {
      try {
        const info = await itemInfo({ listId, itemId });
        const rawItem = info?.item || info?.record || null;
        if (!rawItem) return [itemId, null];
        const built = buildBoardItem(rawItem, { columns: cols, titleCol, dueCol, montageCol, originCol, detailsCol, statusCol, partsMap: parts });
        if (built) {
          const ps = parts[String(itemId)];
          if (ps && typeof ps === 'object') built.partStates = ps;
        }
        return [itemId, built];
      } catch (e) {
        return [itemId, null];
      }
    }));
    const itemsById = new Map(infoEntries);

    const grouped = new Map();
    for (const event of events) {
      const itemId = String(event.itemId || '').trim();
      if (!itemId) continue;
      const item = itemsById.get(itemId) || null;
      const current = grouped.get(itemId) || {
        itemId,
        title: item && item.title ? String(item.title) : itemId,
        description: item && item.description ? String(item.description) : '',
        dueDate: item && item.dueDate ? String(item.dueDate) : '',
        montageDate: item && item.montageDate ? String(item.montageDate) : '',
        origin: item && item.origin ? String(item.origin) : '',
        status: item && item.status ? String(item.status) : 'fertig',
        latestTs: String(event.updatedTs || event.ts || ''),
        events: [],
      };
      current.events.push({
        ts: String(event.updatedTs || event.ts || ''),
        actionLabel: String(event.actionLabel || ''),
        part: event.part ? String(event.part) : '',
        partial: event.partial === true,
        actor: event.actor ? String(event.actor) : '',
        station: event.station ? String(event.station) : '',
      });
      if (String(event.updatedTs || event.ts || '') > current.latestTs) current.latestTs = String(event.updatedTs || event.ts || '');
      grouped.set(itemId, current);
    }

    const items = Array.from(grouped.values())
      .map(entry => ({
        ...entry,
        events: entry.events.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || ''))),
      }))
      .sort((a, b) => String(b.latestTs || '').localeCompare(String(a.latestTs || '')));

    res.json({ ok: true, date, count: items.length, items });
  } catch (err) {
    next(err);
  }
});

function requireMaterialStatusToken(req, res, next) {
  const given =
    String(req.query.token || '').trim() ||
    String(req.header('x-materialstatus-token') || '').trim() ||
    String(req.body && req.body.token || '').trim();
  if (!isMaterialStatusTokenValid(given)) {
    return res.status(404).json({ ok: false, error: 'Not found' });
  }
  next();
}

router.get('/material-status', requireMaterialStatusToken, async (req, res, next) => {
  try {
    const board = await fetchBoardItemsForAnalysis();
    const openItems = (board.items || []).filter(it => canonicalStatus(it.status) !== 'fertig');
    const state = loadMaterialStatusState();
    const report = buildMaterialStatusReport(openItems, state);
    res.json({
      ok: true,
      updatedAt: state.updatedAt || '',
      productOverrides: state.productOverrides || {},
      itemStats: state.itemStats || {},
      productTypeOptions: PRODUCT_TYPE_OPTIONS,
      statFieldOptions: STAT_FIELD_OPTIONS,
      productTypes: Array.from(new Set(openItems.map(inferProductType))).sort((a, b) => a.localeCompare(b)),
      ...report,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/material-status/overview', requireMaterialStatusToken, async (req, res, next) => {
  try {
    const board = await fetchBoardItemsForAnalysis();
    const openItems = (board.items || []).filter(it => canonicalStatus(it.status) !== 'fertig');
    const state = loadMaterialStatusState();
    const overview = buildMaterialInventoryOverview(openItems, state);
    res.json({
      ok: true,
      ...overview,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/material-status/save', express.json(), requireMaterialStatusToken, (req, res) => {
  const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : [];
  const productOverridesInput = req.body && typeof req.body.productOverrides === 'object' ? req.body.productOverrides : {};
  const itemStatsInput = req.body && typeof req.body.itemStats === 'object' ? req.body.itemStats : {};
  const state = loadMaterialStatusState();
  const inventory = {};
  const productOverrides = {};
  const itemStats = {};
  const nowIso = new Date().toISOString();
  for (const raw of rows) {
    const key = normalizeMaterialKey(raw && (raw.key || raw.label));
    const label = String(raw && raw.label || '').trim();
    if (!key || !label) continue;
    const prev = state.inventory && typeof state.inventory[key] === 'object' && state.inventory[key] ? state.inventory[key] : {};
    const packSize = Math.max(1, Number(raw && raw.packSize || 1));
    const category = String(raw && raw.category || '').trim();
    const unit = String(raw && raw.unit || '').trim();
    const inferredPrevPegMode = sanitizePegMode(prev && prev.pegMode) || inferDefaultPegMode({
      category: prev && prev.category,
      label: prev && prev.label,
      unit: prev && prev.unit,
      packSize: Math.max(1, Number(prev && prev.packSize || packSize || 1)),
    });
    const prevPegValue = Math.max(0, Number(prev && prev.pegValue || 0));
    const nextPegModeRaw = raw && raw.pegMode != null ? raw.pegMode : (prev && prev.pegMode);
    const nextPegMode = sanitizePegMode(nextPegModeRaw) || inferDefaultPegMode({ category, label, unit, packSize });
    const nextPegValue = raw && raw.pegValue != null ? Math.max(0, Number(raw.pegValue || 0)) : prevPegValue;
    const pegChanged = nextPegValue !== prevPegValue || nextPegMode !== inferredPrevPegMode;
    const pegHistory = pegChanged
      ? appendPegHistory(prev && prev.pegHistory, { at: nowIso, mode: nextPegMode, value: nextPegValue, actor: 'manual', note: 'save' })
      : trimPegHistory(prev && prev.pegHistory);
    inventory[key] = {
      label,
      category,
      unit,
      packSize,
      stockPacks: Math.max(0, Number(raw && raw.stockPacks || 0)),
      minPacks: Math.max(0, Number(raw && raw.minPacks || 0)),
      pegValue: nextPegValue,
      pegMode: nextPegMode,
      pegHistory,
      notes: String(raw && raw.notes || '').trim(),
      updatedAt: nowIso,
    };
  }
  for (const [itemId, value] of Object.entries(productOverridesInput)) {
    const key = String(itemId || '').trim();
    const override = sanitizeProductTypeOverride(value);
    if (!key || !override) continue;
    productOverrides[key] = override;
  }
  for (const [itemId, rawStats] of Object.entries(itemStatsInput)) {
    const key = String(itemId || '').trim();
    const stats = sanitizeStatsMap(rawStats, { keepZero: true });
    if (!key || !Object.keys(stats).length) continue;
    itemStats[key] = stats;
  }
  const saved = saveMaterialStatusState({ inventory, productOverrides, itemStats, materialChecks: state.materialChecks || {} });
  res.json({ ok: true, updatedAt: saved.updatedAt, count: Object.keys(saved.inventory || {}).length });
});

router.post('/material-status/save-item', express.json(), requireMaterialStatusToken, (req, res) => {
  const itemId = String(req.body && req.body.itemId || '').trim();
  if (!itemId) return res.status(400).json({ ok: false, error: 'Missing itemId' });
  const state = loadMaterialStatusState();
  const productOverrides = { ...(state.productOverrides || {}) };
  const itemStats = { ...(state.itemStats || {}) };

  const productTypeOverride = sanitizeProductTypeOverride(req.body && req.body.productTypeOverride);
  if (productTypeOverride) productOverrides[itemId] = productTypeOverride;
  else delete productOverrides[itemId];

  const stats = sanitizeStatsMap(req.body && req.body.itemStats, { keepZero: true });
  if (Object.keys(stats).length) itemStats[itemId] = stats;
  else delete itemStats[itemId];

  const saved = saveMaterialStatusState({ inventory: state.inventory || {}, productOverrides, itemStats, materialChecks: state.materialChecks || {} });
  res.json({ ok: true, updatedAt: saved.updatedAt, itemId });
});

function sanitizeMaterialCheckDecision(input) {
  const s = String(input || '').trim().toLowerCase();
  if (s === 'approved' || s === 'ok' || s === 'pass') return 'approved';
  if (s === 'rejected' || s === 'no' || s === 'fail' || s === 'blocked') return 'rejected';
  return '';
}

router.post('/material-status/upsert-inventory', express.json(), requireMaterialStatusToken, (req, res) => {
  const records = Array.isArray(req.body && req.body.records) ? req.body.records : [];
  if (!records.length) return res.status(400).json({ ok: false, error: 'Missing records' });
  const state = loadMaterialStatusState();
  const inventory = { ...(state.inventory || {}) };
  const nowIso = new Date().toISOString();

  let written = 0;
  for (const raw of records) {
    const key = normalizeMaterialKey(raw && (raw.key || raw.label));
    const label = String(raw && raw.label || '').trim();
    if (!key) continue;
    const prev = inventory[key] && typeof inventory[key] === 'object' ? inventory[key] : {};
    const nextLabel = label || String(prev.label || '').trim();
    if (!nextLabel) continue;
    const nextCategory = typeof raw?.category === 'string' ? String(raw.category).trim() : String(prev.category || '').trim();
    const nextUnit = typeof raw?.unit === 'string' ? String(raw.unit).trim() : String(prev.unit || '').trim();
    const nextPackSize = raw && raw.packSize != null ? Math.max(1, Number(raw.packSize || 1)) : Math.max(1, Number(prev.packSize || 1));
    const prevPegMode = sanitizePegMode(prev && prev.pegMode) || inferDefaultPegMode({
      category: prev && prev.category,
      label: prev && prev.label,
      unit: prev && prev.unit,
      packSize: Math.max(1, Number(prev && prev.packSize || nextPackSize || 1)),
    });
    const prevPegValue = Math.max(0, Number(prev && prev.pegValue || 0));
    const nextPegModeRaw = raw && raw.pegMode != null ? raw.pegMode : (prev && prev.pegMode);
    const nextPegMode = sanitizePegMode(nextPegModeRaw) || inferDefaultPegMode({ category: nextCategory, label: nextLabel, unit: nextUnit, packSize: nextPackSize });
    const nextPegValue = raw && raw.pegValue != null ? Math.max(0, Number(raw.pegValue || 0)) : prevPegValue;
    const pegChanged = nextPegValue !== prevPegValue || nextPegMode !== prevPegMode;
    const pegHistory = pegChanged
      ? appendPegHistory(prev && prev.pegHistory, { at: nowIso, mode: nextPegMode, value: nextPegValue, actor: 'manual', note: 'upsert' })
      : trimPegHistory(prev && prev.pegHistory);
    inventory[key] = {
      label: nextLabel,
      category: nextCategory,
      unit: nextUnit,
      packSize: nextPackSize,
      stockPacks: raw && raw.stockPacks != null ? Math.max(0, Number(raw.stockPacks || 0)) : Math.max(0, Number(prev.stockPacks || 0)),
      minPacks: raw && raw.minPacks != null ? Math.max(0, Number(raw.minPacks || 0)) : Math.max(0, Number(prev.minPacks || 0)),
      pegValue: nextPegValue,
      pegMode: nextPegMode,
      pegHistory,
      notes: typeof raw?.notes === 'string' ? String(raw.notes).trim() : String(prev.notes || '').trim(),
      updatedAt: nowIso,
    };
    written += 1;
  }

  const saved = saveMaterialStatusState({
    inventory,
    productOverrides: state.productOverrides || {},
    itemStats: state.itemStats || {},
    materialChecks: state.materialChecks || {},
  });
  res.json({ ok: true, updatedAt: saved.updatedAt, written });
});

router.get('/material-check', requireMaterialStatusToken, async (req, res, next) => {
  try {
    const board = await fetchBoardItemsForAnalysis();
    const openItems = (board.items || []).filter(it => canonicalStatus(it.status) !== 'fertig');
    const state = loadMaterialStatusState();
    const report = buildMaterialStatusReport(openItems, state);
    const inventoryState = state && typeof state.inventory === 'object' ? state.inventory : {};
    const checks = state && typeof state.materialChecks === 'object' ? state.materialChecks : {};

    const byItemId = new Map((report.items || []).map(it => [String(it.itemId || '').trim(), it]));
    const items = (openItems || []).map((raw) => {
      const itemId = String(raw.id || '').trim();
      const summary = byItemId.get(itemId) || null;
      const demands = summary && Array.isArray(summary.demands) ? summary.demands : [];
      const demandRows = demands.map((d) => {
        const key = normalizeMaterialKey(d && d.key);
        const fallbackKey = normalizeMaterialKey(d && d.fallbackKey);
        const inventoryKey = inventoryState[key]
          ? key
          : (fallbackKey && inventoryState[fallbackKey] ? fallbackKey : key);
        const tracked = !!inventoryState[inventoryKey];
        const inv = parseInventoryRecord(inventoryState[inventoryKey], d && d.label ? d.label : inventoryKey);
        const neededUnits = Math.max(0, Number(d && d.quantity || 0));
        const missingUnits = Math.max(0, neededUnits - inv.availableUnits);
        let status = 'ok';
        if (neededUnits > 0 && !tracked) status = 'untracked';
        else if (missingUnits > 0) status = 'missing';
        return {
          key,
          fallbackKey,
          label: compactMaterialLabel(inv.label || (d && d.label ? d.label : key), key),
          unit: inv.unit || String(d && d.unit || 'Stk'),
          packSize: inv.packSize,
          stockPacks: inv.stockPacks,
          minPacks: inv.minPacks,
          availableUnits: inv.availableUnits,
          neededUnits,
          missingUnits,
          notes: inv.notes || '',
          tracked,
          inventoryKey,
          status,
        };
      });

      const check = checks && checks[itemId] ? checks[itemId] : null;
      const decision = check && typeof check.decision === 'string' ? check.decision : '';
      const missingCount = demandRows.filter(r => r.status === 'missing').length;
      const untrackedCount = demandRows.filter(r => r.status === 'untracked').length;
      const traffic = missingCount > 0 ? 'red' : (untrackedCount > 0 ? 'yellow' : 'green');

      return {
        itemId,
        title: raw.title || itemId,
        status: raw.status || '',
        effectiveDate: raw.effectiveDate || raw.montageDate || raw.dueDate || '',
        orderOverview: summary && summary.orderOverview ? summary.orderOverview : '',
        panzerSummary: raw.panzerSummary || '',
        decision,
        checkedAt: check && check.checkedAt ? String(check.checkedAt) : '',
        note: check && check.note ? String(check.note) : '',
        actor: check && check.actor ? String(check.actor) : '',
        demandRows,
        missingCount,
        untrackedCount,
        traffic,
      };
    });

    items.sort((a, b) => {
      const pr = (x) => {
        if (!x.decision) return 0;
        if (x.decision === 'rejected') return 1;
        if (x.decision === 'approved') return 2;
        return 3;
      };
      const tr = (x) => {
        if (x.traffic === 'red') return 0;
        if (x.traffic === 'yellow') return 1;
        if (x.traffic === 'green') return 2;
        return 3;
      };
      const ap = pr(a);
      const bp = pr(b);
      if (ap !== bp) return ap - bp;
      const at = tr(a);
      const bt = tr(b);
      if (at !== bt) return at - bt;
      return String(a.effectiveDate || '').localeCompare(String(b.effectiveDate || '')) || String(a.title || '').localeCompare(String(b.title || ''));
    });

    res.json({
      ok: true,
      updatedAt: state.updatedAt || '',
      items,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/material-check/decision', express.json(), requireMaterialStatusToken, (req, res) => {
  const itemId = String(req.body && req.body.itemId || '').trim();
  const decision = sanitizeMaterialCheckDecision(req.body && req.body.decision);
  if (!itemId) return res.status(400).json({ ok: false, error: 'Missing itemId' });
  if (!decision) return res.status(400).json({ ok: false, error: 'Missing decision' });

  const actor = String(req.body && req.body.actor || '').trim();
  const note = String(req.body && req.body.note || '').trim();
  const state = loadMaterialStatusState();
  const materialChecks = { ...(state.materialChecks || {}) };

  materialChecks[itemId] = {
    decision,
    checkedAt: new Date().toISOString(),
    note,
    actor,
  };

  const saved = saveMaterialStatusState({
    inventory: state.inventory || {},
    productOverrides: state.productOverrides || {},
    itemStats: state.itemStats || {},
    materialChecks,
  });

  res.json({ ok: true, updatedAt: saved.updatedAt, itemId, decision });
});

router.get('/material-stats', requireMaterialStatusToken, async (req, res, next) => {
  try {
    const today = new Date();
    const defaultTo = formatDateIso(today);
    const defaultFromDate = new Date(today.getTime() - (29 * 24 * 60 * 60 * 1000));
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || '')) ? String(req.query.from) : formatDateIso(defaultFromDate);
    const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || '')) ? String(req.query.to) : defaultTo;
    const productTypeFilter = String(req.query.productType || '').trim();

    const state = loadMaterialStatusState();
    const board = await fetchBoardItemsForAnalysis();
    const boardItemsById = new Map((board.items || []).map(it => [String(it.id || '').trim(), it]));
    const runningItemsRaw = (board.items || []).filter(it => canonicalStatus(it.status) !== 'fertig');
    const runningItems = productTypeFilter
      ? runningItemsRaw.filter(it => applyProductTypeResolution(state, it.id, inferProductType(it)).productType === productTypeFilter)
      : runningItemsRaw;

    const doneEvents = buildDoneEventsInRange(readProductionLogLines(), { from, to });
    const doneIds = Array.from(new Set(doneEvents.map(e => String(e.itemId || '').trim()).filter(Boolean)));
    const infoEntries = await Promise.all(doneIds.map(async (itemId) => {
      try {
        const info = await itemInfo({ listId: board.listId, itemId });
        const rawItem = info?.item || info?.record || null;
        if (!rawItem) return [itemId, boardItemsById.get(itemId) || null];
        return [itemId, buildBoardItem(rawItem, board)];
      } catch (e) {
        return [itemId, boardItemsById.get(itemId) || null];
      }
    }));
    const itemsById = new Map(infoEntries);

    const completedMap = new Map();
    const partsMapForBoard = loadParts();
    for (const event of doneEvents) {
      const itemId = String(event.itemId || '').trim();
      if (!itemId) continue;
      const built = itemsById.get(itemId) || null;
      const fallbackText = [event.part || '', event.actionLabel || ''].filter(Boolean).join('\n');
      const inferredBase = built || { id: itemId, title: '', description: fallbackText, origin: '' };
      const resolvedType = applyProductTypeResolution(state, itemId, inferProductType(inferredBase));
      const productType = resolvedType.productType;
      if (productTypeFilter && productType !== productTypeFilter) continue;
      const fallbackTitle = normalizeOneLine(String(event.part || '').trim());
      const overviewC = buildOrderOverview(inferredBase);
      const current = completedMap.get(itemId) || {
        itemId,
        title: built && built.title ? built.title : (fallbackTitle || itemId),
        detectedProductType: resolvedType.detectedProductType,
        productTypeOverride: resolvedType.productTypeOverride,
        productType,
        orderOverview: overviewC,
        partDone: annotatePartDone(itemId, overviewC, partsMapForBoard),
        detectedStats: detectStatisticCounts(inferredBase, productType),
        statsOverride: getItemStatsOverride(state, itemId),
        latestTs: String(event.updatedTs || event.ts || ''),
        count: 0,
      };
      current.effectiveStats = mergeDetectedAndOverrideStats(current.detectedStats, current.statsOverride);
      if ((!current.title || looksLikeRecordId(current.title)) && fallbackTitle) current.title = fallbackTitle;
      if (current.productType === 'Sonstiges' && productType !== 'Sonstiges') current.productType = productType;
      if (!current.productTypeOverride && resolvedType.productTypeOverride) current.productTypeOverride = resolvedType.productTypeOverride;
      if (current.detectedProductType === 'Sonstiges' && resolvedType.detectedProductType !== 'Sonstiges') current.detectedProductType = resolvedType.detectedProductType;
      current.count += 1;
      if (String(event.updatedTs || event.ts || '') > current.latestTs) current.latestTs = String(event.updatedTs || event.ts || '');
      completedMap.set(itemId, current);
    }

    const completedItems = Array.from(completedMap.values()).sort((a, b) => String(b.latestTs || '').localeCompare(String(a.latestTs || '')));
    const typeCounts = new Map();
    for (const item of completedItems) typeCounts.set(item.productType, (typeCounts.get(item.productType) || 0) + 1);
    const runningTypeCounts = new Map();
    for (const item of runningItems) {
      const type = applyProductTypeResolution(state, item.id, inferProductType(item)).productType;
      runningTypeCounts.set(type, (runningTypeCounts.get(type) || 0) + 1);
    }
    const productTypes = Array.from(new Set(
      completedItems.map(x => x.productType).concat(runningItemsRaw.map(inferProductType))
    )).sort((a, b) => a.localeCompare(b));

    res.json({
      ok: true,
      filter: { from, to, productType: productTypeFilter || '' },
      productOverrides: state.productOverrides || {},
      itemStats: state.itemStats || {},
      productTypeOptions: PRODUCT_TYPE_OPTIONS,
      statFieldOptions: STAT_FIELD_OPTIONS,
      productTypes,
      summary: {
        completedOrders: completedItems.length,
        runningOrders: runningItems.length,
        runningTotal: runningItemsRaw.length,
      },
      completedByType: productTypes.map(type => ({ productType: type, count: typeCounts.get(type) || 0 })),
      runningByType: productTypes.map(type => ({ productType: type, count: runningTypeCounts.get(type) || 0 })),
      completedItems: completedItems.slice(0, 120),
      runningItems: runningItems.map((item) => {
        const resolvedType = applyProductTypeResolution(state, item.id, inferProductType(item));
        const detectedStats = detectStatisticCounts(item, resolvedType.productType);
        const statsOverride = getItemStatsOverride(state, item.id);
        const overviewR = buildOrderOverview(item);
        return {
          itemId: item.id,
          title: item.title || item.id,
          detectedProductType: resolvedType.detectedProductType,
          productTypeOverride: resolvedType.productTypeOverride,
          productType: resolvedType.productType,
          orderOverview: overviewR,
          partDone: annotatePartDone(item.id, overviewR, partsMapForBoard || loadParts()),
          detectedStats,
          statsOverride,
          effectiveStats: mergeDetectedAndOverrideStats(detectedStats, statsOverride),
          status: item.status || '',
        };
      }).slice(0, 160),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/recalc', express.json(), (req, res) => {
  const description = String(req.body && req.body.description || '').trim();
  if (!description) return res.status(400).json({ ok: false, error: 'Missing description' });

  const panzerConfigs = parsePanzerConfigs(description);
  const cutLines = panzerConfigs
    .map(cfg => {
      const cuts = computePanzerCuts(cfg);
      if (!cuts) return null;
      const prefix = panzerConfigs.length > 1 ? `${cfg.widthMm} x ${cfg.heightMm} mm: ` : '';
      return `${prefix}Schnittmaß ${cuts.cutWidth} mm, Stäbe ${cuts.rodsTotal} (${cuts.unperforatedTotal} ungelocht (${cuts.unperforatedBars} x 6m), ${cuts.perforatedTotal} gelocht (${cuts.perforatedBars} x 6m))`;
    })
    .filter(Boolean);
  const cutInfo = cutLines.length ? cutLines.join('\n') : null;
  const panzerSummary = panzerConfigs.length
    ? panzerConfigs
        .map(cfg => {
          const parts = [];
          if (cfg.material) parts.push(cfg.material);
          if (cfg.profileHeight) parts.push(`${cfg.profileHeight}er`);
          if (cfg.color) parts.push(cfg.color);
          return parts.join(' ');
        })
        .filter(Boolean)
        .join(' / ')
    : null;
  const materialNeeds = Array.from(new Set(
    panzerConfigs.map(materialLineFromConfig).filter(Boolean)
      .concat(extractPartsMaterialNeeds(description))
  ));
  const endleiste = extractEndleisteInfo(description);
  const vorsatz = extractVorsatzInfo(description);
  const vorsatzElement = extractVorsatzElementInfo(description);
  const vorsatzBoxOnly = extractVorsatzBoxOnlyInfo(description);

  let spb35Blocks = null;
  let rebuiltDescription = null;
  if (/sp-b\s*35/i.test(description)) {
    try {
      const blocks = parsePositionBlocksFromText(description);
      const rebuilt = [];
      let anyRecalc = false;
      for (const b of blocks) {
        const inputs = parseSpB35InputsFromHeader(b.headerText);
        if (!inputs) { rebuilt.push({ idx: b.idx, header: b.header, headerText: b.headerText, details: b.details, spb35: null }); continue; }
        const calc = calculateSpB35(inputs);
        if (!calc) { rebuilt.push({ idx: b.idx, header: b.header, headerText: b.headerText, details: b.details, spb35: null }); continue; }
        anyRecalc = true;
        const newHeader = rebuildPositionHeader(inputs, calc) || b.headerText;
        const notes = rebuildInfoBlock(inputs, calc);
        rebuilt.push({
          idx: b.idx,
          header: b.idx + ') ' + newHeader,
          headerText: newHeader,
          details: notes,
          spb35: {
            model: calc.model,
            widthMm: calc.widthMm,
            heightMm: calc.heightMm,
            xMm: calc.xMm,
            position: calc.position,
            useFederhaken: calc.useFederhaken,
            finishedWidthMm: calc.finishedWidthMm,
            finishedHeightMm: calc.finishedHeightMm,
            finishedSizeLabel: calc.finishedSizeLabel,
            brushPosition: calc.brushPosition,
            brushLengthMm: calc.brushLengthMm,
            needsStabilization: calc.needsStabilization,
            needsMiddleLatch: calc.needsMiddleLatch,
            productionLines: calc.productionLines,
            consumption: calc.consumption,
          },
        });
      }
      if (anyRecalc && rebuilt.length) {
        const desc = String(description || '').replace(/\r\n/g, '\n');
        const lines = desc.split('\n').map(l => l.trim());
        const keptTop = [];
        for (let i = 0; i < lines.length; i += 1) {
          if (/^\s*\d{1,3}\s*[).]/.test(lines[i])) break;
          if (lines[i]) keptTop.push(lines[i]);
        }
        const parts = [];
        for (const t of keptTop) parts.push(t);
        for (const r of rebuilt) {
          parts.push(r.header);
          if (r.details && r.details.length) parts.push(...r.details);
        }
        rebuiltDescription = parts.join('\n');
      }
      spb35Blocks = rebuilt;
    } catch (e) {}
  }

  res.json({
    ok: true,
    cutInfo,
    panzerConfigs: panzerConfigs.length ? panzerConfigs : null,
    panzerSummary,
    materialNeeds,
    endleiste,
    vorsatz,
    vorsatzElement,
    vorsatzBoxOnly,
    spb35Blocks,
    rebuiltDescription,
  });
});

router.post('/item/:id/recalc-save', express.json(), requireAdminKey, async (req, res, next) => {
  try {
    const listId = getListId();
    const itemId = String(req.params && req.params.id || '').trim();
    if (!itemId) return res.status(400).json({ ok: false, error: 'Missing itemId' });
    const cols = await getColumnsCached(listId);
    const bestellungCol =
      findColumn(cols, { nameIncludes: 'materialbestellung' }) ||
      findColumn(cols, { nameIncludes: 'bestellung' }) ||
      findColumn(cols, { key: 'description' }) ||
      null;
    const infosCol = findColumn(cols, { nameIncludes: 'infos' });
    const fallbackCol =
      findColumn(cols, { nameIncludes: 'position' }) ||
      findColumn(cols, { nameIncludes: 'beschreibung' }) ||
      findColumn(cols, { primary: true }) ||
      null;
    if (!bestellungCol && !infosCol && !fallbackCol) return res.status(500).json({ ok: false, error: 'Keine beschreibbare Auftrags-Spalte gefunden' });

    const itemInfoResponse = await itemInfo({ listId, itemId });
    const slackItem = itemInfoResponse && itemInfoResponse.item ? itemInfoResponse.item : itemInfoResponse;
    const bestellungText = bestellungCol
      ? (getFieldText(getFieldByColumnId(slackItem, bestellungCol.id)) || '')
      : '';
    const infosText = infosCol
      ? (getFieldText(getFieldByColumnId(slackItem, infosCol.id)) || '')
      : '';
    const fallbackText = fallbackCol
      ? (getFieldText(getFieldByColumnId(slackItem, fallbackCol.id)) || '')
      : '';
    const descriptionText = getText(slackItem, 'description') || getText(slackItem, 'rich_text_notes');
    const sourceTexts = [bestellungText, infosText, fallbackText, descriptionText]
      .map(text => String(text || '').trim())
      .filter(text => text && /sp-b\s*35/i.test(text));
    const scoreSource = text => {
      const blocks = parsePositionBlocksFromText(text);
      return blocks.reduce((score, block) => {
        const inputs = parseSpB35InputsFromHeader(block.headerText);
        return score + (inputs ? 100 : 0) + block.details.length;
      }, 0);
    };
    const combinedText = sourceTexts
      .sort((a, b) => scoreSource(b) - scoreSource(a) || b.length - a.length)[0] || '';

    if (!combinedText) return res.status(400).json({ ok: false, error: 'Kein Inhalt in Bestellung/Infos' });
    if (!/sp-b\s*35/i.test(combinedText)) return res.status(400).json({ ok: false, error: 'Kein SP-B 35 Auftrag' });

    const blocks = parsePositionBlocksFromText(combinedText);
    const rebuiltBlocks = [];
    const spb35ConsumptionItems = [];
    let anyRecalc = false;
    for (const b of blocks) {
      const inputs = parseSpB35InputsFromHeader(b.headerText);
      if (!inputs) { rebuiltBlocks.push({ idx: b.idx, header: b.header, headerText: b.headerText, infoDetails: b.details.slice(0, 10), calc: null }); continue; }
      const calc = calculateSpB35(inputs);
      if (!calc) { rebuiltBlocks.push({ idx: b.idx, header: b.header, headerText: b.headerText, infoDetails: b.details.slice(0, 10), calc: null }); continue; }
      anyRecalc = true;
      const newHeader = rebuildPositionHeader(inputs, calc) || b.headerText;
      const infoDetails = rebuildInfoBlock(inputs, calc);
      rebuiltBlocks.push({ idx: b.idx, header: b.idx + ') ' + newHeader, headerText: newHeader, infoDetails, calc, inputs });
      if (calc && Array.isArray(calc.consumption) && calc.consumption.length) {
        const posIdx = Number(b.idx);
        spb35ConsumptionItems.push({
          position: Number.isFinite(posIdx) ? posIdx : (spb35ConsumptionItems.length + 1),
          model: calc.model || 'SP-B 35',
          entries: calc.consumption,
        });
      }
    }
    if (!anyRecalc) return res.status(400).json({ ok: false, error: 'Keine SP-B 35 Positionen für Neuberechnung' });

    const keptTop = [];
    const descLines = String(combinedText || '').replace(/\r\n/g, '\n').split('\n').map(l => l.trim());
    for (let i = 0; i < descLines.length; i += 1) {
      if (/^\s*\d{1,3}\s*[).]/.test(descLines[i])) break;
      if (descLines[i]) keptTop.push(descLines[i]);
    }

    const bestellungParts = [];
    const infosParts = [];
    for (const t of keptTop) bestellungParts.push(t);
    for (const rb of rebuiltBlocks) {
      bestellungParts.push(rb.header);
      infosParts.push(rb.header);
      if (rb.infoDetails && rb.infoDetails.length) infosParts.push(...rb.infoDetails);
    }
    const nextBestellungText = bestellungParts.join('\n');
    const nextInfosText = infosParts.join('\n');

    const cells = [];
    const cellsChanged = [];
    if (bestellungCol) {
      cells.push({ row_id: itemId, column_id: bestellungCol.id, rich_text: richText(nextBestellungText) });
      cellsChanged.push('Positionen');
    }
    if (infosCol) {
      cells.push({ row_id: itemId, column_id: infosCol.id, rich_text: richText(nextInfosText) });
      cellsChanged.push('Infos');
    }
    if (!bestellungCol && !infosCol && fallbackCol) {
      cells.push({ row_id: itemId, column_id: fallbackCol.id, rich_text: richText(nextBestellungText + (nextInfosText ? `\n${nextInfosText}` : '')) });
      cellsChanged.push(fallbackCol.name || fallbackCol.key || 'Auftrag');
    }
    if (cells.length) await updateItem({ listId, itemId, cells });

    if (spb35ConsumptionItems.length) {
      const all = loadParts();
      const key = String(itemId || '').trim();
      const entry = (all[key] && typeof all[key] === 'object') ? all[key] : {};
      entry.__consumption = {
        generatedAt: new Date().toISOString(),
        source: 'production-recalc-sp-b35',
        items: spb35ConsumptionItems,
      };
      all[key] = entry;
      saveParts(all);
    }

    const activityChannel = process.env.SLACK_ACTIVITY_CHANNEL;
    const actor = String(req.body && req.body.actor || '').trim();
    const station = String(req.body && req.body.station || '').trim();
    if (activityChannel) {
      const who = actor ? `${actor}${station ? (' @ ' + station) : ''}` : (station ? ('@ ' + station) : 'Monitor');
      const msg = `SP-B 35 Neu-Berechnung gespeichert${who ? (' (' + who + ')') : ''}: ${itemId} – ${cellsChanged.join(', ')}`;
      try { await postMessage({ channel: activityChannel, text: msg }); } catch (e) {}
    }

    res.json({
      ok: true,
      itemId,
      cellsUpdated: cellsChanged,
      positionsCount: rebuiltBlocks.length,
      spb35Blocks: rebuiltBlocks.map(rb => ({
        idx: rb.idx,
        header: rb.header,
        headerText: rb.headerText,
        infoDetails: rb.infoDetails,
        spb35: rb.calc ? {
          model: rb.calc.model,
          widthMm: rb.calc.widthMm,
          heightMm: rb.calc.heightMm,
          finishedWidthMm: rb.calc.finishedWidthMm,
          finishedHeightMm: rb.calc.finishedHeightMm,
          finishedSizeLabel: rb.calc.finishedSizeLabel,
          productionLines: rb.calc.productionLines,
          consumption: rb.calc.consumption,
        } : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

function requireAdminKey(req, res, next) {
  const required = String(process.env.MONITOR_ADMIN_KEY || '').trim();
  if (!required) return res.status(501).json({ ok: false, error: 'MONITOR_ADMIN_KEY is not set' });
  const given = String(req.header('x-admin-key') || '').trim();
  if (!given || given !== required) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  next();
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

router.post('/edit', express.json(), requireAdminKey, async (req, res, next) => {
  try {
    const listId = getListId();
    const itemId = String(req.body.itemId || '').trim();
    if (!itemId) return res.status(400).json({ ok: false, error: 'Missing itemId' });

    const title = typeof req.body.title === 'string' ? req.body.title.trim() : null;
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : null;
    if (title == null && description == null) return res.status(400).json({ ok: false, error: 'Nothing to update' });

    const actor = String(req.body.actor || '').trim();
    const station = String(req.body.station || '').trim();

    const cols = await getColumnsCached(listId);
    const lookup = buildColumnLookup(cols);
    const titleCol =
      findColumn(cols, { nameIncludes: 'aufgabe' }) ||
      findColumn(cols, { primary: true }) ||
      findColumn(cols, { key: 'title' }) ||
      findColumn(cols, { key: 'rich_text_notes' }) ||
      findColumn(cols, { type: 'text' });
    const detailsCol =
      findColumn(cols, { nameIncludes: 'materialbestellung' }) ||
      findColumn(cols, { nameIncludes: 'bestellung' }) ||
      findColumn(cols, { nameIncludes: 'infos' }) ||
      lookup.byName.get('beschreibung') ||
      null;

    const cells = [];
    if (title != null) {
      if (!titleCol) return res.status(500).json({ ok: false, error: 'Title column not found' });
      cells.push({ row_id: itemId, column_id: titleCol.id, rich_text: richText(title) });
    }
    if (description != null) {
      if (!detailsCol) return res.status(500).json({ ok: false, error: 'Details column not found' });
      cells.push({ row_id: itemId, column_id: detailsCol.id, rich_text: richText(description) });
    }

    prodLog('edit_request', {
      listId,
      itemId,
      actor: actor || null,
      station: station || null,
      updateTitle: title != null,
      updateDescription: description != null,
      titleLen: title != null ? title.length : null,
      descLen: description != null ? description.length : null,
    });

    await updateItem({ listId, itemId, cells });

    const activityChannel = process.env.SLACK_ACTIVITY_CHANNEL;
    if (activityChannel) {
      const who = actor ? `${actor}${station ? (' @ ' + station) : ''}` : (station ? ('@ ' + station) : '');
      const fields = [title != null ? 'Titel' : '', description != null ? 'Details' : ''].filter(Boolean).join(', ');
      const msg = `Edit${who ? (' (' + who + ')') : ''}: ${itemId} – ${fields}`;
      try { await postMessage({ channel: activityChannel, text: msg }); } catch (e) {}
    }

    res.json({ ok: true, itemId });
  } catch (err) {
    next(err);
  }
});

router.post('/reopen', express.json(), requireAdminKey, async (req, res, next) => {
  try {
    const listId = getListId();
    const itemId = String(req.body.itemId || '').trim();
    if (!itemId) return res.status(400).json({ ok: false, error: 'Missing itemId' });

    const actor = String(req.body.actor || '').trim();
    const station = String(req.body.station || '').trim();
    const targetCanonical = 'offen';

    prodLog('reopen_request', {
      listId,
      itemId,
      actor: actor || null,
      station: station || null,
      targetCanonical,
    });

    const cols = await getColumnsCached(listId);
    const statusCol = findColumn(cols, { key: 'status' }) || findColumn(cols, { nameIncludes: 'status' });
    if (!statusCol) return res.status(500).json({ ok: false, error: 'Status column not found' });

    const choices = statusCol?.options?.choices || [];
    const desired = normalizeStatusText(displayStatusFromCanonical(targetCanonical));
    const match = Array.isArray(choices)
      ? choices.find(ch => canonicalStatus(ch?.label || ch?.value || ch?.id) === targetCanonical || normalizeStatusText(ch?.label) === desired)
      : null;
    const selectValue = match?.id || match?.value || targetCanonical;

    prodLog('reopen_resolve_status', {
      itemId,
      statusColId: statusCol.id,
      statusColName: statusCol.name,
      selectValue,
      match: match ? { id: match.id, value: match.value, label: match.label } : null,
    });

    await updateItem({
      listId,
      itemId,
      cells: [{ row_id: itemId, column_id: statusCol.id, select: [selectValue] }],
    });
    prodLog('reopen_update_ok', { itemId, selectValue });
    setLocalProgress({ itemId, label: 'Wieder geöffnet', station, actor });

    const activityChannel = process.env.SLACK_ACTIVITY_CHANNEL;
    if (activityChannel) {
      const who = actor ? `${actor}${station ? (' @ ' + station) : ''}` : (station ? ('@ ' + station) : '');
      const msg = `Reopen${who ? (' (' + who + ')') : ''}: ${itemId} – Offen`;
      try { await postMessage({ channel: activityChannel, text: msg }); } catch (e) {}
    }

    res.json({ ok: true, itemId, status: selectValue });
  } catch (err) {
    next(err);
  }
});

router.post('/scan', express.json(), async (req, res, next) => {
  try {
    const listId = getListId();
    await getColumnsCached(listId);

    const code = String(req.body.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Missing code' });

    const m = code.match(/^rwjob:(Rec[0-9A-Za-z]+)$/);
    if (!m) return res.status(400).json({ error: 'Invalid code' });
    const itemId = m[1];

    const stage = Number(req.body.stage || 0);
    const part = req.body.part ? String(req.body.part) : '';
    const partial = req.body.partial === true;
    const origin = req.body.origin ? String(req.body.origin) : '';
    const station = req.body.station ? String(req.body.station) : '';
    const actor = req.body.actor ? String(req.body.actor).trim() : '';
    const targetCanonical = partial
      ? 'in_bearbeitung'
      : (
        stage === 1 ? 'in_bearbeitung' :
        stage === 2 ? (origin === 'ReWo' ? 'in_bearbeitung' : 'fertig') :
        stage === 3 ? 'fertig' :
        'in_bearbeitung'
      );
    prodLog('scan_request', { listId, itemId, stage, actor: actor || null, station: station || null, part: part || null, partial, targetCanonical });

    const cols = await getColumnsCached(listId);
    const statusCol = findColumn(cols, { key: 'status' }) || findColumn(cols, { nameIncludes: 'status' });
    if (!statusCol) return res.status(500).json({ error: 'Status column not found' });

    const choices = statusCol?.options?.choices || [];
    const desired = normalizeStatusText(displayStatusFromCanonical(targetCanonical));
    const match = Array.isArray(choices)
      ? choices.find(ch => canonicalStatus(ch?.label || ch?.value || ch?.id) === targetCanonical || normalizeStatusText(ch?.label) === desired)
      : null;
    const selectValue = match?.id || match?.value || targetCanonical;
    prodLog('scan_resolve_status', {
      itemId,
      statusColId: statusCol.id,
      statusColName: statusCol.name,
      selectValue,
      match: match ? { id: match.id, value: match.value, label: match.label } : null,
    });

    try {
      await updateItem({
        listId,
        itemId,
        cells: [{ row_id: itemId, column_id: statusCol.id, select: [selectValue] }],
      });
      prodLog('scan_update_ok', { itemId, selectValue });

      if (part) {
        const all = loadParts();
        const entry = (all[String(itemId)] && typeof all[String(itemId)] === 'object') ? all[String(itemId)] : {};
        const key = normalizePartKey(part);
        const prev = (entry[key] && typeof entry[key] === 'object') ? entry[key] : {};
        const ts = new Date().toISOString();
        const who = { ts, actor: actor || '', station: station || '' };
        const next = { ...prev };
        if (stage === 1) next.saw = who;
        if (stage === 2) next.done = { ...who, label: origin === 'ReWo' ? 'Arretiert' : 'Fertig' };
        if (stage === 3) next.courier = who;
        entry[key] = next;
        all[String(itemId)] = entry;
        saveParts(all);
      }

      if (!partial) {
        const localLabel = stage === 1 ? 'Gesägt' : stage === 2 ? (origin === 'ReWo' ? 'Arretiert' : 'Fertig') : stage === 3 ? 'Kurier' : '';
        if (localLabel) setLocalProgress({ itemId, label: localLabel, station, actor });
      }

      const activityChannel = process.env.SLACK_ACTIVITY_CHANNEL;
      if (activityChannel) {
        const actionLabel = stage === 1 ? 'Säge' : stage === 2 ? (origin === 'ReWo' ? 'Arretieren' : 'Fertig') : 'Kurier';
        const who = actor ? `${actor}${station ? (' @ ' + station) : ''}` : (station ? ('@ ' + station) : '');
        const msg = partial
          ? `Teilscan${who ? (' (' + who + ')') : ''}: ${actionLabel} – ${itemId} – ${part}`
          : `Scan${who ? (' (' + who + ')') : ''}: ${actionLabel} – ${itemId}`;
        try { await postMessage({ channel: activityChannel, text: msg }); } catch (e) {}
      }

      res.json({ ok: true, itemId, status: selectValue });
    } catch (err) {
      prodLog('scan_update_error', { itemId, error: err?.details?.error || err.message || 'update_failed', details: err?.details || null });
      res.json({ ok: false, itemId, error: err?.details?.error || err.message || 'update_failed' });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/note', express.json(), async (req, res, next) => {
  try {
    const itemId = String(req.body.itemId || '').trim();
    if (!itemId) return res.status(400).json({ ok: false, error: 'Missing itemId' });
    const noteRaw = normalizeOneLine(req.body.note || '');
    const note = noteRaw.slice(0, 200);
    const actor = normalizeOneLine(req.body.actor || '').slice(0, 32);
    const station = normalizeOneLine(req.body.station || '').slice(0, 64);

    const notes = loadNotes();
    if (!note) {
      delete notes[itemId];
      saveNotes(notes);
      prodLog('note_clear', { itemId, actor: actor || null, station: station || null });
      return res.json({ ok: true, itemId, note: '' });
    }

    notes[itemId] = { text: note, ts: new Date().toISOString(), actor, station };
    saveNotes(notes);
    prodLog('note_set', { itemId, len: note.length, actor: actor || null, station: station || null });
    res.json({ ok: true, itemId, note });
  } catch (err) {
    next(err);
  }
});

router.post('/question/answer', express.json(), async (req, res, next) => {
  try {
    const listId = getListId();
    const itemId = String(req.body.itemId || '').trim();
    if (!itemId) return res.status(400).json({ ok: false, error: 'Missing itemId' });

    const answerRaw = String(req.body.answer || '').trim();
    if (!answerRaw) return res.status(400).json({ ok: false, error: 'Missing answer' });
    const answer = answerRaw.slice(0, 900);

    const actor = normalizeOneLine(req.body.actor || '').slice(0, 32);
    const station = normalizeOneLine(req.body.station || '').slice(0, 64);

    const cols = await getColumnsCached(listId);
    const lookup = buildColumnLookup(cols);
    const bestellungCol = findColumn(cols, { key: 'description' }) || findColumn(cols, { nameIncludes: 'bestellung' });
    const infosCol = findColumn(cols, { nameIncludes: 'infos' });
    const materialCol = findColumn(cols, { nameIncludes: 'materialbestellung' });
    const fallbackCol = lookup.byName.get('beschreibung') || null;

    const info = await itemInfo({ listId, itemId });
    const item = info && info.item ? info.item : null;
    if (!item) return res.status(404).json({ ok: false, error: 'Item not found' });

    const ts = new Date();
    const when = ts.toLocaleString('de-DE');
    const who = actor ? (actor + (station ? (' @ ' + station) : '')) : (station ? ('@ ' + station) : '');
    const header = `Antwort${who ? (' (' + who + ')') : ''}: ${when}`;

    const cells = [];
    const written = [];

    const baseAppend = (existingText) => {
      const prior = String(existingText || '').trimEnd();
      const next = (prior ? (prior + '\n\n') : '') + header + '\n' + answer;
      return next.length > 8000 ? ('…\n' + next.slice(-8000)) : next;
    };

    const existingInfos = getFieldText(getFieldByColumnId(item, infosCol?.id));
    if (infosCol) {
      const infosNext = baseAppend(existingInfos);
      cells.push({ row_id: itemId, column_id: infosCol.id, rich_text: richText(infosNext) });
      written.push(infosCol.name || infosCol.key || infosCol.id);
    } else if (bestellungCol) {
      const existingBestellung = getFieldText(getFieldByColumnId(item, bestellungCol?.id));
      const bestellungNext = baseAppend(existingBestellung);
      cells.push({ row_id: itemId, column_id: bestellungCol.id, rich_text: richText(bestellungNext) });
      written.push(bestellungCol.name || bestellungCol.key || bestellungCol.id);
    } else if (materialCol) {
      const existingMaterial = getFieldText(getFieldByColumnId(item, materialCol?.id));
      const materialNext = baseAppend(existingMaterial);
      cells.push({ row_id: itemId, column_id: materialCol.id, rich_text: richText(materialNext) });
      written.push(materialCol.name || materialCol.key || materialCol.id);
    } else if (fallbackCol) {
      const existingFallback = getFieldText(getFieldByColumnId(item, fallbackCol?.id));
      const fallbackNext = baseAppend(existingFallback);
      cells.push({ row_id: itemId, column_id: fallbackCol.id, rich_text: richText(fallbackNext) });
      written.push(fallbackCol.name || fallbackCol.key || fallbackCol.id);
    }

    if (!cells.length) return res.status(500).json({ ok: false, error: 'No writable columns found' });

    await updateItem({ listId, itemId, cells });

    prodLog('question_answer_set', { itemId, columns: written, actor: actor || null, station: station || null, len: answer.length });
    res.json({ ok: true, itemId, columns: written });
  } catch (err) {
    next(err);
  }
});

router.post('/material', express.json(), async (req, res, next) => {
  try {
    const materialListId = process.env.SLACK_MATERIAL_LIST_ID;
    if (!materialListId) return res.status(500).json({ ok: false, error: 'SLACK_MATERIAL_LIST_ID is not set' });

    const itemId = String(req.body.itemId || '').trim();
    if (!itemId) return res.status(400).json({ ok: false, error: 'Missing itemId' });

    const title = String(req.body.title || '').trim();
    const part = String(req.body.part || '').trim();
    const panzerConfigs = Array.isArray(req.body.panzerConfigs) ? req.body.panzerConfigs : [];
    const partMaterial = String(req.body.partMaterial || '').trim();
    const dueDate = String(req.body.montageDate || req.body.dueDate || '').slice(0, 10);
    const assignee = String(process.env.SLACK_MATERIAL_ASSIGNEE || '').trim();

    const materials = [];
    const scopedByPart = !!part || !!partMaterial;
    if (!scopedByPart) {
      for (const cfg of panzerConfigs) {
        if (!cfg) continue;
        const mat = cfg.material ? String(cfg.material).trim() : '';
        const prof = cfg.profileHeight ? `${Number(cfg.profileHeight)}er` : '';
        const col = cfg.color ? String(cfg.color).trim() : '';
        const line = [mat, prof, col].filter(Boolean).join(' ');
        if (line) materials.push(line);
      }
    }
    const uniqueMaterials = Array.from(new Set(materials));

    function normalizeMaterialText(s) {
      return normalizeMaterialKey(s);
    }

    function looksLikePanzerLabel(s) {
      const t = String(s || '').toLowerCase();
      if (t.includes('panzer')) return true;
      return /\d{3,4}\s*(?:x|×)\s*\d{3,4}/i.test(t);
    }

    if (partMaterial) {
      const parts = splitMaterialSegments(partMaterial).slice(0, 15);
      for (const p of parts) {
        const pm = normalizeMaterialText(p);
        const duplicate = uniqueMaterials.some(m => normalizeMaterialText(m) === pm);
        const redundant =
          looksLikePanzerLabel(p) &&
          (uniqueMaterials.some(m => pm.includes(normalizeMaterialText(m))) ||
           uniqueMaterials.some(m => normalizeMaterialText(m).includes(pm)));
        if (!duplicate && !redundant) uniqueMaterials.push(p);
      }
    }
    if (!uniqueMaterials.length) uniqueMaterials.push('(Material unklar)');

    const cols = await listSchema({ listId: materialListId });
    const findMatCol = (name) => cols.find(c => c && typeof c.name === 'string' && c.name.toLowerCase().includes(name));
    const colPrimary = cols.find(c => c && c.is_primary_column) || null;
    const colMaterial =
      findMatCol('material') ||
      colPrimary ||
      cols.find(c => c.key === 'rich_text_notes') ||
      cols.find(c => c.type === 'text');
    const colKommission = findMatCol('kommission') || findMatCol('projekt') || null;
    const colStatus = cols.find(c => c.key === 'status') || findMatCol('status') || null;
    const colDue = findMatCol('fällig') || cols.find(c => c.key === 'date') || null;
    const colAssignee = findMatCol('empfänger') || findMatCol('empfaenger') || findMatCol('assignee') || null;

    function richText(text) {
      return [{
        type: 'rich_text',
        elements: [{
          type: 'rich_text_section',
          elements: [{ type: 'text', text: String(text) }],
        }],
      }];
    }

    let statusOption = null;
    if (colStatus && Array.isArray(colStatus.options?.choices)) {
      statusOption = colStatus.options.choices.find(ch => /angefragt/i.test(String(ch.label || ch.value || ''))) || colStatus.options.choices[0];
    }

    let created = 0;
    try {
      for (const mat of uniqueMaterials) {
        const primaryText = itemId ? `${mat} |#${itemId}` : mat;
        const cells = [];
        if (colMaterial) cells.push({ column_id: colMaterial.id, rich_text: richText(primaryText) });
        if (colKommission && (title || itemId)) cells.push({ column_id: colKommission.id, rich_text: richText(title || itemId) });
        if (colStatus && statusOption) cells.push({ column_id: colStatus.id, select: [statusOption.id || statusOption.value] });
        if (colDue && dueDate) cells.push({ column_id: colDue.id, date: [dueDate] });
        if (colAssignee && assignee) cells.push({ column_id: colAssignee.id, user: [assignee] });

        await createItem({ listId: materialListId, initial_fields: cells });
        created += 1;
      }
    } catch (err) {
      return res.status(502).json({
        ok: false,
        error: err?.details?.error || err.message || 'material_create_failed',
        details: err?.details || null,
        created,
      });
    }

    res.json({ ok: true, created });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err?.details?.error || err.message || 'material_failed', details: err?.details || null });
  }
});

router.get('/mat-checked', async (req, res) => {
  try {
    const state = loadMatChecked();
    res.json({ ok: true, ids: state.ids, updatedAt: state.updatedAt });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e), ids: [] });
  }
});

router.post('/mat-checked/:itemId', express.json(), async (req, res) => {
  try {
    const itemId = String(req.params && req.params.itemId || '').trim();
    if (!itemId) return res.status(400).json({ ok: false, error: 'Missing itemId' });
    const state = loadMatChecked();
    if (state.ids.includes(itemId)) {
      return res.json({ ok: true, already: true, updatedAt: state.updatedAt, ids: state.ids });
    }
    const saved = saveMatChecked(state.ids.concat([itemId]));
    res.json({ ok: true, added: true, itemId, updatedAt: saved.updatedAt, ids: saved.ids });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.delete('/mat-checked/:itemId', express.json(), async (req, res) => {
  try {
    const itemId = String(req.params && req.params.itemId || '').trim();
    if (!itemId) return res.status(400).json({ ok: false, error: 'Missing itemId' });
    const state = loadMatChecked();
    const filtered = state.ids.filter(id => String(id) !== itemId);
    if (filtered.length === state.ids.length) {
      return res.json({ ok: true, removed: false, updatedAt: state.updatedAt, ids: state.ids });
    }
    const saved = saveMatChecked(filtered);
    res.json({ ok: true, removed: true, itemId, updatedAt: saved.updatedAt, ids: saved.ids });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.delete('/mat-checked', express.json(), async (req, res) => {
  try {
    const saved = saveMatChecked([]);
    res.json({ ok: true, reset: true, updatedAt: saved.updatedAt, ids: [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.get('/split-cache', async (req, res) => {
  try {
    const state = loadSplits();
    res.json({ ok: true, data: state || {}, updatedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.post('/split-cache/auto-split', express.json(), async (req, res) => {
  try {
    const { text } = req.body || {};
    const result = splitCompoundPositionText(text || '');
    res.json({ ok: true, input: String(text || ''), parts: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.post('/split-cache/save', express.json(), async (req, res) => {
  try {
    const { itemId, rowKey, parts } = req.body || {};
    const iKey = String(itemId || '').trim();
    const rKey = String(rowKey || '').trim();
    if (!iKey || !rKey) {
      return res.status(400).json({ ok: false, error: 'itemId und rowKey erforderlich' });
    }
    if (!Array.isArray(parts)) {
      return res.status(400).json({ ok: false, error: 'parts muss Array sein' });
    }
    const cleanParts = parts.map(p => normalizeOneLine(p)).filter(Boolean);
    if (!cleanParts.length) {
      return res.status(400).json({ ok: false, error: 'parts darf nicht leer sein' });
    }
    const state = loadSplits();
    if (!state[iKey] || typeof state[iKey] !== 'object') state[iKey] = {};
    const before = JSON.stringify(state[iKey][rKey] || []);
    state[iKey][rKey] = cleanParts;
    saveSplits(state);
    res.json({
      ok: true,
      itemId: iKey,
      rowKey: rKey,
      parts: cleanParts,
      changed: before !== JSON.stringify(cleanParts),
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.post('/split-cache/delete', express.json(), async (req, res) => {
  try {
    const { itemId, rowKey } = req.body || {};
    const iKey = String(itemId || '').trim();
    const rKey = String(rowKey || '').trim();
    if (!iKey || !rKey) {
      return res.status(400).json({ ok: false, error: 'itemId und rowKey erforderlich' });
    }
    const state = loadSplits();
    let removed = false;
    if (state[iKey] && typeof state[iKey] === 'object' && Object.prototype.hasOwnProperty.call(state[iKey], rKey)) {
      delete state[iKey][rKey];
      if (Object.keys(state[iKey]).length === 0) delete state[iKey];
      saveSplits(state);
      removed = true;
    }
    res.json({ ok: true, removed, updatedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

module.exports = router;
Object.assign(module.exports, {
  buildFullBoardSnapshot,
  erzeugeKommissionierZeilen,
  kategorisiereMaterialbedarf,
  normalizePartDoneKey,
  annotatePartDone,
  buildOrderOverview,
  nextWorkday, parseIsoDate, formatDateIso, sameDay, addDays, isWeekend, isHoliday,
  startOfToday, normalizeMaterialKey,
  splitCompoundPositionText,
});
