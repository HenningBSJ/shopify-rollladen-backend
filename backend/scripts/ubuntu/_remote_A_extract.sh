#!/bin/bash
set -eu
TMP=/tmp/roll-latest
SRV=/srv/rollladen-monitor

# 1) Fix CR/LF in all bash/template files locally in TMP
find "$TMP" -type f \( -name '*.sh' -o -name '*.template' -o -name '*.service' \) -exec sed -i 's/\r$//' {} \;
echo "CRLF fixed in $TMP"

# 2) Backup existing SRV if it has any real content
if [ -f "$SRV/backend/package.json" ] || [ -f "$SRV/cloudflared/config.yml" ]; then
  BAK="/srv/rollladen-monitor-BACKUP-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$(dirname "$BAK")" 2>/dev/null || true
  echo "Backup existing $SRV -> $BAK"
  cp -a "$SRV" "$BAK" 2>/dev/null || mv "$SRV" "$BAK" || true
  echo "BACKUP_OK: $BAK"
else
  echo "No prior deploy found (fresh install)"
fi

# 3) Extract Backend
mkdir -p "$SRV"
rm -rf "$SRV/backend" 2>/dev/null || true
mkdir -p "$SRV/backend"
tar -xzf "$TMP/backend.tar.gz" -C "$SRV/backend"
[ -f "$SRV/backend/package.json" ] && echo "BACKEND_UNPACK_OK (package.json, v$(cd "$SRV/backend" && node -e "console.log(require('./package.json').version)" 2>/dev/null || echo '?'))"

# 4) Extract Cloudflared
if [ -f "$TMP/cloudflared.tar.gz" ]; then
  rm -rf "$SRV/cloudflared" 2>/dev/null || true
  mkdir -p "$SRV/cloudflared"
  tar -xzf "$TMP/cloudflared.tar.gz" -C "$SRV/cloudflared"
  [ -f "$SRV/cloudflared/config.yml" ] && echo "CF_UNPACK_OK (config.yml exists)"
else
  echo "SKIP_CF (no tar)"
fi

# 5) Copy installer scripts + units into destination scripts folder for idempotency
mkdir -p "$SRV/backend/scripts/ubuntu"
for f in install-full.sh TASK1-run-on-ubuntu.sh env.template rollladen-backend.service rollladen-cloudflared.service; do
  if [ -f "$TMP/$f" ]; then
    cp "$TMP/$f" "$SRV/backend/scripts/ubuntu/$f"
    sed -i 's/\r$//' "$SRV/backend/scripts/ubuntu/$f" 2>/dev/null || true
  fi
done
chmod +x "$SRV/backend/scripts/ubuntu/"*.sh 2>/dev/null || true

# 6) Permissions
chown -R root:adm "$SRV" 2>/dev/null || true
chmod 755 "$SRV"
chmod -R u+rwX,go+rX "$SRV/backend" 2>/dev/null || true
chown -R root:root "$SRV/cloudflared" 2>/dev/null || true
chmod -R u+rwX,go+rX "$SRV/cloudflared" 2>/dev/null || true
echo "PERMS_OK"

# 7) Final listing
echo ""
echo "===== FINAL /srv/rollladen-monitor ====="
ls -la "$SRV"
echo ""
echo "===== Backend package.json (top 12 lines) ====="
head -n 12 "$SRV/backend/package.json" || true
echo ""
echo "===== Ubuntu Scripts Dir ====="
ls -la "$SRV/backend/scripts/ubuntu" || true
