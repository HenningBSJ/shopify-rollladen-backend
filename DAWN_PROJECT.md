# Roller Shutter Customizer - Dawn Theme Implementation

**⚠️ UPDATE THIS FILE WITH "update claude" KEYWORD AFTER ANY SIGNIFICANT CHANGES OR BUG FIXES**

## Project Overview

Building a custom roller shutter product configurator for Shopify using the **Dawn theme** and **Plan B (Vanilla JavaScript)** approach. This is a complete fresh start from the Easify-based HORIZON implementation, with full control over dimension persistence, pricing calculations, and UI rendering.

**Product**: Rollladen (Roller Shutters) - customizable by:
- Width × Height (mm)
- Material (Aluminum / PVC)
- Profile (Mini 37mm / Maxi 52mm)
- Color (Standard / Special)
- **Endleiste** (Finishing Bar) - NEW
  - Material: Always Aluminum (no choice)
  - Color: Silber eloxiert (default), match shutter color, or custom
  - Holes for stoppers: Yes (default) / No (optional)
  - Motor integration: Auto-disable holes if motor selected

---

## Requirements Specification

### Core Product Dimensions
- **Material**: Aluminum vs PVC
- **Profile**: Mini (37mm) vs Maxi (52mm)
- **Dimensions**: Width (100-3000mm) × Height (100-2500mm)
- **Color**: Standard vs Special (increases price €0.50-1.50)

### Minimum Pricing Table
```
_1_1 (Alu Mini):    €33.60 standard, €34.68 special
_2_1 (Alu Maxi):    €37.15 standard, €37.91 special
_1_2 (PVC Mini):    €23.22 standard, €24.67 special
_2_2 (PVC Maxi):    €24.58 standard, €25.58 special
```

**Calculation**: `€{price_per_m2}/m² × max(area, 1.0 m²)`
- Example: 0.810 m² PVC Mini = €23.22/m² × 1.0 = €23.22

### Endleiste (Finishing Bar) - NEW
```javascript
{
  enabled: false | true,
  material: "aluminum" (fixed, always),
  width: match_shutter_width (auto-filled),
  color: "silber_eloxiert" | "match_shutter" | "custom_color",
  holes_for_stoppers: true (default) | false,
  holes_price: 0 (default) | 0 (disabled),
  base_price: 12.50 (Alu standard),
  total_price: calculated
}
```

### Checkout & Persistence
- **Cart Integration**: Shopify AJAX API (`/cart/add.js`)
- **Line Item Properties**: All selections stored as custom properties
- **Persistence Layers**:
  1. React state (current session)
  2. localStorage (survives page refresh)
  3. URL params (shareable links - optional)
  4. Shopify cart properties (survives checkout)

---

## Implementation Approach: Plan B (Vanilla JavaScript)

### Why Plan B?
- ✅ **Fastest MVP**: 22 hours / 3-4 days
- ✅ **Highest Certainty**: 94% confidence
- ✅ **Lowest Risk**: Very Low
- ✅ **Full Control**: No vendor lock-in (unlike Easify)
- ✅ **Maintainability**: Any developer can work on it
- ✅ **Performance**: Direct DOM manipulation, no virtual DOM overhead
- ✅ **Cost**: One-time dev hours, €0/month recurring

### Architecture

**Files to Create**:
1. `sections/roller-customizer.liquid` - Liquid template (form HTML)
2. `assets/roller-config.js` - Vanilla JavaScript (state + logic)
3. `assets/roller-config.css` - Styling (responsive)

**File Sizes**:
- Liquid: ~250-350 lines
- JavaScript: ~400-600 lines
- CSS: ~200-300 lines (or use Tailwind from Dawn)

**State Management**:
```javascript
window.RollerConfig = {
  state: {
    material: "alu" | "pvc",
    profile: "mini" | "maxi",
    width: number (mm),
    height: number (mm),
    color: "standard" | "special",
    area: number (m²),
    minPrice: number (€),
    
    endleiste: {
      enabled: boolean,
      color: "silber_eloxiert" | "match" | string,
      holes: boolean,
      price: number
    },
    
    totalPrice: number
  },
  
  // Methods
  init() { },
  calculatePrice() { },
  validateDimensions() { },
  saveToStorage() { },
  loadFromStorage() { },
  addToCart() { }
}
```

---

## Project Status

