#!/bin/bash
# FINAL FINAL FIX! PPD NEU ERSTELLEN MIT RICHTIGEN FILTERN! + IPP631 URI!
set +u
NAME="Brother_QL_1110NWB"
URI="ipp://192.168.2.103:631/ipp/print"
PPD_FILE="/etc/cups/ppd/${NAME}.ppd"
PDF="/tmp/label-correct.pdf"

echo "================================================================="
echo "  PPD NEU + IPP631 URI + RICHTIGE FILTER PDF→URF!"
echo "================================================================="
cancel -a -x 2>&1 || true
lpadmin -x "$NAME" 2>&1 || true
sleep 2
mkdir -p /etc/cups/ppd

echo "[1] PPD NEU GENERIEREN mit driverless → nach /tmp/ppd-raw.ppd"
DRV=$(driverless 2>&1 | grep -iE "QL.*1110" | head -1 | awk '{print $1}')
[ -z "$DRV" ] && DRV="ipp://Brother%20QL-1110NWB._ipp._tcp.local/"
echo "  driverless URI=$DRV"
driverless "$DRV" > /tmp/ppd-raw.ppd 2>/dev/null
echo "  Raw PPD Zeilen: $(wc -l < /tmp/ppd-raw.ppd)"

echo ""
echo "[2] PPD PATCEN: cupsFilter2 HINZUFÜGEN (PDF→urf Filterkette!)"
# Original driverless PPD hat NUR image/urf image/urf passthrough
# Wir fügen VORHER PDF→CUPS-Raster→urf Filter hinzu!
python3 - <<'PYEOF'
with open('/tmp/ppd-raw.ppd','r',errors='ignore') as f:
    lines = f.readlines()
out = []
inserted = False
for line in lines:
    out.append(line.rstrip())
    if not inserted and '*cupsFilter2:' in line and 'image/urf' in line:
        inserted = True
        # NEUE FILTER VOR dem image/urf Passthrough (oder danach ist auch OK)
        out.insert(len(out)-1, '*% Patch by RUN_FINAL: PDF Filter chain for CUPS!')
        out.insert(len(out)-1, '*cupsFilter2: "application/pdf application/vnd.cups-pdf 0 pdftopdf"')
        out.insert(len(out)-1, '*cupsFilter2: "application/vnd.cups-pdf application/vnd.cups-raster 100 gstoraster"')
        out.insert(len(out)-1, '*cupsFilter2: "application/vnd.cups-raster image/urf 100 rastertopwg"')
# Falls keine cupsFilter2 Zeile war: am Ende
if not inserted:
    out.append('*% Patch by RUN_FINAL: NO cupsFilter found, appending full chain!')
    out.append('*cupsFilter2: "application/pdf application/vnd.cups-pdf 0 pdftopdf"')
    out.append('*cupsFilter2: "application/vnd.cups-pdf application/vnd.cups-raster 100 gstoraster"')
    out.append('*cupsFilter2: "application/vnd.cups-raster image/urf 100 rastertopwg"')
    out.append('*cupsFilter2: "image/urf image/urf 0 -"')
with open('/etc/cups/ppd/Brother_QL_1110NWB.ppd','w') as f:
    f.write('\n'.join(out) + '\n')
print(f"✅ PPD geschrieben nach /etc/cups/ppd/Brother_QL_1110NWB.ppd, neue Zeilen: {len(out)}")
PYEOF
chown root:lp /etc/cups/ppd/Brother_QL_1110NWB.ppd
chmod 644 /etc/cups/ppd/Brother_QL_1110NWB.ppd
echo ""
echo "  → KONTROLLE: Alle cupsFilter2 Zeilen in NEUER PPD:"
grep -in cupsFilter2 /etc/cups/ppd/Brother_QL_1110NWB.ppd

echo ""
echo "[3] DRUCKER ANLEGEN mit URI=$URI + PPD=$PPD_FILE"
lpadmin -p "$NAME" -E -v "$URI" -P "$PPD_FILE" \
  -D "Brother QL-1110NWB FINAL IPP631 + Filter Patch" \
  -L "Rafes Ubuntu FINAL!" 2>&1
sleep 2
cupsaccept "$NAME" 2>&1
cupsenable "$NAME" 2>&1
lpoptions -d "$NAME" 2>&1
lpoptions -p "$NAME" -o media=29x90mm -o sides=one-sided -o print-scaling=auto-fit 2>&1
echo ""
echo "  → STATUS:"
lpstat -p "$NAME" 2>&1
lpstat -v "$NAME" 2>&1
echo "  → Drucker permanent?"
lpstat -l -p "$NAME" 2>&1 | grep -i temporary || echo "  ✅ PERMANENT (kein temporary!)"

echo ""
echo "[4] PDF korrekt 29x90mm:"
if [ ! -s "$PDF" ]; then
  cat > /tmp/ps.ps <<'PS'
%!PS
<< /PageSize [82.2047 255.1181] >> setpagedevice
/Helvetica-Bold findfont 11 scalefont setfont
3 240 moveto (FINAL TEST FINAL LABEL!) show
3 225 moveto (Brother QL-1110NWB!) show
3 20  moveto (Ubuntu IPP631 + Filter Patch!) show
showpage
PS
  gs -o "$PDF" -sDEVICE=pdfwrite -dDEVICEWIDTHPOINTS=82.2047 -dDEVICEHEIGHTPOINTS=255.1181 -dCompatibilityLevel=1.5 /tmp/ps.ps 2>&1 | tail -2
  sleep 1
fi
pdfinfo "$PDF" 2>&1 | grep -E "Pages|Page size"

echo ""
echo "[5] DRUCKEN!"
LOG=$(lp -d "$NAME" -o media=29x90mm -o sides=one-sided "$PDF" 2>&1)
echo "  lp=$LOG"
JOBID=$(echo "$LOG" | grep -oE "[0-9]+" | head -1)
[ -z "$JOBID" ] && JOBID="?"
echo "  → JobID=$JOBID"
echo ""
echo "--- lpq 45x1s ---"
for I in $(seq 1 45); do
  sleep 1
  L=$(lpq -P "$NAME" 2>&1 | tail -1)
  printf "  %2ds | %s\n" "$I" "$L"
  echo "$L" | grep -qiE "no entries|leer|empty|keine.*eint" && break
done
echo ""
sleep 5
echo "--- error_log Job $JOBID ---"
echo "  ======================================================================"
grep -nE "\] \[Job ${JOBID}\]" /var/log/cups/error_log 2>&1 | tail -80
echo "  ======================================================================"
echo ""
echo "--- lpstat completed ---"
lpstat -W completed -P "$NAME" 2>&1 | tail -5
echo ""
echo "================================================================="
echo "  FERTIG JOB $JOBID! BITTE AM BROTHER NACHSCHAUEN!"
echo "================================================================="
