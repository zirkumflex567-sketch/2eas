@echo off
title Titan Cockpit - Alle 5 MT5 Terminals und Server Starter
color 0A

echo ==============================================================================
echo        TITAN COCKPIT - STARTER FUER ALLE 5 MT5 TERMINALS & DASHBOARD
echo ==============================================================================
echo.

cd /d "C:\Users\zirku\Downloads\testing"
set PYTHON_CMD=python
if exist "C:\Python314\python.exe" set PYTHON_CMD=C:\Python314\python.exe

:: ==============================================================================
:: 1. PRUEFE & STARTE ALLE 5 MT5 TERMINALS (SICHTBAR)
:: ==============================================================================
echo [1/4] Pruefe und starte MetaTrader 5 Terminals (sichtbare Fenster)...

:: --- Terminal 1: Blueberry Funded PROPFIRMA (#5120620) ---
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-CimInstance Win32_Process -Filter \"Name = 'terminal64.exe'\" | Where-Object { $_.ExecutablePath -like '*700194619*' -and $_.ExecutablePath -like '*goldm5*' }; if ($p) { Write-Host '       [OK]    Terminal 1 (Blueberry Funded PROPFIRMA #5120620) laeuft bereits.' -ForegroundColor Green } else { start-process 'C:\Users\zirku\Documents\goldm5\.mt5-puprime-700194619\terminal64.exe' -ArgumentList '/portable' -WorkingDirectory 'C:\Users\zirku\Documents\goldm5\.mt5-puprime-700194619'; Write-Host '       [START] Terminal 1 (Blueberry Funded PROPFIRMA #5120620) gestartet.' -ForegroundColor Yellow }"

:: --- Terminal 2: XAU Titan Pro 10k Demo (#53087839) ---
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-CimInstance Win32_Process -Filter \"Name = 'terminal64.exe'\" | Where-Object { $_.ExecutablePath -like 'C:\Program Files\PU Prime MT5 Terminal\*' }; if ($p) { Write-Host '       [OK]    Terminal 2 (Titan Pro 10k Demo #53087839) laeuft bereits.' -ForegroundColor Green } else { start-process 'C:\Program Files\PU Prime MT5 Terminal\terminal64.exe' -WorkingDirectory 'C:\Program Files\PU Prime MT5 Terminal'; Write-Host '       [START] Terminal 2 (Titan Pro 10k Demo #53087839) gestartet.' -ForegroundColor Yellow }"

:: --- Terminal 3: XAUUSD 5 Minute M5 $250 Demo (#700194619) ---
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-CimInstance Win32_Process -Filter \"Name = 'terminal64.exe'\" | Where-Object { $_.ExecutablePath -like '*hermes_ea_work*' }; if ($p) { Write-Host '       [OK]    Terminal 3 (XAU 5M $250 Demo #700194619) laeuft bereits.' -ForegroundColor Green } else { start-process 'C:\Users\zirku\Downloads\mt5_strategy_research\rev\hermes_ea_work\portable\terminal64.exe' -ArgumentList '/portable' -WorkingDirectory 'C:\Users\zirku\Downloads\mt5_strategy_research\rev\hermes_ea_work\portable'; Write-Host '       [START] Terminal 3 (XAU 5M $250 Demo #700194619) gestartet.' -ForegroundColor Yellow }"

:: --- Terminal 4: XAU Titan Pro M5 $500 #1 Demo (#700184986) ---
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-CimInstance Win32_Process -Filter \"Name = 'terminal64.exe'\" | Where-Object { $_.ExecutablePath -like '*goldm5\.mt5-puprime\terminal64.exe' }; if ($p) { Write-Host '       [OK]    Terminal 4 (Titan M5 $500 #1 Demo #700184986) laeuft bereits.' -ForegroundColor Green } else { start-process 'C:\Users\zirku\Documents\goldm5\.mt5-puprime\terminal64.exe' -ArgumentList '/portable' -WorkingDirectory 'C:\Users\zirku\Documents\goldm5\.mt5-puprime'; Write-Host '       [START] Terminal 4 (Titan M5 $500 #1 Demo #700184986) gestartet.' -ForegroundColor Yellow }"

:: --- Terminal 5: XAUUSD 5 Minute M15 $500 #2 Demo (#700194822) ---
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-CimInstance Win32_Process -Filter \"Name = 'terminal64.exe'\" | Where-Object { $_.ExecutablePath -like '*700194822*' }; if ($p) { Write-Host '       [OK]    Terminal 5 (XAU 5M $500 Demo #700194822) laeuft bereits.' -ForegroundColor Green } else { start-process 'C:\Users\zirku\Documents\goldm5\.mt5-puprime-700194822\terminal64.exe' -ArgumentList '/portable' -WorkingDirectory 'C:\Users\zirku\Documents\goldm5\.mt5-puprime-700194822'; Write-Host '       [START] Terminal 5 (XAU 5M $500 Demo #700194822) gestartet.' -ForegroundColor Yellow }"

ping 127.0.0.1 -n 3 >nul

:: ==============================================================================
:: 2. PRUEFE & STARTE DASHBOARD WEBSERVER (PORT 8050)
:: ==============================================================================
echo.
echo [2/4] Pruefe Cockpit Dashboard auf Port 8050...
set DASHBOARD_ALLOWED_HOSTS=h-town.duckdns.org
set DASHBOARD_PROXY_SECRET=7a64fc2c0c11f9b06650d9bd97ad932d45536c6f9a550ce7ed55d5e7a166af33
set DASHBOARD_PROXY_USERS={"kevin":"trade"}
set DASHBOARD_PROXY_PREFIX=/stt
netstat -ano | findstr "127.0.0.1:8050" | findstr "0.0.0.0:0" >nul
if errorlevel 1 (
    echo       [START] Starte Dashboard Webserver (app.py)...
    start "Titan Cockpit Server" /min "%PYTHON_CMD%" app.py
    ping 127.0.0.1 -n 3 >nul
    echo       [OK]    Webserver auf Port 8050 gestartet.
) else (
    echo       [OK]    Webserver laeuft bereits auf Port 8050.
)

:: ==============================================================================
:: 3. PRUEFE & STARTE SSH REVERSE TUNNEL (FUER HANDY/EXTERNEN ZUGRIFF)
:: ==============================================================================
echo.
echo [3/4] Pruefe SSH-Reverse-Tunnel (h-town.duckdns.org:8055 ^<--^> Local:8050)...
tasklist /FI "IMAGENAME eq ssh.exe" 2>nul | find /I "ssh.exe" >nul
if errorlevel 1 (
    echo       [START] Starte SSH Reverse-Tunnel Service...
    start "STT Reverse Tunnel" /min powershell.exe -ExecutionPolicy Bypass -NoProfile -File "C:\Users\zirku\Downloads\testing\start_stt_tunnel.ps1"
    ping 127.0.0.1 -n 3 >nul
    echo       [OK]    SSH Reverse-Tunnel gestartet.
) else (
    echo       [OK]    SSH Reverse-Tunnel laeuft bereits.
)

:: ==============================================================================
:: 4. BROWSER OEFFNEN
:: ==============================================================================
echo.
echo [4/4] Oeffne Remote-Cockpit im Browser...
start https://h-town.duckdns.org/stt/

echo.
echo ==============================================================================
echo                       STATUS-UEBERSICHT (BEREIT)
echo ==============================================================================
echo   Terminal 1: Blueberry Funded PROPFIRMA (#5120620 - Phase 1 Live Prop - $10k)
echo   Terminal 2: XAU Titan Pro 10k Demo (#53087839 - ICMarketsEU)
echo   Terminal 3: XAUUSD 5 Minute M5 $250 Demo (#700194619 - PUPrime)
echo   Terminal 4: XAU Titan Pro M5 $500 #1 Demo (#700184986 - PUPrime)
echo   Terminal 5: XAUUSD 5 Minute M15 $500 #2 Demo (#700194822 - PUPrime)
echo.
echo   Lokal am PC:    http://127.0.0.1:8050
echo   Handy / Remote: https://h-town.duckdns.org/stt/
echo   Login Remote:   Benutzer: kevin  ^|  Passwort: TitanGold2026!
echo ==============================================================================
echo.
echo Druecke eine beliebige Taste, um dieses Fenster zu schliessen...
pause >nul
