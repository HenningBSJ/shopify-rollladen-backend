# Korrigiert den Task "Rollladen Cloudflared (Boot-Start)" damit er statt repair-cloudflared-service.ps1
# nun ensure-cloudflared.ps1 aufruft (gleiches Verhalten wie Watchdog - Exit 0 wenn Service OK).
# ALS ADMINISTRATOR ausführen!
param(
    [string]$Root = '',
    [int]$DelaySeconds = 15,
    [string]$PublicHealthUrl = 'https://monitor.rollladenwelt.de/health',
    [string]$LocalHealthUrl = 'http://127.0.0.1:3006/health',
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

function Test-IsAdmin {
    $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
if (-not (Test-IsAdmin)) {
    Write-Host "[FEHLER] Als Administrator ausfuehren! (Rechtsklick PS -> Als Admin)" -ForegroundColor Red
    exit 1
}

if (-not $Root) {
    $Root = (Resolve-Path "$PSScriptRoot\..").Path
}
$taskName = 'Rollladen Cloudflared (Boot-Start)'
$ensureScript = Join-Path $Root 'scripts\ensure-cloudflared.ps1'
if (-not (Test-Path $ensureScript)) { throw "ensure-cloudflared.ps1 nicht gefunden: $ensureScript" }

function Quote-Arg([string]$v) { return '"' + ($v -replace '"','""') + '"' }
$psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path $psExe)) { $psExe = (Get-Command powershell.exe).Source }

$safeRoot = $Root -replace "'", "''"
$safeScript = $ensureScript -replace "'", "''"
$bootCmd = "& { Start-Sleep -Seconds $DelaySeconds ; Set-Location '$safeRoot' ; & '$safeScript' -LocalHealthUrl '$LocalHealthUrl' -PublicHealthUrl '$PublicHealthUrl' }"

$bootArgs = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden',
              '-Command', $bootCmd)
$argStr = ($bootArgs | ForEach-Object { Quote-Arg $_ }) -join ' '

Write-Host "Task: $taskName" -ForegroundColor Cyan
Write-Host "Neues Execute: $psExe"
Write-Host "Neues Argument (Anfang): " -NoNewline
Write-Host ($argStr.Substring(0, [Math]::Min(220, $argStr.Length)) + "...") -ForegroundColor Yellow

if ($WhatIf) {
    Write-Host "`n[WhatIf] Task Action wuerde jetzt geaendert werden. Starte Task testweise... (ohne WhatIf)"
    exit 0
}

try {
    $newAction = New-ScheduledTaskAction -Execute $psExe -Argument $argStr -WorkingDirectory $Root
    Set-ScheduledTask -TaskName $taskName -Action $newAction -ErrorAction Stop | Out-Null
    Write-Host "`n[OK] Task '$taskName' Action auf ensure-cloudflared.ps1 korrigiert." -ForegroundColor Green
} catch {
    Write-Host ("[FEHLER] Task konnte nicht aktualisiert werden: " + $_.Exception.Message) -ForegroundColor Red
    exit 2
}

Write-Host "`nStarte Task zur Verifikation..."
Start-ScheduledTask -TaskName $taskName
Write-Host "Warte $($DelaySeconds + 10)s auf Abschluss..."
Start-Sleep -Seconds ($DelaySeconds + 10)

$info = Get-ScheduledTaskInfo -TaskName $taskName
Write-Host ("`nLetzter Lauf : {0}" -f $info.LastRunTime)
Write-Host ("Letztes Ergebnis : {0}" -f $info.LastTaskResult) -NoNewline
if ([int]$info.LastTaskResult -eq 0) {
    Write-Host "  -> 0 (ERFOLG) " -ForegroundColor Green
} else {
    Write-Host "  -> !=0 (FEHLER) " -ForegroundColor Red
}
Write-Host "`nFalls LastTaskResult = 0 ist der Fix erfolgreich abgeschlossen!"
