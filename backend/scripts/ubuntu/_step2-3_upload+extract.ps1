# =====================================================================
# STEP 2: Upload (SCP) + Extract -> /srv/rollladen-monitor
# =====================================================================
$ErrorActionPreference = "Stop"
$root = "C:\Projects\Shopify"
Set-Location $root

# A) Helpers laden
. "$root\backend\scripts\ubuntu\_ubu-helper.ps1"

# B) Finde die letzten beiden Tars in TEMP
$btar = Get-ChildItem $env:TEMP -Filter "backend.tar.gz" -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$ctar = Get-ChildItem $env:TEMP -Filter "cloudflared.tar.gz" -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $btar) { throw "backend.tar.gz nicht gefunden in $env:TEMP. Bitte neu packen." }
Write-Host "Benutze: BackendTar=$($btar.FullName)"
Write-Host "          CfTar=$($ctar.FullName)"

$DEPLOY = "/tmp/roll-deploy-latest"
Invoke-UbuCmd "rm -rf '$DEPLOY' ; mkdir -p '$DEPLOY'" | Out-Null

# Upload 1: Backend Tar
CopyTo-Ubu -LocalPath $btar.FullName -RemotePath "$DEPLOY/backend.tar.gz"
# Upload 2: Cloudflared Tar falls vorhanden
if ($ctar) { CopyTo-Ubu -LocalPath $ctar.FullName -RemotePath "$DEPLOY/cloudflared.tar.gz" }

# Upload 3: Alle bash Install Skripte + Units + template
$shFiles = @("install-full.sh","TASK1-run-on-ubuntu.sh","env.template","rollladen-backend.service","rollladen-cloudflared.service")
foreach ($f in $shFiles) {
  $local = Join-Path "$root\backend\scripts\ubuntu" $f
  if (Test-Path $local) {
    CopyTo-Ubu -LocalPath $local -RemotePath "$DEPLOY/$f"
    if ($f -match "\.sh$") { Invoke-UbuCmd "chmod +x '$DEPLOY/$f' && sed -i 's/\r`$//' '$DEPLOY/$f'" | Out-Null }
  }
}
Write-Host "✅ Alles hochgeladen nach $DEPLOY" -ForegroundColor Green
Write-Host ""
Write-Host "--- Schritt 3: TMP -> /srv + Backup ---"
$cmd = @'
set -eu
TMP=/tmp/roll-deploy-latest
SRV=/srv/rollladen-monitor
# Backup altes SRV falls vorhanden
if [ -f "$SRV/backend/package.json" ] || [ -f "$SRV/cloudflared/config.yml" ]; then
  BAK="/srv/rollladen-monitor-BACKUP-$(date +%Y%m%d-%H%M%S)"
  mkdir -p $(dirname "$BAK")
  cp -a "$SRV" "$BAK" 2>/dev/null || mv "$SRV" "$BAK" || true
  echo "BACKUP_OK_$BAK"
fi
mkdir -p "$SRV"
# Backend entpacken
rm -rf "$SRV/backend" 2>/dev/null || true
mkdir -p "$SRV/backend"
tar -xzf "$TMP/backend.tar.gz" -C "$SRV/backend"
echo "UNPACK_BACKEND_OK: $(ls $SRV/backend/package.json 2>/dev/null && echo found || echo MISSING!)"
# Cloudflared falls da
if [ -f "$TMP/cloudflared.tar.gz" ]; then
  rm -rf "$SRV/cloudflared" 2>/dev/null || true
  mkdir -p "$SRV/cloudflared"
  tar -xzf "$TMP/cloudflared.tar.gz" -C "$SRV/cloudflared"
  chown -R root:root "$SRV/cloudflared" 2>/dev/null || true
  echo "UNPACK_CF_OK: $(ls $SRV/cloudflared/config.yml 2>/dev/null && echo found || echo MISSING!)"
else
  echo "UNPACK_CF_SKIPPED (kein tar)"
fi
# Berechtigungen
chown -R root:adm "$SRV" 2>/dev/null || true
chmod 755 "$SRV"
chmod -R u+rwX,go+rX "$SRV/backend" 2>/dev/null || true
chmod -R u+rwX "$SRV/backend/scripts/ubuntu/*.sh" 2>/dev/null || true
echo "LS_SRV: $(ls -la $SRV)"
'@
$r = Invoke-UbuCmd $cmd -Sudo -Timeout 120
$r.Output | ForEach-Object { Write-Host "    | $_" }
Write-Host ""
Write-Host "✅ STEP 2 + 3 ERLEDIGT! Dateien auf Ubuntu in /srv/rollladen-monitor/" -ForegroundColor Green
Write-Host "Nächster Schritt: TASK1-run-on-ubuntu.sh (Baseline) dann install-full.sh."
exit 0
