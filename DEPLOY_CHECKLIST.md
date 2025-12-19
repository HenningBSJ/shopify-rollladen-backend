# Phase 4 Deployment Checklist

## ✅ Step 1: Create Neon PostgreSQL Database (5 minutes)

### 1.1 Sign Up & Create Project
- [ ] Go to https://neon.tech
- [ ] Sign up (GitHub or email)
- [ ] Create new project: `rollladen`
- [ ] Select region closest to you (EU recommended)
- [ ] Wait for project to initialize

### 1.2 Get Connection String
- [ ] Click on "Connection string" in dashboard
- [ ] Copy PostgreSQL connection string
  ```
  postgresql://neondb_owner:xxxxx@ep-xxx.neon.tech/rollladen
  ```
- [ ] Save this safely - you'll need it in 3 minutes

### 1.3 Verify Database Works
- [ ] In Neon dashboard, click "SQL Editor"
- [ ] Run: `SELECT 1;`
- [ ] Should return: `1` ✓

### 1.4 Initialize Database Schema
Run in your terminal:
```bash
cd c:\Projects\Shopify\backend
psql postgresql://neondb_owner:xxxxx@ep-xxx.neon.tech/rollladen < db/schema.sql
```

**If that doesn't work**, try online:
1. In Neon SQL Editor, copy entire contents of `db/schema.sql`
2. Paste into SQL Editor
3. Click "Execute"

### 1.5 Verify Tables Created
In Neon SQL Editor, run:
```sql
\dt
```

Should show:
```
addresses
orders
refresh_tokens
users
```

✅ **Database ready!**

---

## ✅ Step 2: Deploy Backend to Vercel (5 minutes)

### 2.1 Push Backend to GitHub

Create a new GitHub repository for the backend:

```bash
cd c:\Projects\Shopify\backend

# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial backend setup"

# Add remote (replace YOUR-USERNAME)
git remote add origin https://github.com/YOUR-USERNAME/rollladen-backend.git

# Push
git branch -M main
git push -u origin main
```

✅ Backend code is now on GitHub

### 2.2 Deploy on Vercel

1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Search for "rollladen-backend"
4. Select your repository
5. Click "Import"

### 2.3 Add Environment Variables

1. In Vercel, go to Settings → Environment Variables
2. Add these 9 variables:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | `postgresql://neondb_owner:xxxxx@ep-xxx.neon.tech/rollladen` |
| `JWT_SECRET` | Generate: `openssl rand -hex 32` (run in terminal) |
| `JWT_REFRESH_SECRET` | Generate: `openssl rand -hex 32` (different one) |
| `SHOPIFY_API_KEY` | (leave blank for now) |
| `SHOPIFY_API_SECRET` | (leave blank for now) |
| `SHOPIFY_STORE_URL` | `rollladenwelt.myshopify.com` |
| `FRONTEND_URL` | `https://rollladenwelt.myshopify.com` |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |

**How to generate random strings:**
```bash
openssl rand -hex 32
# Output: a1b2c3d4e5f6... (copy this)
```

### 2.4 Deploy

1. Click "Deploy"
2. Wait 2-3 minutes
3. See "Congratulations! Your project has been successfully deployed"
4. Click "Visit" or go to `https://your-project-name.vercel.app`

✅ Backend deployed!

### 2.5 Get Your Vercel URL

On the Vercel dashboard, copy your project URL:
- Example: `https://rollladen-backend.vercel.app`
- You'll need this in the next step

---

## ✅ Step 3: Update Shopify Frontend (2 minutes)

### 3.1 Update API URL

1. Open: `c:\Projects\Shopify\assets\auth-config.js`
2. Find line 2: `apiUrl: 'https://your-vercel-project.vercel.app',`
3. Replace with your actual Vercel URL:
   ```javascript
   apiUrl: 'https://rollladen-backend.vercel.app',  // Your URL here
   ```
4. Save the file

### 3.2 Push to Shopify

```bash
cd c:\Projects\Shopify
shopify theme push --development
```

