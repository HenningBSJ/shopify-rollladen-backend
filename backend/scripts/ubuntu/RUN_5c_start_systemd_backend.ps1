[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "TASK 5c: systemd rollladen-backend.service starten" -ForegroundColor Cyan
Write-Host "============================================================"

Write-Host ""
Write-Host "Step 1: Vorheriger Status + daemon-reload" -ForegroundColor Yellow
$r1 = Invoke-UbuCmd -Sudo "systemctl daemon-reload ; echo '=== Units enabled? ===' ; systemctl is-enabled rollladen-backend.service ; systemctl is-enabled rollladen-cloudflared.service 2>&1 ; echo '=== Vor Start rollladen-backend Active ===' ; systemctl is-active rollladen-backend.service 2>&1 || echo inactive"
$r1.Output | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host "Step 2: Starte rollladen-backend.service" -ForegroundColor Yellow
$r2 = Invoke-UbuCmd -Sudo "systemctl start rollladen-backend.service ; sleep 3 ; systemctl status rollladen-backend.service --no-pager -l -n 20" -Timeout 30
$r2.Output | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host "Step 3: Aktiv & Prozess laeuft?" -ForegroundColor Yellow
$r3 = Invoke-UbuCmd -Sudo "systemctl is-active rollladen-backend.service ; systemctl show -p MainPID,MemoryCurrent,CPUTimeUSec rollladen-backend.service ; echo '' ; echo '=== node Prozesse ===' ; ps -eo pid,user,etime,args | grep -E 'node src/index' | grep -v grep ; echo '' ; echo '=== Health Endpoint curl ===' ; for i in 1 2 3 4 5; do sleep 2 ; code=\$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3006/health 2>/dev/null || echo '000') ; echo \"  Versuch \$i: /health=\$code\" ; if [ \"\$code\" = '200' ]; then curl -s http://127.0.0.1:3006/health ; echo '' ; break ; fi ; done" -Timeout 40
$r3.Output | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host "Step 4: journalctl -u rollladen-backend letze 50 Zeilen" -ForegroundColor Yellow
$r4 = Invoke-UbuCmd -Sudo "journalctl -u rollladen-backend.service --no-pager -n 50 -o short-iso 2>&1" -Timeout 30
$r4.Output | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host "Zusammenfassung:" -ForegroundColor Cyan
$summary = Invoke-UbuCmd -Sudo "A=\$(systemctl is-active rollladen-backend.service) ; H=\$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3006/health) ; echo \"  Active: \$A\" ; echo \"  /health: HTTP \$H\" ; [ \"\$A\" = 'active' ] && [ \"\$H\" = '200' ] && echo '  TASK5C: ✅ OK' || echo '  TASK5C: ❌ FAIL'"
$summary.Output | ForEach-Object { Write-Host "  $_" }

exit 0
