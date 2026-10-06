param(
  [int]$Port = 3006,
  [switch]$UseWatch,
  [switch]$VisibleWindow,
  [switch]$WhatIf
)

$ErrorActionPreference = 'Continue'

$root = (Resolve-Path "$PSScriptRoot\..").Path
$healthUrl = "http://127.0.0.1:$Port/health"
$logDir  = Join-Path $root 'data\uptime'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("backend-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))
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

Write-Host ("[{0}] restart-backend.ps1 gestartet (Port={1}, UseWatch={2})" -f (Get-Date -Format 'HH:mm:ss'), $Port, [bool]$UseWatch)

function Test-Health {
  param(
    [string]$Url,
    [int]$TimeoutSec = 2
  )

  try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSec
    return ($res.StatusCode -ge 200 -and $res.StatusCode -lt 300)
  } catch {
    return $false
  }
}

function Stop-BackendOnPort {
  param([int]$TargetPort)

  $connections = @(Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue)
  if (-not $connections.Count) {
    Write-Host "Kein Listener auf Port $TargetPort gefunden."
    return
  }

  $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $pids) {
    if ($WhatIf) {
      Write-Host "[WhatIf] Wuerde PID $procId auf Port $TargetPort beenden."
      continue
    }
    Write-Host "Beende PID $procId auf Port $TargetPort..."
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
}

Stop-BackendOnPort -TargetPort $Port

$nodeArgs = if ($UseWatch) {
  @('--watch', '-r', 'dotenv/config', 'src/index.js')
} else {
  @('-r', 'dotenv/config', 'src/index.js')
}

if ($WhatIf) {
  Write-Host ("[WhatIf] Wuerde starten: node {0}" -f ($nodeArgs -join ' '))
  return
}

$windowStyle = if ($VisibleWindow) { 'Normal' } else { 'Hidden' }
$nodeLogDir = Join-Path $root 'data\uptime'
if (-not (Test-Path $nodeLogDir)) { New-Item -ItemType Directory -Path $nodeLogDir -Force | Out-Null }
$nodeLogStdOut = Join-Path $nodeLogDir ("node-stdout-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))
$nodeLogStdErr = Join-Path $nodeLogDir ("node-stderr-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))
"=== Node Start $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Port=$Port UseWatch=$UseWatch ===" | Out-File -FilePath $nodeLogStdOut -Append -Encoding UTF8
"=== Node Start $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Port=$Port UseWatch=$UseWatch ===" | Out-File -FilePath $nodeLogStdErr -Append -Encoding UTF8

Write-Host ("Starte Backend in {0} (StdOut/StdErr in data\uptime\)" -f $root)
$proc = Start-Process -FilePath 'node' -ArgumentList $nodeArgs -WorkingDirectory $root `
  -WindowStyle $windowStyle -PassThru `
  -RedirectStandardOutput $nodeLogStdOut -RedirectStandardError $nodeLogStdErr

for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-Health -Url $healthUrl) {
    Write-Host ("[{0}] Backend laeuft wieder auf Port {1} (PID {2})." -f (Get-Date -Format 'HH:mm:ss'), $Port, $proc.Id)
    try { Stop-Transcript | Out-Null } catch {}
    return
  }
}

$msg = "Backend ist nach dem Neustart auf Port $Port nicht erreichbar."
Write-Error $msg
try { Stop-Transcript | Out-Null } catch {}
throw $msg
