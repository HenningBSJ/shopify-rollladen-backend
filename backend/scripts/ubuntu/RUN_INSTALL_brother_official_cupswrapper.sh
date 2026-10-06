#!/bin/bash
set -u
echo "================================================================"
echo "  BROTHER ORIGINAL LINUX CUPSWRAPPER INSTALLIEREN (ENDGÜLTIG!)"
echo "  Quelle: Brother Official Linux Driver Installer Bash + dpkg"
echo "  QL-1110NWB cupswrapper-name: ql1110nwbpdrv (i386 32-bit)"
echo "================================================================"
DRIVER_URL="https://download.brother.com/welcome/dlf102824/ql1110nwbpdrv-2.1.4-0.i386.deb"
DRIVER_LOCAL="/tmp/ql1110nwb-cupswrapper.deb"
PRNAME="Brother_QL_1110NWB"
PRURI="socket://192.168.2.103:9100"
echo "[0] Systemvoraussetzungen + i386 multiarch (Brother Treiber sind i386!)"
dpkg --print-foreign-architectures 2>&1 | grep -q i386 || {
  echo "  → dpkg --add-architecture i386 + apt-get update"
  dpkg --add-architecture i386
  apt-get update -qq
}
echo "  → i386 vorhanden: $(dpkg --print-foreign-architectures 2>&1 | tr '\n' ' ')"
export DEBIAN_FRONTEND=noninteractive
apt-get install -y --no-install-recommends \
  lib32gcc-s1 libc6-i386 lib32stdc++6 \
  cups-bsd libcups2:i386 libstdc++6:i386 wget \
  2>&1 | tail -n 10
echo ""

echo "[1] Alle Brother Drucker erstmal löschen + Queue leeren!"
cancel -a -x 2>&1 || true
for PR in $(lpstat -p 2>&1 | awk '{print $2}' | grep -i Brother); do
  echo "  → Löschen alt: $PR"
  lpadmin -x "$PR" 2>&1 || true
done
sleep 2
[ -d /usr/share/ppd/Brother ] && ls -la /usr/share/ppd/Brother 2>&1
echo ""

echo "[2] Download Brother .deb von Hersteller URL: $DRIVER_URL"
rm -f "$DRIVER_LOCAL"
if wget -q --timeout=30 -O "$DRIVER_LOCAL" "$DRIVER_URL" 2>/dev/null; then
  SIZE=$(stat -c%s "$DRIVER_LOCAL" 2>/dev/null || echo 0)
  echo "  ✅ Download OK! Größe: $SIZE Bytes"