Wait for upload to complete. You should see:
```
Theme upload complete ...
✓ The theme 'Development...' (#188850536823) was pushed successfully.
```

✅ Frontend updated!

---

## ✅ Step 4: Create Auth Page in Shopify (3 minutes)

### 4.1 Create Auth Template & Section

The theme includes:
- `templates/page.auth.json` - Auth page template
- `sections/auth.liquid` - Auth form section

Both are pre-configured. Just push to Shopify:

```bash
cd c:\Projects\Shopify
shopify theme push --development
```

### 4.2 Create Page in Shopify Admin

1. Go to https://rollladenwelt.myshopify.com/admin
2. Navigate to: **Pages**
3. Click **"Add page"**
4. Fill in:
   - **Title**: `Auth`
   - **Slug**: `auth` (must be exactly `auth`)
   - **Content**: Leave blank
   - **Template**: `Standard-Seite` (default template)
5. Click **"Save"**

### 4.3 Verify It Works

1. Go to https://rollladenwelt.myshopify.com/pages/auth
2. Should see login/register form with:
   - Purple background
   - "Rollladen Shop" header
   - "Anmelden" and "Registrieren" tabs
   - Form fields for registration

✅ Auth page is live!

---

## ✅ Step 5: Test Full Auth Flow (10 minutes)

### 5.1 Test Health Check

First, verify backend is running:

```bash
curl https://rollladen-backend.vercel.app/health
```

Expected response:
```json
{"status":"ok","timestamp":"2025-12-17T..."}
```

✅ Backend is responding

### 5.2 Test Registration

**Via UI (easier):**

1. Go to https://rollladenwelt.myshopify.com/pages/auth
2. Click **"Registrieren"** tab
3. Fill out form:
   ```
   Land: Deutschland
   Unternehmen: Test GmbH
   Ansprechpartner: Max Mustermann
   E-Mail: test@example.de
   Telefon: +49 123 456789
   Passwort: TestPass123!
   Straße: Hauptstraße 1
   Postleitzahl: 10115
   Stadt: Berlin
   ```
4. Click **"Registrieren"**

**Expected:**
- See "Registrierung erfolgreich!" message
- Wait 2 seconds
- Auto-redirect to `/pages/customizer`
- Customizer form should be visible

✅ Registration works!

### 5.3 Test Login After Logout

1. Open browser DevTools (F12)
2. Go to Console tab
3. Run: `localStorage.clear()`
4. Refresh page
5. Should see login message again
6. Go to `/pages/auth`
7. Click **"Anmelden"** tab
8. Enter:
   ```
   E-Mail: test@example.de
   Passwort: TestPass123!
   ```
9. Click **"Anmelden"**

**Expected:**
- Success message
- Redirect to customizer
- Customizer visible (not login message)

✅ Login works!

### 5.4 Test Token Persistence

1. Go to customizer (after logging in)
2. Refresh page (Ctrl+R)
3. Customizer should STILL be visible (not login message)
4. Open DevTools → Application → Storage → localStorage
5. Should see:
   - `auth_token` - JWT token
   - `refresh_token` - Refresh token
   - `current_user` - User data

✅ Tokens persisting!

### 5.5 Test Address Management (Optional)

1. Stay logged in (in DevTools console)
2. Run:
   ```javascript
   AuthManager.addAddress({
     address_type: 'billing',
     street: 'Alexanderstraße 1',
     postal_code: '10115',
     city: 'Berlin',
     country: 'de',
     is_default: true
   })
   ```
3. Check response in console
4. Should see new address object with ID

✅ API working!

---

## ✅ Step 6: Verify Database (Database check)

### 6.1 Check Registered Users

In Neon SQL Editor:
```sql
SELECT id, email, company_name, country, created_at FROM users;
```

Should show your test user:
```
id | email              | company_name | country | created_at
1  | test@example.de    | Test GmbH    | de      | 2025-12-17...
```

✅ User created in database!

### 6.2 Check Addresses

```sql
SELECT id, user_id, address_type, street, city FROM addresses;
```

