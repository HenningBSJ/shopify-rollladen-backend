# ================================================================
# TASK 4: Kompletter Deploy von WINDOWS nach UBUNTU via Tailscale SCP
# AUF WINDOWS IN PowerShell AUSFÜHREN!
# Benötigt:
#   [1] Ubuntu 100.98.136.86 erreichbar via Tailscale (ping vorher testen!)
#   [2] SSH Username auf Ubuntu + Passwort oder SSH-Key
#   [3] Windows hat OpenSSH Client (ist bei Win10/11 standardmäßig installiert)
#       Falls nicht: Einstellungen → Apps → Optionale Features → "OpenSSH Client" installieren
# ================================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]  [string]$UbuntuUser,          # z.B. "ubuntu" oder "jonas" oder was immer der User ist
    [Parameter(Mandatory=$false)] [string]$UbuntuHost = "100.98.136.86",
    [Parameter(Mandatory=$false)] [int]   $UbuntuSshPort = 22,
    [Parameter(Mandatory=$false)] [string]$TmpDeployDir = "/tmp/rollladen-deploy",
    [Parameter(Mandatory=$false)] [switch]$SkipBackend,
    [Parameter(Mandatory=$false)] [switch]$SkipCloudflared,
    [Parameter(Mandatory=$false)] [switch]$DryRun
)
$ErrorActionPreference = "Stop"
$root = "C:\Projects\Shopify"
$backend = Join-Path $root "backend"
$cloudf  = Join-Path $root "cloudflared"

# ============================================================
# 0. PRE-CHECKS
# ============================================================
function Write-Step($msg) { Write-Host "`n====== $msg ======" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "   OK  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "   ⚠️  $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "   ❌ $msg" -ForegroundColor Red }

Write-Step "TASK 4 Deploy Pre-Checks"
if (-not (Test-Path $backend\package.json)) { throw "Backend Ordner fehlt: $backend" }
if (-not (Get-Command scp -ErrorAction SilentlyContinue)) {
  throw "OpenSSH Client (scp) ist nicht installiert. Einstellungen → Apps → Optionale Features → OpenSSH Client installieren!"
}
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
  throw "OpenSSH Client (ssh) ist nicht installiert. Einstellungen → Apps → Optionale Features → OpenSSH Client installieren!"
}
Write-OK "OpenSSH Client: $(scp -V 2>&1 | Select-Object -First 1)"
Write-OK "Backend: $backend"
if (Test-Path $cloudf) { Write-OK "Cloudflared Config: $cloudf" } else { Write-Warn "Cloudflared Ordner fehlt! (Wenn noch nicht kopiert werden soll, ist das OK)" }

# Test Tailscale Reachability
Write-Host "   Teste Erreichbarkeit Ubuntu via Tailscale (1 Ping)..." -NoNewline
$pingTest = Test-Connection -ComputerName $UbuntuHost -Count 1 -Quiet -ErrorAction SilentlyContinue
if ($pingTest) { Write-Host " OK" -ForegroundColor Green } else { Write-Host " FAIL" -ForegroundColor Red; Write-Warn "Ubuntu Host $UbuntuHost nicht erreichbar! Prüfe Tailscale Status:  tailscale status" }

# Test SSH Connection (interaktiv, falls First Time → Host Key Accept!)
Write-Host "   Teste SSH Verbindung ${UbuntuUser}@${UbuntuHost}:${UbuntuSshPort}..."
Write-Host "   (Hinweis: Bei ERSTEN Mal nach 'yes' gefragt werden → Host Key dauerhaft akzeptieren!)" -ForegroundColor Yellow
try {
  $sshCheck = 'echo SSH_OK_$USER_$(hostname)'
  ssh -o StrictHostKeyChecking=accept-new -o BatchMode=no -p $UbuntuSshPort "${UbuntuUser}@${UbuntuHost}" $sshCheck
  if ($LASTEXITCODE -ne 0) { throw "SSH exited with code $LASTEXITCODE" }
} catch {
  Write-Fail "SSH Verbindungsfehler. Prüfe: Username, Password, Port, Tailscale!"
  throw "SSH Test fehlgeschlagen."
}

