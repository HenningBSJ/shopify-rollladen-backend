param(
  [int]$Port = 3006,
  [string]$LocalHealthUrl = '',
  [string]$PublicHealthUrl = '',
  [int]$TimeoutSec = 4,
  [int]$PublicRetryDelaySec = 6,
  [switch]$UseWatch,
  [switch]$WhatIf
)

$ErrorActionPreference = 'Continue'

$root = (Resolve-Path "$PSScriptRoot\..").Path
$logDir  = Join-Path $root 'data\uptime'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("ensure-backend-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))
try { Start-Transcript -Path $logFile -Append -ErrorAction SilentlyContinue | Out-Null } catch {}

function Ensure-SystemPath {
  $nodeCandidates = @(
    (Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
    'C:\Program Files\nodejs\node.exe',
    'C:\Program Files (x86)\nodejs\node.exe'
  ) | Where-Object { $_ -and (Test-Path $_) }
  foreach ($n in $nodeCandidates) {
    $nodeDir = Split-Path ([string]$n) -Parent
    if ($nodeDir -and ($env:PATH -split ';' -notcontains $nodeDir)) {
      $env:PATH = "$nodeDir;$env:PATH"
    }
  }
}
Ensure-SystemPath

Write-Host ("[{0}] ensure-backend.ps1 gestartet (Port={1})" -f (Get-Date -Format 'HH:mm:ss'), $Port)

$restartScript = Join-Path $PSScriptRoot 'restart-backend.ps1'
if (-not (Test-Path $restartScript)) {
  $msg = "Restart-Skript nicht gefunden: $restartScript"
  Write-Error $msg
  try { Stop-Transcript | Out-Null } catch {}
  throw $msg
}

if (-not $LocalHealthUrl) {
  $LocalHealthUrl = "http://127.0.0.1:$Port/health"
}

function Test-Endpoint {
  param(
    [string]$Url,
    [int]$RequestTimeoutSec = 4
  )

  if (-not $Url) {
    return [pscustomobject]@{
      Url = ''
      Ok = $true
      Status = 'skipped'
      Detail = ''
    }
  }

  try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $RequestTimeoutSec
    return [pscustomobject]@{
      Url = $Url
      Ok = ($res.StatusCode -ge 200 -and $res.StatusCode -lt 300)
      Status = [string]$res.StatusCode
      Detail = ''
    }
  } catch {
    $statusCode = ''
    try {
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
        $statusCode = [string][int]$_.Exception.Response.StatusCode
      }
    } catch {}

    return [pscustomobject]@{
      Url = $Url
      Ok = $false
      Status = $(if ($statusCode) { $statusCode } else { 'network' })
      Detail = $_.Exception.Message
    }
  }
}

$local = Test-Endpoint -Url $LocalHealthUrl -RequestTimeoutSec $TimeoutSec
$public = Test-Endpoint -Url $PublicHealthUrl -RequestTimeoutSec $TimeoutSec

if ($local.Ok -and $public.Ok) {
  Write-Host "Backend-Pruefung ok. Kein Neustart noetig."
  return
}

if (-not $local.Ok) {
  Write-Host ("Lokaler Health-Check fehlgeschlagen: {0} [{1}] {2}" -f $local.Url, $local.Status, $local.Detail)
}
if ($PublicHealthUrl -and -not $public.Ok) {
  Write-Host ("Oeffentlicher Check fehlgeschlagen: {0} [{1}] {2}" -f $public.Url, $public.Status, $public.Detail)
}

Write-Host "Starte Backend neu..."
& $restartScript -Port $Port -UseWatch:$UseWatch -WhatIf:$WhatIf

if ($WhatIf) {
  Write-Host "[WhatIf] Trockenlauf beendet."
  return
}

$localAfter = Test-Endpoint -Url $LocalHealthUrl -RequestTimeoutSec $TimeoutSec
if (-not $localAfter.Ok) {
  $msg = ("Backend nach Neustart weiterhin nicht erreichbar: {0} [{1}] {2}" -f $localAfter.Url, $localAfter.Status, $localAfter.Detail)
  Write-Error $msg
  try { Stop-Transcript | Out-Null } catch {}
  throw $msg
}

if ($PublicHealthUrl) {
  Start-Sleep -Seconds $PublicRetryDelaySec
  $publicAfter = Test-Endpoint -Url $PublicHealthUrl -RequestTimeoutSec $TimeoutSec
  if (-not $publicAfter.Ok) {
    Write-Warning ("Backend lokal ok, aber oeffentliche URL antwortet noch nicht: {0} [{1}] {2}" -f $publicAfter.Url, $publicAfter.Status, $publicAfter.Detail)
  } else {
    Write-Host ("[{0}] Oeffentliche URL antwortet wieder." -f (Get-Date -Format 'HH:mm:ss'))
  }
}

Write-Host ("[{0}] ensure-backend.ps1 Health-Check abgeschlossen." -f (Get-Date -Format 'HH:mm:ss'))
try { Stop-Transcript | Out-Null } catch {}