Should show:
```
id | user_id | address_type | street        | city
1  | 1       | shipping     | Hauptstraße 1 | Berlin
```

✅ Address saved!

---

## 🎯 Troubleshooting

### "Failed to fetch" on registration (CORS error)

**Problem:** CORS headers not configured or backend not recognizing origin

**Fix:**
1. Check `auth-config.js` line 2 has correct Vercel URL
2. In Vercel Settings → Environment Variables, verify `FRONTEND_URL` = `https://rollladenwelt.myshopify.com`
3. Backend's CORS is configured to allow all origins - should work
4. If still blocked:
   - Clear browser cache (Ctrl+Shift+Delete)
   - Hard refresh page (Ctrl+Shift+R)
   - Check DevTools → Network tab for 403 status on OPTIONS preflight request
5. Redeploy backend if needed: Push to GitHub and Vercel will auto-deploy

### "Database connection failed"

**Problem:** `DATABASE_URL` is wrong

**Fix:**
1. Copy fresh connection string from Neon dashboard
2. Paste into Vercel environment variables
3. Redeploy backend
4. Test health check again

### Page shows login message but I'm logged in

**Problem:** Auth check not working

**Fix:**
1. DevTools → Console: `localStorage.getItem('auth_token')`
2. If it shows a token, auth is working
3. If empty, try logging in again
4. If still empty, check backend logs: `vercel logs https://your-app.vercel.app`

### Registered but can't login

**Problem:** Password not hashing correctly

**Fix:**
1. Try registration with different email
2. Check Neon: `SELECT * FROM users;`
3. Verify `password_hash` is NOT null and NOT empty
4. If password_hash is null, backend is broken - check logs

### Customizer shows but no forms appear

**Problem:** roller-config.js not loading or auth_token in wrong format

**Fix:**
1. DevTools → Network tab
2. Check if `roller-config.js` loaded (200 status)
3. In Console: `window.RollerConfig` should exist
4. If not, hard refresh (Ctrl+Shift+R)

---

## ✅ Final Verification Checklist

- [ ] Backend deployed to Vercel
- [ ] Health check returns `{"status":"ok"}`
- [ ] Database initialized with tables
- [ ] Auth page visible at `/pages/auth`
- [ ] Registration works
- [ ] Login works
- [ ] Tokens stored in localStorage
- [ ] Customizer hidden until login
- [ ] Customizer shows after login
- [ ] Page refresh preserves login
- [ ] Logout clears tokens
- [ ] User data in database
- [ ] Addresses in database

✅ **All systems go!**

---

## 🚀 Phase 4 is LIVE

Your authentication system is now production-ready!

**Users can now:**
1. Register with company info
2. Log in securely
3. Access customizer after auth
4. Stay logged in across page refreshes
5. Manage shipping/billing addresses

**Next phase options:**
- Test edge cases & performance
- Add LexOffice integration (Phase 4B)
- Build customer dashboard (Phase 4C)
- Implement Shopify OAuth (Phase 4D)

---

## 📝 Keep These URLs Handy

| Service | URL |
|---------|-----|
| **Auth Page** | https://rollladenwelt.myshopify.com/pages/auth |
| **Customizer** | https://rollladenwelt.myshopify.com/pages/customizer |
| **Backend Health** | https://your-backend.vercel.app/health |
| **Vercel Logs** | `vercel logs https://your-backend.vercel.app` |
| **Neon Dashboard** | https://console.neon.tech |
| **Shopify Admin** | https://rollladenwelt.myshopify.com/admin |

---

## 🔧 Common Operations

### View Backend Logs
```bash
vercel logs https://your-backend.vercel.app
```

### Restart Backend
```bash
cd backend
git add .
git commit -m "Restart"
git push
# Vercel auto-deploys
```

### Reset Database (⚠️ Deletes all data)
```bash
psql postgresql://... < backend/db/schema.sql
```

### Check Database Users
```bash
psql postgresql://...
SELECT * FROM users;
\q
```

---

Finished? Great! 🎉 Let me know if you hit any issues during deployment.
