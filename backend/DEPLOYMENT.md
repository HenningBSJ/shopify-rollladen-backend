# Phase 4 Backend Deployment Guide

## Prerequisites
- Neon PostgreSQL account (free tier available)
- Vercel account (free tier available)
- GitHub account (for Vercel integration)

## Step 1: Set Up PostgreSQL on Neon

1. Go to https://neon.tech and sign up
2. Create a new project named "rollladen"
3. Copy the connection string from Neon:
   ```
   postgresql://user:password@ep-xxx.neon.tech/rollladen
   ```
4. Initialize the database schema:
   ```sql
   psql postgresql://user:password@ep-xxx.neon.tech/rollladen < db/schema.sql
   ```

## Step 2: Deploy to Vercel

1. Push this backend folder to a GitHub repository
   ```bash
   cd backend
   git init
   git add .
   git commit -m "Initial backend setup"
   git push origin main
   ```

2. Go to https://vercel.com/new and import your repository

3. Configure environment variables in Vercel:
   - `DATABASE_URL` = Your Neon connection string
   - `JWT_SECRET` = Generate a random string (openssl rand -hex 32)
   - `JWT_REFRESH_SECRET` = Generate another random string
   - `SHOPIFY_API_KEY` = Your Shopify app key (later)
   - `SHOPIFY_API_SECRET` = Your Shopify app secret (later)
   - `SHOPIFY_STORE_URL` = rollladenwelt.myshopify.com
   - `FRONTEND_URL` = https://rollladenwelt.myshopify.com
   - `NODE_ENV` = production

4. Deploy by clicking "Deploy"

5. Your backend will be live at: `https://your-vercel-project.vercel.app`

## Step 3: Test the Backend

```bash
# Register a new customer
curl -X POST https://your-project.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "securepassword123",
    "company_name": "Test Company",
    "contact_person": "Max Mustermann",
    "phone": "+49 123 456789",
    "country": "de",
    "street": "Hauptstraße 1",
    "postal_code": "10115",
    "city": "Berlin"
  }'

# Login
curl -X POST https://your-project.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "securepassword123"
  }'

# Get current user (with token)
curl -X GET https://your-project.vercel.app/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Step 4: Connect to Shopify Customizer

Update `sections/roller-customizer.liquid` to:
1. Check for authentication token in localStorage
2. If not logged in, show login/registration page
3. If logged in, show customizer form

See the frontend changes in the next steps.

## Environment Variables Reference

| Variable | Example | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql://...` | Neon PostgreSQL connection |
| `JWT_SECRET` | `abc123xyz789...` | Sign access tokens |
| `JWT_REFRESH_SECRET` | `xyz789abc123...` | Sign refresh tokens |
| `SHOPIFY_API_KEY` | (from Shopify) | OAuth with Shopify |
| `SHOPIFY_API_SECRET` | (from Shopify) | OAuth with Shopify |
| `SHOPIFY_STORE_URL` | `rollladenwelt.myshopify.com` | Store identifier |
| `FRONTEND_URL` | `https://rollladenwelt.myshopify.com` | CORS allowed origin |
| `NODE_ENV` | `production` | Environment |
| `PORT` | `3000` | (Vercel manages this) |

## Troubleshooting

### Database Connection Failed
- Verify `DATABASE_URL` is correct in Vercel environment
- Check Neon IP whitelist allows Vercel IPs
- Run schema.sql manually if not auto-running

### CORS Errors
- Update `FRONTEND_URL` in Vercel environment
- Ensure Shopify customizer calls backend with correct URL

### Token Validation Issues
- Verify `JWT_SECRET` and `JWT_REFRESH_SECRET` are set
- Check token expiration (1 hour for access, 7 days for refresh)
- Look at Vercel logs: `vercel logs https://your-project.vercel.app`

## Monitoring

Check Vercel logs:
```bash
vercel logs https://your-project.vercel.app
```

Check Neon metrics:
- Login to Neon dashboard
- View query performance and connection stats
