# RUN_START_UBUNTU_QUICKTUNNEL.ps1
# Upload + Ausführung von _remote_start_quicktunnel.sh auf Ubuntu.
# Extrahiert die Quick-Tunnel URL aus dem Output und speichert sie lokal für TASK 7+8.
[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"

$root = "C:\Projects\Shopify\backend\scripts\ubuntu"
. "$root\_ubu-helper.ps1"

$localSh  = "$root\_remote_start_quicktunnel.sh"
$remoteSh = "/tmp/_remote_start_quicktunnel.sh"
$urlCache = "$root\__quicktunnel_url.txt"

Write-Host ""
Write-Host "🚀  STARTE QUICK TUNNEL (Ubuntu Testbetrieb, konfliktfrei *.trycloudflare.com) " -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] Upload Skript → $remoteSh ..."
CopyTo-Ubu -LocalPath $localSh -RemotePath $remoteSh -Overwrite

Write-Host ""
Write-Host "[2/3] chmod +x ..."
Invoke-UbuCmd "chmod +x '$remoteSh'" | Out-Null

Write-Host ""
Write-Host "[3/3] AUSFÜHREN (bis zu 45s warten, weil URL im Log braucht Zeit) ..." -ForegroundColor Cyan
$res = Invoke-UbuCmd "bash '$remoteSh'" -Timeout 60

Write-Host ""
Write-Host ($res.Output -join "`r`n")
Write-Host ""

# URL extrahieren und speichern
$urlLine = ($res.Output -join "`n") | Select-String -Pattern '__QUICKTUNNEL_URL__=(.+)'
if ($urlLine -and $urlLine.Matches.Count -gt 0) {
    $URL = $urlLine.Matches[0].Groups[1].Value.Trim()
    # PowerShell 5 Kompatibilität: UTF8NoBOM gibt es nicht.
    # Nutze .NET File.WriteAllText für echten UTF8 NO BOM
    [System.IO.File]::WriteAllText($urlCache, $URL, (New-Object System.Text.UTF8Encoding $false))
    Write-Host ""
    Write-Host "💾  URL gespeichert in: $urlCache" -ForegroundColor Green
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "  ✅ QUICK TUNNEL LIVE → $URL"                           -ForegroundColor Green
    Write-Host "     Monitor    : $URL/display"                          -ForegroundColor Green
    Write-Host "     Print-Health: $URL/display/print-health (Basic Auth)"-ForegroundColor Green
    Write-Host "     PDF-Only    : $URL/pdf-only"                        -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    $env:QT_URL = $URL
} else {
    Write-Warning "WARNUNG: __QUICKTUNNEL_URL__ Zeile nicht gefunden. Bitte manuell aus Output oben entnehmen."
}
