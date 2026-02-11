# Roller Shutter Customizer - Task Documentation

**⚠️ UPDATE THIS FILE WITH "update claude" KEYWORD AFTER ANY SIGNIFICANT CHANGES OR BUG FIXES**

## Current Project Status

**Project**: Rollladen (Roller Shutter) Customizer for Shopify Dawn Theme  
**Approach**: Plan B (Vanilla JavaScript - NOT Easify)  
**Branch**: `dawn` (active)  
**Phase**: 4 - Deployment & Polish  
**Core Completion**: 100%  
**Latest Updates**: Session 15 (Cart Layout & Cleanup)

---

## Architecture Overview

### Tech Stack
- **Templating**: Shopify Liquid (sections/roller-customizer.liquid)
- **Logic**: Vanilla JavaScript (assets/roller-config.js)
- **Styling**: CSS + Responsive Design (assets/roller-config.css)
- **Storage**: Browser localStorage + Shopify line item properties
- **Cart**: Shopify AJAX API (`/cart/add.js`)

### File Structure
```
sections/
  └── roller-customizer.liquid        (208 lines) - HTML form template with tooltips
sections/
  └── auth.liquid                     (120 lines) - Auth form section

assets/
  ├── roller-config.js                (524 lines) - State + logic + image loading
  └── roller-config.css               (721 lines) - Responsive styling + tooltip styles

config/
  └── settings_schema.json            (updated: page_width default now number)
```

---

## Core Features (Updated Session 15)

### ✅ COMPLETED

**1. Pricing Engine** (100% Complete)
- MPC Detection: Material (Aluminum/PVC) × Profile (Mini/Maxi) × Color (Standard/Special)
- 8 combinations with correct €/m² rates
- Minimum area: 1.0 m² chargeable
- Calculation: `€{price_per_m2}/m² × max(area, 1.0) m²`
- **Fixed**: Rounding issues resolved, unit prices displayed correctly

**2. Dimension Validation** (100% Complete)
- Per-combination constraints enforced
- Real-time validation as user types
- Error messages displayed inline

**3. Quantity Selector** (100% Complete)
- +/− buttons with increment/decrement
- Direct input field (1-999)
- Price multiplier: total = base_price × quantity
- **New**: Auto-resets to 1 after "Add to Cart" (persists via bfcache)

**4. Color System** (100% Complete)
- Restructured from generic "standard/special" to material/profile-specific
- **PVC**: 9 colors (beige, weiss, grau, + 6 special)
- **Alu Mini**: 19 colors (all PVC + 10 exclusive)
- **Alu Maxi**: 14 colors (subset of Alu Mini)
- Colors update dynamically when profile changes

**5. Endleiste (Finishing Bar)** (100% Complete)
- Always enabled
- Color options: Silber eloxiert (default), Match shutter, Custom
- Holes for stoppers: Yes (default) / No (optional)
- Pricing: Included with no additional charge

**6. Image Preview** (100% Complete)
- `extractAssetBaseUrl()` - Dynamically determines Shopify asset URL
- `updateRollerImage()` - Loads image: `roller-[profile]-[colorid].png`
- Triggers on: init, material change, profile change, color change
- Responsive CSS: max-height 200-400px

**7. localStorage Persistence** (100% Complete)
- All state saved: material, profile, width, height, color, quantity, endleiste settings
- Auto-restored on page load
- Survives browser refresh/close

**8. Shopify Cart Integration** (100% Complete)
- Sends to `/cart/add.js` with custom line item properties
- Properties include: dimensions, material, profile, color, area, endleiste details
- Quantity multiplier working
- **Refactored**: Cart layout condensed, "Einzelpreis" column removed, wide product column

**9. UI/UX Enhancements** (Session 14-15)
- **CSS Tooltips**: Added for Material, Profile, Colors, Endleiste
- **Optimized Layout**: Larger fonts/inputs, proportional scaling
- **Measuring Instructions**: Relocated to collapsible/modal-like section
- **Cart Polish**: Consistent layout between Main Cart and Drawer
- **Clean Theme**: Unused themes deleted

---


## Key Implementation Details

