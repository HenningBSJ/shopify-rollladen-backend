<!-- Copyright 2025 HeJo Projects - Alle Rechte beibehalten -->
# Backend Deployment Guide (Phase 4)

## Update (April 2026): Produktionsmonitor, Scan, Material & Etiketten

Dieses Backend betreibt neben Auth/Shopify-Integrationen auch einen produktionsnahen Slack-Workflow:

- Monitor UI: `/display` (LAN, Desktop + Mobile/Safari)
- Scan: QR (`rwjob:Rec...`) → Bestätigen → Status-Update in Slack (`/api/production/scan`)
- Material: erzeugt Material-Bestellungen in `SLACK_MATERIAL_LIST_ID` (`/api/production/material`)
- Admin-Edit: Titel/Details aus dem Monitor direkt in Slack ändern (`/api/production/edit`, geschützt per `MONITOR_ADMIN_KEY`)
- Etiketten: Brother DK‑11201 (29×90 mm), Druck aus dem Details-Dialog (`/display/label`)

## Deployment-Variante A (Empfohlen): Windows / LAN Server (Büro)

### Voraussetzungen
- Windows-PC als Server im Büro (statische IP oder DHCP-Reservierung empfohlen)
- Slack App/Bot Token mit Zugriff auf Slack Lists (Produktion + Material)
- Optional: Reverse Proxy + HTTPS (falls Einbettung in Shopify oder Zugriff von außen gewünscht)

### Setup (.env)
In `backend/.env` konfigurieren:

| Variable | Beispiel | Zweck |
|---|---|---|
| `PORT` | `3006` | Server-Port |
| `HOST` | `0.0.0.0` | Im LAN erreichbar machen |
| `DISPLAY_BASE_URL` | `https://monitor.rollladenwelt.de/display` | Basis-URL für QR-Links |
| `SLACK_BOT_TOKEN` | `xoxb-...` | Slack Bot Token |
| `SLACK_LIST_ID` | `L123...` | Slack List: Produktion |
| `SLACK_MATERIAL_LIST_ID` | `L456...` | Slack List: Material |
| `SLACK_MATERIAL_ASSIGNEE` | `U123...` | Standard-Empfänger der Material-Einträge |
| `SLACK_ACTIVITY_CHANNEL` | `C123...` | Optional: Log/Spiegelung von Aktionen |
| `SLACK_ORDER_INTAKE_CHANNEL` | `C123...` | Kanal für normale Intake-Nachrichten |
| `SLACK_EMERGENCY_CHANNEL` | `C123...` | Optional: separater Kanal für Notfall-Alarme; Fallback ist `SLACK_ORDER_INTAKE_CHANNEL` |
| `SLACK_EMERGENCY_MENTION` | `<!channel>` | Mention für Push-Benachrichtigungen, z.B. `<!channel>`, `<!here>`, `<@U123>` oder `<!subteam^ID>` |
| `MONITOR_ADMIN_KEY` | `...` | Admin-Key für Bearbeiten im Monitor |
| `MONITOR_HTTP_USER` | `monitor` | Optional: HTTP Basic Auth Benutzer (Schutz für öffentliches Internet) |
| `MONITOR_HTTP_PASSWORD` | `...` | Optional: HTTP Basic Auth Passwort (wenn gesetzt, sind `/display` + `/api/production/*` geschützt) |
| `AUTO_SYNC_MONTAGE_FROM_DUE` | `true` | Optional: wenn Montage leer, Montagetermin aus Fälligkeit nachtragen |
| `ALLOW_START_WITHOUT_DB` | `true` | Optional: Start auch ohne DB (Monitoring/Slack funktioniert ohne DB) |

### Start / Neustart
```bash
cd backend
npm install
npm run dev:watch
```

Aufruf:
- Monitor: `https://monitor.rollladenwelt.de/display`

### Zugriff aus anderem LAN / Internet (ohne VPN)
Private IPs (`192.168.x.x`) sind von außen nicht erreichbar. Für den einfachen und sicheren Zugriff von Kolleginnen außerhalb des Büros (ohne IT-Aufwand) nutzen wir einen Cloudflare Tunnel (`cloudflared`) in Kombination mit Basic Authentication.

1. **Vorbereitung (`.env`)**:
   Stelle sicher, dass `MONITOR_HTTP_USER` und `MONITOR_HTTP_PASSWORD` gesetzt sind, damit die Seite im Internet nicht öffentlich einsehbar ist.
   
