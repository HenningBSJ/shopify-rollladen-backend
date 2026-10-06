[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"
Write-Host "Schritt 1: 5d printhealth.sh uploaden" -ForegroundColor Cyan
CopyTo-Ubu -LocalPath (Join-Path $PSScriptRoot "_remote_5d_printhealth.sh") -RemotePath /tmp/ph_test.sh
Invoke-UbuCmd "chmod +x /tmp/ph_test.sh" | Out-Null
Write-Host "Schritt 2: Als User rollladen via sudo ausfuehren" -ForegroundColor Cyan

# Fehler nicht werfen, wir wollen die Ausgabe sehen, auch wenn Exit!=0
$oldPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$res = $null
try {
  $res = Invoke-UbuCmd -Sudo "bash -c 'sudo -u rollladen HOME=/var/lib/rollladen bash /tmp/ph_test.sh; echo PH_DONE_EXIT=\$?'" -Timeout 150 -ErrorAction SilentlyContinue
} catch {
  Write-Host "Invoke-Catch (harmlos): $_" -ForegroundColor DarkGray
}
$ErrorActionPreference = $oldPref

if ($res) {
  $res.Output | ForEach-Object { Write-Host "  $_" }
  if ($res.Error) { $res.Error | ForEach-Object { Write-Host "  STDERR: $_" -ForegroundColor DarkRed } }
  Write-Host ""
  Write-Host "ExitStatus=$($res.ExitStatus)" -ForegroundColor $(if($res.ExitStatus -eq 0){'Green'}else{'Yellow'})
}
Write-Host ""
Write-Host "(Pruefe die Ausgabe auf PH_DONE_EXIT=0 / 1 und ✅ ❌)" -ForegroundColor Cyan
exit 0