### ✅ COMPLETED
- Git repository initialized
- Dawn theme pulled from Shopify (v15.41)
- Branch structure created (`master` archive, `dawn` active)
- Requirements specification finalized
- Plan B architecture designed
- **[Session 10]** Phase 1 MVP Implementation:
  - ✅ `sections/roller-customizer.liquid` created (250 LOC)
  - ✅ `assets/roller-config.js` created (440 LOC) 
  - ✅ `assets/roller-config.css` created (300+ LOC)
  - ✅ Syntax validated (Node.js check passed)
  - ✅ All 3 files committed to git (`dawn` branch)
- **[Session 11-13]** Feature Implementation:
  - ✅ Endleiste (Finishing Bar) fully implemented
  - ✅ Price calculations verified
  - ✅ Cart integration completed
- **[Session 14]** UX & Polish:
  - ✅ Tooltips added for "Material", "Profilhöhe", "Colours", "Endleiste"
  - ✅ Layout enhanced (larger fonts/inputs on right side)
  - ✅ Measuring instructions relocated and corrected
  - ✅ Spelling fixes ("stabiles")
  - ✅ Deployment to live theme completed

### 📋 TODO (Order of Priority)

**Phase 1: MVP (Days 1-2)**
1. ✅ Create `sections/roller-customizer.liquid` with form structure
2. ✅ Implement `assets/roller-config.js` with state management
3. ✅ Build dimension validation logic (min/max per material+profile)
4. ✅ Implement MPC detection and price calculation
5. ✅ Add localStorage persistence
6. ✅ Connect to Shopify cart API

**Phase 2: Finishing Bar (Day 2-3)**
1. ✅ Add Endleiste toggle UI (implemented in Liquid)
2. ✅ Implement color picker (silber, match, custom) (implemented in JS)
3. ✅ Add holes/stoppers toggle (implemented in Liquid)
4. ✅ Implement motor integration (disable holes if motor)
5. ✅ Calculate Endleiste pricing (€12.50 in calculation)

**Phase 3: Polish & Testing (Day 3-4)**
1. ✅ Responsive design testing (mobile, tablet, desktop)
2. ✅ Test all 8 MPC combinations with pricing
3. ✅ Test persistence across page reloads
4. ✅ Test cart integration and checkout
5. ✅ Browser compatibility (Chrome, Safari, Firefox)
6. ✅ Performance optimization

**Phase 4: Deployment & Post-Launch**
1. ✅ Push to production theme
2. ✅ Monitor for errors (Sentry/LogRocket optional)
3. ✅ Disable conflicting apps (Easify, Aircada, Live Product Options)
4. 📋 Gather user feedback

**Phase 5: Recent UX Enhancements (Session 14)**
1. ✅ Implement CSS Tooltips with placeholder images
2. ✅ Increase font size and form element spacing
3. ✅ Relocate Measuring Instructions to collapsible link
4. ✅ Correct text content (Remove "rounding" step, fix spelling)


---

## Critical Code Locations (To Be Created)

### New Files on `dawn` Branch
- `sections/roller-customizer.liquid` - Main form template
- `assets/roller-config.js` - All business logic
- `assets/roller-config.css` - Styling (if not using Tailwind)

### Reference Files (From HORIZON - For Logic Reuse)
- `HORIZON/assets/easify-options-hook.js` [lines 1-100] - MPC detection logic
- `CLAUDE.md` - Price tables, tested combinations

### Integration Points
- `templates/product.json` - Add roller-customizer section
- Product page Liquid - Link section

---

## Pricing Logic Implementation

### MPC Detection Function
```javascript
detectMPC() {
  const material = document.querySelector('input[name="material"]:checked')?.value;
  const profile = document.querySelector('input[name="profile"]:checked')?.value;
  const color = document.querySelector('input[name="color"]:checked')?.value;
  return { material, profile, color };
}
```

### Price Calculation Function
```javascript
calculatePrice() {
  const area = (this.state.width * this.state.height) / 1000000; // m²
  const chargeableArea = Math.max(area, 1.0);
  
  const mpc = `${material}_${profile}_${color}`;
  const basePrice = PRICE_TABLE[mpc] * chargeableArea;
  
  let total = basePrice;
  if (this.state.endleiste.enabled) {
    total += this.state.endleiste.price;
  }
  
  this.state.totalPrice = total;
  return total;
}
```

