#!/bin/bash
set -u
echo "================================================================"
echo "  BROTHER QL-1110NWB OFFIZIELLER CUPS LINUX TREIBER INSTALLIEREN"
echo "  Quelle: Brother Official Download Seite (cupswrapper)"
echo "  Brother Linux Driver Policy: .deb Paket + cupswrapper Script!"
echo "================================================================"
BROTHER_MODEL="QL-1110NWB"
DRIVER_DEB="ql1110nwbpdrv-2.1.4-0.i386.deb"   # Standard Brother CUPS Treiber Name
DRIVER_URL_HINT="https://download.brother.com/welcome/dlf102824/${DRIVER_DEB}"
# Brother bietet generell auch Installer-Skript an. Wir nutzen dpkg + apt-get!

echo "[PRE] Ubuntu Architektur prüfen: $(uname -m)"
echo "[PRE] dpkg --print-architecture: $(dpkg --print-architecture)"
if [ "$(dpkg --print-architecture)" = "amd64" ]; then
  echo "✅ amd64 → brauchen multiarch i386 aktivieren (Brother Treiber sind i386!)"
  HAS_I386=$(dpkg --print-foreign-architectures 2>&1 | grep -c i386 || true)
  if [ "$HAS_I386" -eq 0 ]; then
    echo "  → dpkg --add-architecture i386"
    dpkg --add-architecture i386
    apt-get update -qq
  else
    echo "  → i386 multiarch bereits aktiv."
  fi
fi
echo ""

echo "[1] Brother Driver Installer benötigte Pakete installieren (libc6-i386, a2ps, cupswrapper deps):"
export DEBIAN_FRONTEND=noninteractive
apt-get install -y --no-install-recommends \
  libc6:i386 libstdc++6:i386 libgcc1:i386 \
  a2ps cups-bsd cups-client libcups2:i386 \
  file wget 2>&1 | tail -n 15
echo ""

echo "[2] Alten kaputten Brother Drucker löschen (falls noch vorhanden):"
cancel -a -x Brother_QL_1110NWB 2>&1 || true
sleep 1
for PR in $(lpstat -p 2>&1 | awk '{print $2}' | grep -i Brother); do
  echo "  Löschen: $PR"
  lpadmin -x "$PR" 2>&1 || true
done
echo ""

echo "[3] Versuche Brother Driver zu finden: (a) apt Paket ql1110nwbpdrv suchen?"
APT_DRIVER=$(apt-cache search ql1110 2>&1 || true)
if [ -n "$APT_DRIVER" ]; then
  echo "✅ APT Paket gefunden! $APT_DRIVER"
  apt-get install -y ql1110nwbpdrv:i386 2>&1 | tail -n 10
else
  echo "  → Kein apt Paket. (b) Download offiziell von Brother $DRIVER_DEB!"
  mkdir -p /tmp/brother-driver && cd /tmp/brother-driver
  # Fallback: Driver von Brother Herunterladen (ODER falls nicht direkt erreichbar → wir nutzen cupswrapper via brother-lpr-drivers Paket falls vorhanden!)
  if ! wget --spider --timeout 10 "$DRIVER_URL_HINT" 2>/dev/null; then
    echo "  ⚠️ URL nicht direkt erreichbar. ALTERNATIVE: brother-lpr-drivers-laser oder brother-udev-rule-type1 installieren!"
    echo "  Alternative für alle Brother Drucker: Installiere generischen brother cups Treiber via apt"
    apt-get install -y brother-cups-wrapper-common brother-cups-wrapper-extra brother-lpr-drivers-common brother-lpr-drivers-laser brother-udev-rule-type1 2>&1 | tail -n 10
  else
    echo "  ✅ URL erreichbar! Download + Install .deb:"
    wget -q -O "$DRIVER_DEB" "$DRIVER_URL_HINT" 2>&1
    echo "  → Datei runtergeladen: $(ls -la $DRIVER_DEB 2>&1)"
    dpkg -i --force-all "$DRIVER_DEB" 2>&1 | tail -n 20
    apt-get install -f -y 2>&1 | tail -n 5
  fi
fi
echo ""

echo "[4] Prüfen ob Brother PPD jetzt in CUPS gelistet ist (ls /usr/share/ppd/Brother oder lpinfo -m):"
echo "  → PPD Verzeichnis:"
ls -la /usr/share/ppd/ 2>&1 | grep -i brother || echo "  /usr/share/ppd/Brother nicht gefunden"
ls -laR /usr/share/ppd/ 2>&1 | grep -i ql | head -20 || true
echo "  → lpinfo -m | grep -i QL:"
lpinfo -m 2>&1 | grep -i "QL-1110" | head -20 || true
lpinfo -m 2>&1 | grep -i "brother" | head -30 || true
echo ""

echo "[5] FALLBACK: Wenn kein Brother PPD, nutze Gutenprint + gutenprint printer driver (falls installiert):"
apt-get install -y printer-driver-gutenprint 2>&1 | tail -n 5
echo "  → gutenprint | grep brother:"
lpinfo -m 2>&1 | grep -i brother | grep -i gutenprint | head -10 || true
echo ""

echo "================================================================"
echo "  DRIVER INSTALL FERTIG! Jetzt Drucker anlegen!"
echo "================================================================"
