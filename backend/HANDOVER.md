# Handover: ISS / SP-B 35 / Monitor

Stand: 2026-08-12

## Zielbild

Dieses Projekt entwickelt eine praxistaugliche interne Fertigungssteuerung fuer ISS-Produkte im Shopify-Umfeld, aktuell mit Fokus auf `SP-B 35`.

Zentrale Ziele:

- fehlerarmes Intake mit moeglichst vielen Dropdowns statt Freitext
- klare Trennung von `Label`, `Monitor-Kurzinfo`, `Arbeitsanweisung` und `internem Verbrauch`
- reduzierte, anfaengertaugliche Produktionsdarstellung im Monitor
- optionale schrittweise `ISS-Arbeitsseite` fuer komplexe Produkte
- Vorbereitung fuer spaetere Erweiterung auf Dreh-/Schiebetueren und ISS-Rollos

## Aktueller Gesamtstand

### 1. Intake / Formular

In `src/routes/intake-ui.js` und `src/routes/intake.js` wurde das SP-B-35-Formular fachlich und technisch weiter ausgebaut.

Aktuell umgesetzt:

- Dropdowns fuer Farben und Gaze-Auswahl
- moeglichst viele gefuehrte Eingaben statt Freitext
- gegenseitige Logik fuer `Lage` und `Federstifte`
- Regel: Wenn `Federstifte`, dann kein `Hakenmass X`
- zusaetzliche Felder fuer:
  - `Lage der Buerste`
  - `Buerstenlaenge`
  - `Stabilisierungsprofil`
- Hinweis bei `Breite` und `Hoehe`: `Ohne Abzuege eintragen!`
- `Hakenmass X` standardmaessig `4 mm`
- UI- und serverseitiger Fallback auf `4 mm`, wenn kein Hakenmass gesetzt ist und keine Federstifte aktiv sind
- neuer sichtbarer Schalter `Endleiste vorhanden`, damit `Keine Endleiste` nicht mehr nur implizit ueber Defaults entsteht
- `Endleistenfarbe` und `Gebohrt` werden nur aktiv verwendet, wenn die Endleiste wirklich vorhanden ist

Wichtige Fachregeln in der aktuellen Logik:

- innenliegend: `-4 mm` Breite / `-4 mm` Hoehe
- aussenliegend: `+36 mm` Breite / `+40 mm` Hoehe
- Federstifte schliessen Hakenmass aus
- Stabilisierungsprofil: `Elementbreite - 70 mm`
- automatische Stabi-Schwelle jetzt ab `1250 mm` Hoehe
- Einklebepunkt Stabiprofil: `(Hoehe - 70 mm) / 2`

Sichtbare Produktionsdarstellung wurde bewusst reduziert auf:

- `Schnittmass SP-B 35`
- `Stabilisierungsprofil`
- `Schlitten ...`
- `Buerste ...`

Interne Verbrauchsdaten fuer Bestand bleiben erhalten, auch wenn sie nicht mehr voll im Monitortext sichtbar sind.

### 2. Monitor / Display

In `src/routes/display.js` wurde die Darstellung weiter getrennt und fuer Produktion und Labeldruck erweitert.

Aktueller Stand:

- Kurzansicht fuer den Monitor
- Produktblock und Arbeitsblock in Karte/Details
- Label-Ausgabe nur mit High-Level-Infos
- optionale `ISS-Arbeitsseite` fuer schrittweises Arbeiten
- freie Label-Seite `Etikett ohne Auftrag`
- Paketserie fuer Auftragslabels und freie Labels

Wichtige Trennlogik:

- Label enthaelt nur:
  - Kundendaten
  - Datum
  - QR
  - High-Level-Produktbeschreibung
- Label enthaelt ausdruecklich keine Schnittanweisungen
- Arbeitsanweisungen liegen in Monitor/Detail/ISS-Arbeitsseite

#### 2.1 Notfall-Erkennung und visuelle Hervorhebung (NEU ab 2026-08-12)

Problem: Im Intake als "NOTFALL" deklarierte Aufträge mussten im Monitor UNMISSVERSTÄNDLICH sichtbar sein – vorher waren sie nicht von normalen Aufträgen zu unterscheiden.

