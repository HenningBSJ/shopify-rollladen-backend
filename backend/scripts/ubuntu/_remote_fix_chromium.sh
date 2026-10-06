#!/bin/bash
set -u
LOG=/tmp/fix-chrome.log
exec > >(tee -a $LOG) 2>&1

echo "========================================"
echo " FIX: Snap-Chromium -> Google Chrome Stable APT "
echo "========================================"

echo ""
echo "[1/8] Snap-Chromium restlos entfernen (snap remove chromium*) ..."
for s in chromium chromium-browser chromium-shell chrome chromium-snapd; do
  if snap list "$s" >/dev/null 2>&1; then
    echo "  → snap remove --purge $s"
    snap remove --purge "$s" 2>&1 || true
  fi
done
echo "  → Done. Snaps verbleibend:"
snap list 2>&1 | grep -i chrom || echo "    (keine Chromium/Chrome Snaps — GUT!)"

echo ""
echo "[2/8] Alte Chromium Dummy-Pakete via apt purge ..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null 2>&1
apt-get purge -y chromium-browser chromium chromium-l10n 2>&1 || true
apt-get autoremove -y >/dev/null 2>&1 || true

echo ""
echo "[3/8] Google Chrome PAKET via dl.google.com herunterladen ..."
CHROME_DEB=/tmp/google-chrome-stable_current_amd64.deb
rm -f "$CHROME_DEB"
if command -v wget >/dev/null 2>&1; then
  wget -q --tries=3 --timeout=60 -O "$CHROME_DEB" "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
elif command -v curl >/dev/null 2>&1; then
  curl -sS --retry 3 --connect-timeout 60 --max-time 180 -o "$CHROME_DEB" "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
else
  echo "  ❌ Weder wget noch curl gefunden!"
  exit 1
fi
SZ=$(stat -c %s "$CHROME_DEB" 2>/dev/null || echo 0)
echo "  → Größe: $(( SZ / 1024 / 1024 )) MB ($SZ bytes)"
if [ "$SZ" -lt 80000000 ]; then
  echo "  ❌ Deb-Datei zu klein (< 80MB)! Abbruch."
  ls -la "$CHROME_DEB"
  exit 2
fi

echo ""
echo "[4/8] apt-get install -f + Install Chrome DEB ..."
apt-get install -y "$CHROME_DEB" -y 2>&1 || {
  echo "  → Retry mit apt-get install -f / dpkg -i"
  dpkg -i "$CHROME_DEB" 2>&1 || true
  apt-get install -f -y 2>&1 || true
}
sleep 2

echo ""
echo "[5/8] Chrome Binärpfade verifizieren ..."
for p in /usr/bin/google-chrome-stable /usr/bin/google-chrome /opt/google/chrome/google-chrome; do
  if [ -x "$p" ]; then
    VER=$("$p" --version 2>&1 | head -1)
    echo "  ✅ $p → $VER"
  else
    echo "  ❌ $p nicht gefunden / nicht ausführbar"
  fi
done

CHROME_EXE=""
if [ -x /usr/bin/google-chrome-stable ]; then CHROME_EXE=/usr/bin/google-chrome-stable
elif [ -x /usr/bin/google-chrome ]; then CHROME_EXE=/usr/bin/google-chrome
elif [ -x /opt/google/chrome/google-chrome ]; then CHROME_EXE=/opt/google/chrome/google-chrome
fi

if [ -z "$CHROME_EXE" ]; then
  echo "  ❌ KEIN CHROME BINÄRPFAD GEFUNDEN! Abbruch."
  exit 3
fi

echo ""
echo "[6/8] /etc/rollladen-monitor.env ANPASSEN: DIRECT_PRINT_CHROMIUM_EXE auf Chrome setzen + Backup .env vor Änderung"
ENV_FILE=/etc/rollladen-monitor.env
if [ ! -f "$ENV_FILE" ]; then
  echo "  ❌ $ENV_FILE existiert nicht!"
  exit 4
fi
cp -a "$ENV_FILE" "$ENV_FILE.bak-$(date +%s)"
chmod 640 root:rollladen "$ENV_FILE"* 2>/dev/null || true

# Direkte Suche + Ersetze oder Append
if grep -q '^DIRECT_PRINT_CHROMIUM_EXE=' "$ENV_FILE"; then
  sed -i "s|^DIRECT_PRINT_CHROMIUM_EXE=.*|DIRECT_PRINT_CHROMIUM_EXE='${CHROME_EXE}'|" "$ENV_FILE"
  echo "  → Zeile DIRECT_PRINT_CHROMIUM_EXE in $ENV_FILE auf '${CHROME_EXE}' gesetzt."
else
  echo "DIRECT_PRINT_CHROMIUM_EXE='${CHROME_EXE}'" >> "$ENV_FILE"
  echo "  → Neue Zeile DIRECT_PRINT_CHROMIUM_EXE='${CHROME_EXE}' angehängt."
fi

# Sanity Check: Syntax
if ! bash -n "$ENV_FILE"; then
  echo "  ❌ bash -n $ENV_FILE FEHLGESCHLAGEN!"
  exit 5
fi
echo "  ✅ bash -n OK. Variable abfragen (source als root):"
# shellcheck disable=SC1090
( . "$ENV_FILE" 2>/dev/null && echo "    DIRECT_PRINT_CHROMIUM_EXE=$DIRECT_PRINT_CHROMIUM_EXE" ) || true

echo ""
echo "[7/8] systemctl daemon-reload + rollladen-backend restart"
systemctl daemon-reload
sleep 1
systemctl restart rollladen-backend.service
sleep 5

echo "  Status:"
echo "    Active: $(systemctl is-active rollladen-backend.service 2>&1)"
echo "    MainPID: $(systemctl show -p MainPID --value rollladen-backend.service 2>&1)"

echo ""
echo "[8/8] Post-Restart Checks (localhost, node-user, chrome exists as user rollladen)"
H1=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://127.0.0.1:3006/health || echo "000")
echo "  /health localhost → HTTP $H1"
echo "  Chrome als rollladen ausführbar? → $(sudo -u rollladen test -x "$CHROME_EXE" && echo JA || echo NEIN)"
if command -v sudo >/dev/null 2>&1; then
  V=$(sudo -u rollladen "$CHROME_EXE" --version 2>&1 | head -1)
  echo "  Chrome Version (rollladen): $V"
fi

echo ""
echo "========================================"
echo " ✅ CHROMIUM -> CHROME FIX FERTIG "
echo "    neuer Browser Pfad: $CHROME_EXE"
echo "    nächste Schritte: POST /label/direct-print neu testen"
echo "========================================"
echo "__CHROME_EXE__=$CHROME_EXE"
exit 0
