/**
 * test-easify-scenarios.js
 *
 * Validates all Easify mock scenarios against the 1m² minimum pricing logic.
 * Run: node tools/test-easify-scenarios.js
 */

const fs = require('fs');
const path = require('path');

// Load mock data
const mockPath = path.join(process.cwd(), '.vscode', 'easify-mock.json');
if (!fs.existsSync(mockPath)) {
  console.error('Mock file not found:', mockPath);
  process.exit(1);
}

const mockData = JSON.parse(fs.readFileSync(mockPath, 'utf8'));

// Minimum pricing calculation (mirrors sections/product-information.liquid logic)
function calculatePricingWithMinimum(width_mm, height_mm, price_per_m2) {
  const area_m2 = (width_mm * height_mm) / 1e6;
  const min_area_m2 = Math.max(area_m2, 1.0);
  const total_price = min_area_m2 * price_per_m2;
  const is_minimum_applied = area_m2 < 1.0;

  return {
    area_m2: parseFloat(area_m2.toFixed(4)),
    min_area_m2: parseFloat(min_area_m2.toFixed(4)),
    price_per_m2,
    total_price: parseFloat(total_price.toFixed(2)),
    is_minimum_applied
  };
}

// Test each scenario
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║          Easify Mock Scenarios - Pricing Validation        ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const scenarios = mockData.easify_scenarios || [];
let allPass = true;

scenarios.forEach((scenario, idx) => {
  console.log(`\n[Scenario ${idx + 1}] ${scenario.name}`);
  console.log(`Description: ${scenario.description}`);
  console.log(`Variant: ${scenario.variant.title}`);

  const { width_mm, height_mm, area_m2 } = scenario.measurements;
  const { price_per_m2, total_price } = scenario.pricing;

  // Calculate
  const result = calculatePricingWithMinimum(width_mm, height_mm, price_per_m2);

  // Verify
  const expectedMinimumApplied = area_m2 < 1.0;
  const match = result.is_minimum_applied === expectedMinimumApplied;
  const priceMatch = Math.abs(result.total_price - total_price) < 0.01;

  console.log(`\n  Measurements:  ${width_mm} mm × ${height_mm} mm`);
  console.log(`  Area (m²):     ${result.area_m2}`);
  console.log(`  Min Area (m²): ${result.min_area_m2}`);
  console.log(`  Price/m²:      €${price_per_m2.toFixed(2)}`);
  console.log(`  Total Price:   €${result.total_price.toFixed(2)}`);
  console.log(`  Min Applied:   ${result.is_minimum_applied ? '✓ YES' : '✗ NO'}`);

  if (!match || !priceMatch) {
    console.log(`\n  ❌ FAIL: Expected total €${total_price.toFixed(2)}, got €${result.total_price.toFixed(2)}`);
    allPass = false;
  } else {
    console.log(`\n  ✓ PASS`);
  }
  
  console.log(`  ${scenario.pricing.note || ''}`);
});

console.log('\n╔════════════════════════════════════════════════════════════╗');
if (allPass) {
  console.log('║                  ✓ All tests passed!                       ║');
} else {
  console.log('║                 ❌ Some tests failed.                      ║');
}
console.log('╚════════════════════════════════════════════════════════════╝\n');

process.exit(allPass ? 0 : 1);
