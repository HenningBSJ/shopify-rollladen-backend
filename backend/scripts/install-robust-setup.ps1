param(
  [int]$Port = 3006,
  [string]$PublicHealthUrl = 'https://monitor.rollladenwelt.de/health',
  [int]$BackendIntervalMinutes = 5,
  [int]$TunnelIntervalMinutes = 2,
  [switch]$SkipUninstallOld,
  [switch]$SkipTunnel,
  [switch]$WhatIf
)

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $WhatIf) {
  Write-Host "Automatische Admin-Elevation erforderlich..." -ForegroundColor Yellow
  $argList = @('-NoProfile','-ExecutionPolicy','Bypass','-File', ("'{0}'" -f $PSCommandPath))
  foreach ($k in @('Port','PublicHealthUrl','BackendIntervalMinutes','TunnelIntervalMinutes')) {
    $v = Get-Variable -Name $k -ValueOnly -ErrorAction SilentlyContinue
    if ($v -ne $null -and $v -ne '') { $argList += " -$k `"$v`"" }
  }
  if ($SkipUninstallOld) { $argList += ' -SkipUninstallOld' }
  if ($SkipTunnel) { $argList += ' -SkipTunnel' }
  $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList ($argList -join ' ') -Verb RunAs -Wait -PassThru -WindowStyle Normal
  exit $proc.ExitCode
}

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path "$PSScriptRoot\..").Path
$backendRestart  = Join-Path $root 'scripts\restart-backend.ps1'
$backendEnsure   = Join-Path $root 'scripts\ensure-backend.ps1'
$cfEnsure        = Join-Path $root 'scripts\ensure-cloudflared.ps1'
$cfRepair        = Join-Path $root 'scripts\repair-cloudflared-service.ps1'

foreach ($f in @($backendRestart,$backendEnsure,$cfEnsure,$cfRepair)) {
  if (-not (Test-Path $f)) { throw "Fehlt Skript: $f" }
}

$psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path $psExe)) { $psExe = (Get-Command powershell.exe).Source }

$taskBackendBoot   = 'Rollladen Backend (Boot-Start)'
$taskBackendWatch  = 'Rollladen Backend Watchdog'
$taskCfBoot        = 'Rollladen Cloudflared (Boot-Start)'
$taskCfWatch       = 'Rollladen Cloudflared Watchdog'
$legacyTasks       = @('Rollladen Backend Watchdog','Rollladen Cloudflared Watchdog')

function Quote-Arg([string]$v) { return '"' + ($v -replace '"','""') + '"' }

function New-CommonSettings {
  return New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -DontStopOnIdleEnd `
    -MultipleInstances IgnoreNew `
    -Hidden `
    -Compatibility Win8 `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0)
}

$principalSystem = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

function Install-Task(
  [string]$Name,
  [Microsoft.Management.Infrastructure.CimInstance]$Action,
  [Microsoft.Management.Infrastructure.CimInstance[]]$Triggers,
  [string]$Description
) {
  $settings = New-CommonSettings
  $task = New-ScheduledTask -Action $Action -Trigger $Triggers -Principal $principalSystem -Settings $settings -Description $Description

  if ($WhatIf) {
    Write-Host ("[WhatIf] Wuerde Task anlegen: {0}" -f $Name)
    return
  }

  try {
    Register-ScheduledTask -TaskName $Name -InputObject $task -Force -ErrorAction Stop | Out-Null
    Write-Host ("[OK] Task installiert/aktualisiert: {0}" -f $Name)
  } catch {
    Write-Warning ("Task konnte nicht installiert werden: {0}. {1}" -f $Name, $_.Exception.Message)
  }
}

function Uninstall-Task([string]$Name) {
  try {
    $exists = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
    if ($exists) {
      if ($WhatIf) {
        Write-Host ("[WhatIf] Wuerde Task entfernen: {0} (aktueller Principal: {1}, LogonType: {2})" -f $Name, $exists.Principal.UserId, $exists.Principal.LogonType)
      } else {
        Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction Stop
        Write-Host ("[-] Alter Task entfernt: {0}" -f $Name)
      }
    }
  } catch {
    Write-Warning ("Task-Entfernung fehlgeschlagen fuer {0}: {1}" -f $Name, $_.Exception.Message)
  }
}

Clear-Host
Write-Host "==============================================================================="
Write-Host "  Robustes Setup: Backend + Cloudflared   (laeuft OHNE Login, SYSTEM-Account)"
Write-Host "==============================================================================="
Write-Host ("Backend-Port      : {0}" -f $Port)
Write-Host ("Oeffentliche URL  : {0}" -f $PublicHealthUrl)
Write-Host ("Watchdog Backend  : alle {0} Minuten" -f $BackendIntervalMinutes)
Write-Host ("Watchdog Tunnel   : alle {0} Minuten" -f $TunnelIntervalMinutes)
Write-Host ("Tasks laufen als  : SYSTEM (benoetigt KEINEN Benutzer-Login!)" -f $TunnelIntervalMinutes)
Write-Host ""

if (-not $SkipUninstallOld) {
  Write-Host "--- Alte Interactive-Tasks entfernen (von install-watchdogs.ps1) ---"
  foreach ($lt in $legacyTasks) { Uninstall-Task -Name $lt }
  Write-Host ""
}

Write-Host "--- Trigger vorbereiten ---"
$bootTriggerBackend = New-ScheduledTaskTrigger -AtStartup
Write-Host ("* Boot-Trigger (Backend): AtStartup, Delay 25s (im Command eingebaut)")

$bootTriggerCf = New-ScheduledTaskTrigger -AtStartup
Write-Host ("* Boot-Trigger (Cloudflared): AtStartup, Delay 15s (im Command eingebaut)")

$watchTriggerBackend = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
  -RepetitionInterval (New-TimeSpan -Minutes $BackendIntervalMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
Write-Host ("* Watchdog-Trigger (Backend): alle {0} Minuten" -f $BackendIntervalMinutes)

$watchTriggerCf = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $TunnelIntervalMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
Write-Host ("* Watchdog-Trigger (Cloudflared): alle {0} Minuten" -f $TunnelIntervalMinutes)

function Build-BootCommand([string]$ScriptPath, [int]$DelaySeconds, [string[]]$ScriptArgs = @()) {
  $safeScript = $ScriptPath -replace "'", "''"
  $argList = if ($ScriptArgs.Count) {
    ($ScriptArgs | ForEach-Object {
      if ($_ -match '\s') { "'" + ($_ -replace "'", "''") + "'" } else { $_ }
    }) -join ' '
  } else { '' }
  return "& { Start-Sleep -Seconds $DelaySeconds ; Set-Location '$($root -replace "'","''")' ; & '$safeScript' $argList }"
}

Write-Host ""
Write-Host "--- Tasks anlegen ---"

$backendBootCmd = Build-BootCommand -ScriptPath $backendRestart -DelaySeconds 25 -ScriptArgs @('-Port', $Port, '-UseWatch')
$backendBootArgs = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden',
                     '-Command', $backendBootCmd)
$backendBootAction = New-ScheduledTaskAction -Execute $psExe `
  -Argument (($backendBootArgs | ForEach-Object { Quote-Arg $_ }) -join ' ') `
  -WorkingDirectory $root
Install-Task -Name $taskBackendBoot -Action $backendBootAction -Triggers @($bootTriggerBackend) `
  -Description ('Startet Node.js Backend 25s nach Rechnerstart (OHNE Login!). Port={0}' -f $Port)

$backendWatchArgs = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden',
                      '-File', $backendEnsure, '-Port', $Port,
                      '-LocalHealthUrl', ("http://127.0.0.1:{0}/health" -f $Port),
                      '-PublicHealthUrl', $PublicHealthUrl)
$backendWatchAction = New-ScheduledTaskAction -Execute $psExe `
  -Argument (($backendWatchArgs | ForEach-Object { Quote-Arg $_ }) -join ' ') `
  -WorkingDirectory $root
Install-Task -Name $taskBackendWatch -Action $backendWatchAction -Triggers @($watchTriggerBackend) `
  -Description ('Ueberwacht Backend alle {0} Min, startet neu bei Ausfall.' -f $BackendIntervalMinutes)

if (-not $SkipTunnel) {
  $cfBootCmd = Build-BootCommand -ScriptPath $cfEnsure -DelaySeconds 15
  $cfBootArgs = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden',
                  '-Command', $cfBootCmd)
  $cfBootAction = New-ScheduledTaskAction -Execute $psExe `
    -Argument (($cfBootArgs | ForEach-Object { Quote-Arg $_ }) -join ' ') `
    -WorkingDirectory $root
  Install-Task -Name $taskCfBoot -Action $cfBootAction -Triggers @($bootTriggerCf) `
    -Description 'Prueft Cloudflared 15s nach Boot (Public Health). Wenn down -> automatische Reparatur + Neustart (OHNE Login!).'

  $cfWatchArgs = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden',
                   '-File', $cfEnsure,
                   '-LocalHealthUrl', ("http://127.0.0.1:{0}/health" -f $Port),
                   '-PublicHealthUrl', $PublicHealthUrl)
  $cfWatchAction = New-ScheduledTaskAction -Execute $psExe `
    -Argument (($cfWatchArgs | ForEach-Object { Quote-Arg $_ }) -join ' ') `
    -WorkingDirectory $root
  Install-Task -Name $taskCfWatch -Action $cfWatchAction -Triggers @($watchTriggerCf) `
    -Description ('Ueberwacht Cloudflared-Tunnel alle {0} Min, repariert/startet neu.' -f $TunnelIntervalMinutes)
}

Write-Host ""
Write-Host "--- Uebersicht installierter Tasks ---"
Get-ScheduledTask | Where-Object { $_.TaskName -like 'Rollladen*' } | Sort-Object TaskName |
  Format-Table TaskName, State, @{N='User';E={$_.Principal.UserId}}, @{N='LogonType';E={$_.Principal.LogonType}}, Author -AutoSize

Write-Host ""
Write-Host "=== ERLEDIGT. ==="
Write-Host ""
Write-Host "WAS JETZT PASSIERT (kein Benutzer-Login mehr noetig!):"
Write-Host " * Nach REBOOT des Rechners (auch ohne Einloggen!) startet:"
Write-Host "    - nach 15s:  Cloudflared-Dienst (via repair-cloudflared-service.ps1 -> StartType=Automatic)"
Write-Host "    - nach 25s:  Node.js Backend auf Port $Port"
Write-Host " * Alle 2 Minuten:  Cloudflared-Ueberwachung (oeffentliche URL prueft -> Reparatur/Neustart)"
Write-Host " * Alle 5 Minuten:  Backend-Ueberwachung (lokal + oeffentlich -> Neustart bei Ausfall)"
Write-Host ""
Write-Host "Logs unter:  $root\data\uptime\"
Write-Host "             backend-YYYYMMDD.log    (Starten/Neustarten des Backends)"
Write-Host "             ensure-backend-*.log    (Watchdog Pruefungen Backend)"
Write-Host "             ensure-cf-*.log         (Watchdog Pruefungen Cloudflared)"
Write-Host ""
Write-Host "KONTROLLE (jetzt sofort):"
Write-Host "   Get-ScheduledTask | ? TaskName -like 'Rollladen*' | ft -AutoSize"
Write-Host "   # Manueller Test der Boot-Tasks (ohne Neustart):"
Write-Host "   Start-ScheduledTask '$taskCfBoot' ; Start-Sleep 3 ; Start-ScheduledTask '$taskBackendBoot'"
Write-Host ""

# Wenn via Auto-Elevation gestartet (Admin-Fenster offen), Pause zum Lesen
if ($isAdmin -and -not $WhatIf -and [Environment]::UserInteractive) {
  Write-Host "Fenster kann geschlossen werden. Beliebige Taste druecken..." -ForegroundColor Cyan
  try { $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') } catch { Start-Sleep -Seconds 3 }
}
