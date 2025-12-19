# Phase 4 - Complete File Reference

## Quick Navigation

| What I Need | File | Location |
|------------|------|----------|
| **Start here** | `QUICKSTART_PHASE4.md` | Project root |
| **Detailed setup** | `SETUP_PHASE4.md` | Project root |
| **Technical overview** | `PHASE4_SUMMARY.md` | Project root |
| **This file** | `PHASE4_FILES.md` | Project root |
| **Backend files** | `backend/` | Project root |
| **Frontend files** | Assets & sections | Shopify theme |

---

## Backend Files (Vercel Deployment)

Located: `c:\Projects\Shopify\backend\`

### Configuration
```
backend/
├── package.json                 Dependencies (Express, pg, bcryptjs, jwt, etc.)
├── vercel.json                  Vercel deployment config
└── .env.example                 Environment variables template (copy to .env)
```

### Database
```
backend/db/
└── schema.sql                   PostgreSQL schema (users, addresses, orders, etc.)
                                 Run this on Neon: psql < db/schema.sql
```

### Source Code
```
backend/src/
├── index.js                     Express server entry point
├── db.js                        PostgreSQL connection pool
├── auth.js                      Password hashing & JWT utilities
├── middleware.js                Auth middleware & error handler
└── routes/
    ├── auth.js                  /api/auth/* endpoints (register, login, refresh, me)
    └── addresses.js             /api/addresses/* endpoints (CRUD)
```

### Deployment Docs
```
backend/
└── DEPLOYMENT.md                Step-by-step deployment instructions
```

### Environment Variables (.env)
```
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/rollladen
JWT_SECRET=<random-hex-string>
JWT_REFRESH_SECRET=<random-hex-string>
SHOPIFY_API_KEY=<leave-blank-for-now>
SHOPIFY_API_SECRET=<leave-blank-for-now>
SHOPIFY_STORE_URL=rollladenwelt.myshopify.com
FRONTEND_URL=https://rollladenwelt.myshopify.com
NODE_ENV=production
PORT=3000
```

---

## Frontend Files (Shopify Theme)

Located: `c:\Projects\Shopify\`

### New Assets (JavaScript & CSS)
```
assets/
├── auth-config.js               Client-side auth manager
│                                 - Login & registration
│                                 - Token management
│                                 - API calls with auto-refresh
│                                 - Address management
│
└── auth-config.css              Auth page styling
                                 - Login/register form design
                                 - Responsive mobile layout
                                 - Error messages
                                 - Loading states
```

### New Sections (Liquid Templates)
```
sections/
├── auth-page.liquid             Login/registration page
│                                 - Tabs for login/register
│                                 - Form validation
│                                 - Success/error alerts
│                                 - Country selector
│
└── roller-customizer.liquid     MODIFIED - Added auth guard
    (modified)                    - Checks token on page load
                                 - Shows login message if not auth'd
                                 - Shows customizer if auth'd
```

### Documentation Files (Root)
```
Project Root/
├── QUICKSTART_PHASE4.md          ← START HERE: 5-minute setup guide
├── SETUP_PHASE4.md               ← THEN: Detailed deployment steps
├── PHASE4_SUMMARY.md             ← Technical overview & architecture
├── PHASE4_FILES.md               ← This file
├── ROADMAP_WALL.md               ← Overall project phases
├── CLAUDE.md                      ← Session history & code locations
└── DAWN_PROJECT.md               ← Complete project documentation
```

---

## How Everything Connects

```
1. User visits: https://rollladenwelt.myshopify.com/pages/customizer

2. roller-customizer.liquid loads
   → Loads auth-config.js
   → Checks: if (window.AuthManager.isAuthenticated())
   
3a. NOT logged in:
    → auth-config.js shows login message
    → User clicks "Zur Anmeldung"
    → Redirects to: /pages/auth
    
3b. IS logged in:
    → auth-page.liquid shows customizer form
    → Form loads, user can configure roller shutter

4. On login/register:
   → auth-page.liquid calls window.AuthManager.login()
   → auth-config.js sends POST to backend API
   → Backend (Vercel) validates & generates JWT
   → Tokens stored in localStorage
   → User redirected back to /pages/customizer
```

---

## File Dependencies

### JavaScript Dependencies (Backend)
```
express        - Web server framework
pg             - PostgreSQL driver
bcryptjs       - Password hashing
jsonwebtoken   - JWT creation/validation
cors           - CORS middleware
validator      - Email/input validation
dotenv         - Environment variables
```

### Shopify Theme Dependencies
```
auth-config.js
  → Calls backend API at: https://your-vercel-project.vercel.app
  → Stores tokens in localStorage
  → Used by roller-customizer.liquid

auth-config.css
  → Imported by auth-page.liquid
  → Styles for login/register forms

auth-page.liquid
  → Uses auth-config.js for API calls
  → Uses auth-config.css for styling

roller-customizer.liquid
  → Loads auth-config.js
  → Checks authentication status
  → Either shows customizer or login prompt
  → Existing roller-config.js still works (no changes)
```

---

## Database Schema

### users
```
id              SERIAL PRIMARY KEY
email           VARCHAR(255) UNIQUE NOT NULL
password_hash   VARCHAR(255)
company_name    VARCHAR(255)
contact_person  VARCHAR(255)
phone           VARCHAR(20)
country         VARCHAR(2) - 'de', 'at', 'ch', 'li'
shopify_customer_id VARCHAR(255)
shopify_oauth_token VARCHAR(255)
created_at      TIMESTAMP DEFAULT NOW()
updated_at      TIMESTAMP DEFAULT NOW()
last_login      TIMESTAMP
```

### addresses
```
id              SERIAL PRIMARY KEY
user_id         FOREIGN KEY → users.id
address_type    VARCHAR(20) - 'shipping' or 'billing'
street          VARCHAR(255)
postal_code     VARCHAR(20)
city            VARCHAR(255)
country         VARCHAR(2)
is_default      BOOLEAN DEFAULT FALSE
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

### refresh_tokens
```
id              SERIAL PRIMARY KEY
user_id         FOREIGN KEY → users.id
token_hash      VARCHAR(255) UNIQUE (bcrypt hashed)
expires_at      TIMESTAMP
created_at      TIMESTAMP
```

### orders (For Future Use)
```
id              SERIAL PRIMARY KEY
user_id         FOREIGN KEY → users.id
shopify_order_id VARCHAR(255) UNIQUE
order_number    INTEGER
total_price     DECIMAL(10, 2)
currency        VARCHAR(3)
shipping_address_id FOREIGN KEY → addresses.id
billing_address_id FOREIGN KEY → addresses.id
order_data      JSONB (stores full order details)
status          VARCHAR(50) - 'pending', 'completed', etc.
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

---

## API Endpoints Reference

### Authentication
```
POST /api/auth/register
  Body: {
    email, password, company_name, contact_person, phone, country,
    street, postal_code, city
  }
  Returns: { user, accessToken, refreshToken }

POST /api/auth/login
  Body: { email, password }
  Returns: { user, accessToken, refreshToken }

POST /api/auth/refresh
  Body: { refreshToken }
  Returns: { accessToken }

GET /api/auth/me
  Header: Authorization: Bearer {token}
  Returns: { user details }
```

### Addresses (Protected - Requires Auth Token)
```
GET /api/addresses
  Returns: [{ id, user_id, address_type, street, postal_code, city, ... }]

POST /api/addresses
  Body: { address_type, street, postal_code, city, country, is_default }
  Returns: { new address }

PUT /api/addresses/:id
  Body: { street, postal_code, city, country, is_default }
  Returns: { updated address }

DELETE /api/addresses/:id
  Returns: { message: 'Address deleted' }
```

---

## Environment-Specific Notes

### Neon PostgreSQL
- Connection string: `postgresql://...`
- Free tier includes 3 projects, unlimited databases
- IP whitelist: Vercel IPs are allowed by default
- SSL: Required in production
- Dashboard: https://console.neon.tech

### Vercel
- Deployment: Push to GitHub → auto-deploy
- Environment variables: Set in project settings
- Logs: View with `vercel logs https://project.vercel.app`
- Functions: Automatically scalable
- Cost: Free tier available

### Shopify Theme
- Theme ID: 188850536823 (development)
- Push: `shopify theme push --development`
- Pages: Create manually in Shopify admin
- Template selection: Choose `auth-page` for `/pages/auth`

---

## Testing Checklist

- [ ] Backend deployment successful
- [ ] Database tables created in Neon
- [ ] Frontend API URL updated in auth-config.js
- [ ] Shopify theme files pushed
- [ ] Auth page created (`/pages/auth`)
- [ ] Registration works
- [ ] Login works
- [ ] Tokens stored in localStorage
- [ ] Customizer hidden until login
- [ ] Customizer shows after login
- [ ] Logout clears tokens
- [ ] Page refresh preserves login

---

## Common Tasks

### Update Backend Code
```bash
cd backend
# Make changes
git add .
git commit -m "Update"
git push
# Vercel auto-deploys
```

### View Backend Logs
```bash
vercel logs https://your-project.vercel.app
```

### Reset Database (BE CAREFUL!)
```bash
psql postgresql://... < db/schema.sql
```

### Update Frontend
```bash
cd c:\Projects\Shopify
# Edit files
shopify theme push --development
```

### Test API Manually
```bash
curl -X POST https://your-backend.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.de",...}'
```

---

## Phase 4 Completion Status

**Completed (85%):**
- ✅ Backend API infrastructure
- ✅ Database schema
- ✅ Authentication system
- ✅ Token management
- ✅ Frontend login/register UI
- ✅ Customizer auth guard
- ✅ Deployment documentation

**Pending (15%):**
- 🔄 Live testing & verification
- 📋 LexOffice integration (Phase 4B)
- 📋 Customer dashboard (Phase 4C)
- 📋 Shopify OAuth (Phase 4D)
- 📋 Invoice generation (Phase 5)

---

## Next Steps

1. **Follow QUICKSTART_PHASE4.md** - Deploy backend in 5 minutes
2. **Test registration & login** - Verify everything works
3. **Check SETUP_PHASE4.md** - Troubleshooting & detailed guide
4. **Review PHASE4_SUMMARY.md** - Understand the architecture
5. **Plan Phase 4B** - LexOffice integration for trade discounts

---

**Questions?** Check the relevant guide:
- How do I deploy? → `QUICKSTART_PHASE4.md` or `SETUP_PHASE4.md`
- How does this work? → `PHASE4_SUMMARY.md`
- What files did I get? → `PHASE4_FILES.md` (this file)
- What's the next phase? → `ROADMAP_WALL.md`
