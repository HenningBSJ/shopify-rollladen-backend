﻿﻿﻿﻿﻿#Requires -RunAsAdministrator
# -------------------------------------------------------------------
# K1 + K2: Session1 Node kontrolliert neu starten + Baseline-Test
# KORREKTUR:
#  - K1: Sicherstellen, dass neuer Node neue display.js + .env DIRECT_* ENV hat
#  - K2: Spaeter Schritt4 Owner!=bsjal => HARD ABORT + sofort Rollback
# KEINE Emojis, ASCII-only! Saubere PowerShell 5.1 Kompatibilitaet!
# -------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
$scriptStart = Get-Date

# -------------------------------------------------------------------
# [PRE] DYNAMISCHE ERMITTLUNG: Aktuelle interaktive Session ID
# KEIN fest Wert SessionId=1! Wir holen uns die Session aus dem Prozess
# aufrufenden (admin Powershell Prozesses!
# -------------------------------------------------------------------
$MY_INTERACTIVE_SESSION_ID = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
$MY_USERNAME = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name.Split('\')[-1]
$MY_ELEVATED = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host "[PRE] Admin-Powershell Context:"
Write-Host ("      SessionId = {0}" -f $MY_INTERACTIVE_SESSION_ID)
Write-Host ("      Username  = {0}" -f $MY_USERNAME)
Write-Host ("      Computer  = {0}" -f $env:COMPUTERNAME)
Write-Host ("      Elevated  = {0}" -f $MY_ELEVATED)
Write-Host ""

# =========================
# [0/6] PATHS & AUTH
# =========================
$BACKEND_DIR  = 'C:\Projects\Shopify\backend'
$STARTUP_PS1  = Join-Path $env:USERPROFILE '.trae\monitor-startup.ps1'
$BACKUP_DIR   = 'C:\Projects\Shopify\backup'
$PAYLOAD_JSON = Join-Path $BACKUP_DIR 'p.json'
$RESP_K1_JSON = Join-Path $BACKUP_DIR 'resp-K1-SESSION1-NEW.json'
$ERR_K1_TXT   = Join-Path $BACKUP_DIR 'err-K1.txt'

# .env MONITOR AUTH auslesen
$envFile = Join-Path $BACKEND_DIR '.env'
$MON_USER = $null
$MON_PASS = $null
foreach($line in Get-Content $envFile){
  if($line -match '^MONITOR_HTTP_USER\s*=\s*"?([^"]+?)"?\s*$'){ $MON_USER = $Matches[1] }
  if($line -match '^MONITOR_HTTP_PASSWORD\s*=\s*"?([^"]+?)"?\s*$'){ $MON_PASS = $Matches[1] }
}
if(-not $MON_USER -or -not $MON_PASS){
  Write-Host "[FATAL] MONITOR_HTTP_USER / PASS nicht in $envFile gefunden!" -ForegroundColor Red
  exit 99
}

# Payload-Datei vorhanden?
if(-not (Test-Path $PAYLOAD_JSON)){
  $p = '{"qrText":"S4U-BASELINE-K1","l1":"TEST PANZER 100x200mm K1","jobId":"S4U-BASE-K1","customer":"TRAE K1 BASELINE","address1":"Teststrasse 1","address2":"13503 Berlin","material":"Alu 37er Weiss RAL 9016","poDate":"18.09.2026"}'
  Set-Content -Path $PAYLOAD_JSON -Value $p -Encoding UTF8
}

Write-Host "============================================================"
Write-Host "  K1 / K2 KONSOLIDIERT - Node Session1 Reset + Baseline"
Write-Host "  Startup: $STARTUP_PS1"
Write-Host "  Backup : $BACKUP_DIR"
Write-Host "============================================================"
Write-Host ""

# =========================
# [1/6] AKTUELLEN ZUSTAND VORHER PRUEFEN
# =========================
Write-Host "--- [1/6] Zustand VOR Reset ---" -ForegroundColor Cyan
$lBefore = Get-NetTCPConnection -LocalPort 3011 -State Listen -ErrorAction SilentlyContinue
if($lBefore){
  $pBefore = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $lBefore.OwningProcess)
  $oBefore = Invoke-CimMethod -InputObject $pBefore -MethodName GetOwner
  Write-Host ("  Alt Node PID     = {0}" -f $pBefore.ProcessId)
  Write-Host ("  Alt Node Session = {0}" -f $pBefore.SessionId)
  Write-Host ("  Alt Node Owner   = {0}\{1}" -f $oBefore.Domain,$oBefore.User)
  Write-Host ("  Alt Node Start   = {0}" -f $pBefore.CreationDate)
} else {
  Write-Host "  (Port 3011 vorher nicht LISTENING - kein Node?)"
}
Write-Host ""

