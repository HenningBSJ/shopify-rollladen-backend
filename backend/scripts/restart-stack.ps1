param(
  [int]$Port = 3006,
  [string]$PublicHealthUrl = 'https://monitor.rollladenwelt.de/health',
  [switch]$NoWatch,
  [switch]$KeepConsole
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path "$PSScriptRoot\..").Path
$localHealth = "http://127.0.0.1:$Port/health"
$tunnelConfig = Join-Path (Resolve-Path "$PSScriptRoot\..\..\cloudflared").Path 'config.yml'
$tunnelName = 'rollladen-monitor'

function Write-Step {
  param([string]$Text)
  Write-Host ""
  Write-Host "=== $Text ===" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Text)
  Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-Warn {
  param([string]$Text)
  Write-Host "[!!] $Text" -ForegroundColor Yellow
}

function Write-Fail {
  param([string]$Text)
  Write-Host "[FEHLER] $Text" -ForegroundColor Red
}

function Test-Health2 {
  param(
    [string]$Url,
    [int]$TimeoutSec = 4
  )
  try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSec
    return ($res.StatusCode -ge 200 -and $res.StatusCode -lt 300 -and $res.Content -match '"status"\s*:\s*"ok"')
  } catch {
    return $false
  }
}

function Stop-BackendPort {
  param([int]$TargetPort)
  $connections = @(Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue)
  if (-not $connections.Count) {
    Write-Host "Kein Listener auf Port $TargetPort."
    return
  }
  $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $pids) {
    try {
      $proc = Get-Process -Id $procId -ErrorAction Stop
      Write-Host ("Beende Backend-PID {0} ({1})..." -f $procId, $proc.ProcessName)
      Stop-Process -Id $procId -Force -ErrorAction Stop
      Start-Sleep -Milliseconds 400
    } catch {
      Write-Warn ("PID $procId konnte nicht weich beendet werden: " + $_.Exception.Message)
    }
  }
}

function Start-BackendNode {
  param([int]$TargetPort)
  $nodeArgs = if (-not $NoWatch) {
    @('--watch', '-r', 'dotenv/config', 'src/index.js')
  } else {
    @('-r', 'dotenv/config', 'src/index.js')
  }
  Write-Host ("Starte Backend: node {0}" -f ($nodeArgs -join ' '))
  $proc = Start-Process -FilePath 'node' -ArgumentList $nodeArgs -WorkingDirectory $root -WindowStyle Hidden -PassThru
  return $proc
}

function Wait-Health {
  param(
    [string]$Url,
    [int]$TimeoutSec = 25,
    [string]$Label = $Url
  )
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
    if (Test-Health2 -Url $Url -TimeoutSec 2) {
      Write-Ok ("$Label erreichbar nach {0:N1}s" -f $sw.Elapsed.TotalSeconds)
      return $true
    }
    Start-Sleep -Milliseconds 700
  }
  return $false
}

function Restart-CloudflaredService {
  $svc = Get-Service -Name cloudflared -ErrorAction SilentlyContinue
  if (-not $svc) {
    Write-Warn "Dienst 'cloudflared' nicht gefunden. Ueberspringe Dienst-Neustart."
    return $null
  }

  Write-Host ("Dienststatus aktuell: {0}" -f $svc.Status)

  try {
    if ($svc.Status -ne 'Stopped') {
      Write-Host "Stoppe cloudflared-Dienst..."
      Stop-Service -Name cloudflared -Force -ErrorAction Stop
    }
  } catch {
    Write-Warn ("Stoppen per Dienst hat nicht funktioniert: " + $_.Exception.Message)
    try {
      $svc2 = Get-CimInstance Win32_Service -Filter "Name='cloudflared'" -ErrorAction Stop
      if ($svc2 -and $svc2.ProcessId -and $svc2.ProcessId -ne 0) {
        Write-Host ("Versuche Dienstprozess PID {0} zu beenden..." -f $svc2.ProcessId)
        Stop-Process -Id ([int]$svc2.ProcessId) -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
      }
    } catch {
      Write-Warn ("Prozess-Kill vom Dienst hat auch nicht funktioniert: " + $_.Exception.Message)
    }
  }

  try {
    Write-Host "Starte cloudflared-Dienst neu..."
    Start-Service -Name cloudflared -ErrorAction Stop
    Start-Sleep -Seconds 3
    $svcAfter = Get-Service -Name cloudflared -ErrorAction SilentlyContinue
    Write-Host ("Neuer Dienststatus: {0}" -f $svcAfter.Status)
    return [bool]($svcAfter.Status -eq 'Running')
  } catch {
    Write-Fail ("StartService fehlgeschlagen: " + $_.Exception.Message)
    return $false
  }
}

Clear-Host
Write-Host "================================================"
Write-Host " Monitor + Cloudflared Stack-Neustart "
Write-Host " Port : $Port"
Write-Host " Lokal: $localHealth"
Write-Host " Oeffentlich: $PublicHealthUrl"
$backendMode = if ($NoWatch) { 'normal (ohne --watch)' } else { 'dev (mit --watch)' }
Write-Host (" Backend-Modus: " + $backendMode)
Write-Host "================================================"

Write-Step "1) Backend neu starten"
Stop-BackendPort -TargetPort $Port
$null = Start-BackendNode -TargetPort $Port
$localOk = Wait-Health -Url $localHealth -TimeoutSec 25 -Label 'Lokales Backend'
if (-not $localOk) {
  Write-Fail "Backend ist nach Neustart NICHT lokal erreichbar."
}

Write-Step "2) Cloudflared-Dienst neu starten"
$cfRestartOk = Restart-CloudflaredService
Write-Host "Config-Pfad: $tunnelConfig"
Write-Host "Tunnelname : $tunnelName"

Write-Step "3) Oeffentlichen Tunnel prüfen"
$publicOk = $false
if ($PublicHealthUrl) {
  $publicOk = Wait-Health -Url $PublicHealthUrl -TimeoutSec 40 -Label 'Oeffentlicher Monitor'
  if (-not $publicOk) {
    Write-Warn "Oeffentliche URL noch nicht da. Manchmal braucht Cloudflare noch ein paar Sekunden..."
    Start-Sleep -Seconds 10
    $publicOk = Wait-Health -Url $PublicHealthUrl -TimeoutSec 25 -Label 'Oeffentlicher Monitor (2. Versuch)'
  }
}

Write-Step "Zusammenfassung"
if ($localOk) {
  Write-Ok "Lokal: $localHealth"
} else {
  Write-Fail "Lokal: $localHealth"
}
if ($PublicHealthUrl) {
  if ($publicOk) {
    Write-Ok "Oeffentlich: $PublicHealthUrl"
  } else {
    Write-Fail "Oeffentlich: $PublicHealthUrl (Error 1033/530 moeglich -> Dienst oder Admin-Skript repair-cloudflared-service.ps1 erneut pruefen)"
  }
}
Write-Host ""
Write-Host "TIPPS:"
Write-Host "- Bleibt Error 1033: PowerShell als Admin & Set-Location C:\Projects\Shopify\backend ; .\scripts\repair-cloudflared-service.ps1"
Write-Host "- Backend ohne Watch neu starten: .\scripts\restart-stack.ps1 -NoWatch"
Write-Host "- Backend nur neu starten: .\scripts\restart-backend.ps1 -UseWatch"
Write-Host ""

if ($KeepConsole) {
  Write-Host "Beliebige Taste druecken zum Schliessen..."
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
}