else
  echo "  ⚠️ Direktdownload fehlgeschlagen (Firewall/URL). Alternative: Brother Generic Installer via apt!"
  echo "  → Versuche: apt-get install brother-udev-rule-type1 brother-cups-wrapper-common brother-lpr-drivers-laser brother-cups-wrapper-laser"
  apt-get install -y --no-install-recommends brother-udev-rule-type1 brother-cups-wrapper-common brother-lpr-drivers-common brother-lpr-drivers-laser brother-cups-wrapper-laser 2>&1 | tail -n 8
  echo ""
  echo "  → NOTFALL: Falls oben nicht funktioniert → MANUELL INSTALL per Browser Download auf Windows dann SCP nach /tmp/*.deb!"
  ls /tmp/*.deb 2>&1
  echo ""
fi

if [ -f "$DRIVER_LOCAL" ] && [ "$(stat -c%s "$DRIVER_LOCAL" 2>/dev/null || echo 0)" -gt 10000 ]; then
  echo "[3] INSTALL Brother .deb Paket mit dpkg --force-all (Abhängigkeiten reparieren danach!)"
  cd /tmp
  dpkg -i --force-all --force-architecture "$DRIVER_LOCAL" 2>&1 | tail -n 30
  echo ""
  echo "[3b] apt-get install -f (Fehlende deps installieren + broken beheben)"
  apt-get install -f -y 2>&1 | tail -n 10
fi
echo ""

echo "[4] PRÜFUNG: Brother cupswrapper Filter + PPD vorhanden?"
echo "  → rastertobrother:"
find /usr/lib/cups -iname "*brother*" 2>&1 | head -20
echo "  → Brother PPDs:"
find /usr/share/ppd /etc/cups/ppd -iname "*brother*" -o -iname "*ql1110*" 2>&1 | head -20
echo "  → lpinfo -m | grep -iE 'brother|ql[- ]*1110':"
lpinfo -m 2>&1 | grep -iE "brother|ql[- ]*1110" | head -30
echo ""

echo "[5] Drucker anlegen: Name=$PRNAME URI=$PRURI + BEST MOST ACCURATE PPD (von list oben!):"
PPD_FOUND=$(lpinfo -m 2>&1 | grep -iE "brother.*ql.*1110|QL-1110NWB" | head -1 | awk '{print $1}')
if [ -z "$PPD_FOUND" ] && [ -d /usr/share/ppd/Brother ]; then
  PPD_FOUND=$(ls /usr/share/ppd/Brother/*QL1110* 2>/dev/null | head -1)
fi
if [ -z "$PPD_FOUND" ]; then
  # Fallback auf installed PPDs
  PPD_FOUND=$(find /usr/share/ppd -name "*.ppd*" 2>&1 | xargs grep -l "QL-1110" 2>/dev/null | head -1)
fi
echo "  → PPD verwendet: $PPD_FOUND"
echo "  → lpadmin -p $PRNAME -v $PRURI -E -m \"$PPD_FOUND\" -D \"Brother QL-1110NWB Official CupsWrapper\" -L \"Rafes Ubuntu\""
if [ -n "$PPD_FOUND" ]; then
  lpadmin -p "$PRNAME" -v "$PRURI" -E -m "$PPD_FOUND" \
    -D "Brother QL-1110NWB Official CupsWrapper" \
    -L "Rafes Ubuntu" 2>&1
else
  echo "  ❌ KEINE PPD GEFUNDEN! dpkg -i ql1110nwbpdrv-2.1.4-0.i386.deb manuell prüfen!"
fi
cupsaccept "$PRNAME" 2>&1
cupsenable "$PRNAME" 2>&1
lpoptions -d "$PRNAME" 2>&1
sleep 2
echo ""

echo "[6] Drucker Optionen anzeigen (MediaSizes etc. müssen 29x90mm da sein!):"
lpstat -p "$PRNAME" 2>&1
lpoptions -p "$PRNAME" -l 2>&1 | head -50
echo ""
lpoptions -p "$PRNAME" 2>&1
echo ""

echo "[7] TEST JOB 1x /tmp/test-small.pdf drucken + JobID + Filter!"
LOGJOB=$(lp -d "$PRNAME" /tmp/test-small.pdf 2>&1)
JOBID=$(echo "$LOGJOB" | grep -oE "[0-9]+" | head -1)
echo "  → $LOGJOB → JobID=$JOBID"
sleep 1
echo "  --- lpq 15x (5 Sekunden total!) ---"
for I in $(seq 1 1 15); do
  sleep 0.33
  LINE=$(lpq -P "$PRNAME" 2>&1 | head -2 | tail -1)
  echo "  $[$I*0.33] s: $LINE"
done
echo ""
sleep 5
echo "  → error_log Job $JOBID Filter + Status:"
grep -nE "Job $JOBID|Started filter|Started backend|FINAL_CONTENT_TYPE|raster|brother|exited with|Connecting|Wrote.*bytes|Waiting for|Job (completed|aborted|stopped)" /var/log/cups/error_log 2>&1 | tail -n 50
echo ""
echo "================================================================"
echo "  ENDE! Schau am Drucker! KAM DAS LABEL RAUS?"
echo "================================================================"
