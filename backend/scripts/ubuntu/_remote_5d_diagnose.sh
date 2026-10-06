#!/bin/bash
# ============================================================
# TASK 5d DIAGNOSE: Warum /display/print-health HTTP 000?
# Schritte: journalctl neue logs, curl -v (verbose),
#           direktes Aufrufen von print-health handler code testen
# ============================================================
set -u
echo "============================================================"
echo "DIAGNOSE /display/print-health HTTP 000"
echo "Zeit: $(date '+%F %T')"
echo "============================================================"
echo ""

echo "--- Step 1: Backend journald log (letzte 20 Zeilen VOR Test) ---"
journalctl -u rollladen-backend.service --no-pager -n 20 -o short-iso
echo ""

echo "--- Step 2: Lade Credentials ---"
set -a
. /etc/rollladen-monitor.env
set +a
echo "MONITOR_HTTP_USER=$MONITOR_HTTP_USER, Password length=${#MONITOR_HTTP_PASSWORD}"
echo ""

echo "--- Step 3: curl -v --max-time 20 print-health mit VERBOSE ---"
echo "(Full Header + Body Output nach /tmp/ph_diag.txt)"
rm -f /tmp/ph_diag.txt
curl -v --max-time 20 --user "${MONITOR_HTTP_USER}:${MONITOR_HTTP_PASSWORD}" \
  http://127.0.0.1:3006/display/print-health 2>&1 | tee /tmp/ph_diag.txt | tail -n 80
CURL_RC=${PIPESTATUS[0]}
echo ""
echo "CURL Exit Code: $CURL_RC (0=OK, 28=Timeout, 7=NoConnect, 56=RecvFail)"
echo ""

echo "--- Step 4: Backend log (journalctl) NACH dem curl-Request - neue Fehler? ---"
sleep 1
journalctl -u rollladen-backend.service --no-pager -n 30 --since '10 seconds ago' -o short-iso
echo ""

echo "--- Step 5: Einfache Health-Checks auf die Dependencies direkt ---"
echo "A) CUPS lpstat -r (scheduler running?) :"
lpstat -r 2>&1 | head -3
echo "B) lpstat -p (Drucker) :"
lpstat -p 2>&1 | head -10
echo "C) /usr/bin/chromium-browser --version :"
/usr/bin/chromium-browser --version 2>&1 | head -2
echo "D) /usr/bin/lp exists + version? :"
ls -la /usr/bin/lp 2>&1 ; lp --version 2>&1 | head -1
echo "E) WhoAmI (Service User) via id :"
id
echo "F) systemctl is-active cups :"
systemctl is-active cups.service 2>&1
echo "G) lpstat -h localhost -r 2>&1? :"
lpstat -h localhost -r 2>&1 || true
echo ""

echo "--- Step 6: Einfacher Endpoint Test /display/api/test? falls vorhanden ---"
curl -sS --max-time 10 --user "${MONITOR_HTTP_USER}:${MONITOR_HTTP_PASSWORD}" \
  http://127.0.0.1:3006/display/print-health -o /tmp/ph_body.json -w "%{http_code}" 2>&1 \
  || echo "FEHLER"
echo ""
echo "/tmp/ph_body.json Vorhanden? $(ls -la /tmp/ph_body.json 2>&1)"
if [ -s /tmp/ph_body.json ]; then
  echo "Dateiinhalt Anfang:"
  head -c 1000 /tmp/ph_body.json; echo ""
fi
echo ""
echo "ENDE DIAGNOSE."
exit 0