**Erkennung (Backend) in `src/routes/production.js` → `buildBoardItem()`:**
- Closure `detectEmergency()` liefert `emergency: true/false` pro Item zurück.
- Robuste Suche über **ALLE Slack-Felder** (nicht nur title+description), damit z. B. ein Eintrag im `INFOS`-Feld wie "NOTFALL AKTIVIEREN" zuverlässig erkannt wird.
- Durchsucht zunächst zuverlässig flache Strings (`f.text`, `f.value`), danach als Fallback rekursiv tiefe Rich-Text-Bäume (`elements`, `children`, `blocks`) via Stack-basierter Tiefensuche auf `text`/`plain_text`.
- Zwei Trigger: (a) `/\bNOTFALL\b/i` (Wort NOTFALL case-insensitive irgendwo), (b) `/^NOTFALL$/im` (eigene Zeile `NOTFALL`, wie es der Intake-Toggle schreibt).

**Sichtbarkeit (Frontend) in `src/routes/display.js`:**
- Jede Karte erhält bei `item.emergency` die Klasse `.card.emergency`
- **4-stufige UI-Hervorhebung:**
  1. **Hintergrund:** Rot→Schwarz Gradient + 2px dicker roter Rahmen
  2. **Gefahrenstreifen (oben, 5px):** Wiederholter rot/hellrot Gradient "Warnband" via `::before`-Pseudo-Element
  3. **Badge (Prominent, ERSTES Element!)**: `NOTFALL` in Großbuchstaben, fett, 900 weight, rot, Briefabstand `.06em`, zusätzliche Klasse `.b-emergency`
  4. **Detail-Dialog & Suche:** `details-card` erhält `.emergency` (roter Header mit Warnband, eigene Zeile `NOTFALL: JA (Alarm wurde ausgelöst)` in Meta-Zeilen); `itemHaystack()` erweitert Suchindex um `'NOTFALL notfall dringend emergency'` sodass Suche nach `notfall`/`dringend`/`emergency` sofort greift.
- Kombinierbarkeit: `.card.emergency.question` erhält überblendeten Grün/Rot-Verlauf (Herkunftsfarbe bleibt teilbar sichtbar, nicht "übermalt").

**Praxis-Check Auftrag Rec0BP8582D55 (Strehl):**
- Erstellt am: **12.08.2026 10:58:52 Uhr** (date_created: 1786525132)
- Letztes Update: **12.08.2026 12:16:01 Uhr** (updated_timestamp: 1786529761)
- Slack-Feld `INFOS`: "NOTFALL AKTIVIEREN" → Notfall korrekt erkannt (emergency = true)
- Monitor zeigt Karte wie erwartet in Voll-Alarm-Rot-Optik mit Gefahrenstreifen + Badge.

**Achtung Betrieb:**
- Nach Änderungen an `detectEmergency()` muss das Node-Backend ggf. explizit neu gestartet werden (Watch funktioniert meistens, aber bei Structur-Änderungen des Response-Modells ist `taskkill /F /IM node.exe /T` + `npm run dev` der zuverlässigste Weg).
- Debug-Endpunkte: `GET /api/production/debug?limit=2000` liefert rohe Slack-Items (mit `date_created`, `updated_timestamp`); `GET /api/production/board` liefert fertige Items mit `emergency` boolean.

### 3. Paketdruck / Label-Logik

Der Labeldruck wurde deutlich erweitert.

Aktuell umgesetzt:

- Paketanzahl als Druckoption mit Standard `1`
- Ausgabe als Paketserie `1/3`, `2/3`, `3/3` usw.
- `Etikett (Pakete)` in der Detailansicht
- positionenbezogener Paketdruck:
  - Panzer erhalten pro Versandstueck `2` Labels
  - andere Positionen erhalten pro Versandstueck `1` Label
- freies Label-Tool unterstuetzt ebenfalls Paketserien
- Paketkennung ist gross und gut sichtbar links unten auf dem Label

Zusatz fuer freie Labels:

- optionales Haeckchen `Lieferung vom:`
- wenn aktiv, erscheint `Lieferung vom:` klein und normal im rechten Datumsblock
- das Datum bleibt gross und fett
- der Namensblock wird dabei nicht mehr vom Praefix ueberlagert

### 4. ISS-Arbeitsseite

Die `ISS-Arbeitsseite` ist in `src/routes/display.js` als vorgerenderte HTML-Arbeitsseite umgesetzt.

Bereits vorhanden:

- schrittweise Darstellung
- Material
- Maschine
- Einstellung/Mass
- Ergebnis
- Navigation durch die Schritte

Fuer `SP-B 35` bereits konkret umgesetzt:

