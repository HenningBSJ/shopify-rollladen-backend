# Kommissionierliste Folgetag — Finaler Implementierungsplan

**Ziel:** HTML-Seite `/kommissionierung`, die alle Gegenstände für einen ausgewählten **Montage-Folgetag** auflistet, gruppierbar, abhakbar, mit Druck- und Kopier-Export.

---

## 1. Nutzer-Antworten / Rahmen

| Frage | Entscheidung |
|---|---|
| Default-Gruppen-Modus | **Nach Auftrag (pro Kunde)** |
| Zweiter Modus per Toggle | **Nach Kategorie** (Panzer / SP-B35 / Motoren / Wellen / ...) |
| WhatsApp | **Erste Version ohne WhatsApp** – nur Druck + Kopieren (später via `wa.me` + Nummer in `.env`) |
| URL-Pfad | **`/kommissionierung`** (eigenständig, nicht unter `/display`) |
| Checkbox-Persistenz | LocalStorage pro Datum (Key `kommissionierung.checked.${datumIso}`), 14 Tage Auto-Clean |
| Datumsauswahl | Date-Picker mit Default = `nextWorkday(heute, 1)` (Feiertage + WE übersprungen, aber trotzdem manuell wählbar) |
| Auto-Refresh | 60 s, Checkbox-State bleibt via Merge erhalten |

---

## 2. Zu ändernde Dateien

### 2.1 `src/index.js` (+ 3 Zeilen Imports, + 2 Zeilen `app.use`)
- **Import-Zeile** nach Zeile 13 (intake-ui): `const kommissionierungRoutes = require('./routes/kommissionierung');`
- **Zwei `app.use(...)`** vor Zeile 134 (errorHandler):
  - `app.use('/kommissionierung', kommissionierungRoutes);`
  - `app.use('/api/kommissionierung', kommissionierungRoutes);`
- Auth ist im Router selbst via `monitorHttpAuthMiddleware` drin.

### 2.2 `src/routes/production.js` (+ 10 Zeilen Helper-Exports)
Helfer aktuell **nicht exportiert** (nur `module.exports = router`).
- Benötigt in Kommissionierung: `nextWorkday`, `parseIsoDate`, `formatDateIso`, `sameDay`, `addDays`, `isWeekend`, `isHoliday`, `startOfToday`, `normalizeMaterialKey`.
- Lösung: **Vor `module.exports = router;`** folgende Zeile einfügen:
  ```js
  Object.assign(module.exports, {
    nextWorkday, parseIsoDate, formatDateIso, sameDay, addDays,
    isWeekend, isHoliday, startOfToday, normalizeMaterialKey
  });
  ```

### 2.3 `src/routes/kommissionierung.js` (NEU, ca. 900 Zeilen)
Express-Router mit HTML-UI + JSON-API. **Struktur:**

| Abschnitt | Ca. Zeilen | Inhalt |
|---|---|---|
| Imports + Router Setup / Middleware | 25 | `express`, `monitorHttpAuthMiddleware`, Helfer aus `./production` importieren; `router.use(monitorHttpAuthMiddleware)` |
| HTML-ESCAPE + HELFER | 30 | `escapeHtml(s)`, `normalize(s)` (1:1 aus display.js kopieren, da server-seitig) |
| MATERIAL-KATEGORISIERER | 60 | `kategorisiere(text)` → `{typ, label}` Typen: `panzer | spb35 | welle | motor | handsender | jalousie | plissee | sonstiges`; RegEx-Maps für Rademacher, Delta DOre, Erfal, Handsender, Welle, Plissee, Gurt etc. |
| ZEILEN-GENERATOR `baumusterZeilen(item)` | 130 | Nimmt ein item aus `buildBoardItem()` und erzeugt Zeilen: 1/`panzerConfigs[]` → panzer, 1/`issBlocks[]` → spb35, aus `materialNeeds[]` dedupiziert → restliche Kategorien. IDs: `${item.id}-${typ}-${idx}`. Pro Zeile: `id,typ,kategorieLabel,anzahl,bezeichnung,details,materialOffen,materialBestellt,quelle,auftragId,auftragTitel,montageDatumIso,montageDate,origin,dueDate,description`. |
| `GET /api/board` | 90 | Ruft **die exakt gleiche Logik** wie `production.js:router.get('/board')` auf, **aber**: statt buckets zu bauen, ruft man `getListId()`, `listItems()`, `boardCtx`, `buildBoardItem()` — wir importieren diese Funktionen aber aktuell **NICHT**. Einfacher und weniger invasiv: **innerer HTTP-Call** oder **shared helper extraction?** → EINFACHER WEG: `GET /api/kommissionierung/board?date=YYYY-MM-DD` macht **keine** eigene Slack-Abfrage, sondern fetched **den bestehenden Endpoint** `http://localhost:<PORT>/api/production/board?forceMaterials=0` via `node-fetch` / internen `axios`? → Nein, **keine neuen Dependencies.** Wir duplizieren die Board-Routinen **nicht**. → **Besser:** In `production.js` zusätzlich `exports.buildFullBoardSnapshot({force})` einführen, die den Inhalt von `router.get('/board')` als Async-Funktion ohne Request/Response liefert. Dann importiert kommissionierung.js diese eine Funktion. |
| `GET /` → HTML | 520 | Komplette Seite inline. Siehe UI-Plan unten. |