# ============================================================
# 1. /tmp Deploy Ordner auf Ubuntu CLEAN + LEER anlegen
# ============================================================
Write-Step "Bereinige Deploy TMP Ordner auf Ubuntu (${TmpDeployDir})"
$cleanCmd = @"
set -e
if [ -d "${TmpDeployDir}" ]; then
  sudo rm -rf "${TmpDeployDir}"
fi
mkdir -p "${TmpDeployDir}"
echo "TMP_READY: `$(ls -la ${TmpDeployDir} | wc -l) Items"
"@
$cleanCmd | ssh -p $UbuntuSshPort "${UbuntuUser}@${UbuntuHost}" "bash -s"
Write-OK "TMP Ordner bereit: ${TmpDeployDir}"

# ============================================================
# 2. BACKEND nach /tmp via SCP kopieren (OHNE node_modules + ohne Secrets!)
# ============================================================
if (-not $SkipBackend) {
  Write-Step "Kopiere BACKEND (ohne node_modules + ohne sensitiv .env + ohne logs)"
  $src = "$($backend)\"
  $dst = "${TmpDeployDir}/backend"
  # scp -r : Rekursiv; -C : Kompression (grosser node_modules wird aber übersprungen!)
  # Ausschluss von: node_modules/, data/tmp*, data/uptime/*.log, .env.local usw.
  # Leider Windows OpenSSH scp kennt kein --exclude. Workaround:
  #   Vorher temporären Tar-Ball packen (ausschliessen von Patterns) dann scp des tars + remote entpacken!
  Write-Host "   Packe Backend in .tar.gz (ohne node_modules + ohne .env + ohne Uptime-Logs)..."
  $tarLocal = Join-Path $env:TEMP "rollladen-backend-deploy-$(Get-Date -Format 'yyyyMMddHHmmss').tar.gz"
  # 7z oder tar (tar.exe ist auf Win10+ drin!)
  if (Get-Command tar -ErrorAction SilentlyContinue) {
    $null = Push-Location $backend
    & tar --exclude='node_modules' `
          --exclude='data/tmp*' `
          --exclude='data/uptime/*.log' `
          --exclude='data/uptime/state.json' `
          --exclude='data/*.env' `
          --exclude='.env' `
          --exclude='.env.local' `
          --exclude='*.pid' `
          -czf $tarLocal .
    $null = Pop-Location
  } else {
    throw "tar.exe nicht verfügbar! Bitte Windows aktualisieren oder 7-Zip + manuell kopieren."
  }
  $fsize = [math]::Round((Get-Item $tarLocal).Length / 1MB, 1)
  Write-OK "Lokales Tar erstellt: $tarLocal (${fsize} MB)"

  if (-not $DryRun) {
    Write-Host "   SCP: Windows --> Ubuntu (${srcTar} -> ${UbuntuHost}:${TmpDeployDir}/backend.tar.gz) ..." -NoNewline
    scp -P $UbuntuSshPort -o StrictHostKeyChecking=accept-new -C $tarLocal "${UbuntuUser}@${UbuntuHost}:${TmpDeployDir}/backend.tar.gz" | Out-Null
    Write-Host " OK" -ForegroundColor Green

    Write-Host "   Entpacke Tar auf Ubuntu nach ${dst} ..." -NoNewline
    $untar = @"
set -e
mkdir -p "${dst}"
cd "${dst}"
tar -xzf "${TmpDeployDir}/backend.tar.gz"
# Sicherstellen dass node_modules wirklich leer/gelöscht wird (falls doch versehentlich reingerutscht)
rm -rf "${dst}/node_modules"
echo "UNPACK_OK: Backend: `$(ls -la ${dst} | head -n3) ::: package.json v`$(node -e "console.log(require('${dst}/package.json').version)" 2>/dev/null || echo '?')"
"@
    $untar | ssh -p $UbuntuSshPort "${UbuntuUser}@${UbuntuHost}" "bash -s" | Out-Host
    Write-Host " OK" -ForegroundColor Green

    # Tar lokal + remote löschen
    Write-Host "   Aufräumen: entferne Tars..."
    Remove-Item $tarLocal -ErrorAction SilentlyContinue
    ssh -p $UbuntuSshPort "${UbuntuUser}@${UbuntuHost}" "rm -f ${TmpDeployDir}/backend.tar.gz" 2>$null | Out-Null
  } else {
    Write-Warn "DRY-RUN: Skip SCP + Unpack. Tar lokal verbleibt unter $tarLocal zum Testen."
  }
  Write-OK "BACKEND Deploy abgeschlossen."
} else { Write-Warn "SkipBackend: Backend Deploy übersprungen (--SkipBackend)." }

