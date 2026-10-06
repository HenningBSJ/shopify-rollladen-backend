# TASK 5b FIX: /etc/rollladen-monitor.env um alle Werte mit Single Quotes versehen,
# damit Sonderzeichen (Klammern, %, $, ' etc.) korrekt von bash geparst werden.
[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_ubu-helper.ps1"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Aktuelle ENV Datei (cat -An, Zeilen 15-35)" -ForegroundColor Cyan
Write-Host "============================================================"
$r = Invoke-UbuCmd -Sudo "cat -An /etc/rollladen-monitor.env | sed -n '1,40p'"
$r.Output | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Fix: Schreibe ENV neu mit korrektem Quoting (awk)" -ForegroundColor Cyan
Write-Host "============================================================"
$fix = Invoke-UbuCmd -Sudo @'
set -e
BACKUP=/etc/rollladen-monitor.env.bak-quotefix.$(date +%s)
cp -a /etc/rollladen-monitor.env "$BACKUP"
echo "Backup erstellt: $BACKUP"

# Schreibe neu: Kommentare/Leerzeilen bleiben, VAR=VALUE → VALUE in single quotes
# (ausser Value startet schon mit ')
awk '
/^[[:space:]]*$/ || /^[[:space:]]*#/ { print; next }
/^[A-Za-z_][A-Za-z0-9_]*=/ {
  eq = index($0, "=")
  var = substr($0, 1, eq - 1)
  val = substr($0, eq + 1)
  # Schon gequotet? Single/Double Quoted lassen wir erstmal in Ruhe falls Value damit anfaengt
  if (val ~ /^'"'"'.*'"'"'$/) { print var "=" val; next }
  if (val ~ /^\".*\"$/) { print var "=" val; next }
  # Escape single quote im Value: '\'' (quote backslash quote quote)
  gsub(/'"'"'/, "'"'"'\\'"'"'"'"'"'", val)
  print var "='"'"'" val "'"'"'"
  next
}
{ print }
' "$BACKUP" > /etc/rollladen-monitor.env.new

chown root:rollladen /etc/rollladen-monitor.env.new
chmod 640 /etc/rollladen-monitor.env.new
# ACL uebernehmen
if command -v getfacl >/dev/null 2>&1; then
  getfacl "$BACKUP" 2>/dev/null | setfacl --set-file=- /etc/rollladen-monitor.env.new 2>/dev/null || true
fi
mv -f /etc/rollladen-monitor.env.new /etc/rollladen-monitor.env
echo "OK: Neue ENV geschrieben."
echo ""
echo "=== Check: bash -n (source test) ==="
bash -n /etc/rollladen-monitor.env && echo "bash -n: OK_SYNTAX"
echo ""
echo "=== Test source als User rollladen (PORT & SAFE_MODE werden angezeigt) ==="
echo "000000" | sudo -S -p '' -u rollladen bash -c 'set -a ; . /etc/rollladen-monitor.env ; echo PORT=$PORT ; echo SAFE_MODE_SLACK=$SAFE_MODE_SLACK ; echo MONITOR_HTTP_PASSWORD hat Laenge: ${#MONITOR_HTTP_PASSWORD} ; echo DIRECT_PRINT_PRINTER=$DIRECT_PRINT_PRINTER ; echo ENV_OK'
echo ""
echo "=== Kopf 25 Zeilen (cat -A) ==="
head -25 /etc/rollladen-monitor.env | cat -A
'@
$fix.Output | ForEach-Object { Write-Host "  $_" }
exit 0
