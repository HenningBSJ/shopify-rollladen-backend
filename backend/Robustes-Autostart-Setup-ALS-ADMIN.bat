@echo off
chcp 65001 >nul
title Robustes Autostart-Setup  [ALS ADMIN AUSFUEHREN!]

setlocal
set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%scripts\install-robust-setup.ps1"

if not exist "%PS_SCRIPT%" (
  echo FEHLER: Skript nicht gefunden:
  echo %PS_SCRIPT%
  pause
  exit /b 1
)

REM === Auto-Admin-Elevation (wie Monitor-Neustart.bat) ===
fltmc >nul 2>&1
if errorlevel 1 (
  echo Starte mit Administrator-Rechten neu...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

cls
echo ========================================================================
echo   ROBUSTES AUTOSTART-SETUP
echo   Backend + Cloudflared - LAEUFT OHNE BENUTZER-LOGIN!
echo ========================================================================
echo.
echo Dieses Skript legt 4 Windows-Scheduled Tasks an,
echo die ALLE als SYSTEM-Account laufen (benoetigt KEINEN Login!):
echo.
echo   * Nach REBOOT (auch OHNE jemals einzuloggen!):
echo       - 15s: Cloudflared-Dienst reparieren + starten
echo       - 25s: Node.js Backend (Port 3006) starten
echo.
echo   * Im laufenden Betrieb:
echo       - Alle 2 Min: Cloudflared-Tunnel auf 502/530 pruefen + reparieren
echo       - Alle 5 Min: Backend lokal+öffentlich pruefen + neustarten
echo.
echo ========================================================================
echo.
echo Skript: %PS_SCRIPT%
echo.
echo Bereit? Beliebige Taste druecken zum Starten,
echo oder STRG+C zum Abbrechen.
pause >nul

echo.
echo Starte Setup...
echo ============================================================

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -Port 3006 -PublicHealthUrl 'https://monitor.rollladenwelt.de/health'

echo.
echo ============================================================
if errorlevel 1 (
  echo [FEHLER] Setup wurde mit Fehler abgebrochen. Siehe oben.
  color 4F
) else (
  echo [ERFOLG] Setup abgeschlossen! Die Tasks laufen ab sofort.
  echo          1. Test: Get-ScheduledTask ^| ? TaskName -like 'Rollladen*'
  echo          2. Neustart des Rechners OHNE Einloggen testen!
  color 2F
)
echo.
echo Beliebige Taste zum Schliessen...
pause >nul
endlocal
