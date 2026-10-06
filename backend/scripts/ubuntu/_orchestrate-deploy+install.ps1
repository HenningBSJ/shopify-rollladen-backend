# ================================================================
# FULL ORCHESTRATOR: Windows -> Ubuntu Migration Deploy
#   1. Packt Backend (+ cloudflared) ohne node_modules + ohne Secrets in Tars
#   2. SCP nach Ubuntu /tmp/rollladen-deploy
#   3. Entpackt nach /srv/rollladen-monitor (mit BACKUP)
#   4. Führt TASK1 Baseline Setup (sudo) aus
#   5. Führt install-full.sh (sudo, idempotent) aus
#   6. Gibt finale Installer Zusammenfassung + nächste Schritte
# ================================================================
$ErrorActionPreference = "Stop"
$root = "C:\Projects\Shopify"
Set-Location $root
. "$root\backend\scripts\ubuntu\_ubu-helper.ps1"

Write-Host ""
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host " 🚀 ROLLLADEN MONITOR: FULL DEPLOY + INSTALL ORCHESTRATOR" -ForegroundColor Magenta
Write-Host "   Windows -> Ubuntu 100.98.136.86 via Tailscale + Posh-SSH" -ForegroundColor Magenta
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host ""

# ============================================================
# STEP 1: Prepare Tars locally on Windows (no node_modules / no .env secrets!)
# ============================================================
Write-Step = { param($m) Write-Host "`n====== $m ======" -ForegroundColor Cyan }
& $Write-Step "SCHRITT 1/6: Lokales Packen der Archive (ohne Secrets + ohne node_modules)"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$tmpLocal = "$env:TEMP\roll-deploy-$stamp"
New-Item -ItemType Directory -Force -Path $tmpLocal | Out-Null
$backendTar = Join-Path $tmpLocal "backend.tar.gz"
$cfTar      = Join-Path $tmpLocal "cloudflared.tar.gz"

# --- BACKEND TAR (EXCLUDE node_modules, .env secrets, logs, pid, state) ---
Push-Location "$root\backend"
try {
    & tar --exclude='node_modules' `
          --exclude='.env' --exclude='.env.*' --exclude='*.env' `
          --exclude='data/tmp*' --exclude='data/temp*' `
          --exclude='data/uptime/*.log' --exclude='data/uptime/state.json' --exclude='data/uptime/*.pid' `
          --exclude='*.pid' `
          --exclude='npm-debug.log' --exclude='yarn-error.log' `
          -czf $backendTar .
} finally { Pop-Location }
$bt = [Math]::Round((Get-Item $backendTar).Length / 1MB, 1)
Write-Host "  ✅ Backend Tar: $backendTar (${bt} MB)" -ForegroundColor Green

# --- CLOUDFLARED TAR (config.yml + cert.pem, nur wenn vorhanden) ---
$cfHasConfig = Test-Path "$root\cloudflared\config.yml"
if ($cfHasConfig) {
    Push-Location "$root\cloudflared"
    try { & tar -czf $cfTar . } finally { Pop-Location }
    $cfsz = [Math]::Round((Get-Item $cfTar).Length / 1KB, 1)
    Write-Host "  ✅ Cloudflared Tar: $cfTar (${cfsz} KB)" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Cloudflared Ordner/config.yml nicht gefunden -> später manuell kopieren." -ForegroundColor Yellow
}

# ============================================================
# STEP 2: Upload Tars + Bash Helper Scripts to /tmp/rollladen-deploy
# ============================================================
& $Write-Step "SCHRITT 2/6: Upload nach Ubuntu /tmp/rollladen-deploy via SCP"
$deployRemote = "/tmp/rollladen-deploy"
Invoke-UbuCmd "rm -rf '$deployRemote' && mkdir -p '$deployRemote' && echo ready" | Out-Null

# Upload Backend Tar
CopyTo-Ubu -LocalPath $backendTar -RemotePath "$deployRemote/backend.tar.gz"
# Upload Cloudflared Tar if present
if ($cfHasConfig) { CopyTo-Ubu -LocalPath $cfTar -RemotePath "$deployRemote/cloudflared.tar.gz" }

# Upload all bash scripts from ubuntu folder: install-full.sh, TASK1-run-on-ubuntu.sh, env.template
$filesToSend = @("install-full.sh", "TASK1-run-on-ubuntu.sh", "env.template", "_verify.sh")
foreach ($f in $filesToSend) {
    $local = Get-Script $f
    if (Test-Path $local) {
        CopyTo-Ubu -LocalPath $local -RemotePath "$deployRemote/$f"
        Invoke-UbuCmd "chmod +x '$deployRemote/$f'" | Out-Null
    }
}
# LF Convert Remote bash scripts (belt + suspenders)
Invoke-UbuCmd "for f in $deployRemote/*.sh $deployRemote/*.service $deployRemote/*.template; do if [ -f \"\$f\" ]; then sed -i 's/\r$//' \"\$f\" 2>/dev/null; fi; done; echo lf-done" | Out-Null
Write-Host "  ✅ Alle Dateien auf Ubuntu in $deployRemote hochgeladen." -ForegroundColor Green

