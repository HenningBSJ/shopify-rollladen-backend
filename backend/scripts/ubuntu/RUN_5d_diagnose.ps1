[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"
Write-Host "Upload Diagnose Skript..."
CopyTo-Ubu -LocalPath (Join-Path $PSScriptRoot "_remote_5d_diagnose.sh") -RemotePath /tmp/ph_diag.sh
Invoke-UbuCmd "chmod +x /tmp/ph_diag.sh" | Out-Null
Write-Host "Starte Diagnose..."
$oldPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
  $res = Invoke-UbuCmd -Sudo "sudo -u rollladen HOME=/var/lib/rollladen bash /tmp/ph_diag.sh 2>&1" -Timeout 120 -ErrorAction SilentlyContinue
} catch {
  Write-Host "Catched (harmless): $_" -ForegroundColor DarkGray
}
$ErrorActionPreference = $oldPref
if ($res) {
  $res.Output | ForEach-Object { Write-Host "  $_" }
  if ($res.Error) { $res.Error | ForEach-Object { Write-Host "  STDERR: $_" -ForegroundColor DarkRed } }
  Write-Host ""
  Write-Host "Remote Exit=$($res.ExitStatus)"
}
exit 0
