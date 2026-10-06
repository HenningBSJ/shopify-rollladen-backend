#!/bin/bash
#===============================================================================
# TASK 1: Ubuntu Baseline Prüfung + Vorbereitung (AUF UBUNTU AUSFÜHREN!)
# Prüft: Ubuntu Version, Zeitzone, Pakete, User, Ordner, CUPS, Tailscale
# Verwendung:
#   (a) Als root/sudo auf rafes-405-1231 (100.98.136.86) ausführen:
#       sudo bash TASK1-run-on-ubuntu.sh
#===============================================================================
set -eu
SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi
echo "================================================================"
echo " TASK 1: Ubuntu 24.04 Baseline Prüfung + Setup"
echo " Host: $(hostname) | Zeit: $(date '+%F %T')"
echo "================================================================"
# === 1. Ubuntu Version prüfen ===
echo ""
echo "[T1-1] Ubuntu Version prüfen..."
LSB=$(lsb_release -rs 2>/dev/null || echo "n/a")
CODENAME=$(lsb_release -cs 2>/dev/null || echo "n/a")
KERNEL=$(uname -r)
echo "  Release:  ${LSB}"
echo "  Codename: ${CODENAME}"
echo "  Kernel:   ${KERNEL}"
if [ "${CODENAME}" = "noble" ] || [ "${LSB}" = "24.04" ]; then
  echo "  ✅ OK: Ubuntu 24.04 LTS (noble)."
else
  echo "  ⚠️  WARNUNG: Erwartet Ubuntu 24.04 LTS 'noble', tatsächlich: ${CODENAME}!"
fi

# === 2. Zeitzone Europe/Berlin setzen ===
echo ""
echo "[T1-2] Zeitzone auf Europe/Berlin setzen..."
TZ_NOW=$(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || echo "n/a")
echo "  Vorher: ${TZ_NOW}"
if [ "${TZ_NOW}" != "Europe/Berlin" ]; then
  ${SUDO} timedatectl set-timezone Europe/Berlin 2>/dev/null || true
  TZ_NOW2=$(timedatectl show -p Timezone --value 2>/dev/null || echo "n/a")
  echo "  Nachher: ${TZ_NOW2}"
fi
echo "  Aktuell: $(date '+%Z %z, %F %T')"

# === 3. Service User rollladen anlegen (falls noch nicht geschehen) ===
echo ""
echo "[T1-3] Service User 'rollladen' anlegen / prüfen..."
if id rollladen >/dev/null 2>&1; then
  echo "  ✅ existiert (UID=$(id -u rollladen), GID=$(id -g rollladen))"
else
  echo "  → Erstelle system user 'rollladen'..."
  ${SUDO} groupadd --system rollladen 2>/dev/null || true
  ${SUDO} useradd --system --gid rollladen \
    --home-dir /var/lib/rollladen --create-home \
    --shell /usr/sbin/nologin \
    --comment "Rollladen Monitor Service User" rollladen
  echo "  ✅ erstellt (UID=$(id -u rollladen))."
fi
# CUPS Gruppen (lp + lpadmin)
for g in lp lpadmin adm; do
  if getent group $g >/dev/null 2>&1; then
    if ! id -nG rollladen | tr ' ' '\n' | grep -qw $g; then
      ${SUDO} usermod -aG $g rollladen && echo "  → zu Gruppe '${g}' hinzugefügt."
    fi
  fi
done
echo "  Gruppen: $(id -nG rollladen | sort -u | xargs)"

# === 4. Ordnerstruktur anlegen ===
echo ""
echo "[T1-4] Ordnerstruktur anlegen..."
DIRS=(/srv/rollladen-monitor /var/log/rollladen /etc/rollladen-monitor /var/lib/rollladen)
for d in ${DIRS[@]}; do
  if [ ! -d "$d" ]; then
    ${SUDO} mkdir -p "$d" && echo "  → erstellt: $d"
  else
    echo "  ℹ️  bereits vorhanden: $d"
  fi