# =========================
# [2/6] SESSION1 NODE NEU STARTEN (User Startup-Skript -> Session1 bsjal!)
# =========================
Write-Host "--- [2/6] Starte monitor-startup.ps1 (Session1 Reset) ---" -ForegroundColor Cyan
Write-Host "  -> Skript killt automatisch alten Node + startet NEUEN in Session1!"
Write-Host ""
try {
  & $STARTUP_PS1
  Write-Host "  [OK] Startup-Skript beendet (Exit-Code=$LASTEXITCODE)" -ForegroundColor Green
} catch {
  Write-Host ("  [WARN] Startup-Skript Exception: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
}
Write-Host ""

# =========================
# [3/6] WARTEN AUF LISTENER + NEUEN NODE PRUEFEN (Session1 + bsjal!)
# =========================
Write-Host "--- [3/6] Warten auf neuen Listener :3011 + Check Session/Owner ---" -ForegroundColor Cyan
$newPid = $null
for($i = 1; $i -le 25; $i++){
  Start-Sleep -Seconds 1
  $l = Get-NetTCPConnection -LocalPort 3011 -State Listen -ErrorAction SilentlyContinue
  if($l){
    $newPid = $l.OwningProcess
    # Zeile mit SAUBERER Formatierung (KEINE Klammer-Parserfehler!)
    $line = '  Listener OK nach {0}s -> Neue PID={1}' -f $i,$newPid
    Write-Host $line -ForegroundColor Green
    break
  }
  if($i % 5 -eq 0){
    Write-Host ("  ({0}s) warte auf Port :3011 ..." -f $i)
  }
}
if(-not $newPid){
  Write-Host "[FATAL] KEIN LISTENER nach 25s! STOPPEN! Kein neuer Node gestartet!" -ForegroundColor Red
  exit 98
}
# CHECK Owner + Session -> MUSS MY_USERNAME und MY_INTERACTIVE_SESSION_ID sein (DYNAMISCH! KEIN FESTWERT 1!)
$pNew = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $newPid)
$oNew = Invoke-CimMethod -InputObject $pNew -MethodName GetOwner
Write-Host ""
Write-Host "  Neuer Node Details:"
Write-Host ("    PID     = {0}" -f $pNew.ProcessId)
$lineSession = '    Session = {0} (SOLL = Interaktive Admin-Session ID {1}!)' -f $pNew.SessionId,$MY_INTERACTIVE_SESSION_ID
Write-Host $lineSession
Write-Host ("    Owner   = {0}\{1} (SOLL = {2}!)" -f $oNew.Domain,$oNew.User,$MY_USERNAME)
Write-Host ("    Start   = {0}" -f $pNew.CreationDate)
Write-Host ("    CMDLine = {0}" -f $pNew.CommandLine)

# HARD CHECK: Session muss DIE GLEICHE SEIN WIE DIE AUFRUFENDE ADMIN-SHELL! Owner MUSS gleich aktueller Username!
$ownerOk = ($oNew.User -eq $MY_USERNAME)
$sessionOk = ($pNew.SessionId -eq $MY_INTERACTIVE_SESSION_ID)
if(-not $ownerOk -or -not $sessionOk){
  Write-Host ""
  Write-Host "[FATAL] Neuer Node ist NICHT in gleicher Session/gleichem User! HARD ABORT!" -ForegroundColor Red
  $lineSessionFail = "  Session: SOLL={0}, IST={1} -> {2}" -f $MY_INTERACTIVE_SESSION_ID,$pNew.SessionId,$(if($sessionOk){"OK"}else{"FAIL"})
  Write-Host $lineSessionFail
  $lineOwnerFail   = "  Owner  : SOLL={0}, IST={1}\{2} -> {3}" -f $MY_USERNAME,$oNew.Domain,$oNew.User,$(if($ownerOk){"OK"}else{"FAIL"})
  Write-Host $lineOwnerFail
  # SOFORT KILLEN + NICHTS WEITER MACHEN!
  Write-Host ("  -> Beende fehlerhaften Node PID={0} sofort!" -f $newPid)
  try { taskkill /F /PID $newPid | Out-Null } catch {}
  exit 97
}
$linePass = "  [OK] Session={0} + Owner={1} -> K1 HARD CHECK BESTANDEN!" -f $MY_INTERACTIVE_SESSION_ID,$MY_USERNAME
Write-Host $linePass -ForegroundColor Green
Write-Host ""

# =========================
# [4/6] HEALTH LOKAL 10x
# =========================
Write-Host "--- [4/6] Health Lokal :3011 x10 ---" -ForegroundColor Cyan
$okH = 0
for($i = 1; $i -le 10; $i++){
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3011/health' -TimeoutSec 8 -UseBasicParsing -ErrorAction Stop
    if($r.StatusCode -eq 200){ $okH++ }
  } catch {}
}
$healthOk = ($okH -eq 10)
Write-Host ("  Ergebnis Health: {0}/10 OK -> {1}" -f $okH,$(if($healthOk){"[OK]"}else{"[FAIL]"}))
if(-not $healthOk){
  Write-Host "[FATAL] Health nicht 100%! STOPPEN!" -ForegroundColor Red
  exit 96
}
Write-Host ""

