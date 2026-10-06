const fs = require('node:fs');

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] ?? '';
};

const hasFlag = (name) => args.includes(name);

const file = getArg('--file') || getArg('-f') || '';
const yearArg = getArg('--year') || '';
const year = yearArg ? Number.parseInt(yearArg, 10) : new Date().getFullYear() - 1;
const minDateArg = getArg('--from') || '';
const maxDateArg = getArg('--to') || '';
const jsonOut = hasFlag('--json');

if (!file) {
  process.stderr.write(
    [
      'Usage:',
      '  node backend/scripts/analyze-lexware-panzer.js --file <export.csv> [--year 2025] [--from YYYY-MM-DD --to YYYY-MM-DD] [--json]',
      '',
      'Notes:',
      '  - Works with comma or semicolon separated CSV (auto-detect).',
      '  - Filters by year (default: last year) or by explicit date range.',
      '',
    ].join('\n'),
  );
  process.exit(2);
}

const normalize = (s) =>
  String(s ?? '')
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const parseDate = (s) => {
  const t = normalize(s);
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
  const de = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (de) {
    const dd = String(de[1]).padStart(2, '0');
    const mm = String(de[2]).padStart(2, '0');
    return new Date(`${de[3]}-${mm}-${dd}T00:00:00Z`);
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
};

const withinRange = (d) => {
  if (!d) return false;
  if (minDateArg) {
    const minD = parseDate(minDateArg);
    if (minD && d < minD) return false;
  }
  if (maxDateArg) {
    const maxD = parseDate(maxDateArg);
    if (maxD && d > maxD) return false;
  }
  if (!minDateArg && !maxDateArg) {
    return d.getUTCFullYear() === year;
  }
  return true;
};

const sniffDelimiter = (headerLine) => {
  const c = (headerLine.match(/,/g) || []).length;
  const s = (headerLine.match(/;/g) || []).length;
  return s >= c ? ';' : ',';
};

const parseCsv = (text, delimiter) => {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          cur += '"';
          i += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }
      cur += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === delimiter) {
      row.push(cur);
      cur = '';
      continue;
    }

    if (ch === '\r') continue;
    if (ch === '\n') {
      row.push(cur);
      cur = '';
      if (row.length === 1 && normalize(row[0]) === '') {
        row = [];
        continue;
      }
      rows.push(row);
      row = [];
      continue;
    }

    cur += ch;
  }

  row.push(cur);
  if (row.some((c) => normalize(c) !== '')) rows.push(row);
  return rows;
};

const raw = fs.readFileSync(file, 'utf8');
const firstLine = raw.split(/\r?\n/).find((l) => normalize(l) !== '') || '';
const delimiter = sniffDelimiter(firstLine);
const rows = parseCsv(raw, delimiter);
if (rows.length < 2) {
  process.stderr.write('CSV seems empty or invalid.\n');
  process.exit(2);
}

const header = rows[0].map((h) => normalize(h));
const indexByName = new Map(header.map((h, i) => [h.toLowerCase(), i]));

const findCol = (candidates) => {
  for (const c of candidates) {
    const idx = indexByName.get(String(c).toLowerCase());
    if (typeof idx === 'number') return idx;
  }
  return -1;
};

const dateCol = findCol([
  'datum',
  'belegdatum',
  'rechnungsdatum',
  'datum (beleg)',
  'created at',
  'created_at',
  'date',
]);

const textCol = findCol([
  'beschreibung',
  'bezeichnung',
  'artikelbezeichnung',
  'positionstext',
  'text',
  'artikel',
  'produkt',
  'item',
  'name',
]);

const qtyCol = findCol([
  'menge',
  'anzahl',
  'quantity',
  'qty',
]);

const candidatesColor = [
  'weiß',
  'weiss',
  'grau',
  'beige',
  'silber',
  'anthrazit',
  'goldenoak',
  'golden oak',
  'holz hell',
  'holz dunkel',
  'oregon',
  'graubraun',
  'moosgrün',
  'moosgruen',
  'graualuminium',
  'perlweiß',
  'perlweiss',
];

const detectMaterial = (t) => {
  const s = normalize(t).toLowerCase();
  if (/\bpvc\b/.test(s)) return 'PVC';
  if (/\balu\b/.test(s) || /\baluminium\b/.test(s)) return 'Alu';
  return '';
};

