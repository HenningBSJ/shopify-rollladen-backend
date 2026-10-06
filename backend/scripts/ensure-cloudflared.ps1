param(
  [string]$PublicHealthUrl = 'https://monitor.rollladenwelt.de/health',
  [string]$LocalHealthUrl = 'http://127.0.0.1:3006/health',
  [string]$ServiceName = 'cloudflared',
  [int]$TimeoutSec = 6,
  [int]$RetryDelaySec = 6,
  [switch]$WhatIf
)

$ErrorActionPreference = 'Continue'

$root = (Resolve-Path "$PSScriptRoot\..").Path
$logDir  = Join-Path $root 'data\uptime'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("ensure-cf-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))
try { Start-Transcript -Path $logFile -Append -ErrorAction SilentlyContinue | Out-Null } catch {}

Write-Host ("[{0}] ensure-cloudflared.ps1 gestartet" -f (Get-Date -Format 'HH:mm:ss'))

$repairScript = Join-Path $PSScriptRoot 'repair-cloudflared-service.ps1'

function Test-Endpoint {
  param(
    [string]$Url,
    [int]$RequestTimeoutSec = 6
  )

  if (-not $Url) { return $true }
  try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $RequestTimeoutSec
    return ($res.StatusCode -ge 200 -and $res.StatusCode -lt 300)
  } catch {
    return $false
  }
}

$publicOk = Test-Endpoint -Url $PublicHealthUrl -RequestTimeoutSec $TimeoutSec
if ($publicOk) {
  Write-Host "Cloudflare/oeffentlich ok. Kein Neustart noetig."
  return
}

$localOk = Test-Endpoint -Url $LocalHealthUrl -RequestTimeoutSec 3
if (-not $localOk) {
  Write-Host "Oeffentlich down, aber lokal auch nicht ok. Backend-Watchdog sollte separat greifen."
}

Write-Host "Oeffentlicher Health-Check fehlgeschlagen. Starte cloudflared neu..."

if ($WhatIf) {
  Write-Host ("[WhatIf] Wuerde Service neu starten: {0}" -f $ServiceName)
  return
}

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $svc) {
  Write-Host "Service '$ServiceName' nicht gefunden. Versuche automatische Reparatur..."
  if (-not (Test-Path $repairScript)) {
    $msg = "Repair-Skript nicht gefunden: $repairScript"
    Write-Error $msg
    try { Stop-Transcript | Out-Null } catch {}
    throw $msg
  }
  if ($WhatIf) {
    Write-Host "[WhatIf] Wuerde Repair-Skript ausfuehren: $repairScript"
  } else {
    & $repairScript -ErrorAction Stop
  }
  Start-Sleep -Seconds 3
  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if (-not $svc) {
    $msg = "Service '$ServiceName' auch nach Reparatur nicht vorhanden."
    Write-Error $msg
    try { Stop-Transcript | Out-Null } catch {}
    throw $msg
  }
}

if ($svc.StartType -ne 'Automatic') {
  try {
    Set-Service -Name $ServiceName -StartupType Automatic -ErrorAction Stop
    Write-Host "Service-StartType auf 'Automatic' korrigiert."
  } catch {
    Write-Warning ("Konnte StartType nicht auf Automatic setzen: " + $_.Exception.Message)
  }
}

try {
  Restart-Service -Name $ServiceName -Force -ErrorAction Stop
} catch {
  Write-Host "Restart-Service fehlgeschlagen, versuche Repair + harten Neustart..."
  if ((Test-Path $repairScript) -and -not $WhatIf) {
    try { & $repairScript -ErrorAction Stop } catch { Write-Warning ("Auto-Repair fehlgeschlagen: " + $_.Exception.Message) }
  }
  try {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Start-Service -Name $ServiceName -ErrorAction Stop
  } catch {
    try { Stop-Transcript | Out-Null } catch {}
    throw
  }
}

Start-Sleep -Seconds $RetryDelaySec
$publicAfter = Test-Endpoint -Url $PublicHealthUrl -RequestTimeoutSec $TimeoutSec
if (-not $publicAfter) {
  $msg = "cloudflared wurde neu gestartet, aber oeffentliche URL antwortet weiterhin nicht."
  Write-Error $msg
  try { Stop-Transcript | Out-Null } catch {}
  throw $msg
}

Write-Host ("[{0}] ensure-cloudflared.ps1 abgeschlossen. Oeffentliche URL antwortet wieder." -f (Get-Date -Format 'HH:mm:ss'))
try { Stop-Transcript | Out-Null } catch {}
