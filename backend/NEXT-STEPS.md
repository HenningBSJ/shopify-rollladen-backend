# Next Steps: ISS / SP-B 35

Stand: 2026-08-12

## Sofort sinnvoll

### 1. Notfall-Funktion (Monitor) überwachen und stabil halten
Status: **Live seit 2026-08-12**

Umsetzung (kurz):
- Backend `buildBoardItem()` → `detectEmergency()` durchsucht alle Slack-Felder robust auf "NOTFALL" (inkl. INFOS-Feld & tief verschachtelte Rich-Text elements)
- Frontend `display.js` → 4-stufige Hervorhebung: `.card.emergency` mit Rot-Verlauf, 5px Warnstreifen oben, NOTFALL-Badge ERSTES Element, Details-Rot-Header + Suchindex-Erweiterung
- Praxis-Test erfolgreich: Auftrag Rec0BP8582D55 (INFOS = "NOTFALL AKTIVIEREN") wird als emergency=true erkannt und optisch hervorgehoben

Nächste Schritte / Überwachung:
- Wenn neue Aufträge im Intake mit NOTFALL-Schalter angelegt werden, stichprobenartig prüfen, dass Badge + Warnstreifen auf der Monitor-Ansicht erscheinen
- Bei "komisch aussehenden" Karten (z. B. keine Notfallfarbe, obwohl INFOS NOTFALL sagt) zuerst Backend neu starten via Desktop-Shortcut (→ altes Code-Image im RAM ist häufigste Ursache)
- Optional bei Bedarf: Wortliste der Notfall-Trigger erweitern (z. B. `EILT`, `SOFORT`, `DRINGEND`) in [production.js#L1466-L1469](file:///c:/Projects/Shopify/backend/src/routes/production.js#L1466-L1469)

### 2. Cloudflared-Dienst und Stack-Neustart verifizieren

Status:

- Ursache für wiederkehrenden `Error 1033` ist gefunden: Dienst `cloudflared` war vorher ohne Config/Tunnel konfiguriert.
- Am 2026-08-06 wurde `ChangeServiceConfig ERFOLG` in der Admin-Shell bestätigt; die neue Commandline nutzt jetzt `--config C:\Projects\Shopify\cloudflared\config.yml run rollladen-monitor`.
- Für Notfälle gibt es jetzt Desktop-Shortcuts und Skripte, die Backend + Tunnel sauber neu starten.

Naechste konkrete Schritte:

- Nach nächstem Windows-Neustart pruefen, ob der Dienst nun von allein einen nutzbaren Tunnel aufbaut.
- Wenn der Dienst wieder in `STOP_PENDING` haengt: Desktop-Shortcut `Monitor & Cloudflared neustarten` nutzen.
- Im Log Availability/Incidents nachsehen, ob 1033-Fälle abnehmen.

### 3. ISS-Arbeitsseite weiter ausbauen

Ziel:

- Die vorhandene Arbeitsseite fuer `SP-B 35` von einer guten Basis zu einer durchgaengigen Produktionshilfe ausbauen.

Naechste konkrete Schritte:

- weitere Montage- und Vorbereitungsschritte ergaenzen
- Materialbereitstellung noch klarer fuehren
- Bildbereiche und visuelle Hilfen weiter verbessern
- Overlay-Positionen auf dem Gehrungssaege-Foto bei Bedarf weiter feinjustieren

## Fachlich wichtig

### 3. Fachdaten vervollstaendigen

Offen:

- Gaze-Artikelnummern nachtragen
- ggf. vorlaeufige Platzhalter in `sp-b35-parts.json` schaerfen
- Federstift-/Masslogik bei Bedarf fachlich final absichern

### 4. Auftragsdaten optional erweitern

Sinnvoll als naechster Komfortschritt:

- Paketanzahl nicht nur als Druckoption, sondern optional direkt am Auftrag speichern
- damit Paketserien spaeter ohne erneute Eingabe erneut gedruckt werden koennen

## Technisch wichtig

### 5. DB- und Umgebungsproblem pruefen

Offen:

- `.env` / `DATABASE_URL` wegen `Invalid URL` sauber pruefen
- entscheiden, ob das Thema direkt behoben oder bewusst separat geplant wird

## Technisch wichtig

### 6. Monitor-Stabilitaet weiter absichern

Bereits vorhanden:
- `backend/data/uptime/availability-checks.ndjson`
- `backend/data/uptime/availability-incidents.ndjson`
- Desktop-Shortcuts und Stack-Skript `backend/scripts/restart-stack.ps1` (Default: mit `--watch`)
- Notfall-Funktion: `emergency` boolean im Board-Response, `GET /api/production/debug?limit=2000` für rohe Slack-Items (liefert `date_created`/`updated_timestamp`)

Bei kuenftigen Monitorfehlern immer zuerst pruefen:

- `http://127.0.0.1:3006/health`
- `http://127.0.0.1:3006/api/production/board`
- syntaktische Gueltigkeit des ausgelieferten `/display`-Skripts
- ob wirklich die erwartete Instanz auf Port `3006` laeuft
- ob ein `Cloudflare 1033` vorliegt oder das Backend selbst ausfaellt

## Spaeter geplant

### 7. Produktbereich erweitern

Nach `SP-B 35`:

- ISS-Dreh-/Schiebetueren
- ISS-Rollos

## Empfohlene Reihenfolge

1. Notfall-Funktion im Tagesbetrieb beobachten (keine falschen Positives/Negatives) → bei Bedarf Trigger-Liste in `detectEmergency()` schärfen
2. nach naechstem Reboot prüfen, dass `cloudflared`-Dienst + Monitor sauber hochkommen (sonst Desktop-Shortcut verwenden)
3. `ISS-Arbeitsseite` fuer `SP-B 35` weiter ausbauen
4. fehlende Gaze- und Teileinformationen nachziehen
5. optional Paketanzahl als Auftragswert einfuehren
6. `.env` / DB-URL-Thema bereinigen
7. danach auf weitere ISS-Produktgruppen erweitern
