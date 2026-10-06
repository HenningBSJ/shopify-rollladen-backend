param(
  [string]$ServiceName = 'cloudflared',
  [string]$TunnelName = 'rollladen-monitor',
  [string]$ConfigPath = '',
  [string]$CloudflaredExe = '',
  [int]$StartTimeoutSec = 20,
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path "$PSScriptRoot\..").Path
if (-not $ConfigPath) {
  $ConfigPath = Join-Path (Split-Path $root -Parent) 'cloudflared\config.yml'
}

function Get-ServiceQueryText {
  param([string]$Name)
  return (& sc.exe qc $Name | Out-String)
}

function Get-ServiceExeFromConfigText {
  param([string]$Text)
  $raw = [string]($Text | Select-String 'BINARY_PATH_NAME\s*:\s*(.+)$' | ForEach-Object { $_.Matches[0].Groups[1].Value } | Select-Object -First 1)
  if (-not $raw) { return '' }
  $quoted = [regex]::Match($raw, '^\s*"([^"]+\.exe)"')
  if ($quoted.Success) { return $quoted.Groups[1].Value }
  $plain = [regex]::Match($raw, '^\s*([^\s]+\.exe)')
  if ($plain.Success) { return $plain.Groups[1].Value }
  return ''
}

function Resolve-CloudflaredExe {
  param(
    [string]$ExplicitPath,
    [string]$ServiceConfigText
  )
  $candidates = @(
    $ExplicitPath,
    (Get-ServiceExeFromConfigText -Text $ServiceConfigText),
    (Get-Command cloudflared -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
    'C:\Users\bsjal\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe',
    'C:\Program Files (x86)\cloudflared\cloudflared.exe',
    'C:\Program Files\cloudflared\cloudflared.exe'
  ) | Where-Object { $_ }

  foreach ($candidate in $candidates) {
    $path = [string]$candidate
    if ($path -and (Test-Path $path)) {
      return (Resolve-Path $path).Path
    }
  }

  throw 'cloudflared.exe wurde nicht gefunden.'
}

function Get-ServiceState {
  param([string]$Name)
  $text = (& sc.exe queryex $Name | Out-String)
  $stateMatch = [regex]::Match($text, 'STATE\s*:\s*\d+\s+([A-Z_]+)')
  $pidMatch = [regex]::Match($text, 'PID\s*:\s*(\d+)')
  return [pscustomobject]@{
    Raw = $text
    State = $(if ($stateMatch.Success) { $stateMatch.Groups[1].Value } else { '' })
    Pid = $(if ($pidMatch.Success) { [int]$pidMatch.Groups[1].Value } else { 0 })
  }
}

function Wait-ServiceState {
  param(
    [string]$Name,
    [string]$ExpectedState,
    [int]$TimeoutSec = 20
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    $state = Get-ServiceState -Name $Name
    if ($state.State -eq $ExpectedState) {
      return $state
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  return (Get-ServiceState -Name $Name)
}

if (-not (Test-Path $ConfigPath)) {
  throw "Config nicht gefunden: $ConfigPath"
}

$serviceConfig = Get-ServiceQueryText -Name $ServiceName
$cloudflaredExe = Resolve-CloudflaredExe -ExplicitPath $CloudflaredExe -ServiceConfigText $serviceConfig
$desiredBinPath = ('"{0}" tunnel --config "{1}" run {2}' -f $cloudflaredExe, $ConfigPath, $TunnelName)

Write-Host ("cloudflared.exe: {0}" -f $cloudflaredExe)
Write-Host ("Config: {0}" -f $ConfigPath)
Write-Host ("Tunnel: {0}" -f $TunnelName)
Write-Host ("Neue Dienst-Commandline: {0}" -f $desiredBinPath)

if ($WhatIf) {
  Write-Host ("[WhatIf] Wuerde Dienst konfigurieren: {0}" -f $ServiceName)
  return
}

$configOut = & sc.exe config $ServiceName 'binPath=' $desiredBinPath 'start=' 'auto' 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
  throw ("Dienst-Konfiguration fehlgeschlagen: {0}" -f $configOut.Trim())
}
Write-Host ($configOut.Trim())

try {
  & sc.exe description $ServiceName "Named Cloudflare Tunnel fuer monitor.rollladenwelt.de via C:\Projects\Shopify\cloudflared\config.yml" | Out-Null
} catch {}

$before = Get-ServiceState -Name $ServiceName
if ($before.State -eq 'RUNNING') {
  try {
    Restart-Service -Name $ServiceName -Force -ErrorAction Stop
  } catch {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $mid = Get-ServiceState -Name $ServiceName
    if ($mid.State -eq 'STOP_PENDING' -and $mid.Pid -gt 0) {
      Stop-Process -Id $mid.Pid -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 1
    }
    Start-Service -Name $ServiceName -ErrorAction Stop
  }
} else {
  if ($before.State -eq 'STOP_PENDING' -and $before.Pid -gt 0) {
    Stop-Process -Id $before.Pid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }
  Start-Service -Name $ServiceName -ErrorAction Stop
}

$after = Wait-ServiceState -Name $ServiceName -ExpectedState 'RUNNING' -TimeoutSec $StartTimeoutSec
if ($after.State -ne 'RUNNING') {
  $stateLabel = if ($after.State) { $after.State } else { '<leer>' }
  throw ("Dienst ist nicht im Status RUNNING. Aktuell: {0}. sc queryex: {1}" -f $stateLabel, $after.Raw.Trim())
}

Write-Host ("Dienst laeuft wieder. PID {0}" -f $after.Pid)
