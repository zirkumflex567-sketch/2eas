@echo off
echo This legacy stopper is disabled because it killed every SSH and listener process without checking ownership.
echo Use the guarded scripts/dashboard_runtime.ps1 command for the selected main checkout.
exit /b 2
