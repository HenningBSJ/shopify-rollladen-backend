# SP‑B 35 – Spezifikation (Intake → Schnittmaße → Fertigung)

## Ziel
Für Insektenschutz‑Spannrahmen **SP‑B 35** sollen aus den Intake‑Eingaben konsistente Fertigungsangaben entstehen:
- valide Auswahllogik (keine unzulässigen Kombinationen),
- definierte Maßumrechnung (Eingabemaß → Fertigmaß/Schnittmaß),
- strukturierte Ausgabe (z. B. für Slack/Produktion/Material).

Diese Datei beschreibt den fachlichen Soll‑Zustand. Implementierung folgt separat.

## Geltungsbereich
- Produkttyp: `Insektenschutz`
- Unterkategorie: `Spannrahmen`
- Modell: **SP‑B 35**

## Intake-Felder (Ist-Stand im Formular)
Die folgenden Felder existieren im Intake und sind für SP‑B 35 relevant:
- `insectWidthMm` / `insectHeightMm` (mm)
- `insectColor` (Dropdown)
- `insectMesh` (Dropdown)
- `spannPosition` (Dropdown: innenliegend/außenliegend)
- `spannFederstifte` (Dropdown: Ja/Nein)
- `spannHakenLengthMm` als **Hakenmaß X** (Dropdown)
- `spannBrushPosition` (Dropdown: `zum Fenster` / `Abdichtung nach unten`)
- `spannBrushLengthMm` (Dropdown: `8` / `12` / `20`)
- `spannStabilizationMode` (Dropdown: `Auto` / `Ja` / `Nein`)
- `spannNotes` (Bemerkungsfeld)

## Intake-Leitlinie
- Im Intake soll so viel wie möglich als **Dropdown / Auswahlfeld** bereitgestellt werden, um Eingabefehler zu vermeiden.
- Freitext bleibt nur dort erlaubt, wo Varianten offen bleiben müssen, z. B.:
  - Sonderfarbe mit RAL-Angabe
  - freie Bemerkungen / Sonderhinweise
- Diese Leitlinie gilt auch für spätere Erweiterungen auf:
  - ISS-Drehtüren
  - ISS-Schiebetüren
  - ISS-Rollos

## Zulässige Kombinationen (Sperrlogik)
SP‑B 35 erlaubt nur **eine** Befestigungsart:

### Variante A: Hakenbefestigung (Lage)
- `spannPosition` ist gesetzt (innenliegend oder außenliegend)
- `spannFederstifte` ist leer
- `spannHakenLengthMm` ist erforderlich
- Standard-Bürste:
  - `spannBrushPosition = zum Fenster`
  - `spannBrushLengthMm = 8`

### Variante B: Federstifte
- `spannFederstifte = Ja`
- `spannPosition` ist leer
- `spannHakenLengthMm` ist deaktiviert und muss leer sein
- Bürstenangaben bleiben wählbar
- `spannStabilizationMode` bleibt wählbar

Hinweis:
- `spannFederstifte = Nein` verhält sich wie „nicht gewählt“ (es wird dadurch nichts gesperrt), damit anschließend `spannPosition` gewählt werden kann.

## Farben & Gaze (Standardisierung)
### Farben (Dropdown)
Standardfarben:
- Weiß
- Silber
- Grau
- Graubraun

Sonderfall:
- Auswahl `Sonderfarbe` bedeutet: RAL‑Angabe gehört in ein Bemerkungsfeld (siehe unten).

### Gaze (Dropdown)
Standardauswahl:
- Standard
- Durchblick
- Pollenschutz
- Reißfest
- Edelstahl
- Petscreen
- Sonstige

## Sonderfarben-Regel (RAL in Bemerkungen)
Wenn `insectColor = Sonderfarbe`, dann:
- Die konkrete Farbe soll im passenden Bemerkungsfeld stehen, bevorzugt als RAL:
  - Beispiel: `RAL 7016`
  - Beispiel: `Sonderfarbe / RAL: RAL 7016 (Anthrazitgrau)`

Ziel für spätere Materiallogik:
- Sonderfarben führen häufig zu Bestellbedarf.
- Der Bestellbedarf soll perspektivisch über den Materialbestand erkannt werden (nicht manuell über ein fixes Regelwerk).

## Maßlogik SP‑B 35 (Eingabemaß → Fertigmaß)
### Begriffe
- **Eingabemaß**: die im Intake erfassten Maße `insectWidthMm`/`insectHeightMm`.
- **Fertigmaß**: das Maß, auf das gefertigt/zugeschnitten werden soll (Ausgabe für Produktion).

### Basiskorrekturen nach Montage
Wenn Variante A (Hakenbefestigung/Lage) aktiv ist:
- `spannPosition = innenliegend`
  - Fertigmaß Breite = Eingabemaß Breite **− 4 mm**
  - Fertigmaß Höhe = Eingabemaß Höhe **− 4 mm**
