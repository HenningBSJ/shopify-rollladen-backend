# TASK 5b: ENV Check + Smoketest Runner (Remote Ubuntu)
[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "STEP 1: ENV Datei Status Check (BOM/CRLF/Variablen)" -ForegroundColor Cyan
Write-Host "============================================================"
$envCheck = Invoke-UbuCmd -Sudo @'
echo "=== hexdump first 16 bytes ==="
xxd -l 16 /etc/rollladen-monitor.env 2>/dev/null || od -An -tx1 -N16 /etc/rollladen-monitor.env
echo ""
echo "=== Kopf 3 Zeilen (cat -A) ==="
head -3 /etc/rollladen-monitor.env | cat -A
echo ""
echo "=== CRLF-Zaehler (sollte 0 sein) ==="
grep -cP '\r$' /etc/rollladen-monitor.env 2>/dev/null || echo "0"
echo ""
echo "=== Wichtige Variablen ==="
grep -E '^(PORT|NODE_ENV|SAFE_MODE_SLACK|ALLOW_START_WITHOUT_DB|MONITOR_HTTP_USER|DIRECT_PRINT_PRINTER|DIRECT_PRINT_CHROMIUM_EXE|DIRECT_PRINT_LP_EXE|DIRECT_PRINT_LPSTAT_EXE)=' /etc/rollladen-monitor.env
echo ""
echo "=== Datei Berechtigungen ==="
ls -la /etc/rollladen-monitor.env
getfacl /etc/rollladen-monitor.env 2>/dev/null || stat -c '%a %U:%G %n' /etc/rollladen-monitor.env
echo ""
echo "=== User rollladen kann env lesen? (sudo -u mit passwd stdin) ==="
echo "000000" | sudo -S -p '' -u rollladen bash -c 'set -a ; . /etc/rollladen-monitor.env 2>&1 && echo OK_LESBAR PORT=$PORT || echo NICHT_LESBAR' 2>&1
echo ""
echo "=== /srv/rollladen-monitor/backend? ==="
ls -la /srv/rollladen-monitor/backend/package.json 2>&1
echo "=== node -v als rollladen? ==="
echo "000000" | sudo -S -p '' -u rollladen /usr/bin/node -v 2>&1
'@
$envCheck.Output | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "STEP 2: Smoketest Skript hochladen + ausfuehren" -ForegroundColor Cyan
Write-Host "============================================================"
CopyTo-Ubu -LocalPath (Join-Path $PSScriptRoot "_remote_C_smoketest.sh") -RemotePath "/tmp/c_smoketest.sh"
Invoke-UbuCmd "chmod +x /tmp/c_smoketest.sh" | Out-Null

Write-Host ""
Write-Host "  Starte SMOKE TEST als User 'rollladen' via root (Dauer ~20-40s)..." -ForegroundColor Yellow
$smokeRes = Invoke-UbuCmd -Sudo "sudo -u rollladen HOME=/var/lib/rollladen bash /tmp/c_smoketest.sh" -Timeout 90
$smokeRes.Output | ForEach-Object { Write-Host "  $_" }
Write-Host ""
Write-Host "✅ SMOKE TEST Exit Status: ExitStatus=$($smokeRes.ExitStatus)" -ForegroundColor $(if($smokeRes.ExitStatus -eq 0){'Green'}else{'Red'})

if ($smokeRes.ExitStatus -ne 0) {
    Write-Host "!! SMOKE TEST FAILED - Debug Infos folgen !!" -ForegroundColor Red
    $dbg = Invoke-UbuCmd "echo '== Letzte Backend-Logs:'; tail -n 80 /tmp/rollladen-backend-smoke.log 2>/dev/null || echo 'KEIN_LOG'; echo ''; echo '== journalctl -xe? =='; journalctl --no-pager -n 30 2>/dev/null" -Sudo
    $dbg.Output | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkRed }
    throw "SMOKE_TEST_FAILED_$($smokeRes.ExitStatus)"
}
exit 0