**Decision: Board-Builder shared extraction** statt HTTP-Call. Um das sauber zu machen, erweitern wir production.js um eine exportierte `async buildFullBoardSnapshot({ forceMaterials })`.

→ **Update 2.2 production.js** (+ zusätzlich 5 Zeilen shared builder export).

---

## 3. UI-Plan / HTML-Seite

### 3.1 Layout (dunkles Theme, passend zu Production Monitor)

```
┌── HEADER ───────────────────────────────────────────────────────────┐
│ 📦 Kommissionierung                              [Heute laden] [🔄] │
│ [📅 03.09.2026 ▾]  5 Aufträge · 23 Positionen · 12/23 erledigt (52%)│
├── TOOLBAR ──────────────────────────────────────────────────────────┤
│ [Nach Auftrag ▾] [Nur Offene ☐] [Alle auswählen] [Alle abwählen]    │
│ [Fortschritt: ████████████████░░░░░░░░░░░░░░░░░░░░ 52% ]             │
├── GRUPPEN / KACHELN ────────────────────────────────────────────────┤
│                                                                      │
│ ┌─ Auftrag · AB26174 – Lindhof-Brauner (Werkstraße 8, 13503 Berlin) │
│ │ 📍 Montage: 03.09.2026 · Fällig: 24.08. (überfällig!)             │
│ │ [✓] 1× Rollladenpanzer 2224×2422 · Profil 37 Alu · Weiß           │
│ │ [✓] 1× 40er Welle · Kasten Weiß                                   │
│ │ [ ] 1× Motor · SOLARKIT SolarFunkmotor                             │
│ │ [ ] 1× Handsender 1-Kanal                                         │
│ │ ⚠️ OFFEN: Rademacher Motor · Handsender (rot)                      │
│ │ ✅ BESTELLT: SolarFunkmotor (blau)                                  │
│ │ Sub-Fortschritt: ████████████░░ 66% (2/4)                          │
│ └────────────────────────────────────────────────────────────────────┘
│                                                                      │
│ ┌─ Auftrag · BS Jalousienprofi – ... ─────────────────────────────┐ │
│ │ ...                                                               │ │
│ └────────────────────────────────────────────────────────────────────┘
│                                                                      │
│ === "Nach Kategorie" Modus (Toggle) ===                              │
│ ┌─ Kategorie · Rollladenpanzer (7 Stk.) ──────────────────────────┐ │
│ │ [✓] [AB26174] 2224×2422 · Profil 37 Alu Weiß                     │ │
│ │ ...                                                               │ │
│ └────────────────────────────────────────────────────────────────────┘
├─ ACTION BAR (sticky, bottom) ───────────────────────────────────────┤
│ [🖨 Drucken]  [📋 Text kopieren]  [⤓ TXT speichern]  [↺ Reset]      │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 Inline JS (im HTML-Script Tag)

- `el()`, `text()` 1:1 aus display.js (DOM-Builder Mini-Framework)
- `state = { last: null, datum: '2026-09-03', modus: 'auftrag', nurOffene: false, checked: {} }`
- Funktionen:
  - `load()` → fetch `/api/kommissionierung/board?date=YYYY-MM-DD` → merge `state.checked` → render
  - `setChecked(id, val)` → `state.checked[id] = !!val` → `saveCheckedLS()` → `renderFortschritt()`
  - `saveCheckedLS()` → JSON.stringify → `localStorage.setItem("kommissionierung.checked." + datum, ...)`
  - `loadCheckedLS()` → parsen, alten Keys >14 Tage löschen
  - `render()` → leert `#root`, füllt Header, Toolbar, Gruppen je nach `state.modus`, Action-Bar
  - `renderNachAuftrag(data)` / `renderNachKategorie(data)`
  - `renderFortschritt()` → berechnet alle gesetzten IDs / gesamt, setzt Progress-Bar + Zähler
  - `toggleAlle(value)` → iterate alle Zeilen, setChecked(id, value)
  - `resetChecked()` → confirm, LS-Key löschen, neu laden
  - `exportText()` → Klartext, wie oben im WA-Plan (aber ohne wa.me), returns String
  - `copyText()` → `navigator.clipboard.writeText(exportText())` → Meldung
  - `downloadText()` → Blob + `<a download="Kommissionierung_2026-09-03.txt">`
  - `drucken()` → `window.print()`
  - `datumAendern(iso)` → `state.datum = iso` → Checkbox-State aus passendem LS-Key → `load()`