# ============================================================
# 3. CLOUDFLARED CONFIG nach /tmp via SCP (config.yml + cert.pem)
# ============================================================
if (-not $SkipCloudflared -and (Test-Path $cloudf\config.yml)) {
  Write-Step "Kopiere CLOUDFLARED Config (config.yml + cert.pem)"
  $srcCf  = "$($cloudf)\"
  $dstCf  = "${TmpDeployDir}/cloudflared"
  Write-Host "   Tar + SCP cloudflared/ Ordner ..." -NoNewline
  $tarCf = Join-Path $env:TEMP "rollladen-cf-deploy-$(Get-Date -Format 'yyyyMMddHHmmss').tar.gz"
  $null = Push-Location $cloudf
  & tar -czf $tarCf .
  $null = Pop-Location
  Write-Host " OK" -ForegroundColor Green

  if (-not $DryRun) {
    scp -P $UbuntuSshPort -o StrictHostKeyChecking=accept-new -C $tarCf "${UbuntuUser}@${UbuntuHost}:${TmpDeployDir}/cloudflared.tar.gz" | Out-Null
    $untarCf = @"
set -e
mkdir -p "${dstCf}"
cd "${dstCf}"
tar -xzf "${TmpDeployDir}/cloudflared.tar.gz"
rm -f "${TmpDeployDir}/cloudflared.tar.gz"
chmod 644 "${dstCf}/config.yml" "${dstCf}/cert.pem" 2>/dev/null || true
echo "CF_OK: `$(ls -la ${dstCf} | head -n3)"
"@
    $untarCf | ssh -p $UbuntuSshPort "${UbuntuUser}@${UbuntuHost}" "bash -s" | Out-Host
    Remove-Item $tarCf -ErrorAction SilentlyContinue
  }
  Write-OK "CLOUDFLARED Config Deploy abgeschlossen."
} elseif ($SkipCloudflared) {
  Write-Warn "SkipCloudflared: Config übersprungen (--SkipCloudflared)."
} else {
  Write-Warn "cloudflared/config.yml nicht gefunden in ${cloudf}. Überspringe CF Deploy."
}

# ============================================================
# 4. Verschiebe /tmp -> /srv/rollladen-monitor per sudo
# ============================================================
Write-Step "Verschiebe Deploy von /tmp nach /srv/rollladen-monitor (via sudo)"
$moveCmd = @"
set -eu
SRV="/srv/rollladen-monitor"
# Sichere alte Installation (Fallback / Rollback, falls vorhanden!)
if [ -d "\${SRV}/backend" ] || [ -d "\${SRV}/cloudflared" ]; then
  STAMP="`$(date +%Y%m%d-%H%M%S)"
  BACKUP_DIR="/srv/rollladen-monitor-BACKUP-\${STAMP}"
  echo "Backup vorheriger Installation: \${SRV} -> \${BACKUP_DIR}"
  sudo mkdir -p `$(dirname `${BACKUP_DIR})
  sudo cp -a "\${SRV}" "\${BACKUP_DIR}" || sudo mv "\${SRV}" "\${BACKUP_DIR}" || true
  echo "Backup erstellt unter: \${BACKUP_DIR}"
fi

