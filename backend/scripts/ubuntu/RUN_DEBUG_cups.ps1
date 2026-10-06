[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"
Write-Host "CUPS DEEP DEBUG (Job 12 + LogLevel debug + PDF Test direkt via lp!)" -ForegroundColor Cyan
CopyTo-Ubu -LocalPath (Join-Path $PSScriptRoot "RUN_DEBUG_cups_job_details.sh") -RemotePath /tmp/debug-cups2.sh
Invoke-UbuCmd "chmod +x /tmp/debug-cups2.sh" | Out-Null
$oldPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$res = Invoke-UbuCmd -Sudo "bash /tmp/debug-cups2.sh 2>&1" -Timeout 180
$ErrorActionPreference = $oldPref
$res.Output | ForEach-Object { Write-Host "  $_" }
if($res.Error){ $res.Error | ForEach-Object { Write-Host ("  STDERR: " + $_) -ForegroundColor DarkRed } }
exit 0