# ============================================================
# STEP 3: Unpack to /srv/rollladen-monitor + Auto Backup altes Deploy
# ============================================================
& $Write-Step "SCHRITT 3/6: Entpacken nach /srv/rollladen-monitor (Auto-BACKUP alter Installation)"
$unpack = @"
set -eu
DEPLOY=$deployRemote
SRV="/srv/rollladen-monitor"
# Auto Backup falls SRV mit Backend existiert
if [ -f "\${SRV}/backend/package.json" ] || [ -f "\${SRV}/cloudflared/config.yml" ]; then
  BAK="/srv/rollladen-monitor-BACKUP-$(date +%Y%m%d-%H%M%S)"
  echo "Backup existierendes SRV: \${SRV} -> \${BAK}"
  echo '000000' | sudo -S -p '' mkdir -p \$(dirname \${BAK})
  echo '000000' | sudo -S -p '' cp -a "\${SRV}" "\${BAK}" 2>/dev/null || echo '000000' | sudo -S -p '' mv "\${SRV}" "\${BAK}" || true
  echo "✅ Backup erstellt: \${BAK}"
fi
echo '000000' | sudo -S -p '' mkdir -p "\${SRV}"

# Entpacke Backend
echo "Entpacke Backend..."
echo '000000' | sudo -S -p '' rm -rf "\${SRV}/backend" 2>/dev/null || true
echo '000000' | sudo -S -p '' mkdir -p "\${SRV}/backend"
echo '000000' | sudo -S -p '' tar -xzf "\${DEPLOY}/backend.tar.gz" -C "\${SRV}/backend"

# Entpacke Cloudflared falls vorhanden
if [ -f "\${DEPLOY}/cloudflared.tar.gz" ]; then
  echo "Entpacke Cloudflared..."
  echo '000000' | sudo -S -p '' rm -rf "\${SRV}/cloudflared" 2>/dev/null || true
  echo '000000' | sudo -S -p '' mkdir -p "\${SRV}/cloudflared"
  echo '000000' | sudo -S -p '' tar -xzf "\${DEPLOY}/cloudflared.tar.gz" -C "\${SRV}/cloudflared"
  echo '000000' | sudo -S -p '' chown -R root:root "\${SRV}/cloudflared"
  echo '000000' | sudo -S -p '' chmod -R u+rwX,go+rX "\${SRV}/cloudflared"
fi

# Basis Berechtigungen
echo '000000' | sudo -S -p '' chown -R rollladen:adm "\${SRV}" 2>/dev/null || echo '000000' | sudo -S -p '' chown -R root:adm "\${SRV}"
echo '000000' | sudo -S -p '' chmod 755 "\${SRV}"
echo '000000' | sudo -S -p '' chmod -R u+rwX,go+rX "\${SRV}/backend" 2>/dev/null || true

echo ""
echo "SRV Folder after deploy:"
echo '000000' | sudo -S -p '' ls -la "\${SRV}" 2>/dev/null || ls -la "\${SRV}"
echo ""
echo "Backend package.json snippet:"
cat "\${SRV}/backend/package.json" 2>/dev/null | head -n10 || echo "⚠️  package.json fehlt!"
echo ""
echo "Deploy Helfer unter \${SRV}/backend/scripts/ubuntu/:"
ls -la "\${SRV}/backend/scripts/ubuntu/" 2>/dev/null | head -n 15 || echo "⚠️  Skripte fehlen!"
echo ""
echo "STEP3_DONE"
"@
$r = Invoke-UbuCmd $unpack -Timeout 120
$r.Output | ForEach-Object { Write-Host "    | $_" }
Write-Host "  ✅ Deploy nach /srv/rollladen-monitor ERLEDIGT." -ForegroundColor Green

# ============================================================
# STEP 4: TASK1 Baseline Setup
# ============================================================
& $Write-Step "SCHRITT 4/6: TASK 1 - Ubuntu 24.04 Baseline Prüfung + Setup (sudo bash TASK1-run-on-ubuntu.sh)"
$task1 = Invoke-UbuCmd "bash '$deployRemote/TASK1-run-on-ubuntu.sh'" -Sudo -Timeout 300
$task1.Output | ForEach-Object { Write-Host "  $_" }
Write-Host "  ✅ TASK1 abgeschlossen." -ForegroundColor Green

# ============================================================
# STEP 5: FULL INSTALL (Node 24, Chromium, CUPS, systemd units!)
# ============================================================
& $Write-Step "SCHRITT 5/6: TASK 3 - Full Installer (Node24, Chromium, CUPS, Cloudflared, systemd Units, journald, Zeitzone, CUPS Service, ...)"
Write-Host "  ⏳ Dieser Schritt dauert ca. 2-5 Minuten (apt Downloads + Installationen!)" -ForegroundColor Yellow
$installStart = Get-Date
$inst = Invoke-UbuCmd "bash '$deployRemote/install-full.sh'" -Sudo -Timeout 1800
$installDur = (Get-Date) - $installStart
$inst.Output | ForEach-Object { Write-Host "  $_" }
Write-Host ""
Write-Host ("  ✅ Installer abgeschlossen in {0}m {1}s." -f [int]$installDur.TotalMinutes, $installDur.Seconds) -ForegroundColor Green

