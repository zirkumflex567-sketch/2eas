@echo off
setlocal
title 2EAs Dashboard (guarded)
echo This legacy starter no longer launches terminals or an unverified checkout.
echo Opening the dashboard uses the clean main checkout and private runtime configuration.
call "%~dp0Open_Dashboard.bat"
exit /b %errorlevel%
