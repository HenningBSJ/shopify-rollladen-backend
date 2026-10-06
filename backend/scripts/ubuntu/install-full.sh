#!/bin/bash
#===============================================================================
# Rollladen Monitor Backend + Cloudflared + Direktdruck Full Installer Ubuntu
# Pfad: backend/scripts/ubuntu/install-full.sh
# Verwendung: sudo bash install-full.sh (aus beliebigem Verzeichnis)
# Idempotent: Kann mehrmals hintereinander laufen ohne Fehler!
#===============================================================================
set -eu

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
BACKEND_DIR="${PROJECT_ROOT}/backend"

SRV_DIR="/srv/rollladen-monitor"
LOG_DIR="/var/log/rollladen"
ETC_DIR="/etc/rollladen-monitor"
ENV_FILE="/etc/rollladen-monitor.env"
SYSUSER="rollladen"
SYSGROUP="rollladen"
HOME_DIR="/var/lib/rollladen"

# ============================================================
# 1. ROOT CHECK
# ============================================================
if [ "$(id -u)" -ne 0 ]; then
  echo "[FATAL] Bitte als root/sudo ausführen: sudo bash $0" >&2
  exit 1
fi
echo "================================================================"
echo " Rollladen Monitor Ubuntu Installer"
echo " Zeit: $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================"

# ============================================================
# 2. Basispakete sicherstellen (apt Quellen + Basis tools)
# ============================================================
echo "[1/12] Basispakete + apt Repositories einrichten..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq >/dev/null
apt-get install -y -qq --no-install-recommends \
  ca-certificates curl wget gnupg lsb-release apt-transport-https software-properties-common jq htop vim net-tools dnsutils >/dev/null 2>&1 || true

# NodeSource 24.x apt Quelle
if [ ! -f /etc/apt/sources.list.d/nodesource.list ]; then
  echo "  → Füge NodeSource 24.x apt Quelle hinzu..."
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null 2>&1
else
  echo "  → NodeSource 24.x Quelle bereits vorhanden."
fi

# Cloudflare apt Quelle (cloudflared)
if [ ! -f /etc/apt/sources.list.d/cloudflared.list ]; then
  echo "  → Füge Cloudflare apt Quelle hinzu..."
  mkdir -p /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null 2>&1
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
    | tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
else
  echo "  → Cloudflare Quelle bereits vorhanden."
fi

apt-get update -y -qq >/dev/null
echo "[1/12] ✅ OK."

# ============================================================
# 3. Hauptpakete installieren: Node, Chromium, CUPS, Cloudflared
# ============================================================
echo "[2/12] Installiere Node 24, Chromium, CUPS, Cloudflared + Tools..."
apt-get install -y -qq --no-install-recommends \
  nodejs chromium-browser cups cups-client cloudflared \
  systemd bash-completion >/dev/null 2>&1 || {
    echo "  ⚠️ Fallback: chromium-browser Paket nicht verfügbar → versuche chromium..." >&2
    apt-get install -y -qq --no-install-recommends \
      nodejs chromium cups cups-client cloudflared >/dev/null 2>&1 || true
  }

echo "  → Prüfe Versionen:"
echo "    node:     $(node -v 2>/dev/null || echo 'NICHT INSTALLIERT!')"
echo "    npm:      $(npm -v 2>/dev/null || echo 'n/a')"
echo "    cloudflared: $(cloudflared -v 2>/dev/null | cut -d' ' -f1-4 || echo 'NICHT INSTALLIERT!')"
echo "    chromium: $(dpkg -l 2>/dev/null | grep -E '^(ii)\s+(chromium|chromium-browser)\s' | awk '{print $2,$3}' | head -n1 || echo 'NICHT INSTALLIERT!')"
echo "    lp (CUPS):$(lpstat --version 2>/dev/null | head -n1 || echo 'NICHT INSTALLIERT!')"
echo "[2/12] ✅ OK."