- Schritt `Rahmenprofil saegen`
- Gehrungssaege als Maschine
- Maschinenblock mit:
  - `Modus: OP`
  - `Nummer: 1`
  - `Parameter: 70 mm`
  - `Schwenken: 44 Grad`
  - `Sollwert Breite`
  - `Sollwert Hoehe`
  - `Istwert` als Hinweis auf den kuerzeren Teil
  - `Stueck: ignorieren`
- Sollwerte fuer Breite und Hoehe immer im Format mit Dezimal-Komma, z. B. `884,0 mm`
- Einbindung des echten Displayfotos `assets/GehrungsDisplay.jpg`
- dynamische Overlays auf dem Maschinenfoto
- Schritt `Stabilisierungsprofil saegen`
- Arbeitshilfen fuer `Schlitten` und `Buerste`

Wichtiger Architekturpunkt:

- Das fruehere `about:blank`-Problem wurde dadurch geloest, dass die Arbeitsseite fertig im Hauptprozess aufgebaut und erst dann ins Popup geschrieben wird.
- Es gibt keine verschachtelten Popup-Skripte mehr.

### 5. Datenbasis

Folgende Dateien wurden als dauerhafte Wissensbasis angelegt bzw. gepflegt:

- `SP-B35.md`
- `data/sp-b35-parts.json`
- `data/sp-b35-hook-lookup.json`

Diese Dateien enthalten:

- Fachregeln
- Teile-/Artikelstruktur
- Haken-Lookups
- vorbereitete Platzhalter fuer noch fehlende Artikelnummern

## Availability-Logging und Watchdogs

Da Ausfaelle von `Monitor`, `Display` oder `Intake` besser belegbar sein sollten, wurde ein eigenes zeitgestempeltes Logging eingerichtet.

Neue Dateien:

- `backend/scripts/log-availability.ps1`
- `backend/scripts/install-availability-logger.ps1`
- `backend/data/uptime/availability-checks.ndjson`
- `backend/data/uptime/availability-incidents.ndjson`
- `backend/data/uptime/availability-state.json`

Gepruefte Ziele pro Lauf:

- lokaler Healthcheck: `http://127.0.0.1:3006/health`
- oeffentlicher Healthcheck: `https://monitor.rollladenwelt.de/health`
- oeffentliche Monitor-Seite: `https://monitor.rollladenwelt.de/display`
- oeffentliche Intake-Seite: `https://monitor.rollladenwelt.de/intake`

Funktion:

- jede Ausfuehrung schreibt einzelne Checks mit Zeitstempel in `availability-checks.ndjson`
- echte Statuswechsel werden in `availability-incidents.ndjson` als `down-start` und spaeter `recovered` dokumentiert
- der letzte bekannte Zustand liegt in `availability-state.json`
- eine geplante Task `Rollladen Availability Logger` laeuft im 1-Minuten-Intervall

Zusatz:

- `Availability Logger` und `Backend Watchdog` wurden auf fensterlosen Start via `wscript.exe` und `run-hidden.vbs` umgestellt
- damit sollen diese Hintergrundchecks beim Schreiben nicht mehr den Fokus klauen

## Cloudflared / Tunnel-Status

Es gab erneut einen `Cloudflare Tunnel error 1033`.

Aktuelle Erkenntnis:

- das Backend auf Port `3006` lief lokal korrekt
- der Windows-Dienst `cloudflared` war aber falsch bzw. unvollstaendig konfiguriert
- der Dienst startete nur die EXE, aber nicht sichtbar mit `--config ...\config.yml` und `run rollladen-monitor`
- dadurch war der Dienst formal `Running`, baute aber keinen nutzbaren Named Tunnel auf

Aktuell angelegt:

- `backend/scripts/repair-cloudflared-service.ps1`

Zweck des Skripts:

- Dienst auf expliziten Start mit Config-Pfad und Tunnelnamen umstellen
- Ziel-Commandline:
  - `cloudflared.exe tunnel --config C:\Projects\Shopify\cloudflared\config.yml run rollladen-monitor`

Wichtiger Hinweis:

- der finale Dienst-Fix braucht echte Admin-Rechte
- ohne Admin scheitert `sc.exe config cloudflared ...` mit `Zugriff verweigert`
- am 2026-08-06 wurde `ChangeServiceConfig ERFOLG` in der Admin-Shell bestätigt: die Dienst-Commandline ist jetzt umgestellt auf `--config C:\Projects\Shopify\cloudflared\config.yml run rollladen-monitor`
- falls der Dienst trotzdem in STOP_PENDING hängt, PID hart beenden und Dienst neu starten (Skript s. unten)
- kurzfristig wurde der Tunnel manchmal zusätzlich manuell mit der Projekt-Config gestartet, damit `monitor.rollladenwelt.de` wieder erreichbar ist