- **`@media print`-CSS:** Toolbar/Action-Bar/Header-Controls ausblenden, Checkbox Haken erhalten, Font größer, Breite auf A4 optimiert, Breaks nach Kacheln.

### 3.3 Datum-Default im HTML-Script Tag
- Berechne Folgetag client-seitig an **DER DEFAULT-Anzeige**, aber **bevor load() das erste Mal aufgerufen wird**, rufe `load()` mit `?date=...` auf. Wenn der Server das Datum aus dem Querystring nimmt, ist also alles synchron.
- ABER: **Server soll Default liefern**, damit Client nicht bei Feiertagen daneben liegt. → Besser: **Lade `/api/kommissionierung/board` ohne `?date` Querystring**, der Server liefert `defaultDatumIso` (nextWorkday) im Response-Objekt zurück. Client nutzt das als `state.datum`, Date-Picker ist damit vorbelegt.

→ **3.4 API Response `KommissionierungBoard`-Shape:**

```json
{
  "datumIso": "2026-09-03",
  "datumLabel": "Donnerstag, 03.09.2026",
  "istFeiertag": false,
  "istWochenende": false,
  "defaultDatumIso": "2026-09-03",
  "aufgaben": [
    { "id": "Rec0X-panzer-0", "typ": "panzer", "kategorieLabel": "Rollladenpanzer",
      "anzahl": 1, "bezeichnung": "Panzer 2224×2424, Profil 37, Alu, Weiß",
      "details": ["Material: Alu", "Farbe: RAL 9016"],
      "materialOffen": ["Rademacher Motor"], "materialBestellt": ["SolarFunkmotor"],
      "quelle": "Produktion", "auftragId": "Rec0X",
      "auftragTitel": "AB26174 – Lindhof-Brauner – Wesselfelder Weg ...",
      "montageDatumIso": "2026-09-03", "origin": "AB26174", "dueDate": "2026-08-24",
      "adresse": "Wesselfelder Weg 8, 13503 Berlin",
      "kurzAdresse": "Wesselfelder Weg 8 · Reinickendorf"
    },
    ...
  ],
  "statistik": {
    "gesamtZeilen": 23,
    "aufträge": [ {id, titel, adresse, kurzAdresse, montageIso, anzahlZeilen} ],
    "nachKategorie": { "panzer": 7, "spb35": 4, "welle": 3, ... },
    "gesamtOffeneMaterialien": ["Rademacher Motor", "Handsender", ...]
  }
}
```

`adresse`: Extrahiert aus `auftragTitel` falls möglich (Split nach "–" oder ", PLZ"), sonst = title. Die Routinen aus display.js fürs Kacheln machen das sehr ähnlich → einfach 1:1 aus der item.title Struktur ableiten.

---

## 4. Implementierungsreihenfolge

