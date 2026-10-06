#!/bin/bash
set -u
echo "================================================================"
echo "  HIDDEN ROOT CAUSE + FINAL FIX!"
echo "  Problem: FINAL_CONTENT_TYPE=application/pdf wurde auf socket9100 geschickt!"
echo "  Brother auf RAW9100 versteht KEIN PDF! Nur BR-Script 3 = PostScript!"
echo "  Fix: Generic PostScript PPD! CUPS Filterkette: PDF → pdftops → PostScript → socket 9100 → Brother druckt!"
echo "================================================================"
NAME="Brother_QL_1110NWB"
URI="socket://192.168.2.103:9100"
# Generic PostScript PPD in CUPS sample drivers!
GENERIC_PPD="drv:///sample.drv/generic.ppd"
# ODER falls Gutenprint installiert, nimm das (genauer!):
GUTEN_BROTHER_PPD=$(lpinfo -m 2>&1 | grep -i "brother.*ql.*gutenprint" | head -1 | awk '{print $1}')

echo "[0] PPD Optionen:"
echo "  → Generic PS: $GENERIC_PPD"
echo "  → Gutenprint Brother QL: $GUTEN_BROTHER_PPD"
echo ""
if [ -n "$GUTEN_BROTHER_PPD" ]; then
  USE_PPD="$GUTEN_BROTHER_PPD"
  echo "[*] NEHMEN Gutenprint Brother PPD: $USE_PPD"
else
  USE_PPD="$GENERIC_PPD"
  echo "[*] Gutenprint Brother nicht gefunden → Nehme Generic PostScript PPD: $USE_PPD"
fi
echo ""

echo "[1] Alle Jobs canceln, Drucker löschen, frisch neu anlegen!"
cancel -a -x "$NAME" 2>&1 || true
lpadmin -x "$NAME" 2>&1 || true
sleep 2
echo "  → Anlegen: lpadmin -p $NAME -E -v $URI -m $USE_PPD -D \"Brother QL-1110NWB PostScript RAW9100\" -L \"Rafes Ubuntu\""
lpadmin -p "$NAME" -E -v "$URI" -m "$USE_PPD" \
  -D "Brother QL-1110NWB PostScript RAW9100" \
  -L "Rafes Ubuntu CUPS" 2>&1
cupsaccept "$NAME" 2>&1
cupsenable "$NAME" 2>&1
lpoptions -d "$NAME" 2>&1
sleep 2
echo ""

echo "[2] Medien auf 29x90mm setzen + CutMedia Optionen:"
# Custom 29x90mm = unsere Labels!
lpoptions -p "$NAME" -o media=Custom.29x90mm 2>&1
lpoptions -p "$NAME" -o sides=one-sided 2>&1
echo ""
echo "  PPD Options List (wichtig: PageSize/Media da!):"
lpoptions -p "$NAME" -l 2>&1 | head -30
echo ""

echo "[3] FINAL TEST 1: /tmp/test-small.pdf via lp -d $NAME drucken! + JobID grepen!"
LOGJOB=$(lp -d "$NAME" /tmp/test-small.pdf 2>&1)
JOBID=$(echo "$LOGJOB" | grep -oE "[0-9]+" | head -1)
echo "  → $LOGJOB  → JobID=$JOBID"
echo ""
echo "  --- lpq 10x Abfrage ---"
for I in $(seq 1 1 10); do
  sleep 1
  L=$(lpq -P "$NAME" 2>&1 | head -2 | tail -1)
  echo "  $I s: $L"
done
echo ""

echo "[4] Jetzt KRITISCH: FINAL_CONTENT_TYPE in error_log Job $JOBID! SOLLTE NICHT MEHR PDF sein! SOLLTE PostScript/PS sein!"
sleep 2
echo "  error_log grep FINAL_CONTENT_TYPE + filters exited:"
grep -nE "Job $JOBID|FINAL_CONTENT_TYPE|Started filter|Started backend|exited with no errors|Job completed|Content-Type" /var/log/cups/error_log 2>&1 | tail -n 60
echo ""

echo "[5] API Test! (Backend Direktdruck!)"
echo "  Bitte warte, ob Etikett von Test 1 rauskommt."
echo ""
echo "================================================================"
echo "  ACHTUNG: Bis zu 30s dauern bis PostScript verarbeitet!"
echo "  Schau auf Drucker: BLINKT die DATA LED? Kam ein Etikett raus?"
echo "================================================================"
