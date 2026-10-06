param(
  [int]$Port = 3006,
  [string]$PublicHealthUrl = 'https://monitor.rollladenwelt.de/health',
  [int]$BackendIntervalMinutes = 5,
  [int]$TunnelIntervalMinutes = 2,
  [switch]$SkipTunnel,
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path "$PSScriptRoot\..").Path
$backendScript = Join-Path $root 'scripts\ensure-backend.ps1'
$tunnelScript = Join-Path $root 'scripts\ensure-cloudflared.ps1'
$hiddenRunner = Join-Path $root 'scripts\run-hidden.vbs'

if (-not (Test-Path $backendScript)) { throw "Fehlt: $backendScript" }
if (-not (Test-Path $tunnelScript)) { throw "Fehlt: $tunnelScript" }
if (-not (Test-Path $hiddenRunner)) { throw "Fehlt: $hiddenRunner" }

$taskBackendName = 'Rollladen Backend Watchdog'
$taskTunnelName = 'Rollladen Cloudflared Watchdog'

function Quote-TaskArg {
  param([string]$Value)
  return '"' + ([string]$Value -replace '"', '""') + '"'
}

function New-RepeatingTrigger {
  param([int]$Minutes)
  $start = (Get-Date).AddMinutes(1)
  return New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Minutes $Minutes) -RepetitionDuration (New-TimeSpan -Days 3650)
}

function Install-Task {
  param(
    [string]$Name,
    [Microsoft.Management.Infrastructure.CimInstance]$Action,
    [Microsoft.Management.Infrastructure.CimInstance]$Trigger,
    [Microsoft.Management.Infrastructure.CimInstance]$Principal
  )

  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -Hidden
  $task = New-ScheduledTask -Action $Action -Trigger $Trigger -Principal $Principal -Settings $settings

  if ($WhatIf) {
    Write-Host ("[WhatIf] Wuerde Task installieren: {0}" -f $Name)
    return
  }

  try {
    Register-ScheduledTask -TaskName $Name -InputObject $task -Force | Out-Null
    Write-Host ("Task installiert/aktualisiert: {0}" -f $Name)
  } catch {
    Write-Warning ("Task konnte nicht installiert werden: {0}. {1}" -f $Name, $_.Exception.Message)
  }
}

$wscript = (Get-Command wscript.exe).Source
$ps = (Get-Command powershell.exe).Source

$backendArgs = @(
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy', 'Bypass',
  '-File', $backendScript,
  '-Port', $Port,
  '-LocalHealthUrl', ("http://127.0.0.1:{0}/health" -f $Port),
  '-PublicHealthUrl', $PublicHealthUrl
)

$tunnelArgs = @(
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy', 'Bypass',
  '-File', $tunnelScript,
  '-PublicHealthUrl', $PublicHealthUrl,
  '-LocalHealthUrl', ("http://127.0.0.1:{0}/health" -f $Port)
)

$backendActionArgs = @($hiddenRunner, $ps) + $backendArgs
$tunnelActionArgs = @($hiddenRunner, $ps) + $tunnelArgs
$backendAction = New-ScheduledTaskAction -Execute $wscript -Argument (($backendActionArgs | ForEach-Object { Quote-TaskArg $_ }) -join ' ') -WorkingDirectory $root
$tunnelAction = New-ScheduledTaskAction -Execute $wscript -Argument (($tunnelActionArgs | ForEach-Object { Quote-TaskArg $_ }) -join ' ') -WorkingDirectory $root

$backendTrigger = New-RepeatingTrigger -Minutes $BackendIntervalMinutes
$tunnelTrigger = New-RepeatingTrigger -Minutes $TunnelIntervalMinutes

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$backendPrincipal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$tunnelPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Install-Task -Name $taskBackendName -Action $backendAction -Trigger $backendTrigger -Principal $backendPrincipal
if (-not $SkipTunnel) {
  Install-Task -Name $taskTunnelName -Action $tunnelAction -Trigger $tunnelTrigger -Principal $tunnelPrincipal
} else {
  Write-Host "Tunnel-Watchdog uebersprungen."
}

Write-Host "Fertig."
