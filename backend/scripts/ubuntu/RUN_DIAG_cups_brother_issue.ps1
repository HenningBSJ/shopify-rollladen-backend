[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"
Write-Host "=== [1] CUPS QUEUE PRÜFEN: lpq -P Brother_QL_1110NWB + lpstat ===" -ForegroundColor Cyan
$cmd1 = @"
echo '--- whoami (ubuntu user) ---'
whoami
id
echo '--- Brother Ping von UBUNTU aus (ENTSCHEIDEND! Nicht Windows!) ---'
ping -c 2 -W 2 192.168.2.103 2>&1 || true
echo '--- lpstat -t (alles) | head -60 ---'
lpstat -t 2>&1 | head -60
echo '--- lpq -P Brother_QL_1110NWB ---'
lpq -P Brother_QL_1110NWB 2>&1
echo '--- lpstat -o (aktive Jobs) ---'
lpstat -o 2>&1
echo '--- lpoptions -p Brother_QL_1110NWB -l (Drucker Optionen / Medien) ---'
lpoptions -p Brother_QL_1110NWB -l 2>&1 || true
echo '--- journalctl -u cups.service -n 30 --no-pager (letzte CUPS Logs!) ---'
journalctl -u cups.service -n 30 --no-pager -o short-iso 2>&1
"@
$res = Invoke-UbuCmd $cmd1 -Timeout 60
$res.Output | ForEach-Object { Write-Host "  $_" }
if($res.Error){ $res.Error | ForEach-Object { Write-Host ("  STDERR: " + $_) -ForegroundColor Red } }

Write-Host ""
Write-Host "=== [2] JOBS IM CUPS FREIGEBEN UND ALTEN CANCELLN ===" -ForegroundColor Yellow
$cmd2 = @"
echo '--- cancel -a (Alle Jobs auf ALLEN Druckern löschen!) ---'
cancel -a 2>&1
sleep 2
echo '--- lpq Brother danach ---'
lpq -P Brother_QL_1110NWB 2>&1
echo '--- cupsenable Brother (falls DISABLED!) + cupsaccept ---'
cupsenable Brother_QL_1110NWB 2>&1
cupsaccept Brother_QL_1110NWB 2>&1
sleep 2
lpstat -p Brother_QL_1110NWB 2>&1
"@
$res2 = Invoke-UbuCmd -Sudo $cmd2 -Timeout 60
$res2.Output | ForEach-Object { Write-Host "  $_" }
if($res2.Error){ $res2.Error | ForEach-Object { Write-Host ("  STDERR: " + $_) -ForegroundColor Red } }

exit 0