# =========================
# [5/6] DRUCKTEST SESSION1 (mit NEUER Config! tempDir sollte jetzt ENV = RollladenMonitor\print-temp sein!)
# =========================
Write-Host "--- [5/6] Drucktest Session1 NEUER Node (muss neue ENV/display.js Config haben!) ---" -ForegroundColor Cyan
Write-Host ("  Payload: $PAYLOAD_JSON")
Write-Host ("  Resp   : $RESP_K1_JSON")
$auth = "{0}:{1}" -f $MON_USER,$MON_PASS

$curlArgs = @(
  '--max-time','120',
  '-u',$auth,
  '-X','POST',
  '-H','Content-Type: application/json',
  '--data-binary',("@"+$PAYLOAD_JSON),
  '-o',$RESP_K1_JSON,
  '--stderr',$ERR_K1_TXT,
  '-w','HTTP:%{http_code}',
  'http://127.0.0.1:3011/display/label/direct-print'
)
Write-Host "  curl.exe laeuft (bis 120s Timeout) ..."
$curlResult = & curl.exe @curlArgs 2>&1
Write-Host ""
Write-Host ("  HTTP Status (CURL): {0}" -f $curlResult)

# Response Body lesen + auswerten
$jsonOk = $false
$usedTempDir = ''
$printOk  = $false
$failStage = ''
$failMsg   = ''
if(Test-Path $RESP_K1_JSON){
  Write-Host ""
  Write-Host "  ---- Response Body (K1) ----"
  Get-Content $RESP_K1_JSON
  try {
    $j = Get-Content $RESP_K1_JSON | ConvertFrom-Json -ErrorAction Stop
    $jsonOk = $true
    if($j.ok){ $printOk = $true }
    if($j.tempDir){ $usedTempDir = [string]$j.tempDir }
    if($j.stage){ $failStage = [string]$j.stage }
    if($j.error){ $failMsg = [string]$j.error }
    if($j.message){ if($failMsg -eq ''){ $failMsg = [string]$j.message } }
  } catch {
    Write-Host ("  [WARN] Response JSON ungueltig: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
  }
}
Write-Host ""
Write-Host "  ---- Drucktest Auswertung K1 ----"
Write-Host ("    Print OK (ok:true)      : {0}" -f $(if($printOk){"JA [OK]"}else{"NEIN [FAIL]"}))
Write-Host ("    TempDir (genutzt!)      : {0}" -f $usedTempDir)
Write-Host ("    Fail Stage              : {0}" -f $failStage)
Write-Host ("    Fail Message            : {0}" -f $failMsg)
# Check: TEMP VERZEICHNISS MUSS der NEUE ENV-Pfad sein! (DIRECT_PRINT_TEMP_DIR = RollladenMonitor\print-temp)
$EXPECTED_TEMP = 'C:\Users\bsjal\AppData\Local\RollladenMonitor\print-temp'
$tempOk = ($usedTempDir -like '*\RollladenMonitor\print-temp*')
Write-Host ("    TempDir == NEW ENV?     : {0} (SOLL: {1})" -f $(if($tempOk){"JA [OK]"}else{"NEIN [FAIL]"}),$EXPECTED_TEMP)
Write-Host ""

if(-not $printOk -or -not $tempOk){
  Write-Host "[FATAL] K1 Baseline Drucktest FEHLGESCHLAGEN! (Print nicht 200 OK ODER TempDir hat neuen ENV-WERT NICHT benutzt!)" -ForegroundColor Red
  Write-Host "  Grund:"
  if(-not $printOk){ Write-Host ("    - Print FAIL: Stage={0}, Msg={1}" -f $failStage,$failMsg) }
  if(-not $tempOk){  Write-Host ("    - TempDir FAIL! Benutzt={0}, Erwartet (Enthält)=*RollladenMonitor\print-temp*" -f $usedTempDir) }
  exit 95
}

# =========================
# [6/6] ABSCHLUSS K1 BESTANDEN!
# =========================
$dur = [math]::Round(((Get-Date)-$scriptStart).TotalSeconds,1)
Write-Host "============================================================"
Write-Host ("[K1 FERTIG] Erfolgreich in {0}s!" -f $dur) -ForegroundColor Green
Write-Host "  -> Node: Session1 + bsjal + neuer Code + .env DIRECT_* Werte"
Write-Host ("  -> Node PID: {0}, Startzeit: {1}" -f $pNew.ProcessId,$pNew.CreationDate)
Write-Host ("  -> Druck : HTTP 200 OK (CURL Ergebnis: {0})" -f $curlResult)
Write-Host ("  -> TempDir: {0} (NEUER ENV! Korrekt geladen!)" -f $usedTempDir)
Write-Host ""
Write-Host "Naechster Schritt (im TRAE-Chat nach Bestaetigung): D4b KONTROLLIERTER S4U TEST"
Write-Host "============================================================"
exit 0
