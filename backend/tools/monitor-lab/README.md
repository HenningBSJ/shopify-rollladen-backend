# Monitor-Testumgebung: Slack, Material und Historie

Stand: 30.09.2026. Live-Code unter `src/`, Live-Daten und Live-Dienst bleiben unverändert.
Kein Deployment, keine Migration nach Rafes, keine Kalenderänderungen.

## Aktuell: Testfassung 4

### Vorbereitet am 01.10.2026: Herkunft der Scans

Die Scan-Eingänge speichern zusätzlich `context.peerIp` (direkte Socket-Verbindung),
`context.ipSource` und die verifizierte Benutzerkennung samt Namen. Station, Zeitstempel
und frei gemeldetes Kürzel bleiben getrennt erhalten. Übertragene IP-/Benutzerangaben aus
dem Request-Body und ungeprüfte `X-Forwarded-For`-Header werden nicht als Nachweis übernommen.
Bei einem Proxy oder Tunnel kann die Socket-IP dessen Adresse sein; eine ursprüngliche
Client-IP setzt eine separat geprüfte Proxy-Konfiguration voraus.

Ein wiederholter Scan mit derselben Ereignis-ID bleibt auch nach einem IP-Wechsel einmalig;
die zuerst gespeicherten Herkunftsdaten werden nicht überschrieben. Bestehende Ereignisse
erhalten keine erfundenen IPs. Die Datenbank erweitert ihr Schema beim nächsten Öffnen.

13 Fachtests bestanden (darunter drei neue Herkunfts-/Wiederholschutztests).
**Die laufenden Instanzen wurden dafür nicht neu gestartet. Die Änderung liegt im
Testcode bereit und ist in bereits laufenden Serverprozessen noch nicht aktiv.**
Live-Code und Live-Dienst bleiben unverändert. Aktivierung erst bei einem abgestimmten
Teststart; Live-Übernahme weiterhin nur nach gesonderter Freigabe.

```powershell
node tools/monitor-lab/scan-context.test.cjs
```

**http://127.0.0.1:3310/lab** – weiterhin Kennung `LAB` und bisheriges Testpasswort.
Die vorherigen Instanzen wurden nicht beendet. Version 4 enthält eine geprüfte Kopie
der Historie von Version 3 zum Zeitpunkt ihrer Erstellung; danach laufen die Bestände getrennt.

### Teilebedarf ohne JSON bearbeiten

In der aktuellen Version 4 wird der Teilebedarf als Tabelle eingegeben:

1. Auftrag öffnen und als Testperson anmelden.
2. „Position hinzufügen“ wählen, Bezeichnung, Eigenproduktion/Fremdlieferung und
   benötigte Menge eintragen. Es werden keine Beispielteile automatisch übernommen.
3. „Vollständigen Bedarf bestätigen“ speichert die Liste. Bestehende Positions-IDs
   bleiben beim Bearbeiten erhalten; neue Zeilen bekommen eine eigene ID.
4. Danach unter „Menge bestätigen“ die insgesamt vorhandene Menge je Position erfassen.

Ein unveränderter Teilebedarf wird nicht erneut gespeichert und setzt keine
Mengenbestätigungen zurück. Eine fachliche Änderung verlangt eine ausdrückliche
Bestätigung, weil alle Mengen für die neue Bedarfsrevision neu bestätigt werden müssen.
Beim Wechsel des Auftrags werden ungespeicherte Änderungen abgefragt.
Die aktuelle Seite nach Abschluss laufender Eingaben neu laden; kein Serverneustart nötig.

### Gelesene Google-Termine auswählen

- Ausschließlich `jonat.bsjalousienprofi@gmail.com` wurde nach Terminen durchsucht.
- Sieben Termine für 30.09.–31.10.2026 wurden lesend geladen; darunter ein vorhandener
  ausdrücklich gekennzeichneter Testtermin, dessen Details zusätzlich gelesen wurden.
- Unter „Gelesener Kalendertermin“ den gewünschten Eintrag wählen und ausdrücklich
  zuordnen. ID, Titel und Farbe stammen aus dem gespeicherten Google-Ausgangsstand.
