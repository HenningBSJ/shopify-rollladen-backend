#Requires -RunAsAdministrator
<#
.SYNOPSIS
Node Service-Migration Port 3011: User-Session Startup -> ScheduledTask S4U
DATE: 17.09.2026 | BACKUP: C:\Projects\Shopify\backup\20260917-NodeMigration\
OPTION B ONLY! (Option A Interactive wurde VERWORFEN, da nicht service-tauglich).
KEIN Anwendungscode wird geaendert! Nur Task-Registration + Startup-Umschaltung.
ACHTUNG: PID 30420 wird NUR beendet, wenn explizit $global:FORCE_GO_LIVE = $true gesetzt!
         Standard (Dry-Run): Nur Pre-Flights + Task REGISTRIEREN (disabled Trigger!),
                            KEIN Task-Start, KEIN PID-Kill.
#>
$ErrorActionPreference = 'Stop'

# === SCHALTER SICHERHEIT ===
# Dry Run = $true : KEIN Task Start, KEIN Alter Node PID kill!
#                  Task wird MIT TRIGGER registriert (enabled), aber Start nur bei explizit GO!
$global:FORCE_GO_LIVE = $false  # <-- NIEMALS hier aendern! Wird von TRAE nach schriftlichem GO auf $true gesetzt.

$scriptStart = Get-Date
$logFolder = "$env:LOCALAPPDATA\RollladenMonitor"
if (-not (Test-Path $logFolder)) { New-Item -ItemType Directory -Path $logFolder -Force | Out-Null }
$modeTag = if ($global:FORCE_GO_LIVE) { 'GOLIVE' } else { 'DRYRUN-REGISTRYONLY' }
$logFile = Join-Path $logFolder ("NodeMigration-" + $modeTag + "-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")
Start-Transcript -Path $logFile -Append | Out-Null

Write-Host ""
$headline = "=== PRODUKTIONSMONITOR NODE SERVICE-MIGRATION 17.09.2026 (OPTION B: S4U) Modus: {0} ===" -f $modeTag
Write-Host $headline -ForegroundColor Cyan
Write-Host ("Logfile   : " + $logFile)
Write-Host "Backup Dir: C:\Projects\Shopify\backup\20260917-NodeMigration\" -ForegroundColor Green

# === DEFINITIONEN ===
$nodeExe       = 'C:\Program Files\nodejs\node.exe'
$nodeWorkingDir= 'C:\Projects\Shopify\backend'
$nodeArgs      = '-r dotenv/config src/index.js'
$targetPort    = 3011
$neuTaskName   = 'RollladenBackend-Service'
$altTaskName   = 'Monitor Backend 3007'
$taskPrincipalUserId = 'bsjal'
$startupVbs    = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\monitor-launcher.vbs'
$startupPs1    = Join-Path $env:USERPROFILE '.trae\monitor-startup.ps1'
$altNodePID    = 30420  # Aus Inventur

# === PRE-FLIGHT CHECKS ===
Write-Host ""
Write-Host "--- [PRE-FLIGHT 1/8] Node EXE + WorkingDir ---"
if (-not (Test-Path $nodeExe)) { throw ("Node EXE nicht gefunden: " + $nodeExe) }
Write-Host ("  [OK] node.exe Version=" + (Get-Item $nodeExe).VersionInfo.ProductVersion)
$dotenvPath = Join-Path $nodeWorkingDir '.env'
if (-not (Test-Path $dotenvPath)) { throw (".env fehlt in " + $nodeWorkingDir) }
Write-Host ("  [OK] .env vorhanden in " + $nodeWorkingDir)

Write-Host ""
Write-Host ("--- [PRE-FLIGHT 2/8] ALT-Task " + $altTaskName + " Principal (VERGLEICH) ---")
try {
  $altTask = Get-ScheduledTask -TaskName $altTaskName -ErrorAction Stop
  $msg = "  [INFO] {0} -> UserId={1} LogonType={2} RunLevel={3}" -f $altTaskName,$altTask.Principal.UserId,$altTask.Principal.LogonType,$altTask.Principal.RunLevel
  Write-Host $msg
  if ($altTask.Principal.LogonType -eq 'Interactive') {
    Write-Host "         => (Option A Interactive war service-UNTAUGLICH => wurde verworfen!)" -ForegroundColor Yellow
  }
} catch {
  Write-Host ("  [INFO] " + $altTaskName + " nicht vorhanden: " + $_.Exception.Message)
}

