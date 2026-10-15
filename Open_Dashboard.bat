@echo off
setlocal
title 2EAs Dashboard (guarded)

if not defined DASHBOARD_REPO_PATH set "DASHBOARD_REPO_PATH=%USERPROFILE%\.codex\worktrees\open-tasks-delivery\testing"
if not exist "%DASHBOARD_REPO_PATH%\scripts\ensure_dashboard_runtime.ps1" (
    echo The configured checkout does not contain the guarded runtime launcher.
    exit /b 2
)

set "PYTHON_EXE=C:\Python314\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python.exe"
set "PRIVATE_ENV=%USERPROFILE%\.dashboard-env.json"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%DASHBOARD_REPO_PATH%\scripts\ensure_dashboard_runtime.ps1" -Repo "%DASHBOARD_REPO_PATH%" -Python "%PYTHON_EXE%" -Port 8050 -PrivateEnvJson "%PRIVATE_ENV%"
if errorlevel 1 exit /b 1

start "" "https://h-town.duckdns.org/stt/"
exit /b 0