# ============================================================
# 4. Systemuser rollladen anlegen
# ============================================================
echo "[3/12] Systemuser '${SYSUSER}' anlegen / prüfen..."
if ! getent group "${SYSGROUP}" >/dev/null 2>&1; then
  groupadd --system "${SYSGROUP}"
  echo "  → Gruppe '${SYSGROUP}' erstellt."
else
  echo "  → Gruppe '${SYSGROUP}' existiert bereits."
fi
if ! id "${SYSUSER}" >/dev/null 2>&1; then
  useradd --system \
    --gid "${SYSGROUP}" \
    --home-dir "${HOME_DIR}" \
    --create-home \
    --shell /usr/sbin/nologin \
    --comment "Rollladen Monitor Service User" \
    "${SYSUSER}"
  echo "  → User '${SYSUSER}' erstellt (no-login, UID=$(id -u ${SYSUSER}))."
else
  echo "  → User '${SYSUSER}' existiert bereits (UID=$(id -u ${SYSUSER}))."
fi
# User in lp und lpadmin Gruppe (CUPS Druckberechtigung!)
for grp in lp lpadmin; do
  if getent group "${grp}" >/dev/null 2>&1; then
    if ! id -nG "${SYSUSER}" | tr ' ' '\n' | grep -qw "${grp}"; then
      usermod -aG "${grp}" "${SYSUSER}"
      echo "  → User '${SYSUSER}' zu Gruppe '${grp}' hinzugefügt (CUPS-Druck!)."
    fi
  fi
done
echo "[3/12] ✅ OK."

# ============================================================
# 5. Ordnerstruktur + Berechtigungen
# ============================================================
echo "[4/12] Ordnerstruktur + Berechtigungen..."
for d in "${SRV_DIR}" "${LOG_DIR}" "${ETC_DIR}"; do
  if [ ! -d "$d" ]; then
    mkdir -p "$d"
    echo "  → Ordner erstellt: $d"
  fi
done
# /srv/rollladen-monitor: Service-User Besitzer, Admins lesen
chown -R "${SYSUSER}:adm" "${SRV_DIR}" 2>/dev/null || true
chmod 755 "${SRV_DIR}" 2>/dev/null || true
# /var/log/rollladen: Nur Service-User + adm lesen (Log)
chown -R "${SYSUSER}:adm" "${LOG_DIR}" 2>/dev/null || true
chmod 750 "${LOG_DIR}" 2>/dev/null || true
# /etc/rollladen-monitor (Zusatz-Configs, falls gewünscht): Nur root
chown -R root:root "${ETC_DIR}" 2>/dev/null || true
chmod 700 "${ETC_DIR}" 2>/dev/null || true
# Home Directory
if [ -d "${HOME_DIR}" ]; then
  chown -R "${SYSUSER}:${SYSGROUP}" "${HOME_DIR}" 2>/dev/null || true
fi
echo "[4/12] ✅ OK."

# ============================================================
# 6. Environment File /etc/rollladen-monitor.env
# ============================================================
echo "[5/12] Environment File ${ENV_FILE}..."
if [ ! -f "${ENV_FILE}" ]; then
  if [ -f "${BACKEND_DIR}/scripts/ubuntu/env.template" ]; then
    cp "${BACKEND_DIR}/scripts/ubuntu/env.template" "${ENV_FILE}"
    echo "  → Neu angelegt aus env.template. ❗ BITTE JETZT EDITIEREN: nano ${ENV_FILE}"
    echo "    (DATABASE_URL, SLACK_BOT_TOKEN, MONITOR_HTTP_PASSWORD, DIRECT_PRINT_PRINTER, ... aus Windows .env übernehmen!)"
  else
    echo "  ⚠️ Kein env.template gefunden! Bitte manuell anlegen: ${ENV_FILE}" >&2
  fi
else
  echo "  → Bereits vorhanden, wird NICHT überschrieben (idempotent)."
