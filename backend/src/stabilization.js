(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Stabilization = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FRAME_MM = 35;
  const BRACE_MM = 34.2;
  const MIN_GAP_MM = 450;
  const MAX_GAP_MM = 1250;
  const round1 = value => Math.round(value * 10) / 10;
  const oppositeOffset = (axisMm, offset) => round1(axisMm - offset - BRACE_MM);
  function getFrameDimensions(details) {
    const d = details || {};
    let widthMm = Number(d.insectWidthMm);
    let heightMm = Number(d.insectHeightMm);
    if (!(widthMm > 0 && heightMm > 0)) return { widthMm: null, heightMm: null };
    if (d.insectSubtype === 'Spannrahmen') {
      const outside = /^(außenliegend|aussenliegend)$/i.test(String(d.spannPosition || ''));
      const inside = /^innenliegend$/i.test(String(d.spannPosition || ''));
      const spring = /^ja$/i.test(String(d.spannFederstifte || ''));
      if (!outside && !inside && !spring) return { widthMm: null, heightMm: null };
      widthMm += outside ? 36 : (spring ? 0 : -4);
      heightMm += outside ? 40 : (spring ? 0 : -4);
      if (spring) { widthMm -= 6; heightMm -= 6; }
    }
    return { widthMm, heightMm };
  }

  function calculateLayout(input) {
    const src = input || {};
    const widthMm = Number(src.widthMm);
    const heightMm = Number(src.heightMm);
    const orientation = src.orientation || 'horizontal';
    const axisMm = orientation === 'vertical' ? widthMm : heightMm;
    const crossMm = orientation === 'vertical' ? heightMm : widthMm;
    const errors = [];
    if (!['horizontal', 'vertical'].includes(orientation)) errors.push('Bitte eine Ausrichtung waehlen.');
    if (![widthMm, heightMm].every(n => Number.isFinite(n) && n > 2 * FRAME_MM && n <= 5000)) {
      errors.push('Fertige Rahmenmasse muessen groesser als 70 mm und hoechstens 5000 mm sein.');
    }
    const minimumCount = Number.isFinite(axisMm) && axisMm > 0 ? Math.max(0, Math.ceil(axisMm / MAX_GAP_MM) - 1) : 0;
    const maximumCount = Number.isFinite(axisMm) ? Math.max(0, Math.min(10, Math.floor((axisMm - 2 * FRAME_MM - MIN_GAP_MM) / (MIN_GAP_MM + BRACE_MM)))) : 0;
    const count = src.count === undefined ? (Array.isArray(src.positions) ? src.positions.length : minimumCount) : Number(src.count);
    const validCount = Number.isInteger(count) && count >= 0 && count <= 10;
    if (!validCount || count < minimumCount || count > maximumCount) errors.push('Stabi-Anzahl passt nicht zu den Rahmenmassen und Abstaenden.');
    const positions = Array.isArray(src.positions) ? src.positions.map(Number) : [];
    if (src.positions === undefined && validCount) {
      const gap = (axisMm - 2 * FRAME_MM - count * BRACE_MM) / (count + 1);
      for (let i = 0; i < count; i += 1) positions.push(round1(FRAME_MM + gap + i * (gap + BRACE_MM)));
    }
    if (!Array.isArray(src.positions) && src.positions !== undefined) errors.push('Stabi-Positionen sind ungueltig.');
    if (positions.length !== count) errors.push('Fuer jeden Stabi muss eine Position angegeben sein.');
    if (positions.some(n => !Number.isFinite(n))) errors.push('Stabi-Masse muessen Zahlen sein.');
    const gaps = [];
    let previous = FRAME_MM;
    for (const position of positions) {
      gaps.push({ mm: round1(position - previous) });
      previous = position + BRACE_MM;
    }
    gaps.push({ mm: round1(axisMm - FRAME_MM - previous) });
    gaps.forEach((gap, index) => {
      gap.valid = Number.isFinite(gap.mm) && gap.mm <= MAX_GAP_MM && (count === 0 || gap.mm >= MIN_GAP_MM);
      if (!gap.valid) errors.push('Abstand ' + (index + 1) + ': ' + gap.mm + ' mm; erlaubt sind 450 bis 1250 mm zwischen den Profilkanten.');
    });
    return { widthMm, heightMm, orientation, axisMm, crossMm, count, minimumCount, maximumCount,
      positions, oppositePositions: positions.map(p => oppositeOffset(axisMm, p)), gaps,
      valid: errors.length === 0, errors, cutMm: round1(crossMm - 2 * FRAME_MM) };
  }

  function fromDetails(details) {
    if (!details || !details.stabilization) return null;
    const config = details.stabilization;
    if (config.version !== 1 || !['horizontal', 'vertical'].includes(config.orientation)
        || !Number.isInteger(config.count) || !Array.isArray(config.positions)
        || config.positions.some(p => typeof p !== 'number' || !Number.isFinite(p))) {
      const err = new Error('Stabi-Plan unvollstaendig oder ungueltig. Bitte Positionen erneut pruefen.');
      err.status = 400;
      throw err;
    }
    const layout = calculateLayout({ ...config, ...getFrameDimensions(details) });
    if (!layout.valid) {
      const err = new Error(layout.errors.join(' '));
      err.status = 400;
      throw err;
    }
    return layout;
  }
  const formatMm = n => round1(n).toFixed(1).replace(/\.0$/, '');
  function header(layout) {
    if (!layout) return '';
    return 'Stabis ' + (layout.orientation === 'vertical' ? 'V' : 'H') + ': '
      + (layout.positions.length ? layout.positions.map(formatMm).join('/') : 'keine')
      + ' mm ab ' + (layout.orientation === 'vertical' ? 'Linkskante' : 'Unterkante');
  }
  function parseHeader(text) {
    const match = /Stabis ([HV]): (keine|[\d./]+) mm ab (?:Linkskante|Unterkante)/.exec(String(text || ''));
    if (!match) return null;
    const positions = match[2] === 'keine' ? [] : match[2].split('/').map(Number);
    return { version: 1, orientation: match[1] === 'V' ? 'vertical' : 'horizontal', count: positions.length, positions };
  }
  function productionLines(layout, includeCut = true) {
    if (!layout || !layout.count) return [];
    const vertical = layout.orientation === 'vertical';
    return layout.positions.map((position, index) => {
      const edges = vertical ? 'Rahmen-Linkskante bis Stabi-Linkskante' : 'Rahmen-Unterkante bis Stabi-Unterkante';
      const opposite = vertical ? 'Rahmen-Rechtskante bis Stabi-Rechtskante' : 'Rahmen-Oberkante bis Stabi-Oberkante';
      return 'Stabilisierungsprofil (Profilsäge): ' + (includeCut ? '1 x ' + formatMm(layout.cutMm) + ' mm, ' : '')
        + 'Stabi ' + (index + 1) + '/' + layout.count + ' ' + (vertical ? 'vertikal' : 'horizontal')
        + ', ' + edges + ': ' + formatMm(position) + ' mm; ' + opposite + ': '
        + formatMm(layout.oppositePositions[index]) + ' mm';
    });
  }
  return { FRAME_MM, BRACE_MM, MIN_GAP_MM, MAX_GAP_MM, round1, oppositeOffset,
    getFrameDimensions, calculateLayout, fromDetails, header, parseHeader, productionLines };
});
