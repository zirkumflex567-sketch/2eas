# STT SSH Reverse Tunnel Service
param(
    [ValidateRange(1024, 65535)]
    [int]$BackendPort = 8056
)

# Forwards h-town.duckdns.org:8055 -> the guarded local main runtime.
$ErrorActionPreference = 'Stop'
$keyPath = "$env:USERPROFILE\.ssh\id_ed25519"
$remoteHost = "kevin@h-town.duckdns.org"

Write-Host "=========================================================="
Write-Host " STT Reverse Tunnel: h-town.duckdns.org/stt -> Local :$BackendPort"
Write-Host "=========================================================="

while ($true) {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starte SSH Reverse-Tunnel (Port 8055 -> $BackendPort)..."
    ssh -N -R "8055:127.0.0.1:$BackendPort" `
        -i "$keyPath" `
        -o ServerAliveInterval=15 `
        -o ServerAliveCountMax=3 `
        -o ExitOnForwardFailure=yes `
        -o StrictHostKeyChecking=accept-new `
        "$remoteHost"
    
    Write-Warning "[$(Get-Date -Format 'HH:mm:ss')] SSH-Tunnel unterbrochen. Reconnect in 5 Sekunden..."
    Start-Sleep -Seconds 5
}
