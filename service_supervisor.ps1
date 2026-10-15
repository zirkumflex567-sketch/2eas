# Auto-Supervisor for Titan Cockpit & STT Reverse Tunnel
# Ensures 24/7 availability for mobile access at https://h-town.duckdns.org/stt/

$workingDir = "C:\Users\zirku\Downloads\testing"
$pythonExe = if (Test-Path "C:\Python314\python.exe") { "C:\Python314\python.exe" } else { "python" }
$keyPath = "$env:USERPROFILE\.ssh\id_ed25519"
$remoteHost = "kevin@h-town.duckdns.org"

# Set environment variables for proxy security
$env:DASHBOARD_ALLOWED_HOSTS = "h-town.duckdns.org"
$env:DASHBOARD_PROXY_SECRET = "7a64fc2c0c11f9b06650d9bd97ad932d45536c6f9a550ce7ed55d5e7a166af33"
$env:DASHBOARD_PROXY_USERS = '{"kevin":"trade"}'
$env:DASHBOARD_PROXY_PREFIX = "/stt"

function Test-CockpitServer {
    try {
        $conn = Get-NetTCPConnection -LocalPort 8050 -State Listen -ErrorAction SilentlyContinue
        return ($null -ne $conn)
    } catch {
        return $false
    }
}

function Start-CockpitServer {
    if (-not (Test-CockpitServer)) {
        Start-Process -FilePath $pythonExe -ArgumentList "app.py" -WorkingDirectory $workingDir -WindowStyle Hidden
        Start-Sleep -Seconds 3
    }
}

function Test-SshTunnel {
    $procs = Get-Process ssh -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
        $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($p.Id)" -ErrorAction SilentlyContinue).CommandLine
        if ($cmd -like "*8055:127.0.0.1:8050*") {
            return $true
        }
    }
    return $false
}

function Start-SshTunnel {
    if (-not (Test-SshTunnel)) {
        $sshArgs = "-N -R 8055:127.0.0.1:8050 -i `"$keyPath`" -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=accept-new $remoteHost"
        Start-Process -FilePath "ssh.exe" -ArgumentList $sshArgs -WindowStyle Hidden
        Start-Sleep -Seconds 3
    }
}

# Main Watchdog Loop
while ($true) {
    Start-CockpitServer
    Start-SshTunnel
    Start-Sleep -Seconds 10
}
