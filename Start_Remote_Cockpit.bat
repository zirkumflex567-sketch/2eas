@echo off
title XAU Titan Pro und GoldM15 - Remote Cockpit Starter
color 0A

echo ==============================================================================
echo       XAU TITAN PRO UND GOLDM15 - REMOTE INSTITUTIONAL COCKPIT STARTER
echo ==============================================================================
echo.

:: 1. Arbeitsverzeichnis und Python festlegen
cd /d "C:\Users\zirku\Downloads\testing"
set PYTHON_CMD=python
if exist "C:\Python314\python.exe" set PYTHON_CMD=C:\Python314\python.exe

:: 2. MetaTrader 5 Terminals pruefen und starten (beide Konten)
echo [1/5] Pruefe MetaTrader 5 Terminals...

:: 2a. XAU Titan Pro MT5 (PU Prime)
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (!(Get-Process terminal64 -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*PU Prime*' })) { Start-Process 'C:\Program Files\PU Prime MT5 Terminal\terminal64.exe' -WorkingDirectory 'C:\Program Files\PU Prime MT5 Terminal'; Write-Host '       [START] PU Prime MT5 Terminal gestartet.' -ForegroundColor Yellow } else { Write-Host '       [OK] PU Prime MT5 Terminal laeuft bereits.' -ForegroundColor Green }"

:: 2b. GoldM15 Reconstruction MT5 (.mt5-demo portable)
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (!(Get-Process terminal64 -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*goldm5*' })) { Start-Process 'C:\Users\zirku\Documents\goldm5\.mt5-demo\terminal64.exe' -ArgumentList '/portable' -WorkingDirectory 'C:\Users\zirku\Documents\goldm5\.mt5-demo'; Write-Host '       [START] GoldM15 MT5 Terminal (.mt5-demo) gestartet.' -ForegroundColor Yellow } else { Write-Host '       [OK] GoldM15 MT5 Terminal laeuft bereits.' -ForegroundColor Green }"

ping 127.0.0.1 -n 3 >nul

:: 3. Cockpit Webserver (app.py) pruefen und starten
echo.
echo [2/5] Pruefe Cockpit Dashboard auf Port 8050...
set DASHBOARD_ALLOWED_HOSTS=h-town.duckdns.org
set DASHBOARD_PROXY_SECRET=ee433ac2a6c6e42299ed55d5a021cf24e08012c2d8addd72d204361355381953
set DASHBOARD_PROXY_USERS={"kevin":"trade"}
set DASHBOARD_PROXY_PREFIX=/stt
netstat -ano | findstr "127.0.0.1:8050" | findstr "0.0.0.0:0" >nul
if errorlevel 1 (
    echo       [START] Starte Dashboard Webserver app.py...
    start "Titan Cockpit Server" /min "%PYTHON_CMD%" app.py
    ping 127.0.0.1 -n 3 >nul
    echo       [OK] Webserver auf Port 8050 gestartet.
) else (
    echo       [OK] Webserver laeuft bereits auf Port 8050.
)

:: 4. Auto-Sync Dienst (auto_sync_github.py) pruefen und starten
echo.
echo [3/5] Pruefe GitHub Auto-Sync Dienst...
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (!(Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*auto_sync_github.py*' })) { Start-Process '%PYTHON_CMD%' -ArgumentList 'auto_sync_github.py' -WorkingDirectory 'C:\Users\zirku\Downloads\testing' -WindowStyle Minimized; Write-Host '       [START] Auto-Sync Dienst gestartet.' -ForegroundColor Yellow } else { Write-Host '       [OK] Auto-Sync Dienst laeuft bereits.' -ForegroundColor Green }"

:: 5. SSH-Reverse-Tunnel zu h-town.duckdns.org pruefen und starten
echo.
echo [4/5] Pruefe SSH-Reverse-Tunnel (h-town.duckdns.org:8055 ^<--^> Local:8050)...
tasklist /FI "IMAGENAME eq ssh.exe" 2>nul | find /I "ssh.exe" >nul
if errorlevel 1 (
    echo       [START] Starte SSH Reverse-Tunnel Service...
    start "STT Reverse Tunnel" /min powershell.exe -ExecutionPolicy Bypass -NoProfile -File "C:\Users\zirku\Downloads\testing\start_stt_tunnel.ps1"
    ping 127.0.0.1 -n 3 >nul
    echo       [OK] SSH Reverse-Tunnel gestartet.
) else (
    echo       [OK] SSH Reverse-Tunnel laeuft bereits.
)

:: 6. Browser oeffnen
echo.
echo [5/5] Oeffne Remote-Cockpit im Browser...
start https://h-town.duckdns.org/stt/

echo.
echo ==============================================================================
echo                       STATUS-UEBERSICHT (BEREIT)
echo ==============================================================================
echo   MT5 Terminal 1: Blueberry Funded PROPFIRMA (#5120620 - Phase 1 Live Prop - $10k)
echo   MT5 Terminal 2: XAU Titan Pro 10k Demo (#53087839 - ICMarketsEU)
echo   MT5 Terminal 3: XAU Titan Pro 25k Demo (#53098080 - ICMarketsEU)
echo   MT5 Terminal 4: XAU Titan Pro M5 500$ Demo (#700184986 - PUPrime)
echo   MT5 Terminal 5: GoldM15 Reconstruction Demo (#53090070 - ICMarketsEU)
echo   Cockpit Server: http://127.0.0.1:8050 (Default: Blueberry Prop-Firma)
echo   Remote-Zugriff: https://h-town.duckdns.org/stt/
echo   SSH-Tunnel:     h-town.duckdns.org:8055 --^> 127.0.0.1:8050
echo   GitHub Sync:    Aktiv (Live-Pushes werden automatisch uebernommen)
echo.
echo   Login-Daten fuer Remote:
echo     Benutzer:     kevin
echo     Passwort:     TitanGold2026!
echo ==============================================================================
echo.
echo Dieses Fenster schliesst automatisch in wenigen Sekunden...
ping 127.0.0.1 -n 8 >nul
