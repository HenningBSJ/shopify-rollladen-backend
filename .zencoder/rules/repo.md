---
description: Repository Information Overview
alwaysApply: true
---

# Shopify Horizon Theme Information

## Summary
The HORIZON project is a Shopify theme built on Shopify's native Horizon theme (v3.1.0). It provides a fully customizable e-commerce storefront with support for multiple languages, dynamic blocks, sections, and templates. The theme uses Liquid templating language for rendering and includes JavaScript/CSS assets for interactivity and styling.

## Structure
- **HORIZON/**: Main theme directory containing all theme assets, configuration, and templates
  - **layout/**: Theme layout files (theme.liquid, password.liquid)
  - **sections/**: Reusable page sections with JSON configuration (87+ blocks, header/footer groups)
  - **templates/**: Page templates for different Shopify pages (product, collection, cart, blog, etc.)
  - **blocks/**: Individual block components for sections (87 blocks including buttons, forms, collections, etc.)
  - **assets/**: JavaScript and CSS files for theme functionality and styling
  - **config/**: Theme settings schema and configuration data
  - **locales/**: Multi-language support (25+ languages with schema files)
  - **.shopify/**: Shopify-specific configuration including metafields
  - **tools/**: Utility scripts for theme development

## Theme Specification
**Theme Name**: Horizon  
**Theme Version**: 3.1.0  
**Author**: Shopify  
**Template Language**: Liquid  
**Styling**: CSS  
**Interactivity**: JavaScript

## Configuration Files
- **settings_schema.json** (52.97 KB): Comprehensive theme settings including logo, favicon, colors, fonts, and layout configuration
- **settings_data.json** (27.53 KB): Current theme settings and customization values
- **metafields.json**: Custom metafields for products (binding_mount, snowboard_length) and shop-level fields
- **.theme-check.yml**: Theme validation configuration

## Localization
The theme supports 25+ languages including:
English (default), French, German, Spanish, Italian, Dutch, Portuguese, Japanese, Chinese, Korean, Swedish, Danish, Norwegian, Finnish, Czech, Polish, Hungarian, Romanian, Bulgarian, Greek, Turkish, Thai, Vietnamese, Indonesian, Arabic, and more.

Each language has both translation files (*.json) and schema files (*.schema.json).

## Key Assets
**JavaScript Files** (50+):
- Critical functionality: critical.js, component.js, dialog.js
- Cart system: cart-drawer.js, cart-icon.js, cart-discount.js, component-cart-items.js
- Product features: buy-buttons.js, variant-selects.js, quantity-input.js
- Utilities: auto-close-details.js, disclosure-custom.js, anchored-popover.js
- Easify integration: easify-loader.js, easify-bridge.js, easify-debugger.js

**CSS Files**:
- base.css: Primary stylesheet for theme

## Blocks (87 total)
Notable blocks include: add-to-cart, buy-buttons, buttons, accordions, custom-liquid, contact forms, featured collections, filters, reviews, social links, policies, and more.

## Templates (9 main)
- index.json: Homepage
- product.json: Product pages
- collection.json: Collection pages
- cart.json: Shopping cart
- blog.json: Blog listing
- article.json: Article/blog post
- search.json: Search results
- page.json: Generic pages
- 404.json, password.json: Special pages

## Development Tools
- **Shopify Theme Check**: Linter for validating theme code
- **Utility Scripts**: convert-product.js, test-easify-scenarios.js for development tasks
- **VS Code Integration**: Recommended extension is ChatGPT VSCode for development support

## Shopify Integration
- Metafield support for custom product and shop data
- Accelerated checkout integration (buy-buttons, checkout blocks)
- Shop Pay integration
- Email signup and subscription features
- Review system integration
- Policy and footer management

## Main Features
- Fully responsive design
- Multi-language support
- Customizable colors, fonts, and layout
- Announcement bars
- Email signup forms
- Product collections and featured items
- Shopping cart drawer
- Blog and article support
- Footer and header customization
- Advanced product filtering
