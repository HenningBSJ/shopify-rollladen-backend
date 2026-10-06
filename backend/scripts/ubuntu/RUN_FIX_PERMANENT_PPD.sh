#!/bin/bash
set -u
echo "================================================================="
echo "  FIX PERMANENT PPD! Drucker NICHT MEHR TEMPORARY!"
echo "  Problem: driverless:ipp:// → printer-is-temporary=true → Drucker löscht sich nach Job!"
echo "  Lösung: PPD als echte Datei speichern → lpadmin -P /etc/cups/ppd/xxx.ppd"
echo "================================================================="
NAME="Brother_QL_1110NWB"
URI_SOCKET="socket://192.168.2.103:9100"
PPD_DIR="/etc/cups/ppd"
PPD_FILE="$PPD_DIR/$NAME.ppd"
mkdir -p "$PPD_DIR" 2>&1 || true

echo "[0] Alle Brother Drucker löschen + Jobs canceln"
cancel -a -x 2>&1 || true
ALL_PR=$(lpstat -p 2>&1 | awk '{print $2}' | grep -iE "Brother|QL" | sort -u || true)
for PR in $ALL_PR; do
  echo "  → lpadmin -x $PR"
  lpadmin -x "$PR" 2>&1 || true
done
sleep 1
AFTER=$(lpstat -p 2>&1 | grep -ic brother || true)
echo "  → Brother Drucker übrig: $AFTER"
echo ""

echo "[1] PPD generieren mit driverless Kommando (Original Brother PPD!) + speichern unter $PPD_FILE"
DRV_URI=$(driverless 2>&1 | grep -iE "QL.*1110" | head -1 | awk '{print $1}')
[ -z "$DRV_URI" ] && DRV_URI="ipp://Brother%20QL-1110NWB._ipp._tcp.local/"
echo "  driverless URI=$DRV_URI"
driverless "$DRV_URI" > "$PPD_FILE" 2>&1 || true
# Fallback falls driverless leer/invalid: Generic PWG PPD mit gleicher Filterkette
if [ ! -s "$PPD_FILE" ] || ! head -1 "$PPD_FILE" | grep -q "PPD-Adobe"; then
  echo "  → driverless PPD ungültig! Fallback Generic PPD (Filterkette rastertopwg!)"
  cat > "$PPD_FILE" <<'PPDEOF'
*PPD-Adobe: "4.3"
*FormatVersion: "4.3"
*FileVersion: "1.00"
*LanguageVersion: English
*LanguageEncoding: ISOLatin1
*PCFileName: "BROTHERQL.PPD"
*Product: "(Brother QL-1110NWB)"
*Manufacturer: "Brother"
*ModelName: "Brother QL-1110NWB"
*ShortNickName: "Brother QL-1110NWB"
*NickName: "Brother QL-1110NWB PERMANENT PWG Raster"
*PSVersion: "(3010.000) 0"
*LanguageLevel: "3"
*ColorDevice: False
*DefaultColorSpace: Gray
*FileSystem: False
*Throughput: "12"
*LandscapeOrientation: Plus90
*TTRasterizer: Type42
*% Filterkette → PDF→pdftopdf→gstoraster→rastertopwg→image/urf (Brother-kompatibel!)
*cupsFilter2: "application/pdf application/vnd.cups-pdf 0 pdftopdf"
*cupsFilter2: "application/vnd.cups-pdf application/vnd.cups-raster 100 gstoraster"
*cupsFilter2: "application/vnd.cups-raster image/urf 100 rastertopwg"
*cupsFilter2: "image/urf application/vnd.cups-raw 0 -"
*OpenUI *PageSize/Media Size: PickOne
*OrderDependency: 10 AnySetup *PageSize
*DefaultPageSize: 29x90mm
*PageSize 29x90mm/29x90mm: "<</PageSize[82.3937 255.118]>>setpagedevice"
*PageSize 29x62mm/29x62mm: "<</PageSize[82.3937 175.748]>>setpagedevice"
*PageSize 29x52mm/29x52mm: "<</PageSize[82.3937 147.402]>>setpagedevice"
*PageSize 29x42mm/29x42mm: "<</PageSize[82.3937 119.055]>>setpagedevice"
*PageSize 38x90mm/38x90mm: "<</PageSize[107.717 255.118]>>setpagedevice"
*CloseUI: *PageSize
*DefaultCutMedia: None
*PrintFileExtension: ".urf"
PPDEOF
fi
chown root:lp "$PPD_FILE" 2>&1 || true
chmod 644 "$PPD_FILE" 2>&1 || true
echo "  → PPD Datei:"
ls -la "$PPD_FILE"
echo "  → Erste 3 Zeilen PPD:"
head -3 "$PPD_FILE"
echo "  → Filter Zeilen in PPD:"
grep -i cupsFilter "$PPD_FILE" || echo "  (KEINE CUPSFILTER → Fehler!)"
echo ""

echo "[2] DRUCKER PERMANENT ANLEGEN: -P $PPD_FILE -v $URI_SOCKET"
lpadmin -p "$NAME" -E -v "$URI_SOCKET" -P "$PPD_FILE" \
  -D "Brother QL-1110NWB PERMANENT (kein temp!)" \
  -L "Rafes Ubuntu CUPS FINAL!" 2>&1
sleep 2
cupsaccept "$NAME" 2>&1
cupsenable "$NAME" 2>&1
echo "  → cupsaccept + cupsenable OK"
lpoptions -d "$NAME" 2>&1
lpoptions -p "$NAME" -o media=29x90mm -o sides=one-sided -o print-scaling=auto-fit 2>&1
sleep 2
echo ""

echo "[3] VERIFIKATION: Status, URI, PERMANENT? (kein temporary!)"
lpstat -p "$NAME" 2>&1
echo ""
lpstat -v "$NAME" 2>&1
echo ""
echo "  → printer-is-temporary? (MUSS FALSE / NICHT VORHANDEN SEIN!)"
if command -v lpinfo >/dev/null 2>&1; then
  lpstat -l -p "$NAME" 2>&1 | grep -i temporary && echo "  ❌ FEHLER: TEMPORARY DRUCKER! WIRD WIEDER GELÖSCHT!" || echo "  ✅ OK: KEIN temporary → PERMANENT!"
fi
echo ""
lpoptions -d 2>&1
echo ""
echo "  → PPD List (lpoptions -l) Media Default:"
lpoptions -p "$NAME" -l 2>&1 | grep -iE "pagesize|media" | head -3
echo ""
echo "[4] PRINT HEALTH BACKEND TEST:"
sleep 1
curl -s -u monitor:$(grep MONITOR_HTTP_PASSWORD /etc/rollladen-monitor.env 2>/dev/null | cut -d"'" -f2) \
  http://127.0.0.1:3006/display/print-health 2>&1 || echo "  (curl skipped, passend wenn backend läuft!)"
echo ""
echo "================================================================="
echo "  FERTIG! JETZT: Backend API Direktdruck Test starten!"
echo "================================================================="
