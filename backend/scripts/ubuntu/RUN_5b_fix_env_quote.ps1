[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"
Write-Host "Schritt 1: Fix-Skript uploaden" -ForegroundColor Cyan
CopyTo-Ubu -LocalPath (Join-Path $PSScriptRoot "_remote_env_quote_fix.sh") -RemotePath /tmp/env_quote_fix.sh
Invoke-UbuCmd "chmod +x /tmp/env_quote_fix.sh" | Out-Null
Write-Host "Schritt 2: Fix ausfuehren (als root via sudo)" -ForegroundColor Cyan
$res = Invoke-UbuCmd -Sudo "/tmp/env_quote_fix.sh" -Timeout 30
$res.Output | ForEach-Object { Write-Host "  $_" }
Write-Host ""
Write-Host "Fix ExitStatus=$($res.ExitStatus)" -ForegroundColor $(if($res.ExitStatus -eq 0){'Green'}else{'Red'})
exit $res.ExitStatus