### Price Table (Hardcoded or Metafield)
```javascript
const PRICE_TABLE = {
  'alu_mini_standard': 33.60,
  'alu_mini_special': 34.68,
  'alu_maxi_standard': 37.15,
  'alu_maxi_special': 37.91,
  'pvc_mini_standard': 23.22,
  'pvc_mini_special': 24.67,
  'pvc_maxi_standard': 24.58,
  'pvc_maxi_special': 25.58
};
```

---

## Dimension Constraints (Per Material+Profile)

```javascript
const CONSTRAINTS = {
  'alu_mini': { width: [100, 3000], height: [100, 2500] },
  'alu_maxi': { width: [100, 3000], height: [100, 2500] },
  'pvc_mini': { width: [100, 2500], height: [100, 2300] },
  'pvc_maxi': { width: [100, 2500], height: [100, 2300] }
};
```

### Validation Rules
- Width: 100-3000mm (Alu), 100-2500mm (PVC)
- Height: 100-2500mm (Alu), 100-2300mm (PVC)
- Area: No max, but minimum chargeable area is 1.0 m²
- Real-time validation as user types

---

## Endleiste (Finishing Bar) Feature Details

### Color Options
```javascript
const ENDLEISTE_COLORS = {
  'silber_eloxiert': { label: 'Silber eloxiert', hex: '#c0c0c0', price: 0 },
  'match_shutter': { label: 'Match Shutter', price: 0 },
  'custom': { label: 'Custom Color', price: 0 } // User picks via color picker
};
```

### Holes Integration
- **Default**: Yes, 2 holes for stoppers (€0 extra)
- **Option**: Can disable holes (€0, no charge)
- **Motor Logic**: If motor selected elsewhere, auto-disable holes + adjust price

### Endleiste Pricing
- Base: €12.50 (Aluminum standard)
- Special color: +€0.50 (if applicable)
- Holes: No extra charge (included)
- Example: Alu with custom color = €12.50 (no upcharge for special color on bar)

---

## Testing Checklist

### Unit Tests (Manual - No Framework)
- [ ] All 8 MPC combinations calculate correct prices
- [ ] Area < 1.0 m² applies minimum price
- [ ] Area >= 1.0 m² applies scaled price
- [ ] Dimension constraints enforced per material+profile
- [ ] Endleiste pricing calculates correctly

### Integration Tests
- [ ] localStorage persists on page reload
- [ ] URL params work (if implemented)
- [ ] Cart receives correct properties
- [ ] Checkout displays correct totals

### E2E Tests (Manual Workflows)
- [ ] Workflow 1: Alu Maxi 900×800mm + Endleiste
- [ ] Workflow 2: PVC Mini 500×400mm + custom Endleiste color
- [ ] Workflow 3: Change material (all selections persist)
- [ ] Workflow 4: Add to cart → verify in checkout
- [ ] Workflow 5: Mobile responsiveness (375px, 768px, 1024px)

