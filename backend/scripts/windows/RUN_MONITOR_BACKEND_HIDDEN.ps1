# Rolladen Monitor Backend (HIDDEN MODE!)
# Wird von Task Scheduler aufgerufen! Startet Node KOMPLETT OHNE FENSTER!

$ErrorActionPreference = "SilentlyContinue"

# Working Directory setzen
Set-Location "C:\Projects\Shopify\backend"

# Environment Variablen setzen
$env:NODE_ENV = "production"
$env:PORT = "3007"
$env:HOST = "0.0.0.0"

# Node Starten (KEIN FENSTER! -WindowStyle Hidden + Kein PowerShell Fenster!)
& "C:\Program Files\nodejs\node.exe" -r dotenv/config "C:\Projects\Shopify\backend\src\index.js"

exit $LASTEXITCODE