- `spannPosition = außenliegend`
  - Fertigmaß Breite = Eingabemaß Breite **+ 36 mm**
  - Fertigmaß Höhe = Eingabemaß Höhe **+ 40 mm**

Wenn Variante B (Federstifte) aktiv ist:
- Zusätzlich gilt eine fixe Reduktion:
  - Fertigmaß Breite = (Basis‑Fertigmaß) **− 6 mm**
  - Fertigmaß Höhe = (Basis‑Fertigmaß) **− 6 mm**

## Stabilisierungsprofil
- Automatisch erforderlich ab **1500 mm Höhe**
- Unterhalb davon kann es bei Bedarf bereits früher gesetzt werden (praxisnah oft ab ca. **1250 mm Höhe**)
- Steuerung im Intake über `spannStabilizationMode`

### Maße
- Zuschnitt Stabilisierungsprofil:
  - **Elementbreite − 70 mm**
- Einsatzhöhe / Einklebepunkt:
  - **(Elementhöhe − 70 mm) / 2**
  - gemessen **vom Innenrand**

## Ausgabe (Soll)
Für Produktion/Slack/Monitor soll die Ausgabe bewusst auf **Schnittmaße und Fertigungshinweise** reduziert werden:
- Modell: `SP‑B 35`
- Unterkategorie: `Spannrahmen`
- Eingabemaß (Breite x Höhe, mm)
- Befestigungsart:
  - `Haken` inkl. Lage + `spannHakenLengthMm`
  - oder `Federstifte`
- Farbe (standardisiert) + ggf. RAL‑Bemerkung
- Gaze‑Art
- Schnittmaß SP‑B 35 (Gehrungssäge): `2 x Breite`, `2 x Höhe`
- Stabilisierungsprofil (Profilsäge): `Elementbreite - 70 mm` bei SP‑B 35, falls erforderlich
- Einklebepunkt Stabilisierungsprofil: `(Elementhöhe - 70 mm) / 2` vom Innenrand
- Schlitten-Hinweis
- Bürsten-Hinweis
- Freie Bemerkungen (zusammengeführt)

## Interner Verbrauch
- Die sichtbare Arbeitsanweisung bleibt kompakt.
- Relevante Positionen werden intern zusätzlich als **Verbrauch** abgelegt, damit der Materialbestand später darauf zugreifen kann.

## Beispiele
### Beispiel 1 – innenliegend, Haken
- Eingabe: 1000 x 1500, innenliegend
- Fertigmaß: 996 x 1496

### Beispiel 2 – außenliegend, Haken
- Eingabe: 1000 x 1500, außenliegend
- Fertigmaß: 1036 x 1540

### Beispiel 3 – Federstifte
- Eingabe: 1000 x 1500, Federstifte = Ja
- Basis: abhängig von der festgelegten Basismontage (siehe Offene Punkte)
- Zusatz: jeweils −6 mm

## Artikelstamm (SP‑B 35)
Primärquelle: Einzelteile‑Übersicht aus der Anleitung. Unvollständige Nummern sind als `xxx` hinterlegt.

| Pos | Bezeichnung | Art.-Nr. |
|---:|---|---|
| 1 | SP‑B 35 Profil | 3001023FF |
| 3 | Bürste 4 mm | 300135500 |
| 4 | Gaze | 30013xxx / 30023xxx |
| 5 | PVC Keder Ø5,1 mm | 300135300 / 300135400 |
| 6 | PVC Keder Ø4,7 mm | 300235300 / 300235400 |
| 7 | Eckverbinder | 300130500 |
| 8 | Schlitten 1 mm | 300141200 |
| 9 | Haken lang (x‑Variante) | 3001420xx |
| 10 | Stabilisierungsprofil | 3001030FF |
| 11 | Verbinder für Stabilisierungsprofil | 300130200 |
| 12 | Griffleiste zum Anschrauben | 300138200 |
| 13 | Platte für Mittelarretierung | 300141300 |
| 14 | Haken kurz (x‑Variante) | 3001450xx |
| 15 | Kederschutzprofil | 300135100 |
| 16 | Bürste 8 mm | 300135600 |
| 17 | Zylinderkopfschraube M3x4 | 891192600 |
| 18 | Zylinderkopfschraube M3x6 | 891192800 |
| 19 | AL‑IS Federhakenaufnahme | 300140100 |

## Stückliste / Regeln (SP‑B 35)
Die Positionsnummern beziehen sich auf die Artikelstamm‑Tabelle oben.

