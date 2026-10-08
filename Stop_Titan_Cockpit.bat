@echo off
title XAU Titan Pro - Cockpit & Tunnel Stopper

echo ==============================================================================
echo        XAU TITAN PRO - DASHBOARD UND TUNNEL STOPPER
echo ==============================================================================
echo.

echo Beende Dashboard Server auf Port 8050...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "127.0.0.1:8050" ^| findstr "0.0.0.0:0"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Beende SSH Reverse-Tunnel...
taskkill /F /IM ssh.exe >nul 2>&1

echo.
echo [OK] Dashboard-Server und Tunnel erfolgreich beendet.
ping 127.0.0.1 -n 3 >nul