### State Management
```javascript
RollerConfig.state = {
  material: 'alu' | 'pvc',
  profile: 'mini' | 'maxi',
  width: 0-3000 (mm),
  height: 0-2500 (mm),
  color: 'beige' | 'weiss' | ... (19 color IDs),
  area: calculated (m²),
  quantity: 1-999,
  
  endleiste: {
    enabled: true (always),
    color: 'silber_eloxiert' | 'match' | 'custom',
    holes: true | false,
  },
  
  minPrice: calculated (€/m²),
  totalPrice: calculated (€)
}
```

### Price Table (Hardcoded)
```javascript
priceTable: {
  'alu_mini_standard': 33.60,
  'alu_mini_special': 34.68,
  'alu_maxi_standard': 37.15,
  'alu_maxi_special': 37.91,
  'pvc_mini_standard': 23.22,
  'pvc_mini_special': 24.67,
  'pvc_maxi_standard': 24.58,
  'pvc_maxi_special': 25.58
}
```

### Dimension Constraints
```javascript
constraints: {
  alu_mini: { width: [100, 3000], height: [100, 2500] },
  alu_maxi: { width: [100, 3000], height: [100, 2500] },
  pvc_mini: { width: [100, 2500], height: [100, 2300] },
  pvc_maxi: { width: [100, 2500], height: [100, 2300] }
}
```

---

## Image Integration (Session 11)

### How It Works
1. **Script executes** → `extractAssetBaseUrl()` parses the roller-config.js script tag
2. **Gets URL** → Determines Shopify asset folder path
3. **On change events** → `updateRollerImage()` constructs filename
4. **Filename format** → `roller-[profile]-[colorid].png`
5. **Sets img.src** → Browser caches and displays image

### Filename Examples
- `roller-mini-beige.png` (Alu Mini, Beige)
- `roller-maxi-moosgruen_s.png` (Alu Maxi, Moosgrün special)
- `roller-mini-weiss.png` (PVC Mini, Weiß)

### Important Notes
- Material (Alu/PVC) is NOT in filename - PVC is subset of Alu colors
- Use `roller-[profile]-[colorid].png` for all materials
- Special colors use `_s` suffix: `cremweiss_s`, `silber_s`, etc.

---

## Critical Code Locations

### Main Entry Points
- **Initialization**: `RollerConfig.init()` (line 131)
  - Calls: `extractAssetBaseUrl()` → `loadFromStorage()` → `renderColorOptions()` → `attachEventListeners()` → `calculatePrice()` → `updateRollerImage()` → `render()`

- **Event Triggers**:
  - Material change: `onMaterialChange()` (line 184) → calls `updateRollerImage()`
  - Profile change: `onProfileChange()` (line 198) → calls `updateRollerImage()` + `renderColorOptions()`
  - Color change: Inside `renderColorOptions()` listener (line 347) → calls `updateRollerImage()`

- **Image Update**: `updateRollerImage()` (line 407)
  - Constructs: `roller-${profile}-${color}.png`
  - Sets: `document.getElementById('roller-image').src`

### Key Functions
- `calculatePrice()` - Main pricing engine (line 277)
- `renderColorOptions()` - Dynamically render color radio buttons (line 323)
- `renderEndleistColorOptions()` - Finish bar color options (line 366)
- `onQuantityChange()` - Handle quantity updates (line 300)
- `addToCart()` - Shopify integration (line 462)
- `updateRollerImage()` - Image preview update (line 407)

---

## Bug Fixes & Changes (Session 11)

### Fixed Issues
1. **Profile-switching color bug** - Colors now update when profile changes
   - Fix: Call `renderColorOptions()` in `onProfileChange()` (line 187)

2. **Schema validation error** - page_width default was string
   - Fix: Changed `"default": "1200"` to `"default": 1200` in settings_schema.json

3. **Endleiste toggle removed** - Now always enabled
   - Change: Removed checkbox UI, endleiste.enabled hardcoded to true

4. **Quantity selector added** - Full implementation with price multiplier
   - New methods: `onQuantityChange()`, `increaseQuantity()`, `decreaseQuantity()`

### Refactored
1. **Color system** - From generic to material/profile specific
   - Before: All materials shared same colors
   - After: `pvc_mini`, `pvc_maxi`, `alu_mini`, `alu_maxi` separate arrays

2. **UI improvements** - Removed Shopify native form, cleaner layout

---

## Current Challenges & Solutions

### Asset Upload Issue
**Problem**: Shopify assets section not displaying uploaded image files

