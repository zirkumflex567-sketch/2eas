@echo off
title XAU Titan Pro - Cockpit & STT Starter

echo ==============================================================================
echo        XAU TITAN PRO - MULTI-ACCOUNT COCKPIT UND REMOTE STT STARTER
echo ==============================================================================
echo.

:: 1. Python Pfad festlegen
set PYTHON_CMD=python
if exist "C:\Python314\python.exe" set PYTHON_CMD=C:\Python314\python.exe

:: 2. MetaTrader 5 Terminal pruefen und starten
echo [1/4] Pruefe MetaTrader 5 Terminals...
tasklist /FI "IMAGENAME eq terminal64.exe" 2>nul | find /I "terminal64.exe" >nul
if errorlevel 1 (
    echo       Starte MetaTrader 5 Terminal...
    if exist "C:\Program Files\PU Prime MT5 Terminal\terminal64.exe" (
        start "" "C:\Program Files\PU Prime MT5 Terminal\terminal64.exe"
    ) else if exist "C:\Program Files\MetaTrader 5 IC Markets EU\terminal64.exe" (
        start "" "C:\Program Files\MetaTrader 5 IC Markets EU\terminal64.exe"
    ) else if exist "C:\Program Files\MetaTrader 5\terminal64.exe" (
        start "" "C:\Program Files\MetaTrader 5\terminal64.exe"
    )
    ping 127.0.0.1 -n 3 >nul
    echo       [OK] MetaTrader 5 gestartet.
) else (
    echo       [OK] MetaTrader 5 laeuft bereits.
)

:: 3. Cockpit Webserver pruefen und starten
echo [2/4] Pruefe Dashboard Webserver auf Port 8050...
netstat -ano | findstr "127.0.0.1:8050" | findstr "0.0.0.0:0" >nul
if errorlevel 1 (
    echo       Starte Dashboard Webserver app.py...
    cd /d "C:\Users\zirku\Downloads\testing"
    start "Titan Cockpit Server" /min "%PYTHON_CMD%" app.py
    ping 127.0.0.1 -n 3 >nul
    echo       [OK] Webserver gestartet.
) else (
    echo       [OK] Dashboard-Server laeuft bereits auf Port 8050.
)

:: 4. SSH-Reverse-Tunnel zu h-town.duckdns.org pruefen und starten
echo [3/4] Pruefe SSH-Reverse-Tunnel zu h-town.duckdns.org...
tasklist /FI "IMAGENAME eq ssh.exe" 2>nul | find /I "ssh.exe" >nul
if errorlevel 1 (
    echo       Starte STT Reverse-Tunnel...
    cd /d "C:\Users\zirku\Downloads\testing"
    start "STT Reverse Tunnel" /min powershell.exe -ExecutionPolicy Bypass -NoProfile -File "c:\Users\zirku\Downloads\testing\start_stt_tunnel.ps1"
    ping 127.0.0.1 -n 2 >nul
    echo       [OK] Reverse-Tunnel aktiv.
) else (
    echo       [OK] Reverse-Tunnel laeuft bereits.
)

:: 5. Browser oeffnen
echo [4/4] Oeffne Live-Cockpit im Browser...
start https://h-town.duckdns.org/stt/

echo.
echo ==============================================================================
echo   Lokal:  http://127.0.0.1:8050
echo   Remote: https://h-town.duckdns.org/stt/
echo   Login:  kevin
echo ==============================================================================
echo.
ping 127.0.0.1 -n 4 >nul
