#!/bin/bash
# FINAL FIX: URI auf IPP 631 (da RAW9100 am Brother GEHELT / GEBLOCKT ist!)
# IPP 631 funktioniert 100% (nc -zv 631 OK!), und mit UNSEREM Filter image/urf passt das!
set +u
NAME="Brother_QL_1110NWB"
OLD_URI="socket://192.168.2.103:9100"
NEW_URI="ipp://192.168.2.103:631/ipp/print"
PPD="/etc/cups/ppd/Brother_QL_1110NWB.ppd"
PDF="/tmp/label-correct.pdf"

echo "================================================================="
echo "  URI WECHSEL! socket9100 → ipp631!"
echo "  Grund: nc 9100=TIMEOUT! nc 631=OK! Ping OK!"
echo "================================================================="

echo "[1] Jobs canceln + alten Drucker löschen"
cancel -a -x 2>&1 || true
lpadmin -x "$NAME" 2>&1 || true
sleep 2
REMAIN=$(lpstat -p 2>&1 | grep -c "$NAME" || true)
echo "  → Drucker '$NAME' noch vorhanden? $REMAIN (sollte 0 sein!)"
echo ""

echo "[2] PDF 29x90mm vorbereiten"
if [ ! -s "$PDF" ]; then
  cat > /tmp/ps.ps <<'PS'
%!PS
<< /PageSize [82.2047 255.1181] >> setpagedevice
/Helvetica-Bold findfont 11 scalefont setfont
3 240 moveto (IPP 631 FINAL TEST!) show
3 225 moveto (Brother QL-1110NWB!) show
3 20  moveto (ipp://192.168.2.103:631/ipp/print) show
showpage
PS
  gs -o "$PDF" -sDEVICE=pdfwrite -dDEVICEWIDTHPOINTS=82.2 -dDEVICEHEIGHTPOINTS=255.1 /tmp/ps.ps 2>&1 | tail -2
  sleep 1
fi
ls -la "$PDF"
echo ""

echo "[3] NEUEN DRUCKER ANLEGEN: URI=$NEW_URI"
echo "  PPD wird wiederverwendet: $PPD"
lpadmin -p "$NAME" -E -v "$NEW_URI" -P "$PPD" \
  -D "Brother QL-1110NWB FINAL IPP631" \
  -L "Rafes Ubuntu FINAL IPP631!" 2>&1
sleep 2
cupsaccept "$NAME" 2>&1
cupsenable "$NAME" 2>&1
lpoptions -d "$NAME" 2>&1
lpoptions -p "$NAME" -o media=29x90mm -o sides=one-sided -o print-scaling=auto-fit 2>&1
echo ""
echo "  → STATUS:"
lpstat -p "$NAME" 2>&1
lpstat -v "$NAME" 2>&1
echo ""
echo "  → PPD Filter Zeilen:"
grep -in cupsFilter "$PPD" || echo "(nur image/urf passthrough - OK! CUPS MIME fügt Rest hinzu)"
echo ""

echo "[4] FINAL DRUCK mit IPP631!"
LOG=$(lp -d "$NAME" -o media=29x90mm -o sides=one-sided "$PDF" 2>&1)
echo "  lp: $LOG"
JOBID=$(echo "$LOG" | grep -oE "[0-9]+" | head -1)
[ -z "$JOBID" ] && JOBID="?"
echo "  → JobID=$JOBID"
echo ""
echo "--- lpq 40x 1s ---"
for I in $(seq 1 40); do
  sleep 1
  L=$(lpq -P "$NAME" 2>&1 | tail -1)
  printf "  %2ds | %s\n" "$I" "$L"
  echo "$L" | grep -qiE "no entries|leer|empty|keine.*eint" && break
done
echo ""
sleep 4
echo "--- error_log Job $JOBID ---"
echo "  ======================================================================"
grep -nE "\] \[Job ${JOBID}\]" /var/log/cups/error_log 2>&1 | tail -80
echo "  ======================================================================"
echo ""
echo "--- lpstat completed ---"
lpstat -W completed -P "$NAME" 2>&1 | tail -5
echo ""
echo "================================================================="
echo "  FERTIG! JOB $JOBID mit IPP631!"
echo "  👉 BITTE AM BROTHER NACHSCHAUEN! KAM LABEL RAUS?"
echo "================================================================="
