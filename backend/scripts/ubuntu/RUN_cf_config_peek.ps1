[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"
Write-Host "Schritt 1: Aktuelle config.yml anzeigen" -ForegroundColor Cyan
$r1 = Invoke-UbuCmd -Sudo "echo '=== LS /srv/rollladen-monitor/cloudflared ==='; ls -la /srv/rollladen-monitor/cloudflared/ ; echo ''; echo '=== Inhalt config.yml ==='; cat -An /srv/rollladen-monitor/cloudflared/config.yml ; echo ''; echo '=== Zertifikat cert.pem Laenge und erste Zeile? ==='; wc -c /srv/rollladen-monitor/cloudflared/cert.pem; head -c 50 /srv/rollladen-monitor/cloudflared/cert.pem | cat -v; echo ''"
$r1.Output | ForEach-Object { Write-Host "  $_" }
exit 0