const detectProfile = (t) => {
  const s = normalize(t).toLowerCase();
  if (/\bmini\b/.test(s) || /\b37\b/.test(s) || /\b37er\b/.test(s) || /\b37\s*mm\b/.test(s)) return 'Mini (37)';
  if (/\bmaxi\b/.test(s) || /\b52\b/.test(s) || /\b52er\b/.test(s) || /\b52\s*mm\b/.test(s)) return 'Maxi (52)';
  return '';
};

const detectColor = (t) => {
  const s = normalize(t).toLowerCase();
  const hit = candidatesColor.find((c) => s.includes(c));
  if (!hit) return '';
  if (hit === 'weiß') return 'Weiß';
  if (hit === 'weiss') return 'Weiß';
  if (hit === 'moosgrün' || hit === 'moosgruen') return 'Moosgrün';
  if (hit === 'perlweiß' || hit === 'perlweiss') return 'Perlweiß';
  if (hit === 'goldenoak' || hit === 'golden oak') return 'GoldenOak';
  return hit.charAt(0).toUpperCase() + hit.slice(1);
};

const isPanzer = (t) => {
  const s = normalize(t).toLowerCase();
  return s.includes('panzer') || s.includes('rollladenpanzer') || s.includes('rolladenpanzer');
};

const parseQty = (s) => {
  const t = normalize(s);
  if (!t) return 1;
  const n = Number.parseFloat(t.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 1;
};

const counts = new Map();
const rawSamples = new Map();
let scanned = 0;
let matched = 0;

for (let i = 1; i < rows.length; i += 1) {
  const r = rows[i];
  scanned += 1;

  const date = dateCol >= 0 ? parseDate(r[dateCol]) : null;
  if (dateCol >= 0 && !withinRange(date)) continue;

  const text = textCol >= 0 ? normalize(r[textCol]) : '';
  if (!text) continue;
  if (!isPanzer(text)) continue;

  matched += 1;
  const qty = qtyCol >= 0 ? parseQty(r[qtyCol]) : 1;
  const material = detectMaterial(text) || 'Unbekannt';
  const profile = detectProfile(text) || 'Unbekannt';
  const color = detectColor(text) || 'Unbekannt';

  const key = `${material} | ${profile} | ${color}`;
  counts.set(key, (counts.get(key) || 0) + qty);
  if (!rawSamples.has(key)) rawSamples.set(key, text);
}

const result = Array.from(counts.entries())
  .map(([key, qty]) => {
    const [material, profile, color] = key.split(' | ');
    return { material, profil: profile, farbe: color, anzahl: qty, beispiel: rawSamples.get(key) || '' };
  })
  .sort((a, b) => b.anzahl - a.anzahl);

if (jsonOut) {
  process.stdout.write(JSON.stringify({ year, scanned, matched, result }, null, 2) + '\n');
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n, ' ');
const format = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ','));

const col1 = Math.max('Material'.length, ...result.map((r) => r.material.length));
const col2 = Math.max('Profil'.length, ...result.map((r) => r.profil.length));
const col3 = Math.max('Farbe'.length, ...result.map((r) => r.farbe.length));

process.stdout.write(`Auswertung Lexware-Export (Panzer) – Zeitraum: ${minDateArg || maxDateArg ? `${minDateArg || '...'} bis ${maxDateArg || '...'}` : String(year)}\n`);
process.stdout.write(`Zeilen gescannt: ${scanned} | Panzer-Zeilen erkannt: ${matched}\n\n`);
process.stdout.write(`${pad('Material', col1)}  ${pad('Profil', col2)}  ${pad('Farbe', col3)}  Anzahl\n`);
process.stdout.write(`${'-'.repeat(col1)}  ${'-'.repeat(col2)}  ${'-'.repeat(col3)}  ------\n`);
for (const r of result) {
  process.stdout.write(`${pad(r.material, col1)}  ${pad(r.profil, col2)}  ${pad(r.farbe, col3)}  ${format(r.anzahl)}\n`);
}

process.stdout.write('\nHinweise:\n');
process.stdout.write('- Wenn viele Zeilen als „Unbekannt“ landen, fehlen Profil/Farbe im Lexware-Text oder die Schreibweise weicht ab.\n');
process.stdout.write('- Dann bitte 3–5 Beispiel-Positionstexte schicken; ich erweitere die Erkennung zielgenau.\n');

