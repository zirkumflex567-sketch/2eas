# Safe local dashboard/tunnel supervisor. MT5 terminals are never started here.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = $env:DASHBOARD_REPO_PATH
if ([string]::IsNullOrWhiteSpace($repo)) {
    throw 'Set DASHBOARD_REPO_PATH to the clean main checkout before running the supervisor.'
}
$pythonExe = if (Test-Path 'C:\Python314\python.exe') { 'C:\Python314\python.exe' } else { 'python.exe' }
$privateEnv = Join-Path $env:USERPROFILE '.dashboard-env.json'
$ensurePath = Join-Path $repo 'scripts/ensure_dashboard_runtime.ps1'
$tunnelPath = Join-Path $repo 'start_stt_tunnel.ps1'
$hostExe = (Get-Process -Id $PID).Path

while ($true) {
    & $hostExe -NoProfile -ExecutionPolicy Bypass -File $ensurePath -Repo $repo -Python $pythonExe -Port 8050 -PrivateEnvJson $privateEnv
    if ($LASTEXITCODE -ne 0) { throw 'Guarded main dashboard is not ready; supervisor stopped.' }

    # start_stt_tunnel.ps1 owns reconnects. Track that long-lived supervisor,
    # not its transient ssh.exe child, or a long outage creates duplicate loops.
    $tunnel = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -in @('powershell.exe','pwsh.exe') -and $_.CommandLine -like "*$tunnelPath*" }
    if (-not $tunnel) {
        Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$tunnelPath) -WindowStyle Hidden
        Start-Sleep -Seconds 3
        $tunnel = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -in @('powershell.exe','pwsh.exe') -and $_.CommandLine -like "*$tunnelPath*" }
        if (-not $tunnel) { throw 'SSH reverse tunnel did not start.' }
    }
    Start-Sleep -Seconds 30
}
