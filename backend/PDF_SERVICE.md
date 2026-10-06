# PDF Service (Lieferschein / Produktionszettel)

## Update (April 2026): Produktionsmonitor & Slack-Workflows

Zusätzlich zum PDF-Service gibt es eine lokale Produktionsansicht, die Slack Lists nutzt:

- Monitor UI: `/display`
- Etikettendruck (Brother DK‑11201, 29×90 mm): `/display/label`
- QR Rendering (PNG): `/api/qr?text=...`
- Scan/Status-Update: `/api/production/scan`
- Material-Bestellungen (Slack List): `/api/production/material`
- Admin-Edit (Monitor → Slack): `/api/production/edit` (geschützt per `MONITOR_ADMIN_KEY`)

## Endpoints

- `GET /api/pdf/status?orderId=<number>`
- `POST /api/pdf/generate`
  - Body: `{ "orderId": 123, "types": ["packing_slip", "production"] }`

## Environment

- `SHOPIFY_STORE_URL`
- `SHOPIFY_ADMIN_TOKEN`
- `SHOPIFY_API_VERSION` (optional, default: `2025-01`)
- `PDF_API_KEY` (optional; sent as `X-API-Key`)
- `PDF_PUBLIC_BASE_URL` (e.g. `https://your-backend.vercel.app`)
- `PDF_LOCAL_DIR` (for local storage; default: `./tmp`)
- `ALLOW_START_WITHOUT_DB=true` (optional for running without Postgres)
  - Hinweis: Der Produktionsmonitor/Slack-Workflows laufen auch ohne DB.

## Output

This implementation currently stores HTML documents at:

- `/pdfs/orders/<orderId>/packing_slip_<orderId>_<YYYYMMDD>.html`
- `/pdfs/orders/<orderId>/production_<orderId>_<YYYYMMDD>.html`

The next step is to replace HTML output with PDF rendering and to store to a durable bucket (S3/GCS) instead of local disk.

## Update 2026-07-23
- Testmodus fuer die neue Bestandsansicht vorbereitet; Details und Status in WORKLOG_2026-07-23.md.
- Materialkatalog fuer Panzer, Endleisten, Clips, Ersatzteile und Schnittware erweitert.
- Aktueller Hinweis: Die Route /display/bestand ist im Quellstand vorhanden, die laufende Browser-Auslieferung war im Test noch nicht konsistent.
