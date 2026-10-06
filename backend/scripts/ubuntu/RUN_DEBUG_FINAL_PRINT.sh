#!/bin/bash
set +u
echo "================================================================="
echo "  FINAL DEBUG PRINT! (LogLevel=debug AKTIV!)"
echo "  Schritte: (1) PDF erstellen (29x90mm!) (2) lp drucken (3) warten"
echo "           (4) DEBUG error_log Connecting/Wrote Bytes prüfen!"
echo "================================================================="
NAME="Brother_QL_1110NWB"
PDF="/tmp/debug-29x90-final.pdf"

echo "[0] Alte Jobs canceln"
cancel -a -x 2>&1 || true
sleep 1
echo ""

echo "[1] PDF 29x90mm erzeugen mit Ghostscript gs"
# Test-PDF: 29mm breit x 90mm hoch (genau Etikett!)
# PostScript Units: 1mm = 2.834645669 pt
W_PT=$(echo "scale=0; 29 * 72 / 25.4" | bc 2>/dev/null || echo "82")
H_PT=$(echo "scale=0; 90 * 72 / 25.4" | bc 2>/dev/null || echo "255")
echo "  → PDF Dimensionen: ${W_PT}pt x ${H_PT}pt (≈29x90mm)"
cat > /tmp/debug-ps.ps <<'PSEOF'
%!PS-Adobe-3.0
<< /PageSize [82 255] >> setpagedevice
/Helvetica findfont 10 scalefont setfont
10 235 moveto
(--- DEBUG TEST 29x90mm ---) show
10 220 moveto
(Ubuntu FINAL PRINT!) show
10 205 moveto
(JobID: $JOB$) show
10 190 moveto
(Socket Port 9100 + PWG Raster!) show
10 10 moveto
(Date: 2026-09-11) show
showpage
PSEOF
# JOB ID Platzhalter durch echten Wert im Filename ersetzen
gs -o "$PDF" -sDEVICE=pdfwrite -g${W_PT}x${H_PT} -dCompatibilityLevel=1.4 /tmp/debug-ps.ps 2>&1 | tail -3
sleep 1
chmod 644 "$PDF" 2>&1
ls -la "$PDF" 2>&1
which pdfinfo >/dev/null 2>&1 && (echo "  → pdfinfo:"; pdfinfo "$PDF" 2>&1 | grep -E "Pages|Page size")
echo ""

echo "[2] DRUCKEN mit lp an $NAME! (media=29x90mm, one-sided)"
LOG=$(lp -d "$NAME" -o media=29x90mm -o sides=one-sided "$PDF" 2>&1)
echo "  lp output: $LOG"
JOBID=$(echo "$LOG" | grep -oE "[0-9]+" | head -1)
[ -z "$JOBID" ] && JOBID="UNKNOWN"
echo "  → JobID=$JOBID"
echo ""

echo "[3] Warten + lpq Polling (25x 1s = 25s):"
for I in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25; do
  sleep 1
  LINE=$(lpq -P "$NAME" 2>&1 | tail -1)
  printf "  %2ds | %s\n" "$I" "$LINE"
done
echo ""
sleep 3
echo ""

echo "[4] CUPS error_log JOB $JOBID (DEBUG LOGLEVEL! → Connecting/Wrote Bytes!)"
echo "  ======================================================================"
grep -nE "\] \[Job ${JOBID}\]" /var/log/cups/error_log 2>&1 | tail -n 120
echo "  ======================================================================"
echo ""

echo "[5] lpstat Jobs completed + Queue"
echo "  --- lpstat completed $NAME ---"
lpstat -W completed -P "$NAME" 2>&1 | tail -5
echo "  --- lpq Queue aktuell ---"
lpq -P "$NAME" 2>&1
echo ""
echo "[6] Drucker status"
lpstat -p "$NAME" 2>&1
echo ""
echo "================================================================="
echo "  FERTIG MIT JOB $JOBID!"
echo "  SCHAU AM BROTHER: KAM ETWAS RAUS? (Bitte UM JEDEN PREIS MELDEN!)"
echo "================================================================="
