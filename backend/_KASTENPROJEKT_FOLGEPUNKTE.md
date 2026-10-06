# KASTEN-PROJEKT · TODO FOLGEPUNKTE
Erstellt: 2026-08-26
Stand Basisdokument: Vorsatzelement_Arbeitsanleitung_TESTLAUF_v3.html

## 🔴 HOHE PRIORITÄT (Intake-Anpassungen – LOGIK)

1. **[Intake] Schienen-Feld = OPTIONAL machen**
   - Aktuell: Schienen scheinen immer erforderlich → für Vorsatz-/Aufsatzelemente
     sind Schienen je nach Einbausituation optional.
   - Aufgabenstellung: `vorsatzElementRails` (oder vergleichbares Feld)
     default = optional / nicht vorausgewählt; separate Checkbox in Intake-UI.
   - Hinweis in Anleitung: "Schienen sind optional – nicht befestigen im Werk!"
   - siehe [intake-ui.js](file:///c:/Projects/Shopify/backend/src/routes/intake-ui.js) (Box-Size-Bereich um Zeile ~1284)

2. **[Intake] Gurtöffnung-Schnitt im Bestell-Fluss etablieren**
   - Aktuell steht im Schritt nur "siehe Bestellung" → wir brauchen im Intake
     ein strukturiertes Feld `vorsatzStrapExit` mit Werten:
       * hinten (Standard)
       * unten
       * oben
       * Seite (links/rechts)
   - Dann Anleitung-Schritt "Gurtöffnung schneiden" dynamisch mit exakter
     Position + Ausrichtung aus der Bestellung befüllen.
   - Basis-Parameter existieren schon in [intake.js](file:///c:/Projects/Shopify/backend/src/routes/intake.js#L682)
     (`VORSATZ_EXIT_LABEL`), aber fehlen in der Anleitungs-Generierung.

---

## 🟡 MITTLERE PRIORITÄT (Dokumentation & Wissensdatenbank)

3. **[Doku] Separate, detaillierte Arbeitsanleitung: "Panzer anfertigen"**
   - Zielgruppe: Neulinge in der Fertigung.
   - Inhalte:
       * Latten zählen (Formel: Panzerhöhe / Lattenhöhe + Reserve)
       * PVC vs. ALU – Materialunterschiede
       * Endleiste korrekt auf Länge schneiden & aufbiegen
       * Lammellen verbinden (Haken/Clip-System)
       * Qualitätscheck: keine Grate, keine verklemmten Lamellen
   - Verweis in v3 steht: "→ Detaillierte Arbeitsanleitung Panzer (TODO)"

4. **[Bild] Motorkapsel / Motorlager – spezielle Ausrichtung + Begründung**
   - Technisches Foto / Schema erstellen (oder fotografieren):
       * Motor ist NIEMALS zentrisch, sondern X-mm versetzt – warum?
       * Ausrichtung der Ausgangswelle (Gurtanschluss)
       * Luftspalt, sodass die Welle nicht schleift
   - **Wird im Kasten-Montage-Schritt (Schritt 09) als Pflichtbild eingepflegt.**
   - Placeholder in v3: `<!-- TODO: Motorlager-Ausrichtungsbild + Begründung -->`

---

## 🟢 NIEDRIGE PRIORITÄT (Verbesserungen)

5. **[Intake] Kastenhalbhöhe direkt aus der Kastengröße ableiten und anzeigen**
   - 165er → 82,5 mm / 150er → 75,0 mm usw.
   - Zeile direkt in der "Bestellzusammenfassung" mit ausgeben.

6. **[Anleitung] Arbeitsanleitung Blindnieten visualisieren**
   - 4 Bohrpunkte als technische Skizze pro Blendkappe (bisher nur Text).
   - Reihenfolge: Anlegen → Vorbohren (3,3 mm) → Niet setzen → Zange drücken → Kontrolle.

7. **[Anleitung] Testlauf-Schema nach Antriebsart unterscheiden**
   - Gurt: 3 × auf/zu (bedingt möglich, wenn Gurt montiert ist)
   - Motor: zwingend in BEIDE Richtungen (auf UND zu)
   - Motor-Startstrom-Test (kurz antippen, nicht direkt voll durchlaufen lassen)
