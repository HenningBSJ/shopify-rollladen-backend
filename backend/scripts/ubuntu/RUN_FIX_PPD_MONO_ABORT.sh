#!/bin/bash
set +u
NAME="Brother_QL_1110NWB"
PPD_FILE="/etc/cups/ppd/${NAME}.ppd"
URI="ipp://192.168.2.103:631/ipp/print"
PDF="/tmp/label-correct.pdf"

echo "================================================================="
echo "  FIX PPD ColorModel + ErrorPolicy=abort-job! → Testdruck"
echo "================================================================="

cancel -a -x 2>&1 || true
sleep 1

echo "[1] ErrorPolicy=abort-job! (Kein ewiges Retry!)"
cupsctl ErrorPolicy=abort-job 2>&1
cupsctl LogLevel=debug 2>&1
echo "  cupsctl jetzt:"
cupsctl 2>&1 | grep -iE "errorpol|log"
echo ""

echo "[2] PPD KORRIGIEREN!"
echo "  Vorher DefaultColorModel / ColorModel:"
grep -nE "ColorModel|DefaultColorModel" "$PPD_FILE" 2>&1
echo ""
python3 - <<'PYEOF'
import re
with open('/etc/cups/ppd/Brother_QL_1110NWB.ppd','r',errors='ignore') as f:
    c = f.read()
# 1) DefaultColorModel RGB → Monochrome (QL-1110NWB ist Thermo SW!)
c = c.replace('*DefaultColorModel: RGB', '*DefaultColorModel: Gray')
# 2) ColorModel Option: RGB Vorkommen durch Gray ersetzen
c = c.replace('*ColorModel RGB/Color', '*ColorModel Gray/Monochrome')
# 3) UI ColorModel auch Monochrome
c = c.replace('*%Feature: ColorModel RGB *?', '*%Feature: ColorModel Gray *?')
# 4) 8-bit characters in PageSize/PageRegion entfernen (ersetzen durch clean)
for badopt in ['PageRegion','PageSize']:
    c = re.sub(rf'(\*{badopt}\s+102x152mm).*:.*', rf'\1 "102x152mm" "PostScript Custom Page Size"', c)
    c = re.sub(rf'(\*{badopt}\s+4x6).*:.*', rf'\1 "4x6in" "PostScript Custom Page Size 4x6"', c)
# 5) Sicherstellen: cupsFilter2 für PDF vorhanden (unsere Zeilen von vorhin)
filters_needed = [
    '*cupsFilter2: "application/pdf application/vnd.cups-pdf 0 pdftopdf"',
    '*cupsFilter2: "application/vnd.cups-pdf application/vnd.cups-raster 100 gstoraster"',
    '*cupsFilter2: "application/vnd.cups-raster image/urf 100 rastertopwg"',
    '*cupsFilter2: "image/urf image/urf 0 -"'
]
for line in filters_needed:
    if line not in c:
        c += '\n' + line
with open('/etc/cups/ppd/Brother_QL_1110NWB.ppd','w') as f:
    f.write(c)
print("✅ PPD neu geschrieben!")
PYEOF
echo ""
echo "  Nachher DefaultColorModel:"
grep -nE "ColorModel|DefaultColorModel" "$PPD_FILE" 2>&1
echo ""
echo "  cupstestppd JETZT:"
cupstestppd "$PPD_FILE" 2>&1 | tail -10
echo ""

echo "[3] Drucker neu anlegen (mit korrigierter PPD!)"
lpadmin -x "$NAME" 2>&1 || true
sleep 2
lpadmin -p "$NAME" -E -v "$URI" -P "$PPD_FILE" \
  -D "Brother QL-1110NWB FINAL MONOCHROME" \
  -L "Rafes Ubuntu FINAL!" 2>&1
sleep 2
cupsaccept "$NAME" 2>&1
cupsenable "$NAME" 2>&1
lpoptions -d "$NAME" 2>&1
lpoptions -p "$NAME" -o media=29x90mm -o sides=one-sided -o print-color-mode=monochrome 2>&1
echo ""
echo "  → STATUS"
lpstat -p "$NAME" -l 2>&1 | grep -iE "state|temporary|make|uri" 
echo ""

echo "[4] PDF Größe:"
pdfinfo "$PDF" 2>&1 | grep -E "Pages|Page size"

echo ""
echo "[5] DRUCKEN! (Fehler werden jetzt GELOGGT, kein ewiger Retry!)"
LOG=$(lp -d "$NAME" -o media=29x90mm -o sides=one-sided "$PDF" 2>&1)
echo "  lp=$LOG"
JOBID=$(echo "$LOG" | grep -oE "[0-9]+" | head -1)
[ -z "$JOBID" ] && JOBID="?"
echo "  JobID=$JOBID"
echo ""
echo "--- lpq 45x1s ---"
for I in $(seq 1 45); do
  sleep 1
  L=$(lpq -P "$NAME" 2>&1 | tail -1)
  printf "  %2ds | %s\n" "$I" "$L"
  echo "$L" | grep -qiE "no entries|keine.*eint|error|aborted" && break
done
echo ""
sleep 5
echo "--- error_log der letzten 10 min (JOB relevantes) ---"
echo "  ======================================================================"
journalctl -u cups --since "10 min ago" 2>&1 | tail -50
echo ""
echo "--- /var/log/cups/error_log letzte 100 ZEILEN! (Job $JOBID !) ---"
echo "  ======================================================================"
tail -n 100 /var/log/cups/error_log 2>&1
echo "  ======================================================================"
echo ""
echo "--- lpstat completed + not-completed ---"
lpstat -W completed -P "$NAME" 2>&1 | tail -5
echo "NOT COMPLETED:"
lpstat -P "$NAME" 2>&1 | tail -10
echo ""
echo "================================================================="
echo "  FERTIG! JOB $JOBID! BITTE AM DRUCKER NACHSCHAUEN!"
echo "================================================================="
