# RUN_FIX_UBUNTU_CHROMIUM_TO_CHROME.ps1
[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$root = "C:\Projects\Shopify\backend\scripts\ubuntu"
. "$root\_ubu-helper.ps1"

$localSh  = "$root\_remote_fix_chromium.sh"
$remoteSh = "/tmp/_remote_fix_chromium.sh"

Write-Host ""
Write-Host "🐛  FIX: Snap-Chromium durch Google Chrome APT ersetzen (Ubuntu)" -ForegroundColor Magenta
Write-Host "    Dauer ~ 2-4 Min je nach Internetgeschwindigkeit"
Write-Host ""

Write-Host "[1/3] Upload Skript..."
CopyTo-Ubu -LocalPath $localSh -RemotePath $remoteSh -Overwrite
Invoke-UbuCmd "chmod +x '$remoteSh'" | Out-Null

Write-Host ""
Write-Host "[2/3] AUSFÜHREN (SUDO bash) - bitte warten (Install + Restart) ..." -ForegroundColor Magenta
# Allow 8 min Timeout (Download + Install)
$res = Invoke-UbuCmd "bash '$remoteSh'" -Sudo -Timeout 600

Write-Host ""
Write-Host ($res.Output -join "`r`n")
Write-Host ""

$chromeExeLine = ($res.Output -join "`n") | Select-String -Pattern '__CHROME_EXE__=(.+)'
if ($chromeExeLine -and $chromeExeLine.Matches.Count -gt 0) {
    $EXE = $chromeExeLine.Matches[0].Groups[1].Value.Trim()
    Write-Host "✅ CHROME EXTRACTED: $EXE" -ForegroundColor Green
}
Write-Host ""
Write-Host "✅ Fix abgeschlossen. Nächster Schritt: Smoke-Tests wiederholen!" -ForegroundColor Green