done
# Basis-Berechtigungen
${SUDO} chown rollladen:adm /srv/rollladen-monitor /var/log/rollladen 2>/dev/null || true
${SUDO} chmod 755 /srv/rollladen-monitor 2>/dev/null || true
${SUDO} chmod 750 /var/log/rollladen 2>/dev/null || true
${SUDO} chown root:root /etc/rollladen-monitor 2>/dev/null || true
${SUDO} chmod 700 /etc/rollladen-monitor 2>/dev/null || true
${SUDO} chown rollladen:rollladen /var/lib/rollladen 2>/dev/null || true

# === 5. Basispakete Installation ===
echo ""
echo "[T1-5] Basispakete: curl/wget/curl/ca/jq/gnupg/lsb-release..."
export DEBIAN_FRONTEND=noninteractive
${SUDO} apt-get update -qq >/dev/null 2>&1 || true
${SUDO} apt-get install -y -qq --no-install-recommends \
  curl wget ca-certificates gnupg lsb-release apt-transport-https \
  software-properties-common jq htop net-tools dnsutils unzip >/dev/null 2>&1 || true
echo "  ✅ installiert (Details siehe dpkg -l)."

# === 6. Tailscale Verbindungsstatus ===
echo ""
echo "[T1-6] Tailscale Status (Tailnet 'Tg49cQqjcY11CNTRL')..."
if command -v tailscale >/dev/null 2>&1; then
  echo "  tailscale: $(tailscale version 2>/dev/null | head -n1 || echo 'unknown version')"
  TS=$(tailscale status --self --json 2>/dev/null | jq -r '{BackendState, Self:{HostName, TailscaleIPs, OS}}' 2>/dev/null || echo "n/a (kein JSON Output)")
  echo "  ${TS}"
  PING_WIN=$(tailscale ping --c 2 --timeout 2s 100.96.91.113 2>&1 | head -n3 || echo "ping fail")
  echo "  Ping Windows (100.96.91.113): ${PING_WIN}"
else
  echo "  ⚠️  tailscale nicht installiert! (Install: curl -fsSL https://tailscale.com/install.sh | sh)"
fi

# === 7. Disk Space / RAM / CPU ===
echo ""
echo "[T1-7] Ressourcen-Übersicht:"
df -h / /srv /var/lib 2>/dev/null | awk 'NR==1 || /^\// {print "  FS " $0}'
FREE=$(free -h 2>/dev/null | awk '/Mem:/ {print "  RAM: total="$2" / avail="$7}')
echo ${FREE:-"  RAM: n/a"}
echo "  CPU Kerne: $(nproc 2>/dev/null || echo '?')"
echo "  Load:     $(uptime | sed -E 's/.*load average: //' || echo '?')"

# === 8. CUPS Status ===
echo ""
echo "[T1-8] CUPS / lp Status:"
if command -v lpstat >/dev/null 2>&1; then
  echo "  lpstat: $(lpstat --version 2>/dev/null | head -n1 || echo 'ok')"
  echo "  Drucker Queue:  $(lpstat -p -d 2>&1 | head -n20 || echo 'keine Drucker')"
else
  echo "  ⚠️  lpstat (cups-client) nicht installiert."
fi
if systemctl list-unit-files 2>/dev/null | grep -q cups; then
  echo "  cups.service: active=$(systemctl is-active cups 2>/dev/null || echo '?'), enabled=$(systemctl is-enabled cups 2>/dev/null || echo '?')"
fi

# === END ===
echo ""
echo "================================================================"
echo " ✅ TASK 1 Baseline Prüfung + Setup abgeschlossen!"
echo " Zeit: $(date '+%F %T')"
echo "================================================================"
echo ""
echo "NÄCHSTE SCHRITTE:"
echo "  (1) Führe TASK 4 Deploy (Windows-Seite) aus um Code auf diese Maschine zu kopieren."
echo "  (2) Dann: sudo bash /srv/rollladen-monitor/backend/scripts/ubuntu/install-full.sh"
echo ""
exit 0
