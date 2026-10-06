[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"
Write-Host "Upload Task 6 Print Test Skript..."
CopyTo-Ubu -LocalPath (Join-Path $PSScriptRoot "_remote_task6_print_test.sh") -RemotePath /tmp/t6.sh
Invoke-UbuCmd "chmod +x /tmp/t6.sh" | Out-Null
Write-Host "Ausfuehren als rollladen User (Gruppe lp/lpadmin) via sudo root -> sudo -u rollladen:"
$oldPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
  $res = Invoke-UbuCmd -Sudo "bash -c 'sudo -u rollladen HOME=/var/lib/rollladen /tmp/t6.sh 2>&1 ; echo T6EXIT=\$?'" -Timeout 120 -ErrorAction SilentlyContinue
} catch {
  Write-Host "Catched: $_" -ForegroundColor DarkGray
}
$ErrorActionPreference = $oldPref
if ($res) {
  $res.Output | ForEach-Object { Write-Host "  $_" }
  if ($res.Error) { $res.Error | ForEach-Object { Write-Host "  STDERR: $_" -ForegroundColor DarkRed } }
}
exit 0
