@echo off
title Open Trading Dashboard
color 0A

echo ==============================================================================
echo                       TRADING DASHBOARD OEFFNEN
echo ==============================================================================
echo.
echo [1/3] Pruefe lokalen Dashboard-Server (Port 8050)...
set DASHBOARD_ALLOWED_HOSTS=h-town.duckdns.org
set DASHBOARD_PROXY_SECRET=ee433ac2a6c6e42299ed55d5a021cf24e08012c2d8addd72d204361355381953
set DASHBOARD_PROXY_USERS={"kevin":"trade"}
set DASHBOARD_PROXY_PREFIX=/stt
netstat -ano | findstr "127.0.0.1:8050" | findstr "0.0.0.0:0" >nul
if errorlevel 1 (
    echo       Server laeuft noch nicht. Starte app.py...
    set PYTHON_CMD=python
    if exist "C:\Python314\python.exe" set PYTHON_CMD=C:\Python314\python.exe
    cd /d "C:\Users\zirku\Downloads\testing"
    start "Titan Cockpit Server" /min "%PYTHON_CMD%" app.py
    ping 127.0.0.1 -n 3 >nul
    echo       [OK] Server gestartet.
) else (
    echo       [OK] Server laeuft bereits auf Port 8050.
)

echo.
echo [2/3] Pruefe SSH Reverse-Tunnel zu h-town.duckdns.org...
tasklist /FI "IMAGENAME eq ssh.exe" 2>nul | find /I "ssh.exe" >nul
if errorlevel 1 (
    echo       Tunnel laeuft noch nicht. Starte Reverse-Tunnel...
    cd /d "C:\Users\zirku\Downloads\testing"
    start "STT Reverse Tunnel" /min powershell.exe -ExecutionPolicy Bypass -NoProfile -File "c:\Users\zirku\Downloads\testing\start_stt_tunnel.ps1"
    ping 127.0.0.1 -n 2 >nul
    echo       [OK] Reverse-Tunnel aktiviert.
) else (
    echo       [OK] SSH Reverse-Tunnel ist aktiv.
)

echo.
echo [3/3] Oeffne Trading-Dashboard im Browser...
start https://h-town.duckdns.org/stt/

echo.
echo ==============================================================================
echo   Remote URL:  https://h-town.duckdns.org/stt/
echo   Login:       kevin
echo   Passwort:    TitanGold2026!
echo   Lokal:       http://127.0.0.1:8050
echo ==============================================================================
echo.
ping 127.0.0.1 -n 4 >nul
