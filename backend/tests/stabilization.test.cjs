const test = require('node:test');
const assert = require('node:assert/strict');
const stabi = require('../src/stabilization');
const sp = require('../src/spb35');

test('automatic layouts respect dimensions and profile thickness in both orientations', () => {
  for (const orientation of ['horizontal', 'vertical']) {
    for (const [axis, count] of [[800, 0], [1250, 0], [1251, 1], [2500, 1], [2501, 2], [5000, 3]]) {
      const layout = stabi.calculateLayout({ widthMm: orientation === 'vertical' ? axis : 1000,
        heightMm: orientation === 'horizontal' ? axis : 1000, orientation });
      assert.equal(layout.count, count);
      assert.equal(layout.valid, true, layout.errors.join('; '));
      layout.positions.forEach((p, i) => assert.ok(Math.abs(p + layout.oppositePositions[i] + 34.2 - axis) < 0.11));
    }
  }
});

test('custom positions, minimum gaps, ordering and impossible counts are validated', () => {
  const calculate = positions => stabi.calculateLayout({ widthMm: 1000, heightMm: 5000, positions });
  assert.equal(calculate([1000, 2000, 3000]).valid, false);
  assert.equal(calculate([1000, 2000, 3000, 4000]).valid, true);
  assert.equal(calculate([1000, 900, 3000, 4000]).valid, false);
  assert.equal(calculate([100, 1500, 3000, 4000]).valid, false);
  assert.equal(calculate([1000, 2000, 3000, 4950]).valid, false);
  for (const count of [-1, 1.5, 100]) assert.equal(stabi.calculateLayout({ widthMm: 1000, heightMm: 5000, count }).valid, false);
  assert.equal(stabi.calculateLayout({ widthMm: 1000, heightMm: 5001 }).valid, false);
  assert.equal(stabi.calculateLayout({ widthMm: 1000, heightMm: 5000, orientation: 'both' }).valid, false);
  const exactMin = stabi.calculateLayout({ widthMm: 1000, heightMm: 1250, count: 1, positions: [485] });
  assert.equal(exactMin.valid, true);
  assert.equal(exactMin.gaps[0].mm, 450);
});

test('finished SP-B35 dimensions and legacy orders keep their existing calculation', () => {
  const details = { insectSubtype: 'Spannrahmen', insectWidthMm: 1000, insectHeightMm: 1500, spannPosition: 'innenliegend' };
  assert.deepEqual(stabi.getFrameDimensions(details), { widthMm: 996, heightMm: 1496 });
  assert.equal(sp.calculateSpB35(details).stabilizationCenterFromInnerEdgeMm, 713);
  assert.deepEqual(stabi.getFrameDimensions({ ...details, spannPosition: 'außenliegend', spannFederstifte: 'Ja' }), { widthMm: 1030, heightMm: 1534 });
});

test('hook groove follows the frame position in the work instruction', () => {
  const inside = sp.calculateSpB35({ insectSubtype: 'Spannrahmen', insectWidthMm: 1000, insectHeightMm: 1000, spannPosition: 'innenliegend' });
  const outside = sp.calculateSpB35({ insectSubtype: 'Spannrahmen', insectWidthMm: 1000, insectHeightMm: 1000, spannPosition: 'außenliegend' });
  assert.equal(inside.hookGroove, 'Außennut');
  assert.ok(inside.productionLines.includes('Haken in Außennut'));
  assert.equal(outside.hookGroove, 'Mittelnut');
  assert.ok(outside.productionLines.includes('Haken in Mittelnut'));
});

test('all positions, cuts and consumption survive production header round trips', () => {
  for (const orientation of ['horizontal', 'vertical']) {
    const details = { insectSubtype: 'Spannrahmen', insectWidthMm: 4900, insectHeightMm: 4900, spannPosition: 'innenliegend',
      stabilization: { version: 1, orientation, count: 4, positions: [1000, 2000, 3000, 4000] } };
    const calc = sp.calculateSpB35(details);
    assert.equal(calc.stabilizationLayout.count, 4);
    assert.equal(calc.consumption.find(p => p.label === 'Stabilisierungsprofil').qty, 4);
    assert.equal(calc.consumption.find(p => p.label === 'Verbinder für Stabilisierungsprofil').qty, 8);
    assert.equal(calc.productionLines.filter(l => l.startsWith('Stabilisierungsprofil')).length, 4);
    const restored = sp.parseSpB35InputsFromHeader(sp.rebuildPositionHeader(details, calc));
    assert.deepEqual(restored.stabilization, details.stabilization);
    assert.deepEqual(sp.calculateSpB35(restored).stabilizationLayout, calc.stabilizationLayout);
  }
});

test('zero braces persist, doors use entered dimensions, invalid layouts cannot enter production', () => {
  const d = { insectSubtype: 'Spannrahmen', insectWidthMm: 1000, insectHeightMm: 1000, spannPosition: 'innenliegend', stabilization: {version: 1, orientation:'horizontal', count:0, positions:[]} };
  const c = sp.calculateSpB35(d);
  assert.equal(c.needsStabilization, false);
  assert.ok(!c.consumption.some(p => p.label === 'Stabilisierungsprofil'));
  assert.equal(sp.parseSpB35InputsFromHeader(sp.rebuildPositionHeader(d,c)).stabilization.count, 0);
  assert.throws(() => sp.calculateSpB35({...d, insectHeightMm:4000}), e => e.status === 400);
  const doorAuto = stabi.calculateLayout({widthMm:1000,heightMm:2200,orientation:'horizontal'});
  const door = stabi.fromDetails({insectSubtype:'Tür',insectWidthMm:1000,insectHeightMm:2200,stabilization:{version:1,orientation:'horizontal',count:doorAuto.count,positions:doorAuto.positions}});
  assert.equal(door.heightMm, 2200);
  assert.equal(door.count, 1);
  assert.ok(stabi.productionLines(door,false)[0].includes('Rahmen-Unterkante bis Stabi-Unterkante'));
});

test('production and monitor parsing keep finished size, cut size and hook line together', () => {
  const text = [
    '1) Insektenschutz – SP-B 35, Spannrahmen, 955 x 1100 mm, Farbe: Sonderfarbe, Gaze: Standard, innenliegend, Hakenmaß X: 4 mm, Bürste zum Fenster',
    'Fertigmaß: 951 x 1096 mm',
    'Schnittmaß SP-B 35 (Gehrungssäge): 2 x 951 mm x 2 x 1096 mm',
    'Schlitten auf Hakenseite jeweils 2',
    'Haken in Außennut',
    'Bürste zum Fenster, 8 mm',
  ].join('\n');

  const blocks = sp.parsePositionBlocksFromText(text);
  assert.equal(blocks.length, 1);
  assert.ok(blocks[0].details.includes('Fertigmaß: 951 x 1096 mm'));
  assert.ok(blocks[0].details.includes('Schnittmaß SP-B 35 (Gehrungssäge): 2 x 951 mm x 2 x 1096 mm'));
  assert.ok(blocks[0].details.includes('Haken in Außennut'));

  const positions = sp.parseSpB35InputsFromHeader(blocks[0].headerText);
  const calc = sp.calculateSpB35(positions);
  assert.equal(calc.finishedSizeLabel, '951 x 1096 mm');
  assert.equal(calc.hookGroove, 'Außennut');
  assert.ok(calc.productionLines.includes('Fertigmaß: 951 x 1096 mm'));
});