## Desktop-Kurzstart / Stack-Neustart

Ab 2026-08-06 gibt es direkte Desktop-Einträge für den Notfall-Neustart, damit man bei `Error 1033` oder hängendem Monitor ohne Pflegearbeit sofort zurückkommt.

**Standard ab 2026-08-06**: Backend wird immer mit `--watch` gestartet, damit Änderungen an JS-Dateien automatisch geladen werden.

Angelegt:

- `backend/Monitor-Neustart.bat`
  - doppelklickbare Batch im Projektroot
  - fordert automatisch Administrator-Rechte an
  - ruft `backend/scripts/restart-stack.ps1` auf und bleibt zur Ergebnisanzeige offen
  - nutzt den Standard des Skripts: **mit `--watch`**
- `backend/scripts/restart-stack.ps1`
  - macht einen robusten Stack-Neustart:
    1. alten Backend-Listener auf Port 3006 beenden
    2. Node-Backend neu starten
    3. `cloudflared`-Dienst neu starten (bei hängendem Dienst auch PID-Kill)
    4. lokales Health und öffentliches Health prüfen
  - **Default**: `node --watch ...`
  - explizit ohne Watch: Switch `-NoWatch`
  - Parameter `-KeepConsole` lässt das Fenster zur Ergebnisanzeige offen
- Desktop-Verknüpfungen:
  - `C:\Users\bsjal\OneDrive\Desktop\Monitor & Cloudflared neustarten.lnk`
    - universeller Shortcut auf die Batch (Default: mit Watch, Admin-UAC über Batch)
  - `C:\Users\bsjal\OneDrive\Desktop\Monitor neustarten (mit Dev-Watch).lnk`
    - explizit mit Watch, direkt PowerShell-Aufruf
  - `C:\Users\bsjal\OneDrive\Desktop\Monitor neustarten (ohne Watch).lnk`
    - explizit ohne Watch, direkt PowerShell-Aufruf

Typische Nutzung im Betrieb:

- Monitor hängt / `Error 1033` / `Lade...` bleibt:
  - Doppelklick auf Desktop-Verknüpfung `Monitor & Cloudflared neustarten`
  - UAC bestätigen
  - Warten auf die grünen `[OK]`-Zeilen für Lokal und Öffentlich

Weitere bestehende Neustart-Skripte:

- `backend/scripts/restart-backend.ps1`
  - nur Backend, ohne Tunnel; mit `-UseWatch` wird ebenfalls Watch aktiviert
- `backend/scripts/start-tunnel.ps1`
  - nur kurzfristiger Tunnel-Start via Winget-`cloudflared.exe`

## Wichtige Bugfixes und Lessons Learned

### 1. Monitor hing auf `Lade...`

Ursache:

- falsch escapte Zeichen in serverseitig erzeugtem Browser-JavaScript in `src/routes/display.js`
- betroffen waren insbesondere `\\n`, Regexe und andere Backslash-Stellen im ausgelieferten Skript

Fix:

- Browser-Skript-Strings konsequent escaped
- nach aehnlichen Aenderungen nicht nur `node --check` auf der Quelldatei, sondern im Zweifel auch das tatsaechlich ausgelieferte Skript pruefen

### 2. ISS-Arbeit zeigte `about:blank`

Ursache:

- Fehler im generierten HTML bzw. Inline-Skript der Popup-Arbeitsseite

Fix:

- Arbeitsseite als statisches HTML vorgerendert
- erst danach ins Popup geschrieben

### 3. Direktdruck / Label-Tests

Erkenntnisse:

- der Brother-Drucker und SumatraPDF koennen lokal funktionieren, auch wenn der Benutzer nur eine generische Fehlermeldung sieht
- bei Druckproblemen muessen Druckpfad und Tunnel-/Seitenproblem getrennt betrachtet werden

### 4. Allgemeine Lessons Learned

- Bei serverseitig erzeugtem JavaScript muessen `\\n`, `</script>` und Regexe extrem sauber escaped werden.
- Bereits kleine Stringfehler koennen das gesamte Monitor-Rendering blockieren.
- Bei Monitorproblemen zuerst unterscheiden:
  - laeuft `/health`
  - liefert `/api/production/board` JSON
  - rendert das ausgelieferte `/display`-Script syntaktisch korrekt
  - ist der Tunnel selbst erreichbar oder liegt ein `1033` vor
