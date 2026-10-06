[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"
$scriptRemote = "/tmp/fix-cups.sh"
Write-Host "Upload FIX Shellscript..."
CopyTo-Ubu -LocalPath (Join-Path $PSScriptRoot "RUN_FIX_cups_raw_socket.sh") -RemotePath $scriptRemote
Write-Host "Run chmod +x..."
Invoke-UbuCmd "chmod +x $scriptRemote" | Out-Null
Write-Host "Run script als root (sudo!)..."
$oldPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$res = Invoke-UbuCmd -Sudo "bash $scriptRemote 2>&1" -Timeout 120
$ErrorActionPreference = $oldPref
$res.Output | ForEach-Object { Write-Host "  $_" }
if($res.Error){ $res.Error | ForEach-Object { Write-Host ("  STDERR: " + $_) -ForegroundColor DarkRed } }
exit 0