Write-Host ""
Write-Host "--- [PRE-FLIGHT 3/8] Aktueller Node Listener Port $targetPort ---"
$listenerBefore = Get-NetTCPConnection -LocalPort $targetPort -State Listen -ErrorAction SilentlyContinue
if ($listenerBefore) {
  $procBefore = Get-Process -Id $listenerBefore.OwningProcess -ErrorAction SilentlyContinue
  $msg = "  [INFO] Port {0} LISTENING PID={1} ({2}) - LEBT AKTUELL!" -f $targetPort,$listenerBefore.OwningProcess,$procBefore.ProcessName
  Write-Host $msg -ForegroundColor Cyan
} else {
  Write-Host ("  [INFO] Port " + $targetPort + " NICHT listening.")
}

Write-Host ""
Write-Host ("--- [PRE-FLIGHT 4/8] Local Health Check (via bestehenden Port " + $targetPort + ") ---")
try {
  $uri = "http://127.0.0.1:{0}/health" -f $targetPort
  $r = Invoke-WebRequest -Uri $uri -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
  Write-Host ("  [OK] Lokal Health HTTP " + $r.StatusCode)
} catch {
  Write-Host ("  [WARN] Lokal Health fehlgeschlagen: " + $_.Exception.Message) -ForegroundColor Yellow
}

Write-Host ""
Write-Host "--- [PRE-FLIGHT 5/8] Startup-VBS vorhanden? ---"
if (Test-Path $startupVbs) { Write-Host "  [OK] Startup-VBS vorhanden (wird spaeter deaktiviert, NICHT geloescht)" }
else { Write-Host "  [INFO] Startup-VBS nicht gefunden" }

Write-Host ""
Write-Host "--- [PRE-FLIGHT 6/8] Task '$neuTaskName' bereits vorhanden? ---"
$vorhanden = Get-ScheduledTask -TaskName $neuTaskName -ErrorAction SilentlyContinue
if ($vorhanden) {
  $msg = "  [WARN] Task '$neuTaskName' EXISTIERT BEREITS (State={0}, LogonType={1})" -f $vorhanden.State,$vorhanden.Principal.LogonType
  Write-Host $msg -ForegroundColor Yellow
  $remove = Read-Host "  Vorhandenen Task UNREGISTER entfernen (NEU anlegen danach)? [J/N]"
  if ($remove -match '^[JjYy]$') {
    try {
      Unregister-ScheduledTask -TaskName $neuTaskName -Confirm:$false -ErrorAction Stop
      Write-Host ("  [OK] Task '" + $neuTaskName + "' entfernt.") -ForegroundColor Green
      $vorhanden = $null
    } catch {
      throw ("Konnte vorhandenen Task nicht entfernen: " + $_)
    }
  } else {
    throw "Abbruch: Task '$neuTaskName' bereits vorhanden, entfernen verweigert."
  }
} else {
  Write-Host ("  [OK] Task '" + $neuTaskName + "' noch nicht registriert (frei!).") -ForegroundColor Green
}

Write-Host ""
Write-Host "--- [PRE-FLIGHT 7/8] S4U Principal (OPTION B) erzeugen ---"
$principal = New-ScheduledTaskPrincipal -UserId $taskPrincipalUserId -LogonType S4U -RunLevel Highest -ErrorAction Stop
$msg = "  [OK] Principal: UserId={0} LogonType={1} RunLevel={2}" -f $principal.UserId,$principal.LogonType,$principal.RunLevel
Write-Host $msg -ForegroundColor Green
if ($principal.LogonType -ne 'S4U') {
  throw "FREIGABEKRITERIUM NICHT ERFUELLT: LogonType != S4U => Task startet nicht ohne Anmeldung!"
}
Write-Host "         => FREIGABEKRITERIUM ERFUELLT: Task laeuft AUCH OHNE BENUTZERANMELDUNG!" -ForegroundColor Green

Write-Host ""
Write-Host "--- [PRE-FLIGHT 8/8] Action + Settings + Trigger zusammenbauen ---"
$action = New-ScheduledTaskAction -Execute $nodeExe -Argument $nodeArgs -WorkingDirectory $nodeWorkingDir -ErrorAction Stop
$msg = "  [OK] Action: Execute={0}" -f $action.Execute
Write-Host $msg
Write-Host ("         Arguments   = " + $action.Arguments)
Write-Host ("         WorkingDir  = " + $action.WorkingDirectory)
$triggerStartup = New-ScheduledTaskTrigger -AtStartup -ErrorAction Stop
Write-Host "  [OK] Trigger: AtStartup (Start nach Windows-Boot, KEINE Anmeldung noetig!)" -ForegroundColor Green

