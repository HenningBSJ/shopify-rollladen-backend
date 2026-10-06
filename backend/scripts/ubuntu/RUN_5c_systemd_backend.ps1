[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"
Write-Host "Schritt 1: Upload remote start-systemd.sh" -ForegroundColor Cyan
CopyTo-Ubu -LocalPath (Join-Path $PSScriptRoot "_remote_start_systemd.sh") -RemotePath /tmp/start_systemd.sh
Invoke-UbuCmd "chmod +x /tmp/start_systemd.sh" | Out-Null
Write-Host "Schritt 2: Als root ausfuehren (sudo)" -ForegroundColor Cyan
$res = Invoke-UbuCmd -Sudo "/tmp/start_systemd.sh" -Timeout 90
$res.Output | ForEach-Object { Write-Host "  $_" }
Write-Host ""
Write-Host "ExitStatus=$($res.ExitStatus)" -ForegroundColor $(if($res.ExitStatus -eq 0){'Green'}else{'Red'})
exit $res.ExitStatus
