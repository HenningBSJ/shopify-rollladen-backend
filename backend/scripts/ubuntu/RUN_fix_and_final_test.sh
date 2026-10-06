#!/bin/bash
set -u
echo "============================================================"
echo "  FINAL FIX: socket://9100 + PPD everywhere (wandelt PDF→Raster!)"
echo "  Brother auf Port9100 erwartet RAW → kein IPP Format Check mehr!"
echo "============================================================"
NAME="Brother_QL_1110NWB"
URI_SOCKET="socket://192.168.2.103:9100"

echo "[1] Alle Jobs canceln + Drucker URI ändern (URI bleibt everywhere PPD!)"
cancel -a -x $NAME 2>&1 || true
sleep 1
echo "  → lpadmin -p $NAME -v $URI_SOCKET -E"
lpadmin -p "$NAME" -v "$URI_SOCKET" -E 2>&1
cupsaccept "$NAME" 2>&1
cupsenable "$NAME" 2>&1
lpoptions -d "$NAME" 2>&1
sleep 2
echo ""

echo "[2] Status nach URI Wechsel:"
lpstat -t 2>&1 | grep -i "Gerät\|ist bereit\|im Leerlauf\|akzeptiert" | grep -i Brother
echo ""
lpoptions -p "$NAME" 2>&1 | head -3
echo ""

echo "[3] error_log + access_log truncaten damit wir frisch starten!"
[ -r /var/log/cups/error_log ] && truncate -s 0 /var/log/cups/error_log 2>&1
[ -r /var/log/cups/access_log ] && truncate -s 0 /var/log/cups/access_log 2>&1
echo ""

echo "[4] FINAL PRINT TEST direkt via lp /tmp/test-small.pdf + JobID grepen!"
LOGJOB=$(lp -d "$NAME" -o media=Custom.29x90mm -o sides=one-sided -o CutMedia=EndOfJob /tmp/test-small.pdf 2>&1)
JOBID=$(echo "$LOGJOB" | grep -oE "[0-9]+" | head -1)
echo "  → $LOGJOB  → JobID=$JOBID"
echo ""
echo "  --- lpq 8x ---"
for I in 1 2 3 4 5 6 7 8; do
  sleep 1
  echo -n "  $I s: "
  lpq -P "$NAME" 2>&1 | head -2 | tail -1
done
echo ""

echo "[5] KRITISCHER CHECK error_log nach Job $JOBID: GIBTS ES NOCH document-format-error? (SOLLTE ES NICHT MEHR GEBEN!)"
sleep 3
echo "  → error_log grep (Job|Unable|document-format|Backend|socket):"
grep -nE "Job $JOBID|Unable to|document-format|Backend|socket|exit" /var/log/cups/error_log 2>&1 | tail -n 50
echo ""
echo "  → Job completed/prüfen:"
lpstat -W completed -P "$NAME" 2>&1 | tail -5
echo ""

echo "[6] BACKEND: socket Backend Logs in error_log (Job $JOBID):"
grep -nE "socket|backend|Backend|pid:|connected|sent|bytes|exited" /var/log/cups/error_log 2>&1 | grep -E "Job $JOBID|socket" | tail -n 30
echo ""

echo "[7] Sehr gut! Jetzt API-Test (Backend Endpunkt /display/label/direct-print) folgt in PS1 Skript!"
echo "============================================================"
echo "  FIX FERTIG! Schau am Drucker: KAM EIN ETIKETT RAUS?"
echo "============================================================"