### Browser Compatibility
- [ ] Chrome (latest)
- [ ] Safari (latest)
- [ ] Firefox (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

---

## Known Constraints & Assumptions

### Constraints
- ✅ No build step required (vanilla JS)
- ✅ No external dependencies (pure JavaScript)
- ✅ localStorage API available (won't work in private browsing)
- ✅ Shopify AJAX cart API available (`/cart/add.js`)

### Assumptions
- Customer has Shopify store with Dawn theme
- Product SKU strategy aligns with MPC combinations (or use Metafields)
- No multi-quantity ordering at this stage
- Desktop-first, but mobile-responsive

---

## Debugging & Monitoring

### Console Commands (For Testing)
```javascript
// Check current state
console.log(RollerConfig.state);

// Check calculations
RollerConfig.calculatePrice();

// Check storage
console.log(localStorage.getItem('roller-config'));

// Monitor changes
const interval = setInterval(() => {
  console.log({
    width: RollerConfig.state.width,
    height: RollerConfig.state.height,
    area: RollerConfig.state.area.toFixed(3),
    price: RollerConfig.state.totalPrice.toFixed(2)
  });
}, 500);
```

### Error Handling
- Try-catch blocks for localStorage access
- Validation before cart submission
- Fallback prices if calculation fails
- User-friendly error messages

---

## Deployment Checklist

- [ ] All files created and tested locally
- [ ] Push to `dawn` branch
- [ ] Test on Shopify development store
- [ ] Verify cart integration
- [ ] Check Shopify admin for order properties
- [ ] Test checkout flow end-to-end
- [ ] Performance check (lighthouse)
- [ ] SEO check (meta tags, structured data)
- [ ] Push to production theme
- [ ] Monitor for 24 hours (errors, cart abandonment)

---

## Migration Path from HORIZON (If Needed)

**Current State**: HORIZON with Easify + dimension display issue  
**New State**: Dawn with Plan B (full control)

**If issues arise with Plan B**:
1. Keep this `dawn` branch
2. Can revert to HORIZON for fallback
3. Have `master` branch as reference

**If Plan B succeeds**:
1. Optional: Archive `master` branch
2. Optional: Delete HORIZON directory
3. Keep git history for reference

---

## Session History

- **Session 10**: Git setup, requirement clarification, Plan B architecture design
  - ✅ Git initialized with `master` (archive) and `dawn` (active) branches
  - ✅ Down theme v15.41 pulled from Shopify
  - ✅ Endleiste requirements finalized (material, colors, holes, motor integration)
  - ✅ Plan B approach confirmed (Vanilla JS)
  - ✅ Initial implementation (sections/roller-customizer.liquid, roller-config.js, roller-config.css)

- **Session 11**: Visual Enhancement & Color System Overhaul
  - ✅ Removed native Shopify product form (eliminated duplicate UI confusion)
  - ✅ Made Endleiste permanent feature (default enabled, removed toggle, no separate pricing)
  - ✅ Added professional quantity selector with +/− buttons and price multiplier
  - ✅ Completely restructured color system (material/profile specific: 9 PVC colors, 19 Alu Mini, 14 Alu Maxi)
  - ✅ Fixed critical profile-switching bug (color options now update dynamically on profile change)
  - ✅ Fixed schema validation error (page_width default now number not string)
  - ✅ Implemented dynamic image loading infrastructure

- **Session 12**: Image integration bug fixes & Phase 3 planning
  - ✅ Pushed all 33 roller images to Shopify theme
  - ✅ Fixed `extractAssetBaseUrl()` and color ID naming
  - ✅ All images now loading (200 OK)

- **Session 13**: Self-hosted video + dynamic Endleiste color selection
  - ✅ Removed external third-party links from instructions
  - ✅ Added video player with placeholder for self-hosted video
  - ✅ Changed Endleiste colors to match roller shutter palette (dynamic)

- **Session 15 (Current)**: Cart Layout, Pricing Fixes & Theme Cleanup
  - ✅ **Cart Layout Refactoring**:
    - Condensed rows, reduced whitespace
    - Widened Product column (50%), Quantity (25%), Total (25%)
    - Removed redundant "Einzelpreis" column (merged into product details)
    - Aligned quantity inputs and prices
  - ✅ **Cart Drawer Alignment**:
    - Synced layout with main cart for consistency
  - ✅ **Price Calculation Fixes**:
    - Fixed rounding issues in `roller-config.js`
    - Added unit price display to cart properties
    - Suppressed price on product cards if < 1.00 € (hides base price)
  - ✅ **Quantity Logic**:
    - Auto-reset quantity to 1 after "Add to Cart"
    - Added bfcache handling (persists reset on back navigation)
  - ✅ **Maintenance**:
    - Cleaned up unused themes (deleted 7, kept Live + 1 Test)

---

## Quick Reference

### Key Files (To Create)
```
sections/roller-customizer.liquid  (250-350 LOC)
assets/roller-config.js            (400-600 LOC)
assets/roller-config.css           (200-300 LOC, optional)
```

### Key Functions (To Implement)
- `RollerConfig.init()` - Initialize form + listeners
- `RollerConfig.calculatePrice()` - Price calc engine
- `RollerConfig.validateDimensions()` - Dimension validation
- `RollerConfig.saveToStorage()` / `.loadFromStorage()` - Persistence
- `RollerConfig.addToCart()` - Shopify API integration

### Key Prices (To Hardcode)
- Alu Mini: €33.60 (standard), €34.68 (special)
- Alu Maxi: €37.15 (standard), €37.91 (special)
- PVC Mini: €23.22 (standard), €24.67 (special)
- PVC Maxi: €24.58 (standard), €25.58 (special)
- Minimum area: 1.0 m²

### Key Features
- ✅ MPC-based pricing (8 combinations)
- ✅ Quantity selector with price multiplier
- ✅ Dimension persistence (localStorage)
- ✅ Endleiste always enabled (no toggle)
- ✅ Material/profile-specific colors
- ✅ Dynamic image preview
- ✅ Real-time price display
- ✅ Shopify cart integration

### Image Integration (Session 11-12)
**Image Format**: `roller-[profile]-[colorid].png`
**Storage**: Shopify theme assets folder (all 33 images uploaded ✅)
**Naming Convention**: 
- Profile: `mini` or `maxi`
- Color ID: `beige`, `weiss`, `grau`, `silber`, `cremeweiss`, `moosgruen`, etc. (no `_s` suffix)
- Example: `roller-mini-beige.png`, `roller-maxi-moosgruen.png`

**Implementation** (Session 12 Bug Fixes):
- `extractAssetBaseUrl()` - Parses script tag, removes version parameters (fixed `?v=...` handling)
- `updateRollerImage()` - Updates image based on profile + color
- `isSpecialColor()` - Refactored to check against standard color list instead of `_s` suffix
- Triggers on: init, material change, profile change, color change
- All images loading: **200 OK** ✅ (was 404 due to color ID mismatch)
- Responsive: max-height 200-400px depending on viewport

---

## Implementation Status

**Phase 1 (MVP)** ✅ COMPLETE
- Form structure
- State management
- Pricing engine (all 8 MPC combinations)
- Quantity selector
- localStorage persistence
- Shopify cart integration

**Phase 2 (Visual)** ✅ COMPLETE (Session 12)
- Image preview infrastructure ✅
- All 33 roller images uploaded to Shopify ✅
- Image loading working (200 OK, no 404s) ✅
- Color ID naming fixed (removed `_s` suffix) ✅
- Asset URL extraction fixed (handles version params) ✅

**Phase 3 (UX Enhancements)** 🟠 IN PROGRESS (Session 12)
- Responsive layout (images left on desktop, underneath on mobile)
- Trade customer registration form (DE, AT, CH, LI)
- Project code field for order reference
- Measurement instructions with embedded guides

**Phase 4 (Polish)** 📋 TODO
- Finishing bar images (optional Phase)
- Full workflow testing
- Checkout flow verification

**Phase 5 (Production)** 📋 TODO
- Final testing
- Production deployment

---

## Status Summary

**Project Status**: PHASE 3 (UX ENHANCEMENTS) 🔄  
**Branch**: `dawn` (active)  
**Approach**: Plan B (Vanilla JavaScript) ✅  
**Core Features**: 95% Complete  
**Image Preview**: 100% Complete ✅  

**What's Working**:
- All pricing calculations ✅
- Quantity selection ✅
- Color system (material/profile specific) ✅
- All 33 roller images loading correctly ✅
- localStorage persistence ✅
- Cart integration ✅

**What's Next** (Session 12+):
1. Responsive layout - images left on desktop, underneath on mobile
2. Trade customer registration form (DE, AT, CH, LI with country-specific fields)
3. Project code field for order reference on bill
4. Measurement instructions with embedded guides
5. Finishing bar images (optional Phase 4)

---

## Session History

- **Session 10**: Git setup, requirement clarification, Plan B architecture design
  - ✅ Git initialized with `master` (archive) and `dawn` (active) branches
  - ✅ Down theme v15.41 pulled from Shopify
  - ✅ Initial implementation (sections/roller-customizer.liquid, roller-config.js, roller-config.css)

- **Session 11**: Visual enhancement & color system overhaul
  - ✅ Removed native Shopify product form
  - ✅ Made Endleiste permanent (default enabled)
  - ✅ Added quantity selector with price multiplier
  - ✅ Restructured color system (material/profile specific)
  - ✅ Implemented image preview infrastructure
  
- **Session 12** (Current): Image integration bug fixes & Phase 3 planning
  - ✅ Pushed all 33 roller images to Shopify theme
  - ✅ Fixed `extractAssetBaseUrl()` to handle version parameters (`?v=...`)
  - ✅ Fixed color ID naming (removed `_s` suffix to match image filenames)
  - ✅ Updated `isSpecialColor()` logic to check standard color list
  - ✅ All images now loading (200 OK, no 404s)
  - ✅ Updated DAWN_PROJECT.md with new status
  - 📋 Planning Phase 3: Responsive layout, registration form, project code, measurement instructions