$settings = New-ScheduledTaskSettingsSet -ErrorAction Stop
# WICHTIG: Alle Task Scheduler Duration Properties sind CIM-Type STRING (nicht [TimeSpan]!)
#          PowerShell [TimeSpan] -> 00:01:00 XML ist UNGUELTIG (0x80041318)!
#          Stattdessen: IMMER ISO 8601 Duration Strings via CimInstanceProperties['X'].Value zuweisen!
#          ISO 8601: P[n]Y[n]M[n]DT[n]H[n]M[n]S | Kurzform z.B. PT1M = Periode Time 1 Minute | PT0S = 0s (kein Limit!)
$settings.MultipleInstances = [Microsoft.PowerShell.Cmdletization.GeneratedTypes.ScheduledTask.MultipleInstancesEnum]::IgnoreNew
$settings.RestartCount = 3
# RestartInterval: PT1M = 1 Minute (statt New-TimeSpan -> 00:01:00 XML ungueltig)
if ($settings.CimClass.CimClassProperties['RestartInterval']) { $settings.CimInstanceProperties['RestartInterval'].Value = 'PT1M' }
# ExecutionTimeLimit: PT0S = 0 Sekunden -> Task Scheduler Bedeutung: KEIN LAUFZEIT-LIMIT / UNBEGRENZT!
#                     (Wichtig: Default Task Scheduler ist PT72H = 72h / 3 Tage -> zu kurz fuer 24/7 Dienst!)
if ($settings.CimClass.CimClassProperties['ExecutionTimeLimit']) { $settings.CimInstanceProperties['ExecutionTimeLimit'].Value = 'PT0S' }
$settings.StartWhenAvailable = $true
# Weitere Settings
if ($settings.CimClass.CimClassProperties['AllowStartIfOnBatteries'])     { $settings.AllowStartIfOnBatteries = $true }
if ($settings.CimClass.CimClassProperties['DontStopIfGoingOnBatteries']) { $settings.DontStopIfGoingOnBatteries = $true }
if ($settings.CimClass.CimClassProperties['DisallowHardTerminate'])      { $settings.DisallowHardTerminate = $false }
if ($settings.CimClass.CimClassProperties['RunOnlyIfNetworkAvailable'])  { $settings.RunOnlyIfNetworkAvailable = $false }
# Logging (rohe CIM String-Werte!)
$riLog  = if ($settings.CimClass.CimClassProperties['RestartInterval'])   { $settings.CimInstanceProperties['RestartInterval'].Value   } else { 'N/A' }
$etlLog = if ($settings.CimClass.CimClassProperties['ExecutionTimeLimit']){ $settings.CimInstanceProperties['ExecutionTimeLimit'].Value } else { 'N/A' }
$msg = "  [OK] Settings: Multi={0} RestartCount={1} RestartInterval={2} ExecLimit={3} (ISO 8601) StartWhenAvail={4}" -f `
  $settings.MultipleInstances,$settings.RestartCount,$riLog,$etlLog,$settings.StartWhenAvailable
Write-Host $msg

$description = "Produktionsmonitor Node Backend Port {0} | S4U Scheduled Task | RunLevel Highest | Startet OHNE BENUTZERANMELDUNG (AtStartup) | Migration 17.09.2026" -f $targetPort
Write-Host ("  [OK] Description : " + $description)

# === TASK REGISTRIERUNG (BIS HIER DRY-RUN SICHER!) ===
Write-Host ""
Write-Host "========== [SCHRITT A] Task REGISTRIEREN (S4U Highest + AtStartup Trigger) ==========" -ForegroundColor Cyan
if ($global:FORCE_GO_LIVE) {
  Write-Host "!! Modus GOLIVE: Task wird MIT AKTIVEM TRIGGER registriert (AtStartup enabled). !!" -ForegroundColor Yellow
} else {
  Write-Host "!! Modus DRYRUN: Task wird registriert MIT TRIGGER. KEIN Task-Start, KEIN PID-Kill. !!" -ForegroundColor Yellow
}
$confirm = Read-Host "Registrierung JETZT durchfuehren? [J/N]"
if (-not ($confirm -match '^[JjYy]$')) { Write-Host "Abbruch durch User."; exit 0 }

try {
  Register-ScheduledTask -TaskName $neuTaskName `
    -Action $action `
    -Principal $principal `
    -Settings $settings `
    -Trigger $triggerStartup `
    -Description $description `
    -Force -ErrorAction Stop | Out-Null
  Write-Host ("  [OK] Task '" + $neuTaskName + "' ERFOLGREICH REGISTRIERT!") -ForegroundColor Green
} catch {
  Write-Host ("  [FAIL] Register-ScheduledTask FEHLER: " + $_.Exception.Message) -ForegroundColor Red
  throw
}

# Nach-Registrierungs-Prüfung
$neuTask = Get-ScheduledTask -TaskName $neuTaskName -ErrorAction Stop
$msg = "  [PRUEFUNG] Task '{0}' -> UserId={1} LogonType={2} RunLevel={3} Triggers={4} State={5}" -f `
  $neuTask.TaskName,$neuTask.Principal.UserId,$neuTask.Principal.LogonType,$neuTask.Principal.RunLevel,$neuTask.Triggers.Count,$neuTask.State