# Ziel Ordner anlegen
sudo mkdir -p "\${SRV}"

# Backend verschieben
if [ -d "${TmpDeployDir}/backend" ]; then
  echo "Verschiebe Backend: ${TmpDeployDir}/backend -> \${SRV}/backend"
  sudo rm -rf "\${SRV}/backend" 2>/dev/null || true
  sudo mv "${TmpDeployDir}/backend" "\${SRV}/backend"
fi
# Cloudflared verschieben
if [ -d "${TmpDeployDir}/cloudflared" ]; then
  echo "Verschiebe Cloudflared: ${TmpDeployDir}/cloudflared -> \${SRV}/cloudflared"
  sudo rm -rf "\${SRV}/cloudflared" 2>/dev/null || true
  sudo mv "${TmpDeployDir}/cloudflared" "\${SRV}/cloudflared"
  sudo chown -R root:root "\${SRV}/cloudflared"
  sudo chmod -R u+rwX,go+rX "\${SRV}/cloudflared"
fi

# Berechtigungen /srv Owner rollladen:adm
sudo chown -R rollladen:adm "\${SRV}" 2>/dev/null || true
sudo chmod 755 "\${SRV}" 2>/dev/null || true
sudo chmod -R u+rwX,go+rX "\${SRV}/backend" 2>/dev/null || true

echo ""
echo "DEPLOY_DONE! SRV Folder:"
ls -la "\${SRV}"
echo ""
echo "Backend package.json:"
cat "\${SRV}/backend/package.json" 2>/dev/null | head -n10 || echo "⚠️  package.json fehlt!"
"@
$moveCmd | ssh -p $UbuntuSshPort "${UbuntuUser}@${UbuntuHost}" "bash -s" | Out-Host

# ============================================================
# 5. FINAL: Installer Pfad ausgeben + nächste Schritte
# ============================================================
Write-Step "Deploy erfolgreich - Nächste Schritte"
$installer = "/srv/rollladen-monitor/backend/scripts/ubuntu/install-full.sh"
$task1File = "/srv/rollladen-monitor/backend/scripts/ubuntu/TASK1-run-on-ubuntu.sh"
Write-Host ""
Write-Host "  ✅ DEPLOY ABGESCHLOSSEN! Alle Dateien auf Ubuntu unter /srv/rollladen-monitor/" -ForegroundColor Green
Write-Host ""
Write-Host "  [1] Öffne SSH auf Ubuntu:" -ForegroundColor Cyan
Write-Host "      ssh ${UbuntuUser}@${UbuntuHost}"
Write-Host ""
Write-Host "  [2] TASK 1 Baseline Prüfung ausführen:" -ForegroundColor Cyan
Write-Host "      sudo bash $task1File"
Write-Host ""
Write-Host "  [3] TASK 3 Installer ausführen (Installiert Node 24, Chromium, CUPS, systemd Units!):" -ForegroundColor Cyan
Write-Host "      sudo bash $installer"
Write-Host ""
Write-Host "  [4] Nach Installer: /etc/rollladen-monitor.env EDITIEREN (Secrets DB/Slack/... von Windows .env übernehmen!)" -ForegroundColor Yellow
Write-Host "      sudo nano /etc/rollladen-monitor.env"
Write-Host ""
Write-Host "  [5] Später: MANUELLER Test Backend:" -ForegroundColor Cyan
Write-Host "      sudo -u rollladen bash -c 'cd /srv/rollladen-monitor/backend && set -a && source /etc/rollladen-monitor.env && set +a && node src/index.js'"
Write-Host ""
Write-Host "  [6] Wenn läuft: systemd Unit starten + logs beobachten:" -ForegroundColor Cyan
Write-Host "      sudo systemctl start rollladen-backend"
Write-Host "      sudo journalctl -u rollladen-backend -f"
Write-Host ""
Write-Host "  💡 Rollback falls was schief geht: sudo mv /srv/rollladen-monitor-BACKUP-* /srv/rollladen-monitor " -ForegroundColor Yellow
exit 0
