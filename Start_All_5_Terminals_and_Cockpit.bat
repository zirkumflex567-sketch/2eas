@echo off
setlocal
title 2EAs Dashboard (guarded)
echo MT5 auto-start is disabled: account/chart attachments and presets need manual verification.
echo Opening the dashboard uses the clean main checkout and private runtime configuration.
call "%~dp0Open_Dashboard.bat"
exit /b %errorlevel%
