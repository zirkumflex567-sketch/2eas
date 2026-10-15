@echo off
setlocal
title 2EAs Remote Dashboard (guarded)
echo Automatic terminal start and Git synchronization are disabled pending account and chart identity verification.
echo Opening the dashboard uses the clean main checkout and private runtime configuration.
call "%~dp0Open_Dashboard.bat"
exit /b %errorlevel%
