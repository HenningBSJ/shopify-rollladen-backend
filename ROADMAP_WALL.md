# 🎯 ROLLLADEN CUSTOMIZER - WALL ROADMAP

## Phase 4: Authentication & Customer Management 🔐
- [ ] Design login/registration flow (wireframes)
- [ ] Set up backend API (Node.js/Express recommended for LexOffice integration)
- [ ] Implement JWT-based authentication
- [ ] Create customer database schema
- [ ] Implement customer signup with email verification
- [ ] Implement customer login with session persistence
- [ ] Add "Remember me" functionality
- [ ] Create password reset flow
- [ ] Build customer dashboard (view order history)
- [ ] Store customer data in database (company, contact, address)
- [ ] Add redirect: non-logged-in → login/register before customizer

---

## Phase 4A: Multi-Address Support 📫
- [ ] Design shipping vs. billing address UI
- [ ] Add checkbox: "Same as shipping address"
- [ ] Store separate shipping and billing addresses
- [ ] Pass shipping address to Shopify delivery settings
- [ ] Pass billing address to invoice generation

---

## Phase 4B: Trade Discount & Credit System 💳
- [ ] Design trade discount eligibility check
- [ ] Create LexOffice API integration module
- [ ] Query LexOffice for customer credit status
- [ ] Query LexOffice for trade discount tier
- [ ] Apply discount multiplier to pricing
- [ ] Display discount percentage on form
- [ ] Add credit check before "Add to Cart"
- [ ] Show credit status in customer dashboard

---

## Phase 4C: Order History & Tax Tracking 📊
- [ ] Store order date, amount, customer ID in database
- [ ] Track tax category per order (B2B vs. B2C)
- [ ] Generate tax reports from order history
- [ ] Add order history view to customer dashboard
- [ ] Export orders for accounting (CSV, XML)
- [ ] Tag orders with marketing campaign source

---

## Phase 5: Additional Products 🏗️
- [ ] Create product catalog system
- [ ] Add Vorbaukästen (pre-assembled cases) product line
  - [ ] Design Vorbaukästen customizer
  - [ ] Add Vorbaukästen to cart with main order
  - [ ] Price Vorbaukästen combinations
- [ ] Add Aufsatzkästen (mounting cases) product line
  - [ ] Design Aufsatzkästen customizer
  - [ ] Add Aufsatzkästen to cart with main order
  - [ ] Price Aufsatzkästen combinations
- [ ] Bundle discounts (shutter + cases)
- [ ] Bulk order pricing

---

## Phase 6: Instructions & Documentation 📹
- [ ] ✅ Remove external links (BEW24, Rolladenplanet)
- [ ] Upload measurement video to Shopify/CDN
- [ ] Embed self-hosted video in instructions
- [ ] Create PDF measurement guide (downloadable)
- [ ] Add installation guide video
- [ ] Add maintenance guide

---

## Phase 7: Endleiste (Finishing Bar) Enhancements 🎨
- [ ] ✅ Make Endleiste color selectable (match all roller colors)
- [ ] Add Endleiste color preview
- [ ] Create Endleiste image previews for each color
- [ ] Add Endleiste material options (Aluminum, Stainless, etc.)
- [ ] Add Endleiste length customization
- [ ] Price variations for Endleiste materials

---

## Phase 8: Invoice & Shipping Labels 📄
- [ ] Design invoice template
- [ ] Generate invoice with order details
- [ ] Print invoice with shipping address
- [ ] Generate shipping label with billing address
- [ ] Auto-populate with LexOffice data
- [ ] Email invoice to customer
- [ ] Create order packing slip

---

## Phase 9: Payment & Checkout Integration 💰
- [ ] Integrate Shopify Payments
- [ ] Add invoice payment option (B2B credit terms)
- [ ] Add SEPA direct debit for EU customers
- [ ] Add bank transfer option
- [ ] Implement payment status tracking
- [ ] Email payment reminders

---

## Phase 10: Analytics & Reporting 📈
- [ ] Track customizer usage (popular materials, colors, dimensions)
- [ ] Export sales data to LexOffice
- [ ] Monthly report generation
- [ ] Customer acquisition metrics
- [ ] Revenue forecasting
- [ ] Inventory recommendations based on sales

---

## Phase 11: Performance & Optimization ⚡
- [ ] Optimize image loading (lazy load)
- [ ] Minify CSS/JS assets
- [ ] Cache color/pricing data
- [ ] Implement CDN for images
- [ ] Mobile performance testing
- [ ] Lighthouse score optimization

---

## Phase 12: Support & Testing 🧪
- [ ] Unit tests for pricing calculations
- [ ] Integration tests for order flow
- [ ] E2E tests for full checkout
- [ ] User acceptance testing (UAT)
- [ ] Create help documentation
- [ ] Set up support ticket system
- [ ] Customer feedback collection

---

## Backlog / Future Enhancements 🚀
- [ ] Multi-language support (DE, EN, FR, IT)
- [ ] Mobile app version
- [ ] AR preview (augmented reality window preview)
- [ ] API for partners/resellers
- [ ] Wholesale portal
- [ ] Subscription/recurring orders
- [ ] Integration with manufacturing systems
- [ ] Real-time inventory tracking

---

**Last Updated**: Session 13  
**Print this document and check off items as you complete them!** ✨
