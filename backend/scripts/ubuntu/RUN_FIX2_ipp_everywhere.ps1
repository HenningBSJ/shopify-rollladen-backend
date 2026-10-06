[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"
Write-Host "IPP Everywhere Fix auf Ubuntu..." -ForegroundColor Cyan
CopyTo-Ubu -LocalPath (Join-Path $PSScriptRoot "RUN_FIX_cups_ipp_everywhere.sh") -RemotePath /tmp/fix2-ipp.sh
Invoke-UbuCmd "chmod +x /tmp/fix2-ipp.sh" | Out-Null
$oldPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$res = Invoke-UbuCmd -Sudo "bash /tmp/fix2-ipp.sh 2>&1" -Timeout 120
$ErrorActionPreference = $oldPref
$res.Output | ForEach-Object { Write-Host "  $_" }
if($res.Error){ $res.Error | ForEach-Object { Write-Host ("  STDERR: " + $_) -ForegroundColor DarkRed } }

Write-Host ""
Write-Host "ZUSATZ: sudo tail -50 /var/log/cups/error_log (UM DIREKT ZU SEHEN WAS CUPS MACHT!)" -ForegroundColor Yellow
$resLog = Invoke-UbuCmd -Sudo "tail -n 50 /var/log/cups/error_log 2>&1 ; echo '---CUPS ACCESS LOG---' ; tail -n 20 /var/log/cups/access_log 2>&1 || echo access_log nicht lesbar" -Timeout 30
$resLog.Output | ForEach-Object { Write-Host "  $_" }
if($resLog.Error){ $resLog.Error | ForEach-Object { Write-Host ("  STDERR LOG: " + $_) -ForegroundColor DarkRed } }
exit 0
