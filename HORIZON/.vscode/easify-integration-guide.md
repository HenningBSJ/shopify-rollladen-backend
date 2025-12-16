# Easify Integration Testing Guide

## Quick Start: Transfer Easify Data to VSCode

### 1. Extract Live Easify Data (in Browser)

**Option A: Quick Inspector**
```javascript
// Open DevTools console on your Shopify product page with Easify
// Paste this:

EasifyDebugger.inspectCart()
// Logs all Easify selections, cart data, form fields

// Then copy a mock fixture:
EasifyDebugger.exportMockData()
// Copies JSON to clipboard → paste into a file
```

**Option B: Advanced Diagnostics (for troubleshooting)**
```javascript
// If pricing doesn't work correctly, use the advanced debugger:

EasifyAdvancedDebugger.diagnose()
// Shows:
// - Easify app status (loaded? window.Easify defined?)
// - Product data & variants
// - Variant selection (which variant is selected?)
// - Measurement inputs (width/height values)
// - Price calculation & display
// - HORIZON minimum pricing script status
// - Shopify cart contents

// Simulate a measurement to trigger calculation:
EasifyAdvancedDebugger.simulateMeasurementInput(600, 500)
// Sets width=600mm, height=500mm and fires events
// Check console for calculated price after 1 second
```

### 2. Save Mock Data Locally
```bash
# In VSCode, create a test fixture:
.vscode/easify-mock.json
```

**Example mock data structure:**
```json
{
  "easify": {
    "product_id": "7234567890123",
    "variant_selections": {
      "material": "Stoff Grau",
      "profile": "Kassette weiß",
      "color": "Weiß"
    },
    "measurements": {
      "width_mm": 2000,
      "height_mm": 1500,
      "area_m2": 3.0
    },
    "pricing": {
      "base_price_per_m2": 45.50,
      "total_price": 136.50
    }
  },
  "shopify_cart": {
    "items": [
      {
        "title": "Custom Roller Blind",
        "variant_id": "12345678901234",
        "properties": {
          "Material": "Stoff Grau",
          "Profile": "Kassette weiß",
          "Color": "Weiß",
          "Width": "2000",
          "Height": "1500",
          "Area_m2": "3.0"
        },
        "price": 13650,
        "quantity": 1
      }
    ]
  }
}
```

### 3. Test Minimum Pricing Locally

**Create a test file:** `.vscode/test-minimum-pricing.js`

```javascript
// Test the 1 m² minimum pricing logic

const easifyMockData = {
  cases: [
    { width_mm: 2000, height_mm: 1000, price_per_m2: 50, desc: "Normal (2 m²)" },
    { width_mm: 1000, height_mm: 500, price_per_m2: 50, desc: "Below minimum (0.5 m²)" },
    { width_mm: 1000, height_mm: 1000, price_per_m2: 50, desc: "Exactly 1 m²" },
    { width_mm: 500, height_mm: 400, price_per_m2: 100, desc: "Very small (0.2 m²)" }
  ]
};

easifyMockData.cases.forEach(test => {
  const result = EasifyDebugger.calculatePrice(
    test.width_mm,
    test.height_mm,
    test.price_per_m2
  );
  console.log(`${test.desc}:`, result);
});

// Output should show:
// ✓ Normal (2 m²): { area_m2: 2.0, min_area_m2: 2.0, total_price: 100.00, is_minimum_applied: false }
// ✓ Below minimum (0.5 m²): { area_m2: 0.5, min_area_m2: 1.0, total_price: 50.00, is_minimum_applied: true }
// ✓ Exactly 1 m²: { area_m2: 1.0, min_area_m2: 1.0, total_price: 50.00, is_minimum_applied: false }
// ✓ Very small (0.2 m²): { area_m2: 0.2, min_area_m2: 1.0, total_price: 100.00, is_minimum_applied: true }
```

### 4. Debug Theme Changes

**Workflow:**
1. **Make a change** to `sections/product-information.liquid` or the minimum pricing script
2. **Push to Shopify** theme (or use `shopify theme serve`)
3. **Test on live product** page with Easify
4. **Inspect** using `EasifyDebugger.inspectCart()`
5. **Compare** actual price vs. expected price
6. **Export** new mock data if pricing changes

### 5. Key Integration Points

| Component | Location | Purpose |
|-----------|----------|---------|
| Easify App | `blocks/_product-details.liquid` | Handles material/profile/color selection |
| Min Price Script | `sections/product-information.liquid` (lines 285-560) | Enforces 1 m² floor pricing |
| Debugger Utility | `assets/easify-debugger.js` | Inspects & extracts Easify data for testing |
| Mock Data | `.vscode/easify-mock.json` | Offline test fixture |

### 6. Troubleshooting

**Problem:** Easify data not appearing in console  
→ Verify Easify app is installed on your Shopify store  
→ Check `blocks/_product-details.liquid` has `@app` block

**Problem:** Price showing as 0 or undefined  
→ Check if Easify has calculated the price yet (may be async)  
→ Verify width/height inputs have valid values  
→ Check currency is set correctly in Shopify

**Problem:** Minimum pricing not activating (area < 1 m²)  
→ Verify the mutation observer is running: check browser DevTools console for errors  
→ Ensure width/height inputs match the regex patterns: `breite|höhe|width|height` (case-insensitive)

---

## Next Steps

1. ✅ Pull live Easify data using `EasifyDebugger.inspectCart()`
2. ✅ Create `.vscode/easify-mock.json` with real test cases
3. ✅ Test theme changes against mock data locally
4. ✅ Document findings in `.github/copilot-instructions.md`
5. ✅ When ready, merge changes to production theme
