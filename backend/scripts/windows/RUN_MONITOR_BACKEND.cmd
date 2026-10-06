@echo off
setlocal

REM ===========================================
REM Rolladen Monitor Backend Starter (Port 3009)
REM Wird von Task Scheduler aufgerufen!
REM ===========================================

REM Arbeitsverzeichnis WECHSELN (immer vor Node Start!)
cd /d "C:\Projects\Shopify\backend"

REM Environment Variablen setzen (SICHER, falls .env nicht geladen wird!)
set NODE_ENV=production
set PORT=3009
set HOST=0.0.0.0

REM Node mit dotenv Preload starten (Pfad zur node.exe + Dateien KOMPLETT mit Anführungszeichen!)
"C:\Program Files\nodejs\node.exe" -r dotenv/config "C:\Projects\Shopify\backend\src\index.js"

REM Exit Code weitergeben
exit /b %ERRORLEVEL%
endlocal
