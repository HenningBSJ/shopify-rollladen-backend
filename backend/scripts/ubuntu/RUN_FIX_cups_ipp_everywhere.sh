#!/bin/bash
set -u
echo "========================================================"
echo "  FIX 2: CUPS IPP EVERYWHERE (AirPrint!) Drucker"
echo "  ALT (falsch): socket://9100 + driverless IPP PPD MISMATCH"
echo "  NEU (korrekt): ipp://192.168.2.103:631/ipp/print + everywhere PPD"
echo "========================================================"
NEWNAME="Brother_QL_1110NWB"
URI="ipp://192.168.2.103:631/ipp/print"

echo "[PRE-CHECK 1] IPP Port 631 + RAW 9100 offen?"
nc -z -w 3 192.168.2.103 631 2>&1 && echo "✅ Port 631 (IPP) OFFEN" || echo "❌ Port 631 (IPP) NICHT OFFEN"
nc -z -w 3 192.168.2.103 9100 2>&1 && echo "✅ Port 9100 (RAW) OFFEN" || echo "❌ Port 9100 NICHT OFFEN"
echo ""

echo "[PRE-CHECK 2] IPP Get-Printer-Attributes via ipptool (wenn vorhanden)?"
if command -v ipptool >/dev/null 2>&1; then
  echo "  Nutze ipptool..."
  ipptool -tv -I "ipp://192.168.2.103:631/ipp/print" /dev/null 2>&1 | head -30 || true
else
  echo "  ipptool nicht installiert → curl fallback auf IPP endpoint..."
  # HTTP OPTIONS auf IPP Port:
  curl -sS -o /dev/null -w "HTTP %{http_code}\n" --max-time 5 -X OPTIONS "http://192.168.2.103:631/" 2>&1 || echo "  curl fail"
fi
echo ""

echo "[1] Alle Jobs canceln + Drucker löschen..."
cancel -a 2>&1 || true
sleep 2
for PR in $(lpstat -p 2>/dev/null | awk '{print $2}' | grep -i Brother); do
  echo "  Löschen: $PR"
  lpadmin -x "$PR" 2>&1
done
# Zusätzlich @BRN... Einträge
for PR in $(lpstat -v 2>/dev/null | grep -i Brother | awk -F': | ' '{print $2}' | sort -u); do
  [ -n "$PR" ] && lpadmin -x "$PR" 2>/dev/null
done
sleep 2
echo "  Nach Delete: $(lpstat -p 2>&1 | head -20)"
echo ""

echo "[2] Drucker anlegen mit IPP Everywhere URI: $URI + PPD everywhere!"
lpadmin -p "$NEWNAME" -E -v "$URI" -m everywhere \
  -D "Brother QL-1110NWB IPP Everywhere (AirPrint)" \
  -L "Rafes-405-1231 Ubuntu CUPS IPP" 2>&1
sleep 2
echo ""
echo "[2b] cupsaccept + cupsenable + Default setzen..."
cupsaccept "$NEWNAME" 2>&1
cupsenable "$NEWNAME" 2>&1
lpoptions -d "$NEWNAME" 2>&1
echo ""

echo "[3] Drucker Status nach Anlage..."
lpstat -t 2>&1 | grep -i brother -A2
echo ""
lpq -P "$NEWNAME" 2>&1 | head -6
echo ""
lpoptions -p "$NEWNAME" -l 2>&1 | head -40
echo ""

echo "[4] IMMER WICHTIG: /var/log/cups/error_log letzte Zeilen (falls vorhanden!) → Filterfehler sehen"
if [ -r /var/log/cups/error_log ]; then
  echo "  (Letzte 20 Zeilen error_log VOR Test:)"
  tail -n 20 /var/log/cups/error_log 2>&1 || echo "  Keine Rechte auf error_log → wir lesen es mit sudo unten!"
fi
echo ""
echo "========================================================"
echo "  DRUCKER ANLAGE FERTIG! Jetzt folgt Drucktest (per API)"
echo "========================================================"