fi
chmod 600 "${ENV_FILE}" 2>/dev/null || true
chown root:root "${ENV_FILE}" 2>/dev/null || true
setfacl -m u:${SYSUSER}:r "${ENV_FILE}" >/dev/null 2>&1 || true  # Service-User darf lesen per ACL
echo "[5/12] ✅ OK."

# ============================================================
# 7. Backend Abhängigkeiten installieren (npm ci)
# ============================================================
echo "[6/12] Backend Abhängigkeiten: npm ci als User '${SYSUSER}'..."
NPM_DIR="${SRV_DIR}/backend"
if [ -d "${NPM_DIR}" ] && [ -f "${NPM_DIR}/package.json" ]; then
  if [ -f "${NPM_DIR}/package-lock.json" ]; then
    su -s /bin/sh "${SYSUSER}" -c "cd ${NPM_DIR} && npm ci --omit=dev --no-audit --no-fund --loglevel=error" || {
      echo "  ⚠️ npm ci fehlgeschlagen, Fallback: npm install..." >&2
      su -s /bin/sh "${SYSUSER}" -c "cd ${NPM_DIR} && npm install --omit=dev --no-audit --no-fund --loglevel=error" || true
    }
    echo "  → $(node -e "try{console.log(require('${NPM_DIR}/node_modules/express/package.json').version)}catch(e){console.log('?')}")  (express)"
  else
    echo "  ⚠️ Kein package-lock.json vorhanden → npm install --omit=dev..." >&2
    su -s /bin/sh "${SYSUSER}" -c "cd ${NPM_DIR} && npm install --omit=dev --no-audit --no-fund --loglevel=error" || true
  fi
else
  echo "  ⚠️ Backend Ordner '${NPM_DIR}' fehlt! Bitte vorher Code via scp -r von Windows nach ${SRV_DIR} kopieren." >&2
  echo "    Beispiel (auf Windows):  scp -r C:\Projects\Shopify\backend user@100.98.136.86:/tmp/  && sudo mv /tmp/backend ${SRV_DIR}/"
fi
echo "[6/12] ✅ OK."

# ============================================================
# 8. Cloudflared Config Ordner (kopiert von Windows)
# ============================================================
echo "[7/12] Cloudflared Config Ordner prüfen..."
CF_DIR="${SRV_DIR}/cloudflared"
if [ -d "${CF_DIR}" ] && [ -f "${CF_DIR}/config.yml" ] && [ -f "${CF_DIR}/cert.pem" ]; then
  chown -R root:root "${CF_DIR}" 2>/dev/null || true
  find "${CF_DIR}" -type f -exec chmod 644 {} \; 2>/dev/null || true
  echo "  → Config + Cert vorhanden (config.yml + cert.pem)."
else
  echo "  ⚠️ Cloudflared Config fehlt! Bitte von Windows kopieren:" >&2
  echo "    (1) Windows:  scp -r C:\Projects\Shopify\cloudflared user@100.98.136.86:/tmp/  " >&2
  echo "    (2) Ubuntu:   sudo mv /tmp/cloudflared ${SRV_DIR}/cloudflared && sudo chown -R root:root ${SRV_DIR}/cloudflared" >&2
fi
echo "[7/12] ✅ OK."

