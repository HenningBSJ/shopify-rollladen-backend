param(
  [int]$Port = 3006,
  [string]$PublicBaseUrl = 'https://monitor.rollladenwelt.de',
  [int]$IntervalMinutes = 1,
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path "$PSScriptRoot\..").Path
$logScript = Join-Path $root 'scripts\log-availability.ps1'
$hiddenRunner = Join-Path $root 'scripts\run-hidden.vbs'
if (-not (Test-Path $logScript)) {
  throw "Fehlt: $logScript"
}
if (-not (Test-Path $hiddenRunner)) {
  throw "Fehlt: $hiddenRunner"
}

$taskName = 'Rollladen Availability Logger'

function Quote-TaskArg {
  param([string]$Value)
  return '"' + ([string]$Value -replace '"', '""') + '"'
}

function New-RepeatingTrigger {
  param([int]$Minutes)
  $start = (Get-Date).AddMinutes(1)
  return New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Minutes $Minutes) -RepetitionDuration (New-TimeSpan -Days 3650)
}

$wscript = (Get-Command wscript.exe).Source
$ps = (Get-Command powershell.exe).Source
$args = @(
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy', 'Bypass',
  '-File', $logScript,
  '-Port', $Port,
  '-PublicBaseUrl', $PublicBaseUrl
)

$actionArgs = @($hiddenRunner, $ps) + $args
$action = New-ScheduledTaskAction -Execute $wscript -Argument (($actionArgs | ForEach-Object { Quote-TaskArg $_ }) -join ' ') -WorkingDirectory $root
$trigger = New-RepeatingTrigger -Minutes $IntervalMinutes
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -Hidden
$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings

if ($WhatIf) {
  Write-Host ("[WhatIf] Wuerde Task installieren: {0}" -f $taskName)
  return
}

Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
Write-Host ("Task installiert/aktualisiert: {0}" -f $taskName)
