# Phase 4 Setup Guide - Authentication System

## Overview

Phase 4 implements a complete authentication system:
- **Backend**: Node.js + Express on Vercel + PostgreSQL on Neon
- **Frontend**: Login/registration page gates the customizer
- **Database**: Multi-address support for shipping and billing

## Step 1: Set Up Backend Infrastructure

### 1a. Create Neon PostgreSQL Database

1. Go to https://neon.tech
2. Sign up (free tier includes 3 projects, unlimited databases)
3. Create project: `rollladen`
4. Database name: `rollladen` (auto-created)
5. Copy connection string:
   ```
   postgresql://neondb_owner:xxxxx@ep-xxx.neon.tech/rollladen
   ```

### 1b. Initialize Database Schema

1. Connect to your Neon database:
   ```bash
   psql postgresql://neondb_owner:xxxxx@ep-xxx.neon.tech/rollladen
   ```

2. Run the schema:
   ```sql
   \i db/schema.sql
   ```

3. Verify tables created:
   ```sql
   \dt
   ```
   Should show: `users`, `addresses`, `orders`, `refresh_tokens`

### 1c. Deploy Backend to Vercel

1. Push backend folder to GitHub:
   ```bash
   cd backend
   git init
   git add .
   git commit -m "Initial backend"
   git remote add origin https://github.com/YOUR-USERNAME/rollladen-backend.git
   git push -u origin main
   ```

2. Go to https://vercel.com/new
3. Import GitHub repository
4. Add environment variables (Production):
   ```
   DATABASE_URL = postgresql://neondb_owner:xxxxx@ep-xxx.neon.tech/rollladen
   JWT_SECRET = (generate: openssl rand -hex 32)
   JWT_REFRESH_SECRET = (generate: openssl rand -hex 32)
   SHOPIFY_API_KEY = (get from Shopify later)
   SHOPIFY_API_SECRET = (get from Shopify later)
   SHOPIFY_STORE_URL = rollladenwelt.myshopify.com
   FRONTEND_URL = https://rollladenwelt.myshopify.com
   NODE_ENV = production
   ```

5. Click "Deploy"
6. Wait for deployment to complete
7. Note your Vercel URL: `https://YOUR-PROJECT-NAME.vercel.app`

### 1d. Test Backend

```bash
# Test health check
curl https://YOUR-PROJECT-NAME.vercel.app/health

# Should return: { "status": "ok", "timestamp": "..." }
```

## Step 2: Update Frontend API URL

In `assets/auth-config.js`, update line 2:

```javascript
window.AuthManager = {
  apiUrl: 'https://YOUR-PROJECT-NAME.vercel.app',  // <- Update this
```

Push to Shopify:
```bash
shopify theme push --development
```

## Step 3: Create Auth Page in Shopify

1. Go to Shopify Admin → Pages
2. Create new page:
   - Title: "Auth"
   - Slug: `auth` (URL: `/pages/auth`)
   - Content: Leave blank (will be handled by template)
   - Select template: `auth-page` (from sections)
   - Publish

## Step 4: Update Customizer Page Route

Your customizer should be accessible at:
- Old (public): `/pages/customizer`
- New (authenticated): Still `/pages/customizer`, but requires login

The page now:
1. Loads `auth-config.js`
2. Checks if user is logged in
3. If not logged in: Shows message with link to `/pages/auth`
4. If logged in: Shows customizer form

## Step 5: Test Full Auth Flow

### 5a. Test Registration

1. Go to `https://rollladenwelt.myshopify.com/pages/auth`
2. Click "Registrieren" tab
3. Fill in form:
   - Land: Deutschland
   - Unternehmen: Test GmbH
   - Ansprechpartner: Max Mustermann
   - E-Mail: test@example.de
   - Telefon: +49 123 456789
   - Passwort: TestPassword123!
   - Straße: Hauptstraße 1
   - Postleitzahl: 10115
   - Stadt: Berlin

