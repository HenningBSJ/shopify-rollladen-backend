/**
 * easify-advanced-debugger.js
 *
 * Advanced diagnostics for Easify integration on product pages.
 * Run in browser DevTools console to diagnose pricing issues.
 *
 * Usage:
 *   1. Open DevTools Console on product page
 *   2. Run: EasifyAdvancedDebugger.diagnose()
 */
// @ts-nocheck

// Browser-only debugger for Easify diagnostics
if (typeof window !== 'undefined') {
  window.EasifyAdvancedDebugger = {
  /**
   * Full diagnostic report
   */
  diagnose() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║           EASIFY ADVANCED DIAGNOSTICS                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    this.checkEasifyApp();
    this.checkProductData();
    this.checkVariantSelection();
    this.checkMeasurementInputs();
    this.checkPriceCalculation();
    this.checkHorizonScript();
    this.checkCartData();
  },

  /**
   * Check if Easify app is loaded
   */
  checkEasifyApp() {
    console.log('[1] EASIFY APP STATUS');
    const easifyScript = document.querySelector('script[src*="easify"]');
    const easifyFrame = document.querySelector('iframe[id*="easify"]');
    const easifyDiv = document.querySelector('[data-easify], [id*="easify"], [class*="easify"]');

    console.log(`  Script loaded: ${easifyScript ? '✓ YES' : '✗ NO'}`);
    console.log(`  iFrame found: ${easifyFrame ? '✓ YES' : '✗ NO'}`);
    console.log(`  DOM element: ${easifyDiv ? '✓ YES' : '✗ NO'}`);

    if (window.Easify) {
      console.log(`  window.Easify: ✓ Defined`);
      console.log(`    Keys:`, Object.keys(window.Easify));
    } else {
      console.log(`  window.Easify: ✗ NOT DEFINED`);
    }
  },

  /**
   * Check product data
   */
  checkProductData() {
    console.log('\n[2] PRODUCT DATA');
    if (window.Shopify && window.Shopify.product) {
      const prod = window.Shopify.product;
      console.log(`  Product ID: ${prod.id}`);
      console.log(`  Title: ${prod.title}`);
      console.log(`  Variants: ${prod.variants ? prod.variants.length : '?'}`);
      if (prod.variants && prod.variants.length > 0) {
        const v = prod.variants[0];
        console.log(`  First variant: ${v.title} (ID: ${v.id}, Price: ${v.price})`);
      }
    } else {
      console.log(`  ✗ window.Shopify.product not found`);
    }
  },

  /**
   * Check variant selection
   */
  checkVariantSelection() {
    console.log('\n[3] VARIANT SELECTION');
    const selectors = [
      'select[name="id"]',
      'input[type="radio"][name="id"]:checked',
      '[data-variant-id]',
      '[data-selected-variant]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const val = el.value || el.dataset.variantId || el.dataset.selectedVariant;
        console.log(`  Found via ${sel}: ${val}`);
      }
    }

    // Check Easify option dropdowns
    const easifySelects = document.querySelectorAll('select[data-easify], select[class*="easify"]');
    if (easifySelects.length > 0) {
      console.log(`\n  Easify option selectors (${easifySelects.length}):`);
      easifySelects.forEach((sel, i) => {
        console.log(`    [${i}] ${sel.name || sel.id}: "${sel.value}"`);
      });
    }
  },

  /**
   * Check measurement inputs
   */
  checkMeasurementInputs() {
    console.log('\n[4] MEASUREMENT INPUTS');
    const patterns = [
      { name: 'breite', regex: /breite|width/i },
      { name: 'höhe', regex: /höhe|hoehe|height/i },
      { name: 'area', regex: /fläche|area|m2|m²/i }
    ];

    for (const p of patterns) {
      const inputs = document.querySelectorAll(`input[name*="${p.name}"], input[id*="${p.name}"]`);
      if (inputs.length > 0) {
        console.log(`  ${p.name.toUpperCase()}:`);
        inputs.forEach(inp => {
          console.log(`    ID: ${inp.id || 'none'}, Name: ${inp.name || 'none'}, Value: ${inp.value}`);
        });
      }
    }

    // Regex search for width/height
    const allInputs = document.querySelectorAll('input[type="text"], input[type="number"]');
    console.log(`\n  All text/number inputs (${allInputs.length}):`);
    allInputs.forEach((inp, i) => {
      if (inp.value) {
        console.log(`    [${i}] ${inp.name || inp.id}: "${inp.value}"`);
      }
    });
  },

  /**
   * Check price calculation
   */
  checkPriceCalculation() {
    console.log('\n[5] PRICE DISPLAY & CALCULATION');
    const priceSelectors = [
      '.price',
      '[data-price]',
      '.price__regular',
      '.price__sale',
      '.product__price',
      '[data-testid="price"]',
      '.money'
    ];

    for (const sel of priceSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent) {
        console.log(`  ${sel}: "${el.textContent.trim()}"`);
      }
    }

    // Check for minimum price display
    const minPriceBox = document.querySelector('#minprice-wrap, .minprice__wrap');
    if (minPriceBox) {
      console.log(`\n  Minimum price box: ✓ FOUND`);
      console.log(`    Visible: ${minPriceBox.offsetParent !== null ? '✓ YES' : '✗ NO'}`);
      console.log(`    Content: ${minPriceBox.textContent.trim()}`);
    } else {
      console.log(`\n  Minimum price box: ✗ NOT FOUND`);
    }

    // Check data attributes
    const productInfo = document.querySelector('.product-information');
    if (productInfo) {
      console.log(`\n  product-information element: ✓ FOUND`);
      console.log(`    data-minprice: ${productInfo.dataset.minprice || 'not set'}`);
      console.log(`    data-minpriceInit: ${productInfo.dataset.minpriceInit || 'not set'}`);
    }
  },

  /**
   * Check if HORIZON minimum pricing script is running
   */
  checkHorizonScript() {
    console.log('\n[6] HORIZON MINIMUM PRICING SCRIPT');
    const productInfo = document.querySelector('.product-information');
    if (!productInfo) {
      console.log(`  ✗ .product-information not found`);
      return;
    }

    if (productInfo.dataset.minpriceInit === '1') {
      console.log(`  ✓ Script initialized (data-minpriceInit='1')`);
    } else {
      console.log(`  ✗ Script NOT initialized`);
    }

    const templates = [
      { id: 'tpl-min-area-note', name: 'Min area warning' },
      { id: 'tpl-minprice-box', name: 'Min price box' }
    ];

    for (const tpl of templates) {
      const el = document.getElementById(tpl.id);
      console.log(`  ${tpl.name} template: ${el ? '✓ EXISTS' : '✗ MISSING'}`);
    }
  },

  /**
   * Check cart data
   */
  checkCartData() {
    console.log('\n[7] SHOPIFY CART');
    if (window.Shopify && window.Shopify.cart) {
      const items = window.Shopify.cart.items || [];
      console.log(`  Items in cart: ${items.length}`);
      items.forEach((item, i) => {
        console.log(`\n    [${i}] ${item.title}`);
        console.log(`      Variant ID: ${item.variant_id}`);
        console.log(`      Price: ${item.price}`);
        console.log(`      Properties:`, item.properties || {});
      });
    } else {
      console.log(`  ✗ window.Shopify.cart not found`);
    }
  },

  /**
   * Simulate measurement input to trigger calculation
   */
  simulateMeasurementInput(width_mm, height_mm) {
    console.log(`\n[TEST] Simulating measurement input: ${width_mm}mm × ${height_mm}mm`);
    
    const widthInput = document.querySelector('input[name*="breite"], input[name*="width"]');
    const heightInput = document.querySelector('input[name*="höhe"], input[name*="hoehe"], input[name*="height"]');

    if (widthInput) {
      widthInput.value = width_mm;
      widthInput.dispatchEvent(new Event('input', { bubbles: true }));
      widthInput.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`  ✓ Set width to ${width_mm}mm`);
    } else {
      console.log(`  ✗ Width input not found`);
    }

    if (heightInput) {
      heightInput.value = height_mm;
      heightInput.dispatchEvent(new Event('input', { bubbles: true }));
      heightInput.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`  ✓ Set height to ${height_mm}mm`);
    } else {
      console.log(`  ✗ Height input not found`);
    }

    // Wait and check result
    setTimeout(() => {
      console.log('\n[TEST RESULT] After 1 second:');
      const priceEl = document.querySelector('.price, [data-testid="price"]');
      const minBox = document.querySelector('#minprice-wrap');
      if (priceEl) console.log(`  Price displayed: ${priceEl.textContent.trim()}`);
      if (minBox) console.log(`  Min price box: ${minBox.textContent.trim()}`);
    }, 1000);
  }
  };

  console.log('✓ EasifyAdvancedDebugger loaded');
  console.log('Run: EasifyAdvancedDebugger.diagnose()');
}