- Alte oder falsche Node-Instanzen auf `3006` koennen zu irrefuehrenden Befunden fuehren.
- Ein `cloudflared`-Dienst im Status `Running` bedeutet nicht automatisch, dass der Named Tunnel korrekt verbunden ist.
- **Notfall-Erkennung (2026-08-12):** Eine suface-level Pruefung von `title + description` reicht **niemals** – Slack-List-Felder wie `INFOS` koennen Text (z. B. "NOTFALL AKTIVIEREN") komplett ausserhalb von Titel/Beschreibung tragen. Immer zuerst die flachen String-Felder (`f.text`, `f.value`) abfragen – diese sind zu 100% vorhanden und zuverlässig.
- **Node --watch Fallstricke (2026-08-12):** Auch mit `node --watch` werden manchmal neue API-Response-Felder (z. B. neues `emergency` boolean) nicht sofort sichtbar, weil Hot-Reload Fehler schluckt oder eine alte Instanz haengt. Wenn ein neues Feld im Response `undefined` bleibt, ist ein **expliziter Neustart (`taskkill /IM node.exe /F /T` + `npm run dev`)** der schnellste und zuverlässigste Weg.
- **Direktdruck / Print-Health (2026-08-12):** Wenn lokale Druck-Skripte via Edge/Chromium Print-Dialog hängen, immer 70-80s Timeout + Stage-Logging einbauen; Session-0 Dienstdrucke brauchen explizite Drucker-Freigaben und funktionieren generell zuverlässiger mit SumatraPDF CLI + Shared-Printer (\\localhost\PrinterName). Der neue Endpunkt `/display/print-health` gibt sofort Auskunft, ob EXEs (SumatraPDF, Edge) am erwarteten Ort existieren.

## Relevante Dateien

### Fachlogik / Daten

- `backend/SP-B35.md`
- `backend/data/sp-b35-parts.json`
- `backend/data/sp-b35-hook-lookup.json`
- `backend/src/routes/intake.js`
- `backend/src/routes/intake-ui.js`

### Monitor / Produktion / Labels

- `backend/src/routes/display.js`
- `backend/src/routes/production.js`
- `backend/src/index.js`
- `backend/src/middleware.js`

### Infrastruktur

- `cloudflared/config.yml`
- `backend/Monitor-Neustart.bat`
- `backend/scripts/repair-cloudflared-service.ps1`
- `backend/scripts/restart-stack.ps1`
- `backend/scripts/restart-backend.ps1`
- `backend/scripts/start-tunnel.ps1`
- `backend/scripts/run-hidden.vbs`
- `backend/scripts/install-watchdogs.ps1`
- `backend/scripts/ensure-cloudflared.ps1`
- `backend/scripts/ensure-backend.ps1`
- `backend/package.json`

## Bekannte offene Punkte

### 1. Fachlich noch offen

- Gaze-Artikelnummern muessen noch nachgeliefert werden
- einzelne fachliche Feinheiten zu Federstift-/Masslogik koennen noch nachgeschaerft werden

### 2. Produkt / UX noch offen

- ISS-Arbeitsseite fuer weitere Schritte noch weiter ausbauen
- Overlay-Feintuning fuer Maschinenfoto kann weiter verbessert werden
- Paketanzahl ist aktuell eine Druckoption, aber noch kein dauerhaft gespeicherter Auftragswert

### 3. Technisch noch offen

- `cloudflared`-Dienst-Config wurde am 2026-08-06 per Admin-Shell auf den korrekten Command umgestellt; bei erneutem STOP_PENDING Desktop-Neustart verwenden
- `.env` / Datenbankwarnung `Invalid URL` wurde bewusst vertagt
- spaetere Erweiterung auf Dreh-/Schiebetueren und ISS-Rollos steht noch aus

## Kurzfazit

Der aktuelle Stand ist deutlich weiter als im letzten Handover:

- SP-B-35-Intake ist gefuehrter und robuster
- Produktionsdarstellung ist reduziert und fachlich getrennt
- Label ist sauber von Arbeitsanweisungen entkoppelt
- Paketdruck mit Serienlogik ist live
- freie Labels koennen optional `Lieferung vom:` tragen
- erste ISS-Arbeitsseite ist live und nutzt echte Maschinenoptik
- Availability-Logging und fokusarme Hintergrundchecks sind eingerichtet
- der Cloudflared-Dienstfehler ist analysiert, ein Reparaturskript liegt bereit, braucht aber noch Admin-Ausfuehrung fuer den finalen Dauerfix
