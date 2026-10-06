[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"
Write-Host "Upload CF Config Fix Skript..."
CopyTo-Ubu -LocalPath (Join-Path $PSScriptRoot "_remote_cf_fix_config.sh") -RemotePath /tmp/cf_fix.sh
Invoke-UbuCmd "chmod +x /tmp/cf_fix.sh" | Out-Null
Write-Host "Ausführen als root (sudo) - Dauer ~ 30 Sekunden" -ForegroundColor Yellow
$oldPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
  $res = Invoke-UbuCmd -Sudo "bash /tmp/cf_fix.sh 2>&1 ; echo CFIXEXIT=\$?" -Timeout 120 -ErrorAction SilentlyContinue
} catch {
  Write-Host "Catched (non-zero permitted): $_" -ForegroundColor DarkGray
}
$ErrorActionPreference = $oldPref
if ($res) {
  $res.Output | ForEach-Object { Write-Host "  $_" }
  if ($res.Error) { $res.Error | ForEach-Object { Write-Host "  STDERR: $_" -ForegroundColor DarkRed } }
}
exit 0
