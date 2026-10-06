@echo off
chcp 65001 >nul
title Monitor + Cloudflared - Neustart

setlocal
set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%scripts\restart-stack.ps1"

if not exist "%PS_SCRIPT%" (
  echo FEHLER: Skript nicht gefunden:
  echo %PS_SCRIPT%
  pause
  exit /b 1
)

REM === Auto-Admin-Elevation ===
fltmc >nul 2>&1
if errorlevel 1 (
  echo Starte mit Administrator-Rechten neu...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

REM === Eigentlicher Stack-Neustart ===
echo.
echo Starte Stack-Neustart (Backend + Cloudflared)...
echo Skript: %PS_SCRIPT%
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -KeepConsole

endlocal