Write-Host $msg -ForegroundColor $(if ($neuTask.Principal.LogonType -eq 'S4U'){'Green'}else{'Red'})
if ($neuTask.Triggers.Count -gt 0 -and $neuTask.Triggers[0].CimClass.CimClassName -match 'TASK_TRIGGER_BOOT|AtStartup') {
  Write-Host "  [PRUEFUNG] Trigger AT STARTUP -> Windows-Boot ohne Anmeldung startet Task!" -ForegroundColor Green
}

# === GOLIVE-PHASE (NUR WENN $global:FORCE_GO_LIVE = $true UND schriftl. GO von User!) ===
if (-not $global:FORCE_GO_LIVE) {
  Write-Host ""
  Write-Host "========== DRY-RUN MODUS ABGESCHLOSSEN (bis REGISTRATION) ==========" -ForegroundColor Cyan
  Write-Host "  PID $altNodePID (Port $targetPort) : UNVERAENDERT (nicht beendet!)" -ForegroundColor Green
  Write-Host "  Task '$neuTaskName'               : Registriert MIT Trigger AtStartup (bereit!)"
  Write-Host "  Task '$neuTaskName' Status        : $($neuTask.State) (noch NICHT gestartet!)"
  Write-Host ""
  Write-Host "Naechste Schritte (im TRAE-Chat):" -ForegroundColor Yellow
  Write-Host "  1. User bestaetigt: Task '$neuTaskName' Principal+Trigger OK per schriftlichem GO!"
  Write-Host "  2. TRAE setzt FORCE_GO_LIVE = `$true + startet Skript erneut"
  Write-Host "     => Alter Node PID $altNodePID wird beendet,"
  Write-Host "     => Task '$neuTaskName' wird gestartet,"
  Write-Host "     => Health-Check Listener/20x Local/30x Extern + Testdruck durchgefuehrt."
  Write-Host ("Skript beendet (DRYRUN). Dauer: {0}s" -f [math]::Round(((Get-Date)-$scriptStart).TotalSeconds,1))
  Stop-Transcript | Out-Null
  exit 0
}

# ============================================================
# AB HIER: NUR BEI $global:FORCE_GO_LIVE = $true + SCHRIFTL. GO!
# ============================================================
Write-Host ""
Write-Host "========== [SCHRITT B (GOLIVE ONLY!)] Alter Node Prozess beenden ==========" -ForegroundColor Red
$killAlt = Read-Host ("  Alten Node PID $altNodePID (Port $targetPort) JETZT beenden? (Task startet danach sofort!) [J/N]")
if (-not ($killAlt -match '^[JjYy]$')) { Write-Host "Abbruch GOLIVE."; exit 0 }
$nodePids = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | ForEach-Object { $_.ProcessId })
if ($nodePids.Count -eq 0) {
  Write-Host "  [INFO] Keine node.exe Prozesse laufen."
} else {
  foreach ($p in $nodePids) {
    try {
      Stop-Process -Id $p -Force -ErrorAction Stop
      Write-Host ("  [OK] PID {0} beendet." -f $p) -ForegroundColor Green
    } catch {
      Write-Host ("  [WARN] PID {0} nicht beendet: {1}" -f $p, $_.Exception.Message) -ForegroundColor Yellow
      $out = & taskkill /F /PID $p 2>&1
      Write-Host ("         taskkill Ausgabe: " + ($out -join ' | '))
    }
  }
  Start-Sleep -Seconds 3
}
$stillListening = Get-NetTCPConnection -LocalPort $targetPort -State Listen -ErrorAction SilentlyContinue
if ($stillListening) {
  Write-Host ("  [WARN] Port $targetPort noch belegt PID={0}, nochmal taskkill..." -f $stillListening.OwningProcess) -ForegroundColor Yellow
  & taskkill /F /PID $stillListening.OwningProcess 2>&1 | Out-Null
  Start-Sleep -Seconds 2
}
Write-Host ("  [INFO] Alter Prozess cleanup abgeschlossen. Port {0} sollte jetzt frei sein." -f $targetPort)

