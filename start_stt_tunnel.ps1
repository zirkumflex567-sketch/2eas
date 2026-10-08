# STT SSH Reverse Tunnel Service
# Forwards h-town.duckdns.org:8055 -> 127.0.0.1:8050
$keyPath = "$env:USERPROFILE\.ssh\id_ed25519"
$remoteHost = "kevin@h-town.duckdns.org"

Write-Host "=========================================================="
Write-Host " STT Reverse Tunnel: h-town.duckdns.org/stt -> Local :8050"
Write-Host "=========================================================="

while ($true) {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starte SSH Reverse-Tunnel (Port 8055 -> 8050)..."
    ssh -N -R 8055:127.0.0.1:8050 `
        -i "$keyPath" `
        -o ServerAliveInterval=15 `
        -o ServerAliveCountMax=3 `
        -o ExitOnForwardFailure=yes `
        -o StrictHostKeyChecking=accept-new `
        "$remoteHost"
    
    Write-Warning "[$(Get-Date -Format 'HH:mm:ss')] SSH-Tunnel unterbrochen. Reconnect in 5 Sekunden..."
    Start-Sleep -Seconds 5
}
