#!/bin/bash
set -u
echo "========================================================"
echo "  FIX CUPS: Brother Drucker auf socket://192.168.2.103:9100 RAW"
echo "  AKTUELL BUG: implicitclass:// → KEIN ECHTER DRUCK!"
echo "========================================================"
echo ""

NEWNAME="Brother_QL_1110NWB"
URI="socket://192.168.2.103:9100"
PPD_OLD_NAME="Brother"
DRVNAME="brother-ql1110nwb"

echo "[1] Alle Jobs canceln..."
cancel -a 2>&1
sleep 2
lpq -P $NEWNAME 2>&1 | head -5
echo ""

echo "[2] Brother Netzwerk-Test (Port 9100 RAW socket)..."
nc -z -w 3 192.168.2.103 9100 2>&1 && echo "✅ Port 9100 OFFEN. Perfekt!" || { echo "❌ Port 9100 NICHT OFFEN! Drucker accepting RAW?"; }
echo ""

echo "[3] Alle existierenden Brother-Drucker erstmal entfernen (Säubern!)..."
for PR in $(lpstat -p 2>/dev/null | awk '{print $2}' | grep -i Brother); do
  echo "  Lösche Drucker: $PR ..."
  lpadmin -x "$PR" 2>&1
done
# Falls es Klone gibt, nochmal prüfen:
lpstat -p 2>&1 | grep -i Brother || echo "  ✅ Alle Brother Drucker gelöscht!"
echo ""

echo "[4] Neuen Drucker anlegen: $NEWNAME → $URI (RAW socket!)"
echo "    Zuerst suche passendes PPD... (Brother QL-1110NWB / Generic Raw Queue)"
# Listet alle Treiber: lpinfo --make-and-model Brother -m 2>&1 | head -30
PPD=$(lpinfo --make-and-model "QL-1110NWB" -m 2>&1 | head -1 | awk '{print $1}')
if [ -z "$PPD" ]; then
  echo "  Kein PPD gefunden via lpinfo → Nutze 'raw' Queue (empfohlen für PDFs die wir direkt an Brother schicken!)"
  PPD="raw"
fi
echo "  Nutze PPD: $PPD"
echo ""
# lpadmin anlegen (generic PPD raw reicht, wir machen PDF direkt per Chromium! Brother kann PDF nativ meistens nicht, aber CUPS wird rasterize falls nötig.)
# Bessere Wahl: Treiber falls vorhanden! Sonst raw.
if [ "$PPD" = "raw" ]; then
  echo "  → Anlegen als RAW Queue..."
  lpadmin -p "$NEWNAME" -v "$URI" -E -m raw -D "Brother QL-1110NWB RAW 9100" -L "Ubuntu RAW CUPS Socket"
else
  echo "  → Anlegen mit Brother-PPD..."
  lpadmin -p "$NEWNAME" -v "$URI" -E -m "$PPD" -D "Brother QL-1110NWB PPD 9100" -L "Ubuntu CUPS PPD"
fi
sleep 2
# AKZEPTIEREN + AKTIVIEREN!
cupsaccept "$NEWNAME" 2>&1
cupsenable "$NEWNAME" 2>&1
lpoptions -d "$NEWNAME" 2>&1
echo ""

echo "[5] Drucker nach Anlage prüfen..."
lpstat -t 2>&1 | grep -i brother -A3
echo ""
lpstat -p "$NEWNAME" -l 2>&1 | head -30
echo ""
lpq -P "$NEWNAME" 2>&1 | head -5
echo ""

echo "[6] Teste Port 9100 direkt via nc (50 Bytes RAW schicken + sofort wieder schließen) → Drucker sollte bereit bleiben"
echo "CUPS PING TEST" | nc -w 2 192.168.2.103 9100 2>&1 | head -5 || echo "  OK: nc Ende"
echo ""

echo "========================================================"
echo "  FIX FERTIG! Jetzt kommt Druck-Test via API..."
echo "  Drucker-URI sollte jetzt: $URI"
echo "  Nicht mehr implicitclass://"
echo "========================================================"
