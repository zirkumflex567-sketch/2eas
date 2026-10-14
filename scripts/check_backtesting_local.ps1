# Run from any location. No GitHub Actions, packages, network or payment method needed.
param(
    [string]$Python = "python",
    [string]$Config = ""
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    if ($Config) {
        & $Python -m backtesting.verify --config $Config
    } else {
        & $Python -m backtesting.verify
    }
    $result = $LASTEXITCODE
    if ($result -ne 0) { throw "Offline checks failed (exit $result). See output/mt5-backtests/_verification/*.log" }
    Write-Host "Local checks passed. Broker MT5 test not included." -ForegroundColor Green
} finally {
    Pop-Location
}
