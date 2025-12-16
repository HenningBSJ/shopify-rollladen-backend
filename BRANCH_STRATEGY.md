# Git Branch Strategy

## Current Structure

```
main (master)
├── HORIZON/        ← Reference - Easify-based implementation (archived)
├── assets/         ← HORIZON theme files
├── sections/       ← HORIZON theme files
└── ...

dawn (ACTIVE)
├── HORIZON/        ← Keep for reference
├── assets/         ← Dawn theme files (freshly pulled from Shopify)
├── sections/       ← Dawn theme files
├── locales/        ← Dawn translations
└── ...
```

## What to Know

- **`master`**: Contains archived HORIZON (Easify) for reference only
- **`dawn`**: Active development branch - contains clean Shopify Dawn theme
- **Strategy**: Both exist in same repo for comparison/migration purposes
- **No conflicts**: HORIZON is separate directory, doesn't interfere with Dawn

## Development Workflow

1. Always develop on `dawn` branch
2. Create custom section: `sections/roller-customizer.liquid`
3. Create custom assets: `assets/roller-config.js`, `assets/roller-config.css`
4. All custom code goes into Dawn, not into HORIZON directory

## After First Sale (Future Refactoring)

- Can safely archive `master` branch
- Or delete HORIZON directory once confident in Dawn implementation
- For now, keep as reference for dimension restoration logic, price calculations

---

## Files to Create for Plan B Implementation

### Primary Files (New)
- `sections/roller-customizer.liquid` - Main form template
- `assets/roller-config.js` - State management & event logic
- `assets/roller-config.css` - Styling (optional, can use Tailwind from Dawn)

### Reference Files (From HORIZON - Can Copy Logic)
- `HORIZON/assets/easify-options-hook.js` - Contains MPC pricing logic (lines 1-100)
- `CLAUDE.md` - Contains tested price tables and MPC combinations

### Integration
- Add roller customizer section to `templates/product.json`
- Link to cart via Shopify AJAX API

---

Ready to start building Plan B? 🚀
