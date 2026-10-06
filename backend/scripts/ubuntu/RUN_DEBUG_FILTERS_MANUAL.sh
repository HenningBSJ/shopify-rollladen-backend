#!/bin/bash
set +u
NAME="Brother_QL_1110NWB"
PDF="/tmp/debug-final-correct.pdf"

echo "================================================================="
echo "  SCHRITT 1: Job 23 canceln + alle Jobs killen"
echo "================================================================="
cancel -a -x 2>&1 || true
sleep 1
lpq -P "$NAME" 2>&1
echo ""
echo "================================================================="
echo "  SCHRITT 2: Laufende CUPS Filter Prozesse prüfen (hängen da?)"
echo "================================================================="
echo "--- ps auxf | grep cups/filter ---"
ps auxfww 2>&1 | grep -v grep | grep -E "pdftopdf|gstoraster|rastertopwg|cupsfilter|socket" || echo "  ✅ Keine hängenden Filter Prozesse! (gut!)"
echo ""
echo "--- ps auxf | grep cups ---"
ps auxfww 2>&1 | grep -v grep | grep cupsd | head -5
echo ""

echo "================================================================="
echo "  SCHRITT 3: RICHTIGES 29x90mm PDF erzeugen (RICHTIGE MEDIABOX!)"
echo "================================================================="
# PostScript: 29mm = 82.20 pt, 90mm = 255.12 pt
# Set MediaBox explizit!
cat > /tmp/label-correct.ps <<'PSEOF'
%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 82 255
%%HiResBoundingBox: 0 0 82.2047 255.1181
<< /PageSize [82.2047 255.1181] /ImagingBBox null >> setpagedevice
/Helvetica-Bold findfont 12 scalefont setfont
1 1 setlinewidth
0 0 moveto 82.2 0 lineto 82.2 255.1 lineto 0 255.1 lineto closepath stroke
newpath
3 240 moveto
0 0 0 setrgbcolor
(U B U N T U   F I N A L) show
3 225 moveto
(DEBUG TEST LABEL!) show
3 210 moveto
/Helvetica findfont 9 scalefont setfont
(29mm x 90mm Etikett) show
3 30 moveto
(2026-09-11 Ubuntu CUPS) show
3 15 moveto
(socket://192.168.2.103:9100) show
showpage
PSEOF
gs -o "$PDF" -sDEVICE=pdfwrite -r600 \
  -dDEVICEWIDTHPOINTS=82.2047 -dDEVICEHEIGHTPOINTS=255.1181 \
  -dFitPage -dCompatibilityLevel=1.5 \
  /tmp/label-correct.ps 2>&1 | tail -5
sleep 1
ls -la "$PDF"
echo ""
echo "→ PDF Prüfung pdfinfo:"
pdfinfo "$PDF" 2>&1 | grep -E "Pages|Page size|File size"
echo ""
echo "================================================================="
echo "  SCHRITT 4: Filterkette MANUELL Schritt für Schritt TESTEN!"
echo "  (1) pdftopdf → PDF normalisieren"
echo "  (2) gstoraster → PDF → CUPS Raster"
echo "  (3) rastertopwg → CUPS Raster → PWG Raster (image/urf) → Brother-kompatibel!"
echo "================================================================="
cd /tmp
rm -f /tmp/out-*.{pdf,ras,urf}
mkdir -p /tmp/cups-debug
cd /tmp/cups-debug
FILTERDIR="/usr/lib/cups/filter"

echo "--- [4a] pdftopdf ---"
JOB=99
USER=root
TITLE=debug
COPIES=1
OPTIONS="media=29x90mm sides=one-sided"
echo "  Command: $FILTERDIR/pdftopdf $JOB $USER '$TITLE' $COPIES '$OPTIONS' $PDF > /tmp/out-1.pdf 2>/tmp/pdftopdf.err"
timeout 20s $FILTERDIR/pdftopdf $JOB $USER "$TITLE" $COPIES "$OPTIONS" "$PDF" > /tmp/out-1.pdf 2>/tmp/pdftopdf-err.log
RC_PDFTOPDF=$?
echo "  → Exit pdftopdf: $RC_PDFTOPDF"
echo "  → stderr pdftopdf (nicht-leer?):"
cat /tmp/pdftopdf-err.log 2>&1
ls -la /tmp/out-1.pdf 2>&1
echo ""

echo "--- [4b] gstoraster PDF → CUPS Raster ---"
# gstorason needs PDF-IN and outputs CUPS Raster (options!)
echo "  Command: $FILTERDIR/gstoraster $JOB $USER '$TITLE' $COPIES '$OPTIONS' /tmp/out-1.pdf > /tmp/out-2.ras 2>/tmp/gstoraster-err.log"
timeout 60s $FILTERDIR/gstoraster $JOB $USER "$TITLE" $COPIES "$OPTIONS" /tmp/out-1.pdf > /tmp/out-2.ras 2>/tmp/gstoraster-err.log
RC_GS=$?
echo "  → Exit gstoraster: $RC_GS"
echo "  → stderr gstoraster (erste 20 Zeilen):"
head -20 /tmp/gstoraster-err.log 2>&1
ls -la /tmp/out-2.ras 2>&1
echo ""

echo "--- [4c] rastertopwg CUPS Raster → PWG Raster image/urf ---"
echo "  Command: $FILTERDIR/rastertopwg $JOB $USER '$TITLE' $COPIES '$OPTIONS' /tmp/out-2.ras > /tmp/out-3.urf 2>/tmp/rastertopwg-err.log"
timeout 60s $FILTERDIR/rastertopwg $JOB $USER "$TITLE" $COPIES "$OPTIONS" /tmp/out-2.ras > /tmp/out-3.urf 2>/tmp/rastertopwg-err.log
RC_PWG=$?
echo "  → Exit rastertopwg: $RC_PWG"
echo "  → stderr rastertopwg:"
cat /tmp/rastertopwg-err.log 2>&1
ls -la /tmp/out-3.urf 2>&1
echo ""
echo "  → URF Magic Bytes (sollte URF sein!):"
xxd -l 16 /tmp/out-3.urf 2>&1 || echo "  (kein xxd, fallback head -c 8)"
head -c 8 /tmp/out-3.urf 2>&1 | od -A x -t x1z

echo ""
echo "================================================================="
echo "  SCHRITT 5: Wenn alle Filter einzeln OK → Direktdruck mit richtigem PDF"
echo "================================================================="
if [ "$RC_PDFTOPDF" = "0" ] && [ "$RC_GS" = "0" ] && [ "$RC_PWG" = "0" ] && [ -s /tmp/out-3.urf ]; then
  echo "  ✅ Alle Filter einzeln OK! → Test lp mit korrektem PDF"
  LOG=$(lp -d "$NAME" -o media=29x90mm -o sides=one-sided "$PDF" 2>&1)
  echo "  lp output: $LOG"
  JOBID=$(echo "$LOG" | grep -oE "[0-9]+" | head -1)
  echo "  → JobID=$JOBID"
  echo ""
  echo "  --- lpq 40x (1s) ---"
  for I in $(seq 1 40); do
    sleep 1
    LP=$(lpq -P "$NAME" 2>&1 | tail -1)
    printf "  %2ds | %s\n" "$I" "$LP"
    echo "$LP" | grep -q "keine Einträge" && break
    echo "$LP" | grep -qE "no entries|ist leer|empty" && break
  done
  sleep 3
  echo ""
  echo "  --- error_log Job $JOBID ---"
  grep -nE "\] \[Job ${JOBID}\]" /var/log/cups/error_log 2>&1 | tail -n 80
  echo ""
  echo "  --- lpstat completed ---"
  lpstat -W completed -P "$NAME" 2>&1 | tail -3
else
  echo "  ❌ Mindestens ein Filter fehlgeschlagen!"
  [ "$RC_PDFTOPDF" != "0" ] && echo "    → pdftopdf FAIL exit=$RC_PDFTOPDF"
  [ "$RC_GS" != "0" ] && echo "    → gstoraster FAIL exit=$RC_GS"
  [ "$RC_PWG" != "0" ] && echo "    → rastertopwg FAIL exit=$RC_PWG"
  [ ! -s /tmp/out-3.urf ] && echo "    → out-3.urf ist LEER! (keine URF Daten erzeugt)"
fi
