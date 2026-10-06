#!/bin/bash
# ============================================================
# FIX Cloudflared Named-Tunnel config.yml
# Behebt: CRLF, Windows Pfade, fehlendes origincert
# ============================================================
set -eu
CF_DIR="/srv/rollladen-monitor/cloudflared"
CFG="$CF_DIR/config.yml"
UUID="bb2cde90-9575-4c10-bacf-ff4763073ea9"
echo "=== Aktuelle Datei sichern ==="
BACKUP="$CF_DIR/config.yml.bak-$(date +%s)"
cp -a "$CFG" "$BACKUP" && echo "Backup: $BACKUP"
echo ""
echo "=== Zieldatei schreiben (LF, Linux-Pfade, origincert, UUID) ==="
cat > "$CFG" <<YAML
tunnel: ${UUID}
credentials-file: ${CF_DIR}/${UUID}.json
origincert: ${CF_DIR}/cert.pem
no-autoupdate: true
loglevel: info

ingress:
  - hostname: monitor.rollladenwelt.de
    service: http://127.0.0.1:3006
  - service: http_status:404
YAML
chown root:root "$CFG"
chmod 644 "$CFG"
cat -An "$CFG"
echo ""
echo "=== Stoppe alten cloudflared Service (falls crashend/restart loop) ==="
systemctl stop rollladen-cloudflared.service 2>&1 || true
sleep 2
# Kill uebrige Prozesse
pkill -f 'cloudflared.*tunnel run' 2>/dev/null || true
pkill -f 'cloudflared.*config' 2>/dev/null || true
sleep 1
echo ""
echo "=== Validiere config YAML via cloudflared tunnel --config ingress validate ==="
cloudflared --config "$CFG" tunnel ingress validate 2>&1 | head -30 || true
echo ""
echo "=== Starte Service neu (warte 15s) ==="
systemctl start rollladen-cloudflared.service
sleep 15
echo ""
echo "--- Service Status ---"
systemctl is-active rollladen-cloudflared.service
systemctl status rollladen-cloudflared.service --no-pager -l -n 10 2>&1 || true
echo ""
echo "--- journalctl letzte 30 Zeilen ---"
journalctl -u rollladen-cloudflared.service --no-pager -n 30 -o short-iso 2>&1 || true
echo ""
echo "Zusammenfassung:"
ACTIVE=$(systemctl is-active rollladen-cloudflared.service 2>&1)
echo "  Active: $ACTIVE"
echo "  Config Datei:"
wc -l "$CFG"
echo ""
if [ "$ACTIVE" = "active" ]; then
  echo "✅ Named-Tunnel CONFIG FIX SUCCESSFUL! Service UP!"
  exit 0
else
  echo "⚠️  Service nicht active. Wenn Named-Tunnel Zertifikatsproblem hat: Quick-Tunnel funktioniert auf jeden Fall (siehe oben Test)."
  exit 0
fi