# ============================================================
# STEP 6: Installer Verification nachfolgende Checks
# ============================================================
& $Write-Step "SCHRITT 6/6: INSTALLATIONS-VERIFIKATION (Pakete, User, Units, Ordner, ENV-File)"
$ver = @"
set -e
echo "--- (1) Node/npm/cloudflared/chromium/lpstat Versionen ---"
which node npm cloudflared lpstat 2>/dev/null || true
node -v 2>/dev/null || echo "node: n/a"
npm -v 2>/dev/null || echo "npm: n/a"
cloudflared -v 2>/dev/null | head -n 1 || echo "cloudflared: n/a"
echo "chromium pkg: \$(dpkg -l 2>/dev/null | grep -E '^(ii)\s+(chromium|chromium-browser)\s' | awk '{print \$2,\$3}' | head -1)"
lpstat --version 2>/dev/null | head -n1 || echo "lpstat: n/a"
echo ""
echo "--- (2) User rollladen vorhanden? Gruppen? ---"
id rollladen 2>/dev/null || echo "⚠️  User rollladen fehlt!"
echo ""
echo "--- (3) /srv/rollladen-monitor, /var/log/rollladen, /etc/rollladen-monitor vorhanden? ---"
for d in /srv/rollladen-monitor /var/log/rollladen /etc/rollladen-monitor; do
  if [ -d "\$d" ]; then
    stat --format='  %n : owner=%U:%G mode=%a' "\$d" 2>/dev/null || ls -la "\$d"
  else
    echo "  ⚠️  FEHLT: \$d"
  fi
done
echo ""
echo "--- (4) /etc/rollladen-monitor.env Rechte? ---"
if [ -f /etc/rollladen-monitor.env ]; then
  stat --format='  /etc/rollladen-monitor.env: %U:%G mode=%a' /etc/rollladen-monitor.env
  echo "  Kopfzeilen:"
  head -n 25 /etc/rollladen-monitor.env | grep -v '^#' | grep -v '^\s*$'
else
  echo "  ⚠️  FEHLT: /etc/rollladen-monitor.env"
fi
echo ""
echo "--- (5) systemd Units vorhanden + enabled? ---"
for u in rollladen-backend.service rollladen-cloudflared.service; do
  echo -n "  \$u: "
  if [ -f "/etc/systemd/system/\$u" ]; then
    echo -n "UNIT_DATEI_VORHANDEN "
    echo -n "enabled=\$(systemctl is-enabled \$u 2>/dev/null || echo n/a) "
    echo -n "active=\$(systemctl is-active \$u 2>/dev/null || echo n/a)"
  else
    echo -n "FEHLT"
  fi
  echo ""
done
echo ""
echo "--- (6) CUPS cups.service + Zeitzone ---"
echo "  cups.service active=\$(systemctl is-active cups 2>/dev/null || systemctl is-active cups.service 2>/dev/null || echo n/a) enabled=\$(systemctl is-enabled cups 2>/dev/null || echo n/a)"
echo "  Zeitzone: \$(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone) → aktuell: \$(date '+%F %T %Z')"
echo ""
echo "--- (7) journald Config + persistent Logs ---"
journalctl --disk-usage 2>/dev/null | head -n1 || echo "journalctl: n/a"
echo ""
echo "STEP6_VERIFY_DONE"
"@
$v = Invoke-UbuCmd $ver -Sudo -Timeout 60
$v.Output | ForEach-Object { Write-Host "  $_" }

# Cleanup local tar
Remove-Item $backendTar -ErrorAction SilentlyContinue
if ($cfHasConfig) { Remove-Item $cfTar -ErrorAction SilentlyContinue }
Remove-Item $tmpLocal -ErrorAction SilentlyContinue -Recurse -Force

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host " 🎉 ORCHESTRATOR ERLEDIGT! DEPLOY + INSTALL KAPITEL 1-5 DURCH!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "NÄCHSTE SCHRITTE (Kommen direkt als nächstes in dieser Session):" -ForegroundColor Cyan
Write-Host "  (1) /etc/rollladen-monitor.env BEARBEITEN: Secrets von Windows .env übernehmen!" -ForegroundColor Yellow
Write-Host "  (2) MANUELLER Test Start Backend: node src/index.js mit env geladen → /health 200"
Write-Host "  (3) CUPS Brother QL-1110NWB Drucker anlegen + Testdruck"
Write-Host "  (4) systemd Unit rollladen-backend.service starten + Live Logs"
Write-Host "  (5) Cloudflared Test-Quick-Tunnel (öffentliche Test URL für Seite-an-Seite)"
Write-Host ""
exit 0