1. **[production.js]** Helper + `buildFullBoardSnapshot({ forceMaterials })` exportieren.
2. **[index.js]** Neuen Import + 2x `app.use` vor Error-Handler einfügen.
3. **[kommissionierung.js - Schritt A]** Imports + Router + `/api/board` Endpunkt (mit `buildFullBoardSnapshot`): Filtern nach Datum, Zeilen generieren, Response-Objekt bauen. Mit Node `node --check` prüfen.
4. **[kommissionierung.js - Schritt B]** `/` HTML Endpunkt: Skelett-HTML ohne Funktionalität (Header + Leerer #root).
5. **[Manueller Test]** Browser → `http://localhost:3006/kommissionierung` → HTML laden, `/api/kommissionierung/board` liefert JSON korrekt.
6. **[kommissionierung.js - Schritt C]** Full inline JS: `load()`, render **"Nach Auftrag"**, Checkboxen + LS-Persistenz, Fortschritt, Toolbar.
7. **[kommissionierung.js - Schritt D]** Toggle Nach Kategorie, Nur-Offene, Action-Bar (Druck, Kopieren, TXT-Download, Reset).
8. **[Deploy]** `restart-stack.ps1` starten, Live-URL prüfen, 2–3 Test-Szenarien durchspielen (s. Verifikation).

---

## 5. Verifikation / Abnahme-Szenarien

Priorität 1 (Zwingend):
1. [ ] `GET /kommissionierung` erfordert Basic Auth → Login prompt, danach Seite sichtbar.
2. [ ] Standard-Datum ist **Folgetag (nächster Werktag)**, nicht Kalendertag +1 (weil Wochenende/Feiertag übersprungen).
3. [ ] Items aus Production-Board mit montageDate == gewähltem Datum erscheinen als Kacheln.
4. [ ] Pro Panzer-Config = 1 Zeile, pro SP-B35 issBlock = 1 Zeile.
5. [ ] `materialOffen` wird pro Zeile mit rotem "⚠️ OFFEN: ..." Badge angezeigt.
6. [ ] `orderedMaterial` erscheint als blaues "✅ BESTELLT: ..." Badge pro Zeile.
7. [ ] Checkbox-Haken überleben Page-Refresh (F5) → korrekt in localStorage gespeichert.
8. [ ] Anderes Datum wählen → komplett anderer LS-Key, Haken stehen unabhängig.
9. [ ] "Alle auswählen" → alle Haken, "Alle abwählen" → keiner.
10. [ ] "Drucken" → Print-Dialog, Controls (Toolbar/Action-Bar) verschwunden im @media print.
11. [ ] "Text kopieren" → Zwischenablage enthält die Liste mit [x]/[ ] Status.
12. [ ] "TXT speichern" → Datei runtergeladen mit Datum im Namen.
13. [ ] Toggle "Nach Kategorie" → gleiche Zeilen anders gruppiert, Checkbox-Status bleibt gleich.
14. [ ] "Nur Offene"-Toggle → erledigte Zeilen verschwinden / tauchen wieder auf.
15. [ ] 60 s Auto-Refresh → Konsolen-Ausgabe "refresh", Daten werden neu geladen, gesetzte Haken bleiben.

Priorität 2 (Später / WA-Vorarbeit):
16. [ ] Später: Button für WhatsApp + `.env`-Variable `KOMMISSIONIERUNG_WA_NUMMER` → wa.me/<NUMMER>?text=URI-Encodeter Text.

---

## 6. Datei-Liste (Critical Code Refs)

| Datei | Pfad | Relevanter Bereich |
|---|---|---|
| **NEU** kommissionierung.js | `c:\Projects\Shopify\backend\src\routes\kommissionierung.js` | GANZE DATEI |
| index.js | `c:\Projects\Shopify\backend\src\index.js` | **Z.12 + Z.132** (Import + app.use) |
| production.js | `c:\Projects\Shopify\backend\src\routes\production.js` | **Z.108-128** (Datum-Helfer), **Z.358+** (nextWorkday), **Z.3699+** (Exports vor module.exports) |
| display.js (Referenz, KEIN Edit) | `c:\Projects\Shopify\backend\src\routes\display.js` | **Z.1390-1404** (el+text Mini-DOM), **Z.3503** (Monitor HTML Gerüst) |
| middleware.js (Referenz) | `c:\Projects\Shopify\backend\src\middleware.js` | `monitorHttpAuthMiddleware` |

---

## 7. Hinweise / Gotchas

1. **`buildFullBoardSnapshot` Inlining in production.js:** Der aktuell `/board`-Handler macht viel im Request-Handler-Kontext (2163-2410). Wir extrahieren diesen Block **1:1** in eine asynchrone Top-Level Funktion `buildFullBoardSnapshot(ctx = {})`, die das gleiche Objekt retourniert, ohne `res.json()`. Dann rufen wir sie im bestehenden `router.get('/board')` auf und im neuen `/api/kommissionierung/board`.
2. **HTML-Sicherheit:** Alle Nutzer-Daten (title, description, Materialnamen) müssen via `escapeHtml()` im Template verwendet werden – sonst XSS.
3. **`normalizeMaterialKey`** wird in production.js aktuell verwendet → genau diese Funktion ist wichtig, damit materialOffen/openMaterial und orderedMaterial Keys MATCHEN (sonst würden OFFEN/BESTELLT Badges nicht korrekt finden, weil Zeilen-Material-Key anders normalisiert wird als im open/ordered Set). → Immer die gleiche Funktion verwenden!
4. **Display.js "Nach Kategorie" Toggle:** Wenn keine Daten / Datum keine Aufträge hat, einen Placeholder `"Keine Aufträge mit Montage am <Datum> – wähle ein anderes Datum."` anzeigen.
5. **Druck:** @page { size: A4; margin: 12mm; } setzen, damit Kacheln nicht abgeschnitten werden.

---

**Fertig. → Plan bestätigt:** Sobald der User diesen Plan bestätigt / keine Korrekturen mehr wünscht, geht's in die Umsetzung (TODOs erstellen + nacheinander abarbeiten, deployen, live verifizieren).