2. **Tunnel & Server automatisch starten**:
   Nutze das bereitgestellte PowerShell-Skript:
   ```powershell
   cd backend\scripts
   .\start-tunnel.ps1
   ```
   Das Skript prüft, ob der Node-Server läuft (startet ihn ggf.) und richtet den HTTPS-Tunnel ein.

3. **URL weitergeben**:
   URL ist dauerhaft: `https://monitor.rollladenwelt.de/display`. Der Zugriff erfordert den unter Schritt 1 konfigurierten Benutzernamen und Passwort.

### Intake-Notfall
- Im Intake gibt es einen `Notfall`-Schalter.
- Beim Senden erscheint ein Bestätigungsdialog.
- Zusätzlich zur normalen Intake-Nachricht wird eine separate Slack-Alarmnachricht gesendet.
- Push-Benachrichtigungen werden über `SLACK_EMERGENCY_MENTION` ausgelöst, typischerweise `<!channel>` oder eine gezielte User-/Usergroup-Mention.

### Autostart (Task Scheduler)
Empfohlen: Aufgabenplanung → Aufgabe erstellen → „Beim Systemstart“:
- Programm/Skript: `node`
- Argumente: `-r dotenv/config src/index.js`
- Start in: `C:\Projects\Shopify\backend`

### Automatischer Neustart bei Zugriffsfehlern
Fuer Windows gibt es zwei Hilfsskripte:

- `scripts\restart-backend.ps1`: beendet den Listener auf Port `3006` und startet das Backend neu
- `scripts\ensure-backend.ps1`: prueft `/health` und startet nur bei Fehlern neu
- `scripts\ensure-cloudflared.ps1`: prueft die oeffentliche `/health` und startet bei Cloudflare/Tunnel-Problemen den Windows-Service `cloudflared` neu
- `scripts\install-watchdogs.ps1`: richtet beide Watchdogs in der Windows-Aufgabenplanung ein

Empfohlener Test:

```powershell
cd C:\Projects\Shopify\backend\scripts
.\ensure-backend.ps1 -LocalHealthUrl "http://127.0.0.1:3006/health" -PublicHealthUrl "https://monitor.rollladenwelt.de/health"
```

Cloudflare/Tunnel separat testen:

```powershell
cd C:\Projects\Shopify\backend\scripts
.\ensure-cloudflared.ps1 -PublicHealthUrl "https://monitor.rollladenwelt.de/health" -LocalHealthUrl "http://127.0.0.1:3006/health"
```

Empfohlene Aufgabenplanung (entspricht "Cron" unter Windows):

1. Aufgabenplanung oeffnen
2. Aufgabe erstellen
3. Trigger: "Alle 5 Minuten"
4. Aktion:
   - Programm/Skript: `powershell.exe`
   - Argumente:
     `-ExecutionPolicy Bypass -File "C:\Projects\Shopify\backend\scripts\ensure-backend.ps1" -Port 3006 -LocalHealthUrl "http://127.0.0.1:3006/health" -PublicHealthUrl "https://monitor.rollladenwelt.de/health"`
5. Option "Aufgabe so schnell wie moeglich nach einem verpassten Start ausfuehren" aktivieren

Hinweise:

- Fuer aktive Entwicklungsarbeit kann die Aufgabe mit `-UseWatch` gestartet werden; fuer stabilen Hintergrundbetrieb ist der Standard ohne Watch robuster.
- Wenn nur der Cloudflare-Tunnel stoert, hilft ein Backend-Neustart allein moeglicherweise nicht. Dann braucht der Tunnel einen separaten Watchdog (siehe `ensure-cloudflared.ps1` / `install-watchdogs.ps1`).

### Drucker/Etikett
- Etikett: Brother DK‑11201 (29×90 mm)
- Auslösen: Details-Dialog → „Etikett“ → Browser-Druckdialog

## Deployment-Variante B (Optional): Vercel + Neon (Auth/Shopify Backend)

Diese Variante betrifft den Auth/Customer-Bereich und ist unabhängig vom Produktionsmonitor.

### Voraussetzungen
- Neon PostgreSQL account
- Vercel account
- GitHub repo (für Vercel Integration)

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

## Update 2026-07-23
- Testmodus fuer die neue Bestandsansicht vorbereitet; Details und Status in WORKLOG_2026-07-23.md.
- Materialkatalog fuer Panzer, Endleisten, Clips, Ersatzteile und Schnittware erweitert.
- Aktueller Hinweis: Die Route /display/bestand ist im Quellstand vorhanden, die laufende Browser-Auslieferung war im Test noch nicht konsistent.