- Die Vorschau meldet `matches_snapshot`, wenn die gespeicherte Zuordnung diesem Stand
  entspricht. Änderungen werden als `changed` erkannt. Ein nicht enthaltener Termin
  heißt nur `not_in_loaded_window`, nicht automatisch „gelöscht“.
- Das ist ein datierter Leseabgleich, keine fortlaufende Google-Verbindung. Der Zeitpunkt
  wird angezeigt. Es gibt weiterhin keinen Kalender-Schreibclient und keine Kalenderänderungen.
- Keine automatische Zuordnung nach ähnlichen Kunden-/Auftragstexten.

### Aktive Nutzung in dieser Testfassung

Oben in Monitor, Statusseite und Erfassung erscheint eine gelbe Nutzungsanzeige.
Sie meldet offene Eingaben, laufende Fetch-Schreibvorgänge und Verbindungsprobleme.
„Tätigkeit abgeschlossen“ darf erst nach Speichern oder bewusstem Verwerfen der Eingaben
betätigt werden. Bei offenen Eingaben folgt eine ausdrückliche Rückfrage.

Die [Nutzungsübersicht](http://127.0.0.1:3310/lab/activity) zeigt alle gemeldeten Sitzungen.
Nach 65 Sekunden ohne Lebenszeichen bleibt eine nicht abgeschlossene Sitzung „unknown“.
Schließen oder Navigieren bestätigt keinen Abschluss. Deshalb vor dem Wechsel einer
fertigen Tätigkeit den Abschluss melden; alte ungeklärte Sitzungen werden nicht still entfernt.
Jedes Dokument erhält eine eigene ID, damit doppelte Tabs nicht zusammenfallen.

Nur Testfassung 4 ist erfasst. Live-App und ältere Testfassungen fehlen in dieser Übersicht.
**`restartAllowed` bleibt immer false.** Es gibt keinen Neustart-Endpunkt und keine automatische
Freigabe. Formulareinhalte werden nicht übertragen; Zugriffstoken in Materialseitenpfaden
werden aus der gemeldeten Ansicht entfernt. Die Personenkennung stammt, soweit angemeldet,
aus der geprüften Testanmeldung. Eine unabhängige Prüfung aller tatsächlich abgeschlossenen
Geschäftsvorgänge ersetzt diese Anzeige nicht.

### Start und Prüfung für Version 4

Die Instanz wurde bereits vorbereitet und gestartet. Kein erneutes Vorbereiten erforderlich:

```powershell
node tools/monitor-lab/prepare.cjs --v4
node tools/monitor-lab/build-panel-v4.cjs
node tools/monitor-lab/start.cjs --v4
```

Kalender-Ausgangsstand: `tmp/monitor-calendar-lab-v4/calendar-catalog.json`.
Diese Datei wurde aus den lesenden Connector-Ergebnissen erzeugt und enthält keine
Terminbeschreibungen, Teilnehmerlisten oder Anhänge. Der Import ist noch kein Hintergrunddienst.
Nutzungszustand: `activity.sqlite`; Historie: `history.sqlite` im selben Verzeichnis.

```powershell
node tools/monitor-lab/activity-calendar.test.cjs
node tools/monitor-lab/verify.cjs --v4
node tools/monitor-lab/backup.cjs --v4
```

Die ursprünglichen acht Fachtests und 21 HTTP-/Integritätsprüfungen wurden durch vier
Tests für Tabelleneditor und Wiederherstellung ergänzt. Die laufende Seite wurde erneut
auf HTTP-Erreichbarkeit, vorhandenen Tabelleneditor und gültige Skriptsyntax geprüft.
Eine vollständige Browserprüfung mit mehreren Personen bleibt offen. Kein Live-Neustart.

### Vollständige Sicherung und Wiederherstellungsprüfung

```powershell
node tools/monitor-lab/backup-full.cjs --verify-restore
```

Der Befehl sichert Historie und Nutzungsdaten als SQLite-Snapshots, Kalender- und
Slack-Ausgangsstände, lokale Testzugangsdaten, Anwendungskopie, Lab-Werkzeuge sowie
`package.json`/`package-lock.json`. `node_modules`, frühere Sicherungen und Testläufe
sind ausgeschlossen. Manifest und SHA-256-Prüfsummen erlauben die Kontrolle jeder Datei.
Das Manifest wird erst nach erfolgreicher Erstellung geschrieben. Unvollständige oder
beschädigte Sicherungen werden bei der Wiederherstellung abgewiesen.

Jede Datenbank wird transaktional gesichert; die zwei unabhängigen Datenbanken haben
getrennte Sicherungszeitpunkte. Andere Dateien werden einzeln auf Änderungen während
des Kopierens geprüft. Das ist kein globaler zeitgleicher Snapshot aller laufenden Vorgänge.

`--verify-restore` schreibt ausschließlich in ein neues Verzeichnis unter `restore-checks/`.
Bestehende Ziele werden nicht überschrieben. Es startet keinen Server und berührt weder
die laufende Testdatenbank noch die Live-App. Wiederherstellung auf Live oder Rafes ist
damit nicht autorisiert und wird nicht durchgeführt.

Prüfung am 30.09.2026 erfolgreich: 64 Dateien, 544 Historienereignisse und eine Sitzung
im wiederhergestellten Bestand lesbar. Vier Tests prüfen außerdem stabile Positions-IDs,
unveränderte Bedarfe, ungültige Mengen, beschädigte Dateien und unsichere Zielpfade.
Die Sicherung liegt auf demselben Rechner; eine unabhängige externe Sicherung und ein
Starttest der wiederhergestellten App bleiben vor einem produktiven Umzug erforderlich.

## Vorheriger Stand: Testfassung 3

**http://127.0.0.1:3309/lab** – Version 3. Die bisherigen Kopien auf Port 3307 und 3308 wurden nicht beendet.

Zugang: Kennung `LAB` und das bereits bekannte Testpasswort aus
`tmp/monitor-calendar-lab/access.json`. Version 3 hat dieselben Testzugangsdaten,
aber eigene Cookies, Benutzerdatei, Daten und Historie.

In der Seite:

1. Auftrag anklicken oder eine synthetische ID wie `LAB-DEMO` eingeben und öffnen.
2. Für lokale Änderungen zusätzlich als Testperson LAB anmelden.
3. Vollständigen Teilebedarf mit stabilen Positions-IDs eingeben. Bezugsart ist
   `production` (Eigenproduktion) oder `delivery` (Fremdlieferung).
4. Mengen je Position ausdrücklich bestätigen. Das ist die insgesamt bestätigte Menge,
   keine zu addierende Lieferung. Eine neue Bedarfsrevision verlangt neue Bestätigungen.
5. Testscan erfassen. Korrekturen geben die Ereignis-ID und einen Grund an.
6. Termin-ID, bestehenden Titel und Kundenfarbe eingeben und die Zuordnung speichern.
   Die anschließende Vorschau verwendet diese gespeicherte Zuordnung.
7. Für Scans im bestehenden Monitor: erst hier als Testperson anmelden, dann im selben
   Tab über „Produktionsmonitor“ wechseln. Dort Station setzen und den Scan ausführen.
   Ein neuer Tab benötigt eine eigene Personenanmeldung. Der Testhinweis zeigt die lokale Erfassung an.
8. Zurück unter `/lab` stehen Monitor-Scans mit Rohtext und angemeldeter Testperson im Verlauf.
   Den Scan bei Bedarf explizit einer aktuellen stabilen Positions-ID zuordnen.
   Die Zuordnung selbst bestätigt keine Materialmenge.

Alle Änderungen bleiben in der Testhistorie. **Aktuelle Live-Scans werden noch nicht
automatisch in diese Historie übernommen.** Das bestehende Monitor-Scanformular der
Testfassung 3 schreibt ausschließlich in die Testhistorie, nicht nach Slack.
Ein Erfolgsstatus wird erst nach Speicherung zurückgegeben. Fehlende Personenanmeldung,
fehlende Station oder fehlende Scan-ID verhindern eine erfolgreiche Erfassung.

## Bereits geprüft

- Slack lesend importiert: 521 Einträge, 428 fertig, 15 offen, 78 archiviert.
- Ausgangsstand vom 30.09.2026, 10:49:20 UTC; Status-IDs anhand Listenschema aufgelöst.
- Kein Bearbeiter und kein Fertigzeitpunkt aus dem Import erfunden.
- 19 Fachtests sowie 17 HTTP-/Integritätsprüfungen bestanden.
- Terminzuordnung mit Änderungsverlauf, Schutz vor doppelter Belegung und Kalendergrenze geprüft.
- Scan-Eingang des bestehenden Testmonitors mit Wiederholschutz und verifizierter Testperson geprüft.
- Live-Quellcode unverändert; Live-Daten beim Vergleich ebenfalls unverändert.
- Der Browser ist nicht verbunden; ausgeführtes Browser-JavaScript und visuelle Bedienung
  sind noch nicht vollständig geprüft. Eingebettete Skripte wurden auf Syntax geprüft.

## Aufbau und Grenzen

`history.cjs` speichert Ereignisse in `tmp/monitor-calendar-lab-v3/history.sqlite`.
Version 3 wurde mit einer geprüften SQLite-Sicherung der Version 2 angelegt. Danach
sind die Historien getrennt; neue Ereignisse der Version 2 werden nicht automatisch übernommen.
SQLite-Transaktionen, WAL und `synchronous=FULL` sichern bestätigte Schreibvorgänge.
Ereignis-IDs verhindern doppelte Scans bei Wiederholung derselben Anfrage. Abweichende
Nutzlast unter derselben ID wird abgelehnt. Eine neue absichtliche Scan-ID bleibt ein
neues Ereignis. Korrekturen ergänzen die Historie; UPDATE und DELETE sind per Trigger gesperrt.
Dateisystem-/Datenbankadministratoren könnten die Datei dennoch verändern; dies ist
keine manipulationssichere Archivierung. Produktionsspeicher und unabhängige Sicherung
müssen vor Live-Übernahme eingerichtet werden. Die Testhistorie unter `tmp/` nicht aufräumen.

`slack-readonly.cjs` erlaubt ausschließlich `slackLists.items.list` und
`slackLists.items.info` für die konfigurierte Liste. Pagination, Zeitlimit und
Schemaauflösung sind geprüft. `import-slack.cjs` liest Token/List-ID aus `.env`,
speichert keine Credentials in der Testkopie und protokolliert nur Anzahlen.
Vor dem Import wird eine geprüfte Datenbanksicherung erstellt.

Die Testseite zeigt datierte Slack-Ausgangsstände, keine kontinuierliche Live-Verbindung.
Slack bleibt maßgeblich; lokale Reopen-/Fertig-Scans überschreiben seinen Produktionsstatus
noch nicht. Fehlender Teilebedarf bleibt ungeklärt und wird nie als materialbereit gewertet.

Der klassische Monitor unter `http://127.0.0.1:3309/display` liest den beim Teststart
geladenen lokalen Slack-Snapshot. Die neue `/lab`-Seite liest die Historie bei jedem
Aufruf neu. Nach erneutem Import kann daher der klassische Monitor einen älteren Stand
zeigen, bis die Testinstanz abgestimmt neu gestartet wird.

`calendarPreview` akzeptiert nur `jonat.bsjalousienprofi@gmail.com`, verändert nur
den Titelpräfix und lässt Kundenfarben unverändert. Terminzuordnungen werden jetzt dauerhaft
als Ereignisse gespeichert, inklusive Änderungen und begründetem Lösen der Zuordnung.
Ein Termin kann nur einem Auftrag gleichzeitig zugeordnet sein. Konkurrierende Änderungen
mit veraltetem Stand werden abgewiesen. Termin-ID, Titel und Farbe stammen weiterhin aus
manueller Eingabe und sind ausdrücklich **noch nicht gegen Google geprüft**. Ein Google-Client
ist nicht implementiert; alle Vorschauen sind trocken und schreiben nichts in Kalender.

Monitor-Scans bewahren auch unzugeordneten Rohtext. Es gibt keine automatische unscharfe
Textzuordnung. Die nachträgliche Zuordnung nennt die Bedarfsrevision und kann über ein
Korrekturereignis zurückgenommen werden. Alte Zuordnungen bleiben an ihrer damaligen Revision;
sie bestätigen keinen neuen Bedarf. Der im alten Formular eingetippte Bearbeiter steht
nur als `reportedActor` im Verlauf; maßgeblich ist die authentifizierte Testperson.

## Befehle

Die Kopie ist bereits angelegt; Vorbereitung verweigert ein Überschreiben:

```powershell
node tools/monitor-lab/prepare.cjs --v3
node tools/monitor-lab/build-panel-v3.cjs
node tools/monitor-lab/import-slack.cjs --v3
node tools/monitor-lab/start.cjs --v3
```

Start nur über dieses Skript, ohne `dotenv`-Preload. Es startet ausschließlich auf
127.0.0.1:3309. Portkonflikte beenden keinen vorhandenen Prozess. Strg+C im zugehörigen
Terminal beendet nur den Testprozess; auch Testnutzer vorher ihre Eingaben abschließen lassen.

Im Testserver sind externe Fetch-Aufrufe, produktive Datenbankabfragen, Slack-Schreiben
und Unterprozesse einschließlich Druck blockiert. Nur der getrennte Importbefehl darf
Slack lesen. Die bestehende Startmeldung „DB Connected successfully“ bezieht sich im
Testserver auf einen Testersatz; die neue Historie verwendet unabhängig davon SQLite.
Dies ist eine Testkonfiguration für den geprüften Quellstand, keine Betriebssystem-Sandbox.

```powershell
node tools/monitor-lab/status.test.cjs
node tools/monitor-lab/history.test.cjs
node tools/monitor-lab/link-scan.test.cjs
node tools/monitor-lab/verify.cjs --v3
node tools/monitor-lab/backup.cjs --v3
```

HTTP-Tests erzeugen gekennzeichnete `LAB-VERIFY-*`- und `RecLab*`-Aufträge ausschließlich in der
Testhistorie. Datenbanken der Fachtests liegen unter `test-runs/` getrennt davon.
Ergebnis: `tmp/monitor-calendar-lab-v3/verification.json`.
Sicherungen: `tmp/monitor-calendar-lab-v3/backups/`, jeweils mit SQLite-Integritätsprüfung.
Testdaten, importierte Auftragsdaten und Zugangsdaten sind lokal per `.gitignore` ausgeschlossen.

## Vor Live-Übernahme offen

- Browserprüfung mit echten Klicks und mehreren parallelen Testnutzern.
- Vollständige Positionszuordnung für bestehende Aufträge fachlich prüfen; Bedarf nicht
  automatisch aus unvollständigen Beschreibungstexten freigeben.
- Gespeicherte Terminzuordnungen gegen tatsächliche Google-Termine prüfen; nur im erlaubten Kalender.
- Den getesteten Scan-Eingang erst nach Abnahme auf Live übertragen und automatischen Slack-Abgleich gestalten,
  ohne Slack vorzeitig als maßgebliche Quelle abzulösen.
- Produktionsspeicher, Sicherungsplan und Wiederherstellung auf separatem Ziel prüfen.
- Live-Dienst eindeutig zuordnen. Auch die erneute lesende Dienstsuche lieferte in
  dieser Agentenumgebung keinen passenden Dienst; das belegt nicht, dass er nicht läuft.
- [Wartungsablauf](MAINTENANCE.md) einschließlich Nutzungserkennung umsetzen und testen.
- Vor jedem Live-Neustart Nutzer informieren, Arbeit abschließen lassen und ausdrückliche
  Betreiberfreigabe einholen. Danach Aufruf, Anmeldung und betroffene Funktionen prüfen.

Das mobile Montageformular mit Pflichtangaben, Fotos und Unterschrift folgt später.
