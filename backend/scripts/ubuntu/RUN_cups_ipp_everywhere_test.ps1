[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"
$ub="http://100.98.136.86:3006"
$user='monitor'; $pw='hTgfR4%%jsu(,.,GmnAQdfwra'
$pair = "$($user):$($pw)"; $bytes = [System.Text.Encoding]::ASCII.GetBytes($pair); $base64 = [System.Convert]::ToBase64String($bytes)
$headers = @{ Authorization = "Basic $base64" ; 'Content-Type' = 'application/json'}

Write-Host "=== SCHRITT 0: CUPS error_log + access_log ZURUECKSETZEN (damit wir nur neue Fehler sehen!) ===" -ForegroundColor Yellow
$res = Invoke-UbuCmd -Sudo "echo '=== TRUNCATE error_log START ===' > /tmp/cups-log-trunc.txt 2>&1 ; [ -f /var/log/cups/error_log ] && { truncate -s 0 /var/log/cups/error_log 2>&1 ; echo 'error_log geleert' >> /tmp/cups-log-trunc.txt ; } ; [ -f /var/log/cups/access_log ] && { truncate -s 0 /var/log/cups/access_log 2>&1 ; echo 'access_log geleert' >> /tmp/cups-log-trunc.txt ; } ; cat /tmp/cups-log-trunc.txt" -Timeout 15
$res.Output | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host "=== SCHRITT 1: FINAL TEST DRUCK mit IPP EVERYWHERE (holdJob=FALSE!) ===" -ForegroundColor Cyan
$bodyPrint = @{
  qr="https://monitor.rollladenwelt.de/display?code=rwjjob:Rec0C0AK56DPT"
  l1="IPP EVERYWHERE FINAL TEST OK!"
  d="2026-09-11"
  c1="UBUNTU ipp://631"
  op="MON"
  copies="1"
  ret="/display"
  allowDirectPrint=$true
  holdJob=$false
} | ConvertTo-Json -Compress
try {
  $sw=[Diagnostics.Stopwatch]::StartNew()
  $r = Invoke-WebRequest -UseBasicParsing -Method POST -Uri "$ub/display/label/direct-print" -Headers $headers -Body $bodyPrint -TimeoutSec 45
  $sw.Stop()
  $j = $r.Content | ConvertFrom-Json
  Write-Host ("  API: {0}ms  ok={1}  printer={2}  pdfOnly={3}  holdJob={4}  printKind={5}" -f $sw.ElapsedMilliseconds,$j.ok,$j.printer,$j.pdfOnly,$j.holdJob,$j.printKind)
  if($j.jobId){ Write-Host ("  Job-ID aus Backend: " + $j.jobId) }
} catch {
  Write-Host ("  FAIL API: " + $_.Exception.Message) -ForegroundColor Red
  if($_.Exception.Response){
    try {
      $resp = $_.Exception.Response
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $errBody = $reader.ReadToEnd()
      Write-Host ("  RESPONSE BODY: " + $errBody) -ForegroundColor Red
    } catch {}
  }
  exit 1
}

Write-Host ""
Write-Host "=== SCHRITT 2: lpq/lpstat MEHRMALS (1s, 5s, 12s, 20s) ===" -ForegroundColor Yellow
for($i=1; $i -le 4; $i++){
  $sleepSec = @(1,5,12,20)[$i-1]
  Start-Sleep -Seconds $sleepSec
  Write-Host ("  --- T+{0}s ---" -f $sleepSec)
  $q = Invoke-UbuCmd 'echo "-- lpq --"; lpq -P Brother_QL_1110NWB 2>&1; echo "-- lpstat -o last2 --"; lpstat -o 2>&1 | tail -n 5' -Timeout 20
  $q.Output | ForEach-Object { Write-Host ("    " + $_) }
}

Write-Host ""
Write-Host "=== SCHRITT 3: CUPS error_log + access_log NACH TEST (KRITISCH FÜR DEBUG!) ===" -ForegroundColor Magenta
$resLog = Invoke-UbuCmd -Sudo 'echo "=== CUPS error_log (aktuellster) ===" ; if [ -r /var/log/cups/error_log ]; then cat /var/log/cups/error_log ; else echo "error_log nicht lesbar oder leer"; fi ; echo ""; echo "=== CUPS page_log (Job Abrechnung, wenn Druck ok!) ===" ; if [ -r /var/log/cups/page_log ]; then tail -n 30 /var/log/cups/page_log 2>&1; else echo "page_log nicht lesbar oder leer"; fi ; echo ""; echo "=== lpinfo -l --include-schemes network (IPP Jobs live) ===" ; lpstat -W completed Brother_QL_1110NWB 2>&1 | tail -n 10' -Timeout 40
$resLog.Output | ForEach-Object { Write-Host "  $_" }
if($resLog.Error){ $resLog.Error | ForEach-Object { Write-Host ("  LOG STDERR: "+$_) -ForegroundColor Red } }

Write-Host ""
Write-Host "=== SCHRITT 4: Jobs completed prüfen (wenn OK=1 abgeschlossen!) ===" -ForegroundColor Cyan
$res2 = Invoke-UbuCmd 'COMPLETED=$(lpstat -W completed -P Brother_QL_1110NWB 2>&1 | grep -c Brother || true); NOTCOMPLETED=$(lpstat -W not-completed -P Brother_QL_1110NWB 2>&1 | grep -c Brother || true); echo "COMPLETED_JOBS=$COMPLETED"; echo "INCOMPLETE_JOBS=$NOTCOMPLETED"; if [ "$COMPLETED" -ge 1 ]; then echo "✅✅✅ JOB ABGESCHLOSSEN = LABEL WURDE GEDRUCKT! page_log oben zeigen die Anzahl der Seiten!"; else echo "⚠️  KEIN completed Job gefunden → schau error_log oben nach Fehlern!"; fi' -Timeout 25
$res2.Output | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host "FERTIG! → Schau jetzt direkt am Brother Drucker nach: KAM EIN ETIKETT RAUS?" -ForegroundColor Green
exit 0