# ============================================================
# 9. systemd Units kopieren nach /etc/systemd/system
# ============================================================
echo "[8/12] systemd Units installieren..."
cp "${BACKEND_DIR}/scripts/ubuntu/rollladen-backend.service" /etc/systemd/system/rollladen-backend.service 2>/dev/null || true
cp "${BACKEND_DIR}/scripts/ubuntu/rollladen-cloudflared.service" /etc/systemd/system/rollladen-cloudflared.service 2>/dev/null || true
chmod 644 /etc/systemd/system/rollladen-backend.service /etc/systemd/system/rollladen-cloudflared.service 2>/dev/null || true
chown root:root /etc/systemd/system/rollladen-backend.service /etc/systemd/system/rollladen-cloudflared.service 2>/dev/null || true
systemctl daemon-reload
# Enable (aber NICHT starten!)
systemctl enable rollladen-backend.service >/dev/null 2>&1 || true
systemctl enable rollladen-cloudflared.service >/dev/null 2>&1 || true
echo "  → rollladen-backend.service : enabled=$(systemctl is-enabled rollladen-backend.service 2>/dev/null || echo 'n/a')"
echo "  → rollladen-cloudflared.service : enabled=$(systemctl is-enabled rollladen-cloudflared.service 2>/dev/null || echo 'n/a')"
# Units Syntax prüfen
echo "  → Units Syntax-Prüfung:"
for svc in rollladen-backend.service rollladen-cloudflared.service; do
  OUT=$(systemd-analyze verify "/etc/systemd/system/${svc}" 2>&1 || true)
  if [ -z "${OUT}" ]; then echo "    ✅ ${svc} Syntax OK"
  else echo "    ⚠️ ${svc}: ${OUT}" | head -n 3; fi
done
echo "[8/12] ✅ OK."

# ============================================================
# 10. journald Konfiguration (persistente Logs)
# ============================================================
echo "[9/12] journald persistente Logs..."
JOURNALD_DROPIN="/etc/systemd/journald.conf.d/rollladen-monitor.conf"
mkdir -p /etc/systemd/journald.conf.d
cat > "${JOURNALD_DROPIN}" <<'EOF'
[Journal]
Storage=persistent
SystemMaxUse=500M
SystemKeepFree=1G
MaxRetentionSec=2month
MaxFileSec=1week
ForwardToSyslog=no
EOF
chmod 644 "${JOURNALD_DROPIN}" 2>/dev/null || true
systemctl restart systemd-journald 2>/dev/null || true
echo "  → Gespeichert unter ${JOURNALD_DROPIN}."
echo "[9/12] ✅ OK."

# ============================================================
# 11. Zeitzone auf Europe/Berlin setzen
# ============================================================
echo "[10/12] Zeitzone auf Europe/Berlin setzen..."
CURR_TZ=$(timedatectl show -p Timezone --value 2>/dev/null || echo 'n/a')
if [ "${CURR_TZ}" != "Europe/Berlin" ]; then
  timedatectl set-timezone Europe/Berlin 2>/dev/null || {
    echo "  → timedatectl fehlgeschlagen, Fallback symlink /etc/localtime..." >&2
    ln -sf /usr/share/zoneinfo/Europe/Berlin /etc/localtime 2>/dev/null || true
    echo "Europe/Berlin" > /etc/timezone 2>/dev/null || true
  }
  echo "  → Gesetzt: Europe/Berlin (vorher: ${CURR_TZ})."
else
  echo "  → Bereits korrekt: ${CURR_TZ}."
fi
echo "[10/12] ✅ OK."

# ============================================================
# 12. CUPS Basis-Service aktivieren (falls Drucker verwendet werden)
# ============================================================
echo "[11/12] CUPS Service aktivieren + starten (falls nicht schon)..."
if command -v cupsd >/dev/null 2>&1 && systemctl list-unit-files | grep -q cups.service >/dev/null 2>&1; then
  systemctl enable cups.service --now 2>/dev/null || systemctl enable cups --now 2>/dev/null || true
  CUPS_STAT=$(systemctl is-active cups 2>/dev/null || systemctl is-active cups.service 2>/dev/null || echo 'unknown')
  echo "  → cups.service: active=${CUPS_STAT}, enabled=$(systemctl is-enabled cups 2>/dev/null || echo 'n/a')"
  lpstat -r 2>/dev/null || true
else
  echo "  ⚠️ CUPS nicht als systemd Unit gefunden → manuell prüfen." >&2
fi
echo "[11/12] ✅ OK."

