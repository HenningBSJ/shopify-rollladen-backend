# Wartungsablauf für den Live-Monitor

Dieser Ablauf ist vorbereitet, aber noch nicht in der Live-App umgesetzt.
Testfassung 4 enthält einen ersten lokalen Prototyp der Nutzungserkennung:
`http://127.0.0.1:3310/lab/activity`. Er erfasst keine Live-Nutzer und keine älteren
Testinstanzen. Die automatische Neustartfreigabe bleibt auch dort ausdrücklich gesperrt.
Es gibt weiterhin keine automatische Neustartfreigabe.

## Aktueller Stand

- `RollladenBackend-Service` wurde vom Betreiber als Live-Dienst benannt.
- Die Dienstabfragen dieser Agentenumgebung konnten ihn nicht eindeutig ermitteln.
- Kein Live-Dienst wurde beendet, umkonfiguriert oder neu gestartet.
- Die bisherigen Testinstanzen wurden nicht beendet; Version 4 läuft zusätzlich auf 3310.

## Voraussetzung für eine spätere Nutzungserkennung

Alle relevanten Ansichten (Produktion, Auftragserfassung, Material, Kommissionierung,
Scan-Dialoge) brauchen eine eigene Sitzungs-ID und regelmäßige Lebenszeichen.
Gemeldet werden: angemeldete Person, Ansicht, ungespeicherte Eingaben und laufende
Schreibvorgänge. Keine Inhalte von Formularen oder Passwörter in die Lebenszeichen aufnehmen.

Ein fehlendes Lebenszeichen ist kein Nachweis für abgeschlossene Arbeit: Browser können
im Hintergrund pausieren, Verbindungen können abbrechen und alte Tabs kennen das Verfahren
noch nicht. Unbekannte/abgelaufene Sitzungen müssen als ungeklärt behandelt werden.
Offene TCP-Verbindungen und HTTP-Requests allein sind keine Nutzungserkennung.

## Vorgesehener Ablauf

1. Betreiber kündigt Wartung an. Alle erreichbaren Ansichten zeigen die Ankündigung.
2. Neue Tätigkeiten werden nach der angekündigten Frist nicht mehr begonnen;
   bereits begonnene Eingaben und Scans können fertig gespeichert werden.
3. Server wartet auf ausstehende Schreibvorgänge und Bestätigung der Beteiligten.
   Ungeklärte Sitzungen bleiben sichtbar und verhindern automatische Freigabe.
4. Betreiber prüft Version, Sicherung, offene Sitzungen und Rückfallmöglichkeit.
5. Ausdrückliche Freigabe für diesen Neustart einholen. Erst dann den eindeutig
   identifizierten Dienst geordnet stoppen/starten; keine pauschalen Node-Prozess-Abbrüche.
6. Health, Anmeldung, Produktionsboard, Slack-Lesen und betroffene Funktionen prüfen.
   Einen Start allein nicht als erfolgreiche Bereitstellung werten.
7. Bei Fehlern zur vorbereiteten Version zurückkehren und erneut prüfen. Neue Historie
   nicht durch eine ältere Datenbank überschreiben; Rückfall auf Code und Daten getrennt planen.

Bis dies vollständig integriert und mit mehreren Nutzern getestet ist, bleibt die
manuelle Abstimmung mit den Nutzern plus ausdrückliche Betreiberfreigabe Pflicht.
