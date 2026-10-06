#!/bin/bash
set -eu
TS=$(date +%Y%m%d-%H%M%S)
F=/etc/rollladen-monitor.env
NEW=/tmp/rollladen-monitor.env.new
if [ ! -f "$NEW" ]; then
  echo "FEHLER: $NEW existiert nicht auf Ubuntu!"
  exit 2
fi
if [ -f "$F" ]; then
  BAK="/etc/rollladen-monitor.env.BAK-${TS}"
  cp "$F" "$BAK"
  echo "BACKUP_CREATED: $BAK"
fi
cp "$NEW" "$F"
chown root:rollladen "$F"
chmod 640 "$F"
setfacl -m u:rollladen:r "$F" 2>/dev/null || true
echo "FILE_INFO:"
stat "$F" | head -n 5
echo ""
echo "SET_LINES: $(grep -cEv '^#|^[[:space:]]*$' "$F")"
echo ""
echo "--- PREVIEW 15 Keys (Keine Passwörter!) ---"
grep -Ev '^#|^[[:space:]]*$' "$F" | head -n 15
echo "... [REST GECENSORED]"
echo ""
echo "ENV_INSTALL_OK"