# ============================================================
# 13. FINAL: Zusammenfassung + manuelle To-Do Liste für User
# ============================================================
echo ""
echo "================================================================"
echo " [12/12] 🎉 Installer abgeschlossen!"
echo " Zeit: $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================"
echo ""
echo "============================================="
echo " NÄCHSTE SCHRITTE (MANUELL AUSZUFÜHREN!):"
echo "============================================="
echo " 1) 👉 Bearbeite die ENV Datei mit den echten Secrets:"
echo "      sudo nano ${ENV_FILE}"
echo "    Benötigt aus Windows .env:"
echo "      - DATABASE_URL (Postgres extern)"
echo "      - SLACK_BOT_TOKEN, SLACK_LIST_ID, SLACK_MATERIAL_LIST_ID, SLACK_MATERIAL_ASSIGNEE"
echo "      - MONITOR_HTTP_PASSWORD (Basic Auth Monitor)"
echo "      - MONITOR_ADMIN_KEY"
echo "      - JWT_SECRET + JWT_REFRESH_SECRET (identisch Windows!)"
echo "      - DIRECT_PRINT_PRINTER (später nach CUPS Setup)"
echo "      - Später nach Test: SAFE_MODE_SLACK=0 und DISPLAY_BASE_URL=https://monitor.rollladenwelt.de/display setzen!"
echo ""
echo " 2) 👉 Cloudflared Config von Windows kopieren (falls noch nicht geschehen):"
echo "      (WIN)  scp -r C:\Projects\Shopify\cloudflared <ubuntuuser>@100.98.136.86:/tmp/cf_tmp"
echo "      (UBU)  sudo mv /tmp/cf_tmp ${SRV_DIR}/cloudflared && sudo chown -R root:root ${SRV_DIR}/cloudflared"
echo ""
echo " 3) 👉 CUPS Drucker Brother QL anlegen (falls Netzwerk Drucker vorhanden):"
echo "      sudo apt install -y printer-driver-brlaser brother-cups-wrapper-common cups-pdf"
echo "      sudo lpadmin -p Brother-QL-1110NWB -v socket://<DRUCKER-IP>:9100 -m laserjet-brlaser.ppd -L Buerobrother -E"
echo "      sudo lpadmin -d Brother-QL-1110NWB   # Optional: als Standard setzen"
echo "      lp -d Brother-QL-1110NWB /usr/share/cups/data/testprint  # Testdruck!"
echo "      Anschliessend in ${ENV_FILE}: DIRECT_PRINT_PRINTER=Brother-QL-1110NWB"
echo ""
echo " 4) 👉 Erster Test-Start Backend MANUELL (ohne systemd, um Fehler zu sehen!):"
echo "      sudo -u ${SYSUSER} bash -c 'cd ${SRV_DIR}/backend && set -a && source ${ENV_FILE} && set +a && node src/index.js'"
echo "      Zweites SSH Fenster:  curl -s http://127.0.0.1:3006/health  → {\"status\":\"ok\"}"
echo ""
echo " 5) 👉 Wenn Test läuft: Beenden (Strg+C), dann Service Starten via systemd:"
echo "      sudo systemctl start rollladen-backend"
echo "      sudo systemctl status rollladen-backend"
echo "      sudo journalctl -u rollladen-backend -f  # Live-Logs"
echo ""
echo " 6) 👉 Später: Cloudflared Tunnel starten + Test-Subdomain (siehe tasks.md Task 5):"
echo "      Quick-Tunnel (5 Min, temporär):  sudo cloudflared tunnel --url http://localhost:3006"
echo ""
echo "=============== HÄUFIGE BEFEHLE (SPÄTER) ==============="
echo "   Status Dienste:   sudo systemctl status rollladen-backend rollladen-cloudflared"
echo "   Restart Backend:  sudo systemctl restart rollladen-backend"
echo "   Live Logs:        sudo journalctl -u rollladen-backend -f"
echo "   Logs seit heute:  sudo journalctl --since today -u rollladen-backend -u rollladen-cloudflared"
echo "   Drucker Queue:    lpq -a ; lpstat -p -d"
echo "   Manueller Testdruck: lp -d Brother-QL-1110NWB /tmp/test.pdf"
echo "================================================================"
echo ""
exit 0
