[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"
$ub="http://100.98.136.86:3006"
$user='monitor'; $pw='hTgfR4%%jsu(,.,GmnAQdfwra'
$pair = "$($user):$($pw)"; $bytes = [System.Text.Encoding]::ASCII.GetBytes($pair); $base64 = [System.Convert]::ToBase64String($bytes)
$headers = @{ Authorization = "Basic $base64" ; 'Content-Type' = 'application/json'}

Write-Host "=== FINAL TEST: ECHTER DRUCK (holdJob=FALSE!) auf Ubuntu CUPS socket://9100 ===" -ForegroundColor Cyan
Write-Host "→ Wenn OK: Kamera auf Brother richten, Etikett kommt raus!"
Write-Host ""
$bodyPrint = @{
  qr="https://monitor.rollladenwelt.de/display?code=rwjjob:Rec0C0AK56DPT"
  l1="FINAL CUPS FIX OK!"
  d="2026-09-11"
  c1="UBUNTU SOCKET RAW"
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
  Write-Host ("  API ms={0}  ok={1}  printer={2}  pdfOnly={3}  holdJob={4}  printKind={5}" -f $sw.ElapsedMilliseconds,$j.ok,$j.printer,$j.pdfOnly,$j.holdJob,$j.printKind)
} catch { Write-Host ("  FAIL API: {0}" -f $_.Exception.Message); exit 1 }

Write-Host ""
Write-Host "=== CUPS Status 3x (2s, 7s, 12s) ===" -ForegroundColor Yellow
$sb = {
  param($T)
  Start-Sleep $T
  Write-Host ("  --- T+{0}s ---" -f $T)
  $cmd = 'echo "--- lpq ---"; lpq -P Brother_QL_1110NWB 2>&1 ; echo "--- lpstat -o ---"; lpstat -o 2>&1'
  $res = Invoke-UbuCmd $cmd -Timeout 20
  $res.Output | ForEach-Object { Write-Host ("    " + $_) }
  if($res.Error){ $res.Error | ForEach-Object { Write-Host ("    STDERR: " + $_) -ForegroundColor Red } }
  Write-Host ""
}
. $sb 2
. $sb 7
. $sb 12

Write-Host ""
Write-Host "=== FINAL CHECK: Jobs noch in Queue? (0 = rausgedruckt!) ===" -ForegroundColor Cyan
$res2 = Invoke-UbuCmd 'JOBS=$(lpstat -o 2>&1 | grep -c Brother); echo JOBS_IN_QUEUE=$JOBS; [ "$JOBS" -eq 0 ] && echo "✅ KEINE JOBS MEHR = LABEL WURDE AN BROTHER UEBERMITTELT UND GEDRUCKT! (oder wird gerade gedruckt!)" || echo "⚠️  Noch Jobs da - schau nochmal nach 30s"' -Timeout 20
$res2.Output | ForEach-Object { Write-Host "  $_" }
exit 0