**Solutions to Try**:
```bash
# Force re-deploy all assets
shopify theme push -d

# Or use Shopify CLI to upload specific assets
shopify theme asset upload --path=assets/roller-mini-beige.png
```

**Browser-side**:
- Clear cache (Cmd+Shift+Delete or Ctrl+Shift+Delete)
- Hard refresh (Cmd+Shift+R or Ctrl+Shift+R)
- Check browser DevTools Network tab for image URLs

**Verification**:
- Go to Shopify Admin → Settings → Files → Theme files
- Verify all `roller-*.png` files are listed
- Check file sizes match original uploads

---

## Testing Checklist

### Unit Tests (Manual)
- [ ] All 8 MPC combinations calculate correct prices
- [ ] Area < 1.0 m² shows minimum price
- [ ] Area >= 1.0 m² shows scaled price
- [ ] Quantity changes multiply price correctly
- [ ] Dimension constraints enforced per combo
- [ ] Color updates trigger image change

### Integration Tests
- [ ] Roller images load on profile/color change
- [ ] localStorage persists state across refresh
- [ ] Cart receives all custom properties
- [ ] Checkout displays correct totals

### Workflow Tests
- [ ] Alu Mini 900×800 + Endleiste + Qty 2
- [ ] PVC Maxi 500×400 + special color + Qty 1
- [ ] Profile change (Mini→Maxi) with dimensions preserved
- [ ] Material change (Alu→PVC) with color reset to valid set
- [ ] Mobile responsiveness (375px, 768px, 1024px)

---

## Debugging Commands

```javascript
// Check current state
console.log(RollerConfig.state);

// Check calculations
RollerConfig.calculatePrice();

// Check asset URL
console.log(RollerConfig.assetBaseUrl);

// Test image URL construction
const testUrl = RollerConfig.assetBaseUrl + 'roller-mini-beige.png';
console.log('Image URL:', testUrl);

// Monitor state changes
const interval = setInterval(() => {
  console.log({
    profile: RollerConfig.state.profile,
    color: RollerConfig.state.color,
    area: RollerConfig.state.area.toFixed(3),
    price: RollerConfig.state.totalPrice.toFixed(2),
    quantity: RollerConfig.state.quantity
  });
}, 1000);
```

---

## Known Limitations

- **No pre-loading** - Images load on-demand (fast but could preload all 33 images for better UX)
- **No fallback images** - If image fails to load, nothing displays (could add placeholder)
- **No image caching hints** - Could add cache-busting or version param
- **Material not in URL** - PVC uses same images as Alu (works because color IDs match subset)

---

## Next Steps

### Phase 4: Authentication System (Deferred)
- Requires backend infrastructure for customer management
- Integrate with LexOffice API for credit/discount checking
- Multi-address support (shipping vs. billing)
- See ROADMAP_WALL.md for full feature breakdown

### Phase 4A: Self-Hosted Video Upload
1. Record measurement guide video (or obtain existing video)
2. Upload as `measurement-guide.mp4` to Shopify theme assets
3. Verify video loads via console logs
4. Test video playback on desktop/mobile

### Remaining Items (ROADMAP_WALL.md)
- Vorbaukästen & Aufsatzkästen product lines
- Payment integration
- Invoice generation with shipping labels
- Analytics & reporting

---

## Session History

- **Session 10**: Initial implementation - form, pricing, persistence
- **Session 11**: Visual enhancement - image integration, color system redesign, bug fixes
- **Session 12**: Phase 3 UX (responsive layout, registration form, measurement instructions)
- **Session 13** (Current): Self-hosted video + dynamic Endleiste color selection
  - ✅ Removed external third-party links from instructions
  - ✅ Added video player with placeholder for self-hosted video
  - ✅ Changed Endleiste colors to match roller shutter palette (dynamic)
  - ✅ Created printable ROADMAP_WALL.md checklist

---

## Important Notes for Future Work

- **Umlaut characters in filenames**: Use ASCII equivalents (ö→oe, ä→ae, ü→ue, ß→ss)
- **Image asset URLs**: Use `{{ 'filename.png' | asset_url }}` in Liquid, but not needed here
- **Shopify CDN**: Images cached aggressively - test with cache clear if updates aren't showing
- **Performance**: Current implementation is very fast (no build step, minimal JS)
