$ErrorActionPreference = "Stop"
$winEnv = "C:\Projects\Shopify\backend\.env"
if (-not (Test-Path $winEnv)) { throw "Windows .env fehlt: $winEnv" }

# Parse Windows .env
$vars = [ordered]@{}
Get-Content $winEnv -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) { return }
  $eq = $line.IndexOf('=')
  if ($eq -lt 1) { return }
  $k = $line.Substring(0, $eq).Trim()
  $v = $line.Substring($eq + 1).Trim()
  if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
    $v = $v.Substring(1, $v.Length - 2)
  }
  $vars[$k] = $v
}

# Ubuntu Baseline Overrides (ersetzen Windows Werte oder setzen fehlende!)
$linuxVars = [ordered]@{
  'PORT'                      = '3006'
  'HOST'                      = '0.0.0.0'
  'NODE_ENV'                  = 'production'
  'TZ'                        = 'Europe/Berlin'
  'SAFE_MODE_SLACK'           = '1'
  'SLACK_READONLY'            = '1'
  'DIRECT_PRINT_CHROMIUM_EXE' = '/usr/bin/chromium-browser'
  'DIRECT_PRINT_LP_EXE'       = '/usr/bin/lp'
  'DIRECT_PRINT_LPSTAT_EXE'   = '/usr/bin/lpstat'
  'DIRECT_PRINT_PRINTER'      = 'Brother_QL_1110NWB'
  'DIRECT_PRINT_EDGE_EXE'     = ''
  'DIRECT_PRINT_SUMATRA_EXE'  = ''
  'DISPLAY_BASE_URL'          = 'http://100.98.136.86:3006/display'
}
# Merge: Windows + Linux Override (Linux gewinnt!)
foreach ($k in $linuxVars.Keys) { $vars[$k] = $linuxVars[$k] }

# Assemble final env file content
$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine('# ======================================================')
[void]$sb.AppendLine('# /etc/rollladen-monitor.env')
[void]$sb.AppendLine('# Auto erstellt: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
[void]$sb.AppendLine('# Quelle: Windows .env + Ubuntu Overrides')
[void]$sb.AppendLine('# ACHTUNG: SAFE_MODE_SLACK=1 während Testphase!')
[void]$sb.AppendLine('# Nach Cutover: SAFE_MODE_SLACK=0 + DISPLAY_BASE_URL=https://monitor.rollladenwelt.de/display')
[void]$sb.AppendLine('# ======================================================')
foreach ($k in $vars.Keys) {
  $val = $vars[$k]
  # Values with special chars: quote them
  if ($val -match "[\s=:`"`$\\]") {
    $qval = '"' + $val.Replace('\', '\\').Replace('"', '\"') + '"'
  } else {
    $qval = $val
  }
  [void]$sb.AppendLine("$k=$qval")
}

# Write locally for reference
$localOut = "$env:TEMP\rollladen-ubuntu-env.out"
Set-Content -Path $localOut -Value $sb.ToString() -Encoding UTF8
Write-Host "Env Datei zusammengebaut: $localOut ($($vars.Count) Variablen, $([math]::Round($sb.Length/1KB,1)) KB)" -ForegroundColor Green
Write-Host ""
Write-Host "Preview (Keys + Value-Starts, keine Passwörter im Klartext):" -ForegroundColor Cyan
foreach ($k in $vars.Keys) {
  $v = $vars[$k]
  if ($k -match "PASSWORD|SECRET|TOKEN|JWT|ADMIN_KEY|DATABASE_URL") {
    if ($v.Length -ge 4) { $preview = $v.Substring(0,4) + '***' } else { $preview = '***' }
  } else {
    if ($v.Length -gt 40) { $preview = $v.Substring(0,40) + '...' } else { $preview = $v }
  }
  Write-Host "  $k=$preview"
}

# Upload via SCP then sudo overwrite target
. "C:\Projects\Shopify\backend\scripts\ubuntu\_ubu-helper.ps1"
Write-Host ""
Write-Host "🚀 Upload ENV nach Ubuntu..." -ForegroundColor Cyan
CopyTo-Ubu -LocalPath $localOut -RemotePath "/tmp/rollladen-monitor.env.new"
Write-Host ""
Write-Host "🚀 Installiere ENV nach /etc/rollladen-monitor.env (chmod 600, Backup old!)" -ForegroundColor Cyan
$inst = @"
set -e
TS=$(date +%Y%m%d-%H%M%S)
F=/etc/rollladen-monitor.env
if [ -f "$F" ]; then
  cp "$F" "/etc/rollladen-monitor.env.BAK-$TS"
  echo "BACKUP: /etc/rollladen-monitor.env.BAK-$TS"
fi
cp /tmp/rollladen-monitor.env.new "$F"
chown root:root "$F"
chmod 600 "$F"
# Give service user read permission via ACL
setfacl -m u:rollladen:r "$F" 2>/dev/null || true
echo ""
echo "Installed file info:"
stat "$F"
echo ""
echo "Count SET lines: $(grep -vE '^#|^\s*$' "$F" | wc -l)"
echo ""
echo "FIRST 15 non-comment lines:"
grep -vE '^#|^\s*$' "$F" | head -n 15
echo "... [rest censored!]"
echo ""
echo "ENV_INSTALL_OK"
"@
$r = Invoke-UbuCmd $inst -Sudo -Timeout 60
$r.Output | ForEach-Object { Write-Host "  | $_" }
Write-Host ""
Write-Host "✅ Secrets Transfer abgeschlossen!" -ForegroundColor Green
exit 0
