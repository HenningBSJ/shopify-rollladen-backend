# Copilot / AI Agent Instructions — HORIZON theme

Purpose: quick, actionable guidance to help AI coding agents become productive in this Shopify theme repository.

## Repo Overview
- **Type:** Shopify theme called `HORIZON`.
- **Key directories:** `assets/`, `blocks/`, `sections/`, `snippets/`, `templates/`, `layout/`, `config/`, `locales/`.

## Big Picture / Architecture
- Liquid server-rendered templates in `sections/`, `snippets/`, and `templates/` produce HTML and context; client-side interactivity lives in `assets/` JS/CSS.
- `assets/section-hydration.js` and `assets/section-renderer.js` are central: they initialize and hydrate sections/components after the page loads — when changing how sections mount, update these first.
- Many JS modules follow a pattern: `component-*.js`, `product-*.js`, `cart-*.js`. When adding behavior for a UI piece, create a new `assets/` module following this convention and wire it into the section's markup.

## Project-specific Conventions
- File naming: implement interactive behaviors as `assets/<feature>.js` matching Liquid section names where practical (e.g., `product-form.js` for product forms, `cart-drawer.js` for the cart drawer).
- Types and IDE hints: `assets/global.d.ts` and `assets/jsconfig.json` provide global type hints and path resolution for editors — preserve and update them when adding global helpers.
- CSS: theme styles are colocated under `assets/`; some templates include dedicated CSS like `template-giftcard.css`.

## Integration Points & External Dependencies
- This repo integrates with Shopify platform (Liquid) — changes to section/snippet markup affect theme rendering and Shopify data available in templates.
- Search/recommendation-related code appears in `assets/predictive-search.js` and `assets/product-recommendations.js` — these tie to Shopify storefront search and recommendation endpoints.
- `qr-code-generator.js` and `qr-code-image.js` generate on-page assets — be mindful of client-side payload size when editing.
- **Measurement-based pricing (rollladenwelt use case):** `sections/product-information.liquid` contains a client-side script that calculates price based on width/height inputs and enforces a minimum 1 m² floor price. This is critical for dimension-based products (e.g., custom-sized roller blinds). Do not remove or rename the input field selectors or price node detection logic.

## Key Files to Inspect Before Edits
- `assets/section-hydration.js`, `assets/section-renderer.js` — section lifecycle and mounting.
- `assets/component.js`, `assets/global.d.ts`, `jsconfig.json` — shared utilities and editor config.
- `assets/product-form.js`, `assets/cart-drawer.js`, `assets/header.js`, `assets/header-drawer.js` — central interactive flows.

## Developer Workflows & Recommended Commands
- Theme linting: this repo contains a Theme Check config at `.theme-check.yml` (root of HORIZON). Run Theme Check if available: `theme-check .` or via your project's Ruby/Bundler wrapper if configured.
- Local preview: this is a Shopify theme — typical local preview uses the Shopify CLI: `shopify theme serve` (confirm with the repository owner). If a `package.json` or build system exists, prefer the repo-specific commands.

## Patterns for Changes / PRs
- Small UI behavior: add/modify a file in `assets/` and update the corresponding `sections/` Liquid file to reference any new data attributes or markup.
- Backwards compatibility: do not rename assets referenced by Liquid unless you update every template/snippet that references them.
- Global shared helpers: add functions to `assets/component.js` or a new `assets/utils-*.js` and document additions in `assets/global.d.ts` if they are intended to be global.

## Measurement-Based Pricing (rollladenwelt)
This shop sells custom-sized products (roller blinds). **Pricing is enforced with a 1 m² minimum area** regardless of actual dimensions.

**Easify Integration:**
- **Easify app** (https://apps.shopify.com/easify-product-options) is injected via the `@app` block in `blocks/_product-details.liquid`
- Easify handles **material, profile, color** selection; passes data as **line item properties** to the cart
- Easify may also calculate width/height → area → pricing live on the product page
- **Built-in HORIZON script** in `sections/product-information.liquid` enforces minimum 1 m² pricing as a safety net

**How it works:**
- Width/height inputs (in mm) are detected in the product form via regex patterns: `[name/id]*breite*`, `[name/id]*höhe*`, or English equivalents.
- Script calculates area = (width_mm × height_mm) / 1,000,000 to get square meters.
- If area < 1 m², the base price is scaled up to reflect 1 m² cost (price_min = base_price / area).
- Two UI elements display: a warning note + a minimum-price box.

**Key selectors & templates (in `product-information.liquid`):**
- `#tpl-min-area-note` — warning template (shown when area < 1 m²)
- `#tpl-minprice-box` — minimum price display (shows corrected price & actual area)
- `.product-details` — parent where templates mount
- `data-minprice="active"` — attribute on `.product-information` when minimum is active

**When editing this feature:**
- Do not rename input field patterns (breite/höhe/width/height).
- Keep the template IDs unchanged (`tpl-min-area-note`, `tpl-minprice-box`).
- The mutation observer monitors `.product-details` for changes — do not remove or restructure that selector.
- Currency formatting uses `Intl.NumberFormat` with de-DE locale; adjust if needed for other locales.

**Local Testing & Debugging:**
- Use `assets/easify-debugger.js` — a browser console utility for inspecting Easify data locally
- In browser DevTools (F12) on a product page, run: `EasifyDebugger.inspectCart()` to log all Easify selections, cart data, and properties
- Run `EasifyDebugger.exportMockData()` to generate a JSON fixture of current cart state for offline testing
- Run `EasifyDebugger.calculatePrice(width_mm, height_mm, price_per_m2)` to verify minimum pricing logic
- **Development workflow:** Pull live Easify data → export as mock JSON → test theme changes against mock locally → push to Shopify

## What NOT to Assume
- There is no visible `package.json` or explicit bundler config in the code snapshot — do not assume a JS build step exists unless you find one.
- Do not assume a CI workflow; check for `.github/workflows/` before adding CI-related edits.

---

If anything here is unclear or you want to include build/test automation, tell me which commands or tooling you use (e.g., `npm`, `yarn`, `Shopify CLI`, `theme-check` via Bundler). I can iterate and enhance repository-specific instructions.