Write-Host ""
Write-Host ("========== [SCHRITT C (GOLIVE ONLY!)] Task '{0}' starten ==========" -f $neuTaskName) -ForegroundColor Cyan
try {
  Start-ScheduledTask -TaskName $neuTaskName -ErrorAction Stop
  Write-Host "  [OK] Task gestartet. Warte 12s auf Listener..." -ForegroundColor Green
} catch {
  Write-Host ("  [WARN] Task Start: " + $_.Exception.Message) -ForegroundColor Yellow
}

$maxWarte = 12
$listenerDa = $false
for ($i=1; $i -le $maxWarte; $i++) {
  Start-Sleep -Seconds 1
  $listen = Get-NetTCPConnection -LocalPort $targetPort -State Listen -ErrorAction SilentlyContinue
  if ($listen) {
    $proc = Get-Process -Id $listen.OwningProcess -ErrorAction SilentlyContinue
    $procCim = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $listen.OwningProcess) -ErrorAction SilentlyContinue
    $owner = if ($procCim -and $procCim.GetOwner().ReturnValue -eq 0) { $procCim.GetOwner().User } else { '???' }
    $sessionId = if ($procCim) { $procCim.SessionId } else { '?' }
    $msg = "  [OK] Listener da! ({0}s) PID={1} Name={2} Owner={3} Session={4}" -f $i,$listen.OwningProcess,$proc.ProcessName,$owner,$sessionId
    Write-Host $msg -ForegroundColor Green
    $listenerDa = $true
    break
  }
  $outMsg = "  ({0}s) warte auf :{1}..." -f $i,$targetPort
  Write-Host $outMsg
}
if (-not $listenerDa) {
  $msg = "  [FAIL] Kein Listener nach {0}s! Task-Info:" -f $maxWarte
  Write-Host $msg -ForegroundColor Red
  Get-ScheduledTaskInfo -TaskName $neuTaskName | Format-List LastRunTime,LastTaskResult,NumberOfMissedRuns
  throw "Listener Timeout nach GOLIVE!"
}

# === GOLIVE: 5x Local Health (Preview) ===
Write-Host ""
Write-Host ("========== [SCHRITT D (GOLIVE ONLY!)] 5x Lokal Health Preview :{0} ==========" -f $targetPort)
$healthOK=0; $healthFAIL=0
for ($i=1; $i -le 5; $i++) {
  try {
    $uri = "http://127.0.0.1:{0}/health" -f $targetPort
    $r = Invoke-WebRequest -Uri $uri -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    if ($r.StatusCode -eq 200) { $healthOK++ } else { $healthFAIL++ }
  } catch { $healthFAIL++ }
}
$msg = "  Health Preview: {0} OK / {1} FAIL" -f $healthOK, $healthFAIL
Write-Host $msg -ForegroundColor $(if ($healthFAIL -eq 0){'Green'}else{'Yellow'})

# === GOLIVE-ABSCHLUSS => Rest in TRAE (20+30 Health, Testdruck, Alt-Startup Deaktivierung) ===
Write-Host ""
Write-Host "========== GOLIVE-PHASE ABSCHLUSS ==========" -ForegroundColor Cyan
Write-Host ("Task final           : " + $neuTaskName)
Write-Host ("Task Principal Check : UserId={0} LogonType={1} RunLevel={2}" -f $neuTask.Principal.UserId,$neuTask.Principal.LogonType,$neuTask.Principal.RunLevel)
Write-Host "Task Info            :"
Get-ScheduledTaskInfo -TaskName $neuTaskName | Format-List LastRunTime,LastTaskResult
Write-Host ""
Write-Host "Naechste Schritte (NUR in TRAE!):" -ForegroundColor Yellow
Write-Host "  - 20x Lokal Health :3011 (HTTP 200 erwartet)"
Write-Host "  - 30x Extern Health monitor.rollladenwelt.de (HTTP 200)"
Write-Host "  - 1x Direct Print Test (Brother QL-1110NWB)"
Write-Host "  - ALT-Startup DEAKTIVIEREN (NICHT loeschen!):"
Write-Host "    * monitor-startup.ps1 Node-Block auskommentieren"
Write-Host "    * Startup-VBS -> monitor-launcher.vbs.DISABLED-17092026 umbenennen"
Write-Host ("    * Alt-Task '{0}' -> Disabled setzen" -f $altTaskName)
Write-Host "  - Logout-Test: Benutzer ABmelden, 2 Min warten, 20x extern Health."

Write-Host ""
Write-Host ("Skript beendet (GOLIVE). Dauer: {0}s" -f [math]::Round(((Get-Date)-$scriptStart).TotalSeconds,1)) -ForegroundColor Cyan
Stop-Transcript | Out-Null
