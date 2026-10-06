const fs = require('fs');
const stabilization = require('./stabilization');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function loadJsonFromData(fileName, fallback) {
  try {
    const filePath = path.join(DATA_DIR, fileName);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

const SP_B35_PARTS = loadJsonFromData('sp-b35-parts.json', { parts: [], rules: {} });
const SP_B35_HOOKS = loadJsonFromData('sp-b35-hook-lookup.json', { standardHooks: [], federhakenHooks: [] });
const SP_B35_PARTS_BY_POS = new Map(
  (Array.isArray(SP_B35_PARTS.parts) ? SP_B35_PARTS.parts : []).map((part) => [Number(part.pos), part])
);

function normalize(s) {
  return String(s ?? '')
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForMatch(s) {
  return normalize(s).replace(/ß/g, 'ss').toLowerCase();
}

function asInt(v) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : NaN;
}

function parseMmValue(value) {
  const n = asInt(value);
  return Number.isFinite(n) ? n : null;
}

function formatSizeMm(widthMm, heightMm) {
  const w = Number(widthMm);
  const h = Number(heightMm);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return '';
  return `${Math.round(w)} x ${Math.round(h)} mm`;
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

function getSpB35HookGroove(position) {
  if (isInsidePosition(position)) return 'Außennut';
  if (isOutsidePosition(position)) return 'Mittelnut';
  return '';
}

function getSpB35Part(pos) {
  return SP_B35_PARTS_BY_POS.get(Number(pos)) || null;
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
    const count = c.stabilizationLayout ? c.stabilizationLayout.count : 1;
    pushPart('Stabilisierungsprofil', count, { unit: 'Stk', articleNo: '3001030FF' });
    pushPart('Verbinder für Stabilisierungsprofil', 2 * count, { unit: 'Stk', articleNo: '300130200' });
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
  const brushPosition = normalize(d.spannBrushPosition) || (useFederhaken || isInsidePosition(position) ? 'außen umlaufend' : 'zum Fenster');
  const brushLengthMm = parseMmValue(d.spannBrushLengthMm) || 8;
  const stabilizationLayout = stabilization.fromDetails(d);
  const stabilizationMode = stabilizationLayout ? 'Layout' : (normalize(d.spannStabilizationMode) || 'Auto');
  const stabilizationHeightRaw = stabilizationLayout ? '' : normalize(d.spannStabilizationHeightMm);
  const stabilizationHeightMm = stabilizationHeightRaw ? Number(stabilizationHeightRaw) : null;

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
  if (stabilizationHeightRaw && (!Number.isInteger(stabilizationHeightMm) || !Number.isFinite(finishedHeightMm)
      || stabilizationHeightMm < 35 || stabilizationHeightMm > finishedHeightMm - 35 || stabilizationMode === 'Nein')) {
    const err = new Error('Stabi-Höhe bitte innerhalb des fertigen Rahmens angeben (mindestens 35 mm Abstand zu oben/unten) und Stabilisierungsprofil aktivieren.');
    err.status = 400;
    throw err;
  }
  let needsStabilization = autoNeedsStabilization;
  if (autoNeedsStabilization === true) needsStabilization = true;
  else if (stabilizationMode === 'Ja') needsStabilization = true;
  else if (stabilizationMode === 'Nein') needsStabilization = false;
  if (stabilizationHeightRaw) needsStabilization = true;
  if (stabilizationLayout) needsStabilization = stabilizationLayout.count > 0;
  const needsMiddleLatch = Number.isFinite(heightMm) ? heightMm >= 1300 : null;
  const hookGroove = getSpB35HookGroove(position);
  const gripPosition = Number.isFinite(heightMm)
    ? (heightMm < 1000 ? 'Mitte' : '2/5 von unten')
    : '';
  const keder = resolveSpB35Keder(mesh);
  const hookEntry = useFederhaken ? null : lookupSpB35HookEntry(xMm, false);

  const finishedSizeLine = Number.isFinite(finishedWidthMm) && Number.isFinite(finishedHeightMm)
    ? `Fertigmaß: ${formatSizeMm(finishedWidthMm, finishedHeightMm)}`
    : '';
  const frameCutLine = Number.isFinite(finishedWidthMm) && Number.isFinite(finishedHeightMm)
    ? `Schnittmaß SP-B 35 (Gehrungssäge): ${formatCountedCut(2, finishedWidthMm)} x ${formatCountedCut(2, finishedHeightMm)}`
    : '';
  const stabilizationCutMm = needsStabilization && Number.isFinite(finishedWidthMm)
    ? (stabilizationLayout ? stabilizationLayout.cutMm : finishedWidthMm - 70)
    : null;
  const stabilizationCenterFromInnerEdgeMm = !stabilizationLayout && needsStabilization && Number.isFinite(finishedHeightMm)
    ? (stabilizationHeightRaw ? stabilizationHeightMm - 35 : Math.round((finishedHeightMm - 70) / 2))
    : null;
  const stabilizationLine = Number.isFinite(stabilizationCutMm)
    ? `Stabilisierungsprofil (Profilsäge): ${formatCountedCut(1, stabilizationCutMm)}, Einklebepunkt ${Math.round(stabilizationCenterFromInnerEdgeMm)} mm vom Innenrand`
    : '';
  const slideLine = useFederhaken
    ? 'Schlitten auf Federhakenseite jeweils 3'
    : `Schlitten auf Hakenseite jeweils 2${needsMiddleLatch ? ' plus jeweils 1 Schlitten für jeweils 1 Grifflasche' : ''}`;
  const hookGrooveLine = !useFederhaken && hookGroove ? `Haken in ${hookGroove}` : '';
  const brushLine = brushPosition === 'zum Fenster' && brushLengthMm === 8
    ? 'Bürste zum Fenster'
    : `Bürste ${brushPosition}, ${Math.round(brushLengthMm)} mm`;
  const productionLines = [
    finishedSizeLine,
    frameCutLine,
    ...(stabilizationLayout ? stabilization.productionLines(stabilizationLayout) : [stabilizationLine]),
    slideLine,
    hookGrooveLine,
    brushLine,
    warning,
  ].filter(Boolean);

  const consumption = resolveSpB35Consumption(d, {
    useFederhaken,
    needsMiddleLatch,
    needsStabilization,
    stabilizationLayout,
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
    stabilizationLayout,
    stabilizationHeightMm,
    kederLabel: keder ? keder.label : '',
    kederArticleNo: keder ? keder.articleNo : '',
    needsStabilization,
    autoNeedsStabilization,
    needsMiddleLatch,
    hookGroove,
    gripPosition,
    hookArticleNo: hookEntry ? normalize(hookEntry.hookLongArticleNo) : '',
    stabilizationCutMm,
    stabilizationCenterFromInnerEdgeMm,
    consumption,
    warning,
    productionLines,
  };
}

function parseMmPair(text) {
  const m = /(\d{2,5})\s*x\s*(\d{2,5})\s*mm/i.exec(String(text || ''));
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

function parseSpB35InputsFromHeader(headerText) {
  const raw = normalize(headerText);
  if (!raw) return null;
  const body = raw.replace(/^(?:\d+\s*[).]\s*)?Insektenschutz\s*[–-]\s*/i, '').trim();
  if (!body) return null;

  const modelMatch = /sp-b\s*35/i.test(body);
  if (!modelMatch) return null;

  const segments = body.split(/,(?![^(]*\))/).map(s => normalize(s)).filter(Boolean);
  if (!segments.length) return null;

  const subtype = segments.find(s => /^Spannrahmen$/i.test(s)) || '';
  const dimsSegment = segments.find(s => /\d{2,4}\s*x\s*\d{2,4}\s*mm/i.test(s)) || '';
  const measurementSegment = segments.find(s => /^Aufmaß:/i.test(s));
  const dims = parseMmPair(measurementSegment || dimsSegment);
  const color = (segments.find(s => /^Farbe:/i.test(s)) || '').replace(/^Farbe:\s*/i, '').trim();
  const mesh = (segments.find(s => /^Gaze:/i.test(s)) || '').replace(/^Gaze:\s*/i, '').trim();
  const position = segments.find(s => /innenliegend|außenliegend|aussenliegend/i.test(s)) || '';
  const federSegment = segments.find(s => /Federstifte/i.test(s)) || '';
  const useFederhaken = !!federSegment;
  const hookSegment = segments.find(s => /^Hakenmaß\s*X:/i.test(s)) || '';
  const hookMmMatch = hookSegment ? /(\d+)\s*mm/i.exec(hookSegment) : null;
  const hookMm = hookMmMatch ? Number(hookMmMatch[1]) : null;

  const brushSegments = segments.filter(s => /Bürste/i.test(s));
  let brushPosition = '';
  let brushLengthMm = null;
  if (brushSegments.length) {
    const full = brushSegments.join(' ');
    const lenMatch = /(\d{1,2})\s*mm/i.exec(full);
    if (lenMatch) brushLengthMm = Number(lenMatch[1]);
    let pos = full
      .replace(/^Bürste\s*/i, '')
      .replace(/\b\d{1,2}\s*mm\b/gi, '')
      .replace(/,\s*,/g, ',')
      .replace(/,\s*$/g, '')
      .trim();
    if (normalizeForMatch(pos) === normalizeForMatch('zum Fenster')) {
      brushPosition = 'zum Fenster';
    } else if (pos) {
      brushPosition = pos;
    }
  }
  if (!brushPosition) brushPosition = useFederhaken || isInsidePosition(position) ? 'außen umlaufend' : 'zum Fenster';
  if (!brushLengthMm) brushLengthMm = 8;

  const details = {
    insectSubtype: subtype || 'Spannrahmen',
    insectWidthMm: dims ? dims.width : null,
    insectHeightMm: dims ? dims.height : null,
    spannPosition: position,
    spannFederstifte: useFederhaken ? 'Ja' : 'Nein',
    spannHakenLengthMm: hookMm,
    spannHakenVariant: (segments.find(s => /^Haken: (Kurz|Lang)$/i.test(s)) || '').replace(/^Haken: /i, '').replace(/^kurz$/i, 'Kurz').replace(/^lang$/i, 'Lang'),
    insectMesh: mesh,
    insectColor: color,
    spannBrushPosition: brushPosition,
    spannBrushLengthMm: brushLengthMm,
    spannStabilizationMode: 'Auto',
    ...(stabilization.parseHeader(body) ? { stabilization: stabilization.parseHeader(body) } : {}),
    spannStabilizationHeightMm: ((segments.find(s => /^Stabi-Höhe:/i.test(s)) || '').match(/(\d+)\s*mm/i) || [])[1] || '',
    spannNotes: '',
  };
  details.__debug = { segments, dimsSegment, hookSegment, brushSegments, body };
  return details;
}

function isProductionDetailLine(line) {
  return /^(Schnittmaß SP-B 35|Stabilisierungsprofil \(Profilsäge\)|Schlitten auf |Haken in (Außennut|Mittelnut)$|Bürste\b|Federstifte aktiv\b|Fertigmaß:)/i.test(String(line || '').trim());
}

function parsePositionBlocksFromText(text) {
  const desc = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!desc) return [];
  const lines = desc.split('\n').map(l => String(l || '').trim()).filter(Boolean);
  if (!lines.length) return [];
  const out = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const headerText = normalize(cur.header || '');
    if (headerText) out.push({
      idx: cur.idx,
      header: cur.idx + ') ' + headerText,
      headerText,
      details: cur.details.slice(0, 20),
    });
    cur = null;
  };
  for (const ln of lines) {
    const m = /^\s*(\d{1,3})\s*[).]\s*(.+)\s*$/.exec(ln);
    if (m) {
      flush();
      cur = { idx: String(m[1]), header: String(m[2] || '').trim(), details: [] };
      continue;
    }
    if (!cur) continue;
    const trimmed = normalize(ln.replace(/^\s{1,6}/, ''));
    if (!trimmed) continue;
    if (isProductionDetailLine(trimmed)) cur.details.push(trimmed);
    else cur.header = (cur.header ? (cur.header + ' ' + trimmed) : trimmed).trim();
  }
  flush();
  return out.slice(0, 20);
}

function extractFertigmaßFromDetails(detailsLines) {
  const lines = Array.isArray(detailsLines) ? detailsLines : [];
  const line = lines.find(l => /^Fertigmaß:\s*\d/i.test(String(l || '').trim()));
  if (!line) return null;
  const raw = String(line).replace(/^Fertigmaß:\s*/i, '').trim();
  return parseMmPair(raw);
}

function rebuildPositionHeader(details, spb35) {
  const d = details || {};
  const s = spb35 || {};
  const attrs = [];
  if (s.model) attrs.push(s.model);
  if (d.insectSubtype) attrs.push(d.insectSubtype);
  const cutDims = s.finishedSizeLabel
    ? s.finishedSizeLabel
    : formatSizeMm(d.insectWidthMm, d.insectHeightMm);
  if (cutDims) attrs.push(cutDims);
  if (d.insectColor) attrs.push(`Farbe: ${d.insectColor}`);
  if (d.insectMesh) attrs.push(`Gaze: ${d.insectMesh}`);
  if (d.spannPosition) attrs.push(d.spannPosition);
  if (s.hookGroove) attrs.push(`Haken-Nut: ${s.hookGroove}`);
  if (s.stabilizationLayout) attrs.push(stabilization.header(s.stabilizationLayout));
  if (s.stabilizationLayout) attrs.push(`Aufmaß: ${formatSizeMm(d.insectWidthMm, d.insectHeightMm)}`);
  if (Number.isFinite(s.stabilizationHeightMm)) attrs.push(`Stabi-Höhe: ${s.stabilizationHeightMm} mm von unten (Profilmitte)`);
  if (s.useFederhaken) attrs.push('Federstifte');
  else if (Number.isFinite(s.xMm)) attrs.push(`Hakenmaß X: ${Math.round(s.xMm)} mm`);
  if (!s.useFederhaken && ['Kurz', 'Lang'].includes(d.spannHakenVariant)) attrs.push(`Haken: ${d.spannHakenVariant}`);
  if (s.brushPosition === 'zum Fenster' && s.brushLengthMm === 8) {
    attrs.push('Bürste zum Fenster');
  } else {
    attrs.push(`Bürste ${s.brushPosition}, ${Math.round(s.brushLengthMm)} mm`);
  }
  if (d.insectColor) attrs.push(d.insectColor);
  const seen = new Set();
  return attrs
    .map(a => normalize(a))
    .filter(Boolean)
    .filter(a => (seen.has(a.toLowerCase()) ? false : (seen.add(a.toLowerCase()), true)))
    .join(', ');
}

function rebuildInfoBlock(details, spb35) {
  const dims = formatSizeMm(details && details.insectWidthMm, details && details.insectHeightMm);
  const notes = [];
  if (dims && spb35 && spb35.finishedSizeLabel && dims !== spb35.finishedSizeLabel) {
    notes.push(`Fertigmaß: ${spb35.finishedSizeLabel}`);
  }
  if (spb35 && Array.isArray(spb35.productionLines)) notes.push(...spb35.productionLines);
  return notes;
}

module.exports = {
  SP_B35_PARTS,
  SP_B35_HOOKS,
  SP_B35_PARTS_BY_POS,
  normalize,
  normalizeForMatch,
  asInt,
  parseMmValue,
  formatSizeMm,
  formatCountedCut,
  isInsidePosition,
  isOutsidePosition,
  getSpB35Part,
  lookupSpB35HookEntry,
  resolveSpB35Keder,
  resolveSpB35Consumption,
  calculateSpB35,
  parseMmPair,
  parseSpB35InputsFromHeader,
  isProductionDetailLine,
  parsePositionBlocksFromText,
  extractFertigmaßFromDetails,
  rebuildPositionHeader,
  rebuildInfoBlock,
};
