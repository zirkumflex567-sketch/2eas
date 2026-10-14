@echo off
title XAU Titan Pro & GoldM15 - Remote Cockpit Stopper
color 0C

echo ==============================================================================
echo        XAU TITAN PRO & GOLDM15 - REMOTE COCKPIT STOPPER
echo ==============================================================================
echo.

echo [1/3] Beende Dashboard Server auf Port 8050...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "127.0.0.1:8050" ^| findstr "0.0.0.0:0 LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo       [OK] Dashboard Server beendet.

echo.
echo [2/3] Beende SSH-Reverse-Tunnel...
taskkill /F /IM ssh.exe >nul 2>&1
echo       [OK] SSH-Tunnel beendet.

echo.
echo [3/3] Beende GitHub Auto-Sync Dienst...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*auto_sync_github.py*' } | Stop-Process -Force" >nul 2>&1
echo       [OK] Auto-Sync beendet.

echo.
echo ==============================================================================
echo [HINWEIS] MetaTrader 5 Terminals wurden NICHT beendet (EAs laufen weiter).
echo ==============================================================================
echo.
timeout /t 4 >nul
