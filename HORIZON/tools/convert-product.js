/*
 * convert-product.js
 *
 * Usage:
 *   node tools/convert-product.js path/to/product.json
 *
 * This script reads a Shopify product JSON (storefront `.js` or admin export) and
 * emits an Easify-style mock fixture at `.vscode/easify-mock.json`.
 *
 * Drop a product JSON file (e.g. https://yourstore.myshopify.com/products/<handle>.js) into the workspace
 * and run the script from PowerShell.
 */

const fs = require('fs');
const path = require('path');

function usage() {
  console.log('Usage: node tools/convert-product.js <product-json-path>');
  process.exit(1);
}

if (process.argv.length < 3) usage();

const inputPath = process.argv[2];
if (!fs.existsSync(inputPath)) {
  console.error('File not found:', inputPath);
  process.exit(2);
}

let raw;
try {
  raw = fs.readFileSync(inputPath, 'utf8');
} catch (err) {
  console.error('Error reading file:', err.message);
  process.exit(3);
}

let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  console.error('Invalid JSON:', err.message);
  process.exit(4);
}

// Support both storefront product JSON (object) and admin export (array/obj)
const product = Array.isArray(data) ? data[0] : (data.product || data.products?.[0]) || data;
if (!product || !product.variants) {
  console.error('Could not locate product structure in provided JSON.');
  process.exit(5);
}

// Pick first available variant as example
const variant = product.variants && product.variants.length ? product.variants[0] : null;

// Try to detect a reasonable price per m2: if variant.price exists and product has a "per m2" metafield
let pricePerM2 = null;
if (variant && variant.price) {
  // variant.price may be a string (e.g. "19.99") or integer cents depending on source
  const p = Number(variant.price);
  pricePerM2 = isFinite(p) && p > 0 ? p : null;
}

// Fallback to a guess if nothing found
if (!pricePerM2) pricePerM2 = 50; // default example

// Build a properties object from product options (best-effort)
const properties = {};
if (product.options && product.options.length) {
  product.options.forEach((opt, idx) => {
    properties[opt.name || `Option${idx+1}`] = opt.values ? opt.values[0] : '';
  });
}

// Example measurement defaults (you will replace these with real Easify measurements)
const defaultWidth = 2000; // mm
const defaultHeight = 1500; // mm

const fixture = {
  easify: {
    product_id: product.id || product.handle || 'mock_product_id',
    title: product.title || 'Mock Product',
    variant_selections: properties,
    measurements: {
      width_mm: defaultWidth,
      height_mm: defaultHeight,
      area_m2: (defaultWidth * defaultHeight) / 1e6
    },
    pricing: {
      base_price_per_m2: pricePerM2,
      total_price: (pricePerM2 * ((defaultWidth * defaultHeight) / 1e6)).toFixed(2)
    }
  },
  shopify_cart: {
    items: [
      {
        title: product.title || 'Mock Product',
        variant_id: variant ? variant.id : 'mock_variant_id',
        properties: properties,
        price: variant && variant.price ? variant.price : pricePerM2,
        quantity: 1
      }
    ]
  }
};

const outDir = path.join(process.cwd(), '.vscode');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'easify-mock.json');
fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2), 'utf8');
console.log('Wrote mock fixture to', outPath);
console.log('Open the file and update measurements/pricing as needed.');
