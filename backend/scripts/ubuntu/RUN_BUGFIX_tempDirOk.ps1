[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"
Write-Host "Step 1: Upload files to Ubuntu" -ForegroundColor Cyan
$srcDisplay = Join-Path (Resolve-Path "$PSScriptRoot\..\..\src\routes").Path "display.js"
Write-Host "  Source display.js: $srcDisplay"
CopyTo-Ubu -LocalPath $srcDisplay -RemotePath /tmp/display.js-hotfix
CopyTo-Ubu -LocalPath (Join-Path $PSScriptRoot "_remote_hotfix_displayjs.sh") -RemotePath /tmp/hotfix.sh
Invoke-UbuCmd "chmod +x /tmp/hotfix.sh" | Out-Null
Write-Host "Step 2: Run hotfix as root (sudo)" -ForegroundColor Yellow
$oldPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$res = $null
try {
  $res = Invoke-UbuCmd -Sudo "bash /tmp/hotfix.sh 2>&1 ; echo HFIX_EXIT=\$?" -Timeout 180 -ErrorAction SilentlyContinue
} catch {
  Write-Host "Exception OK (non-zero allowed for analysis): $_" -ForegroundColor DarkGray
}
$ErrorActionPreference = $oldPref
if ($res) {
  $res.Output | ForEach-Object { Write-Host "  $_" }
  if ($res.Error) { $res.Error | ForEach-Object { Write-Host "  STDERR: $_" -ForegroundColor DarkRed } }
  Write-Host ""
  Write-Host "Posh Exit=$($res.ExitStatus) - Beachte HFIX_EXIT Zeile für Bash-Exit" -ForegroundColor Cyan
}
exit 0
