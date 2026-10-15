[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Repo,
    [Parameter(Mandatory=$true)][string]$Python,
    [Parameter(Mandatory=$true)][ValidateRange(1,65535)][int]$Port,
    [string]$PrivateEnvJson = (Join-Path $env:USERPROFILE '.dashboard-env.json')
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Runtime([string]$Action) {
    $runtimeScript = Join-Path $Repo 'scripts/dashboard_runtime.ps1'
    $hostExe = (Get-Process -Id $PID).Path
    $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$runtimeScript,
        '-Action',$Action,'-Repo',$Repo,'-Python',$Python,'-Port',[string]$Port,
        '-PrivateEnvJson',$PrivateEnvJson)
    $output = & $hostExe @arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Guarded dashboard $Action failed." }
    return $output
}

try {
    $resolvedRepo = (Resolve-Path -LiteralPath $Repo).Path
    $branch = (& git -C $resolvedRepo branch --show-current 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or $branch -cne 'main') {
        throw 'Dashboard launcher only accepts a clean main checkout.'
    }

    $statusText = @(Invoke-Runtime 'Status')[-1]
    $status = $statusText | ConvertFrom-Json
    $statusFlag = $status.PSObject.Properties['status']
    $processId = $status.PSObject.Properties['pid']
    if ($null -ne $statusFlag -and $statusFlag.Value -eq 'stopped') {
        Invoke-Runtime 'Start' | Out-Null
    } elseif ($null -ne $processId -and ($status.restart_required -or $status.applicationCodeDirty -or
              $status.startupRevision -ne $status.diskRevision -or
              $status.startupDigest -ne $status.diskDigest)) {
        throw 'Dashboard is running but needs an explicit guarded restart.'
    } elseif ($null -eq $processId) {
        throw 'Guarded runtime returned an unknown status; no process was started or stopped.'
    }
    exit 0
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
