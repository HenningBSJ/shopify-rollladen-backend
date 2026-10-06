[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"
Write-Host "Upload cloudflared test skript..."
CopyTo-Ubu -LocalPath (Join-Path $PSScriptRoot "_remote_task_cloudflared.sh") -RemotePath /tmp/cf.sh
Invoke-UbuCmd "chmod +x /tmp/cf.sh" | Out-Null
Write-Host "Ausführen als root (sudo) - Dauer ca 40-60 Sekunden..." -ForegroundColor Yellow
$oldPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
  $res = Invoke-UbuCmd -Sudo "bash /tmp/cf.sh 2>&1 ; echo CFEXIT=\$?" -Timeout 180 -ErrorAction SilentlyContinue
} catch {
  Write-Host "Catched (non-zero OK): $_" -ForegroundColor DarkGray
}
$ErrorActionPreference = $oldPref
if ($res) {
  $res.Output | ForEach-Object { Write-Host "  $_" }
  if ($res.Error) { $res.Error | ForEach-Object { Write-Host "  STDERR: $_" -ForegroundColor DarkRed } }
}
exit 0
