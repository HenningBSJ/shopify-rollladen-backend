# Phase 4 Quick Start (Do This First!)

## 5-Minute Setup

### Step 1: Set Up PostgreSQL (Neon) - 2 minutes

1. Go to https://neon.tech
2. Sign up with GitHub/email
3. Create new project named `rollladen`
4. Copy the connection string (looks like: `postgresql://...`)
5. Store it safely - you'll need it in 1 minute

### Step 2: Deploy Backend (Vercel) - 3 minutes

1. Copy the `backend/` folder to your GitHub
   ```bash
   cd c:\Projects\Shopify
   mkdir rollladen-backend
   cp -r backend/* rollladen-backend/
   cd rollladen-backend
   git init
   git add .
   git commit -m "Initial"
   git push -u origin main
   ```

2. Go to https://vercel.com/new
3. Import your `rollladen-backend` repository
4. Add these environment variables:
   ```
   DATABASE_URL = postgresql://... (your Neon connection string)
   JWT_SECRET = openssl rand -hex 32 (generate random)
   JWT_REFRESH_SECRET = openssl rand -hex 32 (generate random)
   SHOPIFY_API_KEY = (leave blank for now)
   SHOPIFY_API_SECRET = (leave blank for now)
   SHOPIFY_STORE_URL = rollladenwelt.myshopify.com
   FRONTEND_URL = https://rollladenwelt.myshopify.com
   NODE_ENV = production
   ```
5. Click "Deploy"
6. Wait 2-3 minutes
7. Copy your Vercel URL (e.g., `https://rollladen-backend.vercel.app`)

### Step 3: Update Shopify Frontend - 1 minute

1. Open `c:\Projects\Shopify\assets\auth-config.js`
2. Find line 2: `apiUrl: 'https://your-vercel-project.vercel.app',`
3. Replace with your actual Vercel URL: `apiUrl: 'https://rollladen-backend.vercel.app',`
4. Save the file
5. Push to Shopify: `shopify theme push --development`

### Step 4: Create Auth Page in Shopify - 1 minute

1. Go to https://rollladenwelt.myshopify.com/admin
2. Pages → Add page
3. Title: `Auth`
4. Slug: `auth`
5. Content: (leave blank - template will handle)
6. Theme template: Select `auth-page` from dropdown
7. Click "Save"

### Step 5: Test It!

1. Go to https://rollladenwelt.myshopify.com/pages/auth
2. Click "Registrieren" tab
3. Fill out the form:
   ```
   Land: Deutschland
   Unternehmen: Test Company
   Ansprechpartner: Max Mustermann
   E-Mail: test@example.de
   Telefon: +49 123 456789
   Passwort: TestPass123!
   Straße: Hauptstraße 1
   Postleitzahl: 10115
   Stadt: Berlin
   ```
4. Click "Registrieren"
5. Should see "Registrierung erfolgreich!" and redirect to customizer

## Verify It Worked

After registration, check:

1. **Auth page loaded** ✓
2. **Registration successful** ✓
3. **Redirected to customizer** ✓
4. **Customizer shows (not login message)** ✓
5. **Try logging out:**
   - Open DevTools → Console
   - Run: `localStorage.clear()`
   - Refresh page
   - Should see login message again

## What Happened?

1. **Created backend** - Node.js + Express API running on Vercel
2. **Created database** - PostgreSQL on Neon storing your users
3. **Created auth UI** - Login/registration page on Shopify
4. **Protected customizer** - Only logged-in users can access it
5. **Stored tokens** - localStorage persists login across page refreshes

## Next: Fine-Tuning & Testing

See `SETUP_PHASE4.md` for:
- Full deployment guide
- Testing checklist
- Troubleshooting
- API reference

See `PHASE4_SUMMARY.md` for:
- Architecture overview
- All endpoints
- Security features
- Next phases

## Troubleshooting

### "Failed to fetch" on register
**Problem:** Backend URL is wrong or CORS blocked
**Fix:** 
1. Check `apiUrl` in auth-config.js matches your Vercel URL
2. Check `FRONTEND_URL` in Vercel env = `https://rollladenwelt.myshopify.com`
3. Redeploy backend: `vercel deploy` from backend folder

### "Database connection failed"
**Problem:** DATABASE_URL not correct
**Fix:**
1. Copy fresh connection string from Neon dashboard
2. Paste into Vercel environment
3. Redeploy backend

### Auth page shows but customizer still shows
**Problem:** Token check not working
**Fix:**
1. Clear localStorage: `localStorage.clear()` in console
2. Refresh page
3. Should now show login message

### Registered but can't log back in
**Problem:** Password not being stored/checked correctly
**Fix:**
1. Check Neon database has data: `SELECT * FROM users;`
2. Verify password hash exists (not null)
3. Try registering again with different email

## File Reference

| File | Location | Purpose |
|------|----------|---------|
| `auth-config.js` | `assets/` | Client-side auth logic |
| `auth-config.css` | `assets/` | Auth page styling |
| `auth-page.liquid` | `sections/` | Login/register UI |
| `roller-customizer.liquid` | `sections/` | Added auth guard |
| `src/index.js` | `backend/src/` | Express server |
| `db/schema.sql` | `backend/db/` | Database tables |
| `.env.example` | `backend/` | Environment template |

## Security Notes

✅ Passwords hashed with bcryptjs (never stored plain)  
✅ Tokens signed with JWT (can't be forged)  
✅ CORS restricted to your Shopify store  
✅ Email validation on registration  
✅ Tokens auto-refresh every hour  
✅ Logout clears all stored data  

## You're Done! 🎉

Your authentication system is now live.

**What users can do:**
- Register with company info
- Log in securely
- Access customizer after auth
- Refresh page and stay logged in

**Next phases:**
- Add LexOffice for trade discounts
- Create customer dashboard
- Add invoice generation
- Implement Shopify OAuth

Questions? Check:
- `SETUP_PHASE4.md` - Full setup guide
- `PHASE4_SUMMARY.md` - Technical details
- Vercel logs: `vercel logs https://your-app.vercel.app`
- Neon dashboard: https://console.neon.tech
