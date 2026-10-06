#!/bin/bash
# FINAL TESTDRUCK OHNE CHAOS!
PDF="/tmp/label-correct.pdf"
NAME="Brother_QL_1110NWB"

echo "================================================================="
echo "  FINAL TEST: Korrektes PDF 29x90mm, nur APT-CUPS, kein Snap!"
echo "================================================================="

echo "[1] PDF + Drucker Check:"
ls -la /etc/cups/ppd/Brother_QL_1110NWB.ppd 2>&1
lpstat -p "$NAME" 2>&1
lpstat -v "$NAME" 2>&1

echo ""
echo "[2] PDF korrekt erzeugen (falls fehlt):"
if [ ! -f "$PDF" ] || [ ! -s "$PDF" ]; then
  cd /tmp
  cat > /tmp/label-correct.ps <<'PS'
%!PS-Adobe-3.0
<< /PageSize [82.2047 255.1181] >> setpagedevice
/Helvetica-Bold findfont 12 scalefont setfont
3 240 moveto (UBUNTU FINAL TEST!) show
3 225 moveto (29mm x 90mm!) show
3 15 moveto (socket://192.168.2.103:9100) show
showpage
PS
  gs -o "$PDF" -sDEVICE=pdfwrite -dDEVICEWIDTHPOINTS=82.2047 -dDEVICEHEIGHTPOINTS=255.1181 /tmp/label-correct.ps 2>&1 | tail -2
  sleep 1
fi
ls -la "$PDF"
echo "  → pdfinfo:"
pdfinfo "$PDF" 2>&1 | grep -E "Pages|Page size"

echo ""
echo "[3] Alte Jobs canceln:"
cancel -a -x 2>&1 || true
sleep 1

echo ""
echo "[4] DRUCK STARTEN:"
LOG=$(lp -d "$NAME" -o media=29x90mm -o sides=one-sided "$PDF" 2>&1)
echo "  lp: $LOG"
JOBID=$(echo "$LOG" | grep -oE "[0-9]+" | head -1)
[ -z "$JOBID" ] && JOBID="X"
echo "  → JobID=$JOBID"

echo ""
echo "[5] lpq Polling (35x 1s):"
for I in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35; do
  sleep 1
  L=$(lpq -P "$NAME" 2>&1 | tail -1)
  printf "  %2ds | %s\n" "$I" "$L"
  echo "$L" | grep -qiE "no entries|leer|empty|keine.*eint" && break
done
echo ""
sleep 3

echo "[6] error_log Job $JOBID (DEBUG-Log!):"
echo "  ======================================================================"
grep -nE "\] \[Job ${JOBID}\]" /var/log/cups/error_log 2>&1 | tail -80
echo "  ======================================================================"
echo ""
echo "[7] lpstat completed + Drucker Status:"
lpstat -W completed -P "$NAME" 2>&1 | tail -5
lpstat -p "$NAME" 2>&1
echo ""
echo "================================================================="
echo "  FERTIG JOB $JOBID! 👉 BITTE AM BROTHER NACHSCHAUEN!"
echo "================================================================="
