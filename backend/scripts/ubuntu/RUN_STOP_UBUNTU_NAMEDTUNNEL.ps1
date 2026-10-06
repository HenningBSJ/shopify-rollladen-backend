# RUN_STOP_UBUNTU_NAMEDTUNNEL.ps1
# Lädt _ubu-helper.ps1, uploaded _remote_stop_ubuntu_namedtunnel.sh via SCP nach /tmp,
# führt es SUDO-aus und zeigt die Verification an.
[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"

$root = "C:\Projects\Shopify\backend\scripts\ubuntu"
. "$root\_ubu-helper.ps1"

$localSh  = "$root\_remote_stop_ubuntu_namedtunnel.sh"
$remoteSh = "/tmp/_remote_stop_ubuntu_namedtunnel.sh"

Write-Host ""
Write-Host "🛑  SOFORT-STOP UBUNTU NAMED-TUNNEL (monitor.rollladenwelt.de Domain-Kollision) " -ForegroundColor Red
Write-Host ""

Write-Host "[1/3] Upload Stop-Skript nach Ubuntu → $remoteSh ..." -ForegroundColor Cyan
CopyTo-Ubu -LocalPath $localSh -RemotePath $remoteSh -Overwrite

Write-Host ""
Write-Host "[2/3] Setze +x auf Remote-Skript ..." -ForegroundColor Cyan
Invoke-UbuCmd "chmod +x '$remoteSh'" | Out-Null

Write-Host ""
Write-Host "[3/3] AUSFÜHREN SUDO bash $remoteSh (Stop, Disable, pkill, Verify) ..." -ForegroundColor Cyan
$res = Invoke-UbuCmd "bash '$remoteSh'" -Sudo
Write-Host ""
Write-Host ($res.Output -join "`r`n")
Write-Host ""
Write-Host "✅ Local ExitCode = $($res.ExitStatus)" -ForegroundColor Green
