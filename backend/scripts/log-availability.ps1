param(
  [int]$Port = 3006,
  [string]$PublicBaseUrl = 'https://monitor.rollladenwelt.de',
  [string]$LogDir = '',
  [int]$TimeoutSec = 6
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path "$PSScriptRoot\..").Path
if (-not $LogDir) {
  $LogDir = Join-Path $root 'data\uptime'
}

$checksFile = Join-Path $LogDir 'availability-checks.ndjson'
$incidentsFile = Join-Path $LogDir 'availability-incidents.ndjson'
$stateFile = Join-Path $LogDir 'availability-state.json'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function ConvertTo-CompactJson {
  param([object]$InputObject)
  return ($InputObject | ConvertTo-Json -Depth 10 -Compress)
}

function Append-NdjsonLine {
  param(
    [string]$Path,
    [object]$Data
  )
  Add-Content -Path $Path -Value (ConvertTo-CompactJson $Data)
}

function Load-State {
  if (-not (Test-Path $stateFile)) {
    return @{ endpoints = @{} }
  }
  try {
    $raw = Get-Content -Raw -Path $stateFile
    $obj = $raw | ConvertFrom-Json -Depth 10
    $map = @{}
    if ($obj.endpoints) {
      foreach ($prop in $obj.endpoints.PSObject.Properties) {
        $map[$prop.Name] = @{
          lastOk = [bool]$prop.Value.lastOk
          incidentStartedAt = [string]$prop.Value.incidentStartedAt
        }
      }
    }
    return @{ endpoints = $map }
  } catch {
    return @{ endpoints = @{} }
  }
}

function Save-State {
  param([hashtable]$State)
  $payload = @{
    savedAt = (Get-Date).ToUniversalTime().ToString('o')
    endpoints = $State.endpoints
  }
  Set-Content -Path $stateFile -Value (ConvertTo-CompactJson $payload)
}

function Test-Endpoint {
  param(
    [string]$Name,
    [string]$Url,
    [ValidateSet('health','page')]
    [string]$Kind,
    [int]$RequestTimeoutSec = 6
  )

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $RequestTimeoutSec
    $sw.Stop()
    $statusCode = [int]$res.StatusCode
    $content = ''
    try { $content = [string]$res.Content } catch {}
    $ok = $false
    if ($Kind -eq 'health') {
      $ok = ($statusCode -ge 200 -and $statusCode -lt 300 -and $content -match '"status"\s*:\s*"ok"')
    } else {
      $ok = ($statusCode -ge 200 -and $statusCode -lt 400)
    }
    return [pscustomobject]@{
      endpoint = $Name
      url = $Url
      ok = $ok
      status = [string]$statusCode
      detail = ''
      latencyMs = [int]$sw.ElapsedMilliseconds
    }
  } catch {
    $sw.Stop()
    $statusCode = ''
    $detail = $_.Exception.Message
    try {
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
        $statusCode = [string][int]$_.Exception.Response.StatusCode
      }
      if ($_.Exception.Response -and $_.Exception.Response.Headers.Location) {
        $detail = 'redirect:' + [string]$_.Exception.Response.Headers.Location
      }
    } catch {}

    $ok = $false
    if ($Kind -eq 'page' -and $statusCode) {
      $statusNumber = [int]$statusCode
      $ok = ($statusNumber -ge 200 -and $statusNumber -lt 400)
    }

    return [pscustomobject]@{
      endpoint = $Name
      url = $Url
      ok = $ok
      status = $(if ($statusCode) { $statusCode } else { 'network' })
      detail = $detail
      latencyMs = [int]$sw.ElapsedMilliseconds
    }
  }
}

$timestamp = (Get-Date).ToUniversalTime().ToString('o')
$publicBase = [string]$PublicBaseUrl.TrimEnd('/')

$checks = @(
  @{ name = 'local-health'; url = "http://127.0.0.1:$Port/health"; kind = 'health' },
  @{ name = 'public-health'; url = "$publicBase/health"; kind = 'health' },
  @{ name = 'public-display'; url = "$publicBase/display"; kind = 'page' },
  @{ name = 'public-intake'; url = "$publicBase/intake"; kind = 'page' }
)

$state = Load-State

foreach ($cfg in $checks) {
  $result = Test-Endpoint -Name $cfg.name -Url $cfg.url -Kind $cfg.kind -RequestTimeoutSec $TimeoutSec

  Append-NdjsonLine -Path $checksFile -Data @{
    ts = $timestamp
    endpoint = $result.endpoint
    url = $result.url
    ok = $result.ok
    status = $result.status
    detail = $result.detail
    latencyMs = $result.latencyMs
  }

  $prev = $state.endpoints[$cfg.name]
  if (-not $prev) {
    $prev = @{
      lastOk = $true
      incidentStartedAt = ''
    }
  }

  if ($prev.lastOk -and -not $result.ok) {
    $prev.lastOk = $false
    $prev.incidentStartedAt = $timestamp
    Append-NdjsonLine -Path $incidentsFile -Data @{
      event = 'down-start'
      endpoint = $result.endpoint
      url = $result.url
      startedAt = $timestamp
      status = $result.status
      detail = $result.detail
      latencyMs = $result.latencyMs
    }
  } elseif (($prev.incidentStartedAt) -and $result.ok) {
    $startedAt = [string]$prev.incidentStartedAt
    $durationSec = $null
    try {
      if ($startedAt) {
        $durationSec = [math]::Round(((Get-Date $timestamp) - (Get-Date $startedAt)).TotalSeconds, 0)
      }
    } catch {}
    Append-NdjsonLine -Path $incidentsFile -Data @{
      event = 'recovered'
      endpoint = $result.endpoint
      url = $result.url
      startedAt = $startedAt
      endedAt = $timestamp
      durationSec = $durationSec
      status = $result.status
      detail = $result.detail
      latencyMs = $result.latencyMs
    }
    $prev.lastOk = $true
    $prev.incidentStartedAt = ''
  } else {
    $prev.lastOk = $result.ok
    if ($result.ok) {
      $prev.incidentStartedAt = ''
    }
  }

  $state.endpoints[$cfg.name] = $prev
}

Save-State -State $state
Write-Host ("Availability-Log aktualisiert: {0}" -f $timestamp)