4. Click "Registrieren"
5. Should see success message and redirect to customizer

### 5b. Test Login

1. Go to `https://rollladenwelt.myshopify.com/pages/auth`
2. Click "Anmelden" tab
3. Enter email and password from 5a
4. Click "Anmelden"
5. Should redirect to customizer automatically

### 5c. Test Customizer Access

1. Clear localStorage (DevTools → Application → Storage → Clear All)
2. Go to `/pages/customizer`
3. Should see "Bitte melden Sie sich an..." message
4. Click link to auth page
5. Log in
6. Should redirect back to customizer

### 5d. Test Token Refresh

1. Log in successfully
2. Wait 1 hour (or manually expire token for testing)
3. Try to add to cart
4. Token should automatically refresh
5. Add to cart should work

## Step 6: Configure Shopify Cart Integration

Update `assets/roller-config.js` `addToCart()` method to:
1. Get authenticated user ID
2. Store user ID in line item properties
3. Use for order tracking later

Example modification:
```javascript
addToCart() {
  const userId = window.AuthManager.getCurrentUser()?.id;
  
  const lineItem = {
    // ... existing properties
    properties: {
      _user_id: userId,
    }
  };
}
```

## Step 7: Create Customer Dashboard (Optional - Phase 4B)

Create new page `/pages/dashboard` to show:
- Customer profile
- Address list (shipping & billing)
- Order history
- Download invoices

## Testing Checklist

- [ ] Neon database created and initialized
- [ ] Vercel backend deployed successfully
- [ ] Health check returns 200 OK
- [ ] Registration creates new user in database
- [ ] Login works with correct credentials
- [ ] Login rejects invalid credentials
- [ ] JWT tokens stored in localStorage
- [ ] Token refresh works after 1 hour
- [ ] Customizer hidden from non-authenticated users
- [ ] Customizer visible after login
- [ ] Page redirects after login/register
- [ ] Logout clears localStorage

## Troubleshooting

### "Failed to fetch" when registering

**Solution**: 
- Check CORS origin in `backend/src/index.js`
- Verify `FRONTEND_URL` matches your Shopify store URL
- Redeploy backend after changing environment variables

### "Database connection failed"

**Solution**:
- Verify `DATABASE_URL` is correct in Vercel
- Check Neon is running (check dashboard)
- Run schema.sql manually if tables don't exist

### Tokens not persisting

**Solution**:
- Check localStorage is enabled in browser
- Verify tokens are being set: `localStorage.getItem('auth_token')`
- Check browser console for errors

### Login works but customizer doesn't show

**Solution**:
- Reload page after login
- Check browser console for auth errors
- Verify `isAuthenticated()` returns true

## Environment Variables Reference

| Variable | Production Value | Notes |
|----------|------------------|-------|
| `DATABASE_URL` | Neon connection string | psql://... |
| `JWT_SECRET` | Random 32-char hex | Generate with openssl |
| `JWT_REFRESH_SECRET` | Random 32-char hex | Generate with openssl |
| `SHOPIFY_API_KEY` | From Shopify App | Leave blank for now |
| `SHOPIFY_API_SECRET` | From Shopify App | Leave blank for now |
| `SHOPIFY_STORE_URL` | rollladenwelt.myshopify.com | Your store |
| `FRONTEND_URL` | https://rollladenwelt.myshopify.com | CORS origin |
| `NODE_ENV` | production | Vercel default |

## Next Steps

1. After Phase 4A is working:
   - Add LexOffice integration for credit checking
   - Implement trade discount calculations
   - Store order data in database

2. Phase 4B (Optional):
   - Build customer dashboard
   - Show order history
   - Allow address management

3. Phase 5:
   - Shopify OAuth integration
   - Multi-language support
   - Advanced reporting

---

**Need help?** Check:
- Vercel logs: `vercel logs https://YOUR-PROJECT.vercel.app`
- Backend health: `https://YOUR-PROJECT.vercel.app/health`
- Neon dashboard: https://console.neon.tech