### Zuschnitte (Grundsätzlich)
- Pos. 1 Profil SP‑B 35: 2× Breite und 2× Höhe, Gehrungsschnitt beidseitig.
- Pos. 3 Bürste 4 mm: exakter Zuschnitt beim Einbau, 2× Breite und 2× Höhe.
- Pos. 4 Gaze: exakter Zuschnitt beim Einbau, Breite × Höhe; bei Stabilisierungsprofil ggf. geteilt.
- Pos. 5/6 Keder: exakter Zuschnitt beim Einbau, 2× Breite und 2× Höhe; ggf. zusätzlich 2× Breite (bei Stabilisierungsprofil).

### Keder-Auswahl nach Gaze
- Keder Ø5,1: bei normaler, Durchblick‑ oder Pollenschutzgaze.
- Keder Ø4,7: bei reißfester oder Edelstahlgaze.

### Schlitten / Haken / Mittelarretierung
- Pos. 8 Schlitten 1 mm:
  - Standard: 6 Stk.
  - Federhaken: 8 Stk.
  - Mittelarretierung: +2 Schlitten (für Haken lang).
- Pos. 9 Haken lang: 2 Stk.; ab Elementhöhe 1,3 m zusätzlich 2 Stk. (lose beigelegt).
- Pos. 14 Haken kurz: 2 Stk. (lose beigelegt).

### Stabilisierungsprofil
- Pos. 10 Stabilisierungsprofil: erforderlich ab Elementbreite oder Elementhöhe 1,5 m.
- Zuschnitt Pos. 10: Elementmaß − 70 mm (SP‑B 35).
- Pos. 11 Verbinder: 2 Stk., nur in Verbindung mit Pos. 10.

### Griffleiste / Positionierung
- Pos. 12 Griffleiste zum Anschrauben: auf Schlitten befestigen.
- Position laut Anleitung:
  - bei Elementhöhe < 100 cm: Mitte
  - bei Elementhöhe > 100 cm: 2/5 von unten
- Ab Elementhöhe 1,3 m zusätzlich mittige Arretierung notwendig; dazu Griffleiste + Platte für Mittelarretierung (Pos. 13) verschrauben.

### Kederschutzprofil (optional)
- Zuschnitt Breite: Elementbreite − 40 mm (SP‑B 35).
- Zuschnitt Höhe: Elementhöhe − 71 mm (SP‑B 35).
- Bei Stabilisierungsprofil zusätzlich: +2× Breite.
- Bei Stabilisierungsprofil: Kederschutzprofil für Elementhöhen jeweils zusätzlich 10 mm abziehen.
- Einbauhinweis: 2× Kederschutzprofil ausklinken an beiden Enden; nur bei Stabilisierungsprofil.

### Maß-Tabelle (Kederschutzprofil / Platte beachten)
Maßangaben aus der Anleitung (X/Y):

| Bezeichnung | Maß X | Maß Y |
|---|---:|---:|
| Pos. 9 Haken lang | 40 mm | 6 mm |
| Pos. 14 Haken kurz | 36 mm | 6 mm |
| Pos. 19 AL‑IS Federhakenaufnahme (oben) | 70 mm | 8 mm |
| Pos. 19 AL‑IS Federhakenaufnahme (unten) | 40 mm | 8 mm |
| Pos. 12 Griffleiste zum Anschrauben | 35 mm |  |

### Packungsbeilage (ohne/mit Mittelarretierung)
Art.-Nr. und Stückzahlen aus der Anleitung; offene Gaze-Nummern werden später nachgetragen.

| Artikel | Art.-Nr. | ohne Mittelarretierung | mit Mittelarretierung |
|---|---|---:|---:|
| Zylinderkopfschraube M3×4 (Pos. 17) | 891192600 | 12 | 10 |
| Zylinderkopfschraube M3×6 (Pos. 18) | 891192800 | 0 | 4 |
| Haken lang (Pos. 9) | 891193000 | 2 | 4 |
| Haken kurz (Pos. 14) | 897151011 | 2 | 2 |
| Inbusschlüssel SW 2 | 891193000 | 1 | 1 |
| Montageanleitung SP‑B | 897151012 | 1 | 1 |

## Offene Punkte (bitte bestätigen/ergänzen)
1. **Federstifte‑Basis**: Bezieht sich die −6 mm Reduktion auf innenliegend oder ist Federstifte eine eigene Montageart mit eigener Basisformel?
2. **Eingabemaß‑Definition**: Ist das Eingabemaß „Fenstermaß/Lichtes Maß“ oder bereits ein gewünschtes Fertigmaß?
3. **Schnittlisten‑Tiefe**: Welche Profil‑/Komponenten‑Schnittmaße sollen aus dem Fertigmaß abgeleitet werden (Rahmenprofile, Keder, Stabilisator, Bürste, Haken‑Lookup)?
4. **Hakenlänge**: Soll `spannHakenLengthMm` verpflichtend werden oder per Tabelle aus einem anderen Feld bestimmt werden?
