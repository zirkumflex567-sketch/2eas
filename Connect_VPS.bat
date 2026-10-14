@echo off
title VPS SSH Console - kevin@h-town.duckdns.org
color 0B

echo ==============================================================================
echo                 SSH-VERBINDUNG ZUM VPS (h-town.duckdns.org)
echo ==============================================================================
echo.
echo Benutzer: kevin
echo Host:     h-town.duckdns.org
echo Key:      %USERPROFILE%\.ssh\id_ed25519
echo.
echo Verbinde per SSH... (Zum Beenden einfach 'exit' eingeben)
echo ==============================================================================
echo.

ssh -i "%USERPROFILE%\.ssh\id_ed25519" -o StrictHostKeyChecking=accept-new kevin@h-town.duckdns.org

echo.
echo ==============================================================================
echo SSH-Verbindung beendet.
echo ==============================================================================
echo.
echo Druecke eine beliebige Taste, um dieses Fenster zu schliessen...
pause >nul
