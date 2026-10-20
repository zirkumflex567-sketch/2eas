# Windows PowerShell 5.1 / PowerShell 7.6. Only the verified dashboard process can be stopped.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidateSet('Status','Start','Restart')][string]$Action,
    [Parameter(Mandatory=$true)][string]$Repo,
    [Parameter(Mandatory=$true)][string]$Python,
    [Parameter(Mandatory=$true)][ValidateRange(1,65535)][int]$Port,
    [string]$PrivateEnvJson = '',
    [ValidateRange(1,60)][int]$StartupTimeoutSeconds = 30
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:Failure = 'Runtime operation failed; no environment values were printed.'
$script:Stopped = $false
$script:Previous = $null
$script:Child = $null
$script:RuntimeJsonParameters = @{}

if (-not $PSBoundParameters.ContainsKey('PrivateEnvJson')) {
    $privateEnvName = if ($Port -eq 8050) { '.dashboard-env-8050-isolated.json' } else { '.dashboard-env.json' }
    $PrivateEnvJson = Join-Path $env:USERPROFILE $privateEnvName
}

function Reject([string]$Message) { $script:Failure = $Message; throw 'guard refused' }
function Quote-Argument([string]$Value) {
    if ($Value.Contains('"') -or $Value.Contains("`n") -or $Value.Contains("`r")) {
        Reject 'Invalid path argument.'
    }
    return '"' + $Value + '"'
}
function Run-Python([string]$Arguments) {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $script:PythonPath
    $info.Arguments = $Arguments
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    try {
        [void]$process.Start()
        $outTask = $process.StandardOutput.ReadToEndAsync()
        $errTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(12000)) {
            $process.Kill()
            Reject 'Python preflight timed out.'
        }
        if ($process.ExitCode -ne 0) { Reject 'Python preflight failed; source and environment retained.' }
        return $outTask.Result
    } finally { $process.Dispose() }
}
function Inspect-Checkout {
    $json = Run-Python ((Quote-Argument $script:RuntimePath) + ' --inspect-checkout ' + (Quote-Argument $script:RepoPath))
    try { $result = $json | ConvertFrom-Json } catch { Reject 'Checkout inspection returned invalid JSON.' }
    if ($result.revision -notmatch '^[0-9a-f]{40,64}$' -or
        $result.digest -notmatch '^[0-9a-f]{64}$' -or
        $result.checkoutId -notmatch '^[0-9a-f]{64}$' -or
        $result.sourceAvailable -ne $true) { Reject 'A readable Git application checkout is required.' }
    return $result
}
function Get-Listener {
    $connections = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    if ($connections.Count -eq 0) { return $null }
    $owners = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($owners.Count -ne 1 -or @($connections | Where-Object { $_.LocalAddress -ne '127.0.0.1' }).Count -ne 0) {
        Reject 'Port is occupied by an unsupported listener; nothing stopped.'
    }
    return [int]$owners[0]
}
function Read-Runtime([int]$ListenerPid) {
    try {
        $response = Invoke-WebRequest -Uri ('http://127.0.0.1:' + $Port + '/api/runtime') -Method Get -UseBasicParsing -TimeoutSec 30
        $value = ConvertFrom-Json -InputObject $response.Content @script:RuntimeJsonParameters
        $required = @('pid','startedUtc','checkoutId','startupRevision','startupDigest','diskRevision','diskDigest',
                      'applicationCodeDirty','sourceAvailable','restart_required')
        foreach ($key in $required) {
            if ($null -eq $value.PSObject.Properties[$key]) { throw 'missing runtime field' }
        }
        foreach ($key in @('startedUtc','checkoutId','startupRevision','startupDigest','diskRevision','diskDigest')) {
            if ($value.$key -isnot [string]) { throw 'invalid runtime field type' }
        }
        $timestamp = [DateTimeOffset]::MinValue
        if (($value.pid -isnot [int] -and $value.pid -isnot [long]) -or $value.pid -ne $ListenerPid -or
            $value.checkoutId -notmatch '^[0-9a-f]{64}$' -or
            $value.startupDigest -notmatch '^[0-9a-f]{64}$' -or $value.diskDigest -notmatch '^[0-9a-f]{64}$' -or
            $value.startupRevision -notmatch '^(unknown|[0-9a-f]{40,64})$' -or
            $value.diskRevision -notmatch '^(unknown|[0-9a-f]{40,64})$' -or
            $value.restart_required -isnot [bool] -or $value.sourceAvailable -isnot [bool] -or
            ($value.applicationCodeDirty -isnot [bool] -and $null -ne $value.applicationCodeDirty) -or
            $value.startedUtc -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$' -or
            -not [DateTimeOffset]::TryParse($value.startedUtc, [ref]$timestamp)) { throw 'malformed runtime identity' }
        # Select public fields only; never echo arbitrary content from a listener.
        return $value | Select-Object -Property $required
    } catch { Reject 'Listener runtime identity unavailable or malformed; nothing stopped.' }
}

try {
    # Core parsers can convert ISO timestamps to DateTime automatically. Preserve
    # the source string (DateKind was added in 7.5); 5.1 already preserves it.
    if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('DateKind')) {
        $script:RuntimeJsonParameters.DateKind = 'String'
    } elseif ($PSVersionTable.PSEdition -eq 'Core') {
        Reject 'PowerShell JSON parser cannot preserve runtime timestamp strings; nothing stopped.'
    }
    $script:RepoPath = (Resolve-Path -LiteralPath $Repo).Path.TrimEnd('\','/')
    $script:PythonPath = (Resolve-Path -LiteralPath $Python).Path
    if (-not (Test-Path -LiteralPath $script:RepoPath -PathType Container) -or
        -not (Test-Path -LiteralPath $script:PythonPath -PathType Leaf)) { Reject 'Repository or Python executable is invalid.' }
    $appPath = Join-Path $script:RepoPath 'app.py'
    $script:RuntimePath = Join-Path $script:RepoPath 'dashboard_runtime.py'
    if (-not (Test-Path -LiteralPath $appPath -PathType Leaf) -or
        -not (Test-Path -LiteralPath $script:RuntimePath -PathType Leaf)) { Reject 'Required application source is missing.' }
    $expected = Inspect-Checkout
    $listener = Get-Listener
    if ($Action -eq 'Status') {
        if ($null -eq $listener) {
            @{status='stopped'; expectedRevision=$expected.revision; expectedDigest=$expected.digest; checkoutId=$expected.checkoutId} |
                ConvertTo-Json -Compress
        } else {
            $runtime = Read-Runtime $listener
            if ($runtime.checkoutId -ne $expected.checkoutId) { Reject 'Listener belongs to another checkout; nothing stopped.' }
            $runtime | ConvertTo-Json -Compress
        }
        exit 0
    }
    if ($expected.applicationCodeDirty -ne $false) { Reject 'Tracked application code is dirty; commit or restore it before launch.' }
    $allowedKeys = @('DASHBOARD_ALLOWED_HOSTS','DASHBOARD_PROXY_SECRET','DASHBOARD_PROXY_USERS','DASHBOARD_PROXY_PREFIX',
                     'DASHBOARD_CONTROL_TOKEN','DASHBOARD_QUOTE_MAX_AGE_SECONDS','CHART_STUDIO_STORAGE_TOKEN',
                     'CHART_STUDIO_STORAGE_ENABLED','CHART_STUDIO_DB','CHART_STUDIO_EVIDENCE_ROOT',
                     'CHART_STUDIO_EVIDENCE_DB','CHART_STUDIO_EVIDENCE_SPOOL_ROOT',
                     'CHART_STUDIO_EVIDENCE_DEAL_ACCOUNTS','CHART_STUDIO_DEVICE_SYNC_ENABLED',
                     'CHART_STUDIO_V5_PREVIEW_ENABLED','CHART_STUDIO_INDICATOR_TRUSTED_KEYS_JSON',
                     'CHART_STUDIO_TRADE_TICKET_ENABLED')
    $environment = @{}
    if ($PrivateEnvJson) {
        $privatePath = (Resolve-Path -LiteralPath $PrivateEnvJson).Path
        # Enforce duplicate-key rejection and physical containment before stop.
        [void](Run-Python ((Quote-Argument $script:RuntimePath) + ' --inspect-checkout ' +
                          (Quote-Argument $script:RepoPath) + ' --validate-env ' + (Quote-Argument $privatePath)))
        if ($privatePath.Equals($script:RepoPath, [StringComparison]::OrdinalIgnoreCase) -or
            $privatePath.StartsWith($script:RepoPath + '\', [StringComparison]::OrdinalIgnoreCase)) {
            Reject 'Private environment JSON must be outside the checkout.'
        }
        try { $config = Get-Content -LiteralPath $privatePath -Raw | ConvertFrom-Json }
        catch { Reject 'Private environment JSON is invalid.' }
        if ($null -eq $config -or $config -isnot [PSCustomObject]) { Reject 'Private environment must be a JSON object.' }
        foreach ($property in $config.PSObject.Properties) {
            if ($property.Name -cnotin $allowedKeys -or $property.Value -isnot [string] -or
                $property.Value.Contains([char]0)) { Reject 'Private environment contains an invalid key or value.' }
            if ($property.Name -ceq 'CHART_STUDIO_DEVICE_SYNC_ENABLED' -and $property.Value -cnotin @('0','1')) {
                Reject 'Private environment contains an invalid device-sync feature flag.'
            }
            if ($property.Name -ceq 'CHART_STUDIO_V5_PREVIEW_ENABLED' -and $property.Value -cnotin @('0','1')) {
                Reject 'Private environment contains an invalid v5 preview feature flag.'
            }
            if ($property.Name -ceq 'CHART_STUDIO_TRADE_TICKET_ENABLED' -and $property.Value -cnotin @('0','1')) {
                Reject 'Private environment contains an invalid trade-ticket feature flag.'
            }
            $environment[$property.Name] = $property.Value
        }
        if ($environment.ContainsKey('DASHBOARD_PROXY_USERS')) {
            try { $users = $environment['DASHBOARD_PROXY_USERS'] | ConvertFrom-Json }
            catch { Reject 'Proxy user mapping is invalid.' }
            if ($null -eq $users -or $users -isnot [PSCustomObject]) { Reject 'Proxy user mapping must be an object.' }
            foreach ($property in $users.PSObject.Properties) {
                if ($property.Name -cnotmatch '^[\x21-\x7e]+$' -or $property.Name.Contains(',') -or
                    $property.Value -cnotin @('read','layout','trade')) { Reject 'Proxy user mapping is invalid.' }
            }
            if (@($users.PSObject.Properties).Count -gt 0 -and
                (-not $environment.ContainsKey('DASHBOARD_PROXY_SECRET') -or $environment['DASHBOARD_PROXY_SECRET'].Length -lt 32)) {
                Reject 'Proxy users require a secret of at least 32 characters.'
            }
        }
    }
    # Compile every tracked application Python source without importing any.
    [void](Run-Python ((Quote-Argument $script:RuntimePath) + ' --inspect-checkout ' +
                      (Quote-Argument $script:RepoPath) + ' --preflight'))
    $logId = [Guid]::NewGuid().ToString('N')
    $outLog = Join-Path $script:RepoPath ('.dashboard-runtime-' + $logId + '.stdout.log')
    $errLog = Join-Path $script:RepoPath ('.dashboard-runtime-' + $logId + '.stderr.log')
    $previousLog = Join-Path $script:RepoPath ('.dashboard-runtime-' + $logId + '.previous.log')
    foreach ($logPath in @($outLog, $errLog, $previousLog)) {
        & git -C $script:RepoPath check-ignore --quiet -- $logPath 2>$null
        if ($LASTEXITCODE -ne 0) { Reject 'Runtime logs must be ignored by Git before launch.' }
    }
    if ($Action -eq 'Start' -and $null -ne $listener) { Reject 'Port is already occupied; nothing stopped.' }
    if ($Action -eq 'Restart' -and $null -ne $listener) {
        $script:Previous = Read-Runtime $listener
        if ($script:Previous.checkoutId -ne $expected.checkoutId) { Reject 'Listener belongs to another checkout; nothing stopped.' }
        $script:Previous | ConvertTo-Json -Compress | Set-Content -LiteralPath $previousLog
        # Recheck both source and process ownership immediately before the stop.
        $confirmed = Inspect-Checkout
        if ($confirmed.applicationCodeDirty -ne $false -or $confirmed.digest -ne $expected.digest -or
            $confirmed.revision -ne $expected.revision) { Reject 'Source changed during preflight; nothing stopped.' }
        if ((Get-Listener) -ne $listener) { Reject 'Listener changed during preflight; nothing stopped.' }
        $ownedProcess = Get-Process -Id $listener
        # Hold its OS process handle before the final identity check; don't
        # reacquire a possibly recycled numeric PID at stop time.
        [void]$ownedProcess.Handle
        $again = Read-Runtime $listener
        if ($again.checkoutId -ne $expected.checkoutId -or $again.startedUtc -ne $script:Previous.startedUtc) {
            Reject 'Runtime identity changed during preflight; nothing stopped.'
        }
        Stop-Process -InputObject $ownedProcess -ErrorAction Stop
        $script:Stopped = $true
        $stopDeadline = [DateTime]::UtcNow.AddSeconds(5)
        while ($null -ne (Get-Listener) -and [DateTime]::UtcNow -lt $stopDeadline) { Start-Sleep -Milliseconds 100 }
        if ($null -ne (Get-Listener)) { Reject 'Dashboard listener did not stop; source and private environment retained.' }
    }
    $saved = @{}
    try {
        foreach ($key in ($allowedKeys + @('DASHBOARD_PORT'))) {
            $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
            [Environment]::SetEnvironmentVariable($key, $null, 'Process')
        }
        foreach ($key in $environment.Keys) { [Environment]::SetEnvironmentVariable($key, $environment[$key], 'Process') }
        [Environment]::SetEnvironmentVariable('DASHBOARD_PORT', [string]$Port, 'Process')
        $script:Child = Start-Process -FilePath $script:PythonPath -ArgumentList (Quote-Argument $appPath) -WorkingDirectory $script:RepoPath `
            -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
    } finally {
        foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
    }
    $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
    do {
        $script:Child.Refresh()
        if ($script:Child.HasExited) { Reject 'Dashboard exited during startup; inspect the private ignored logs.' }
        $currentListener = Get-Listener
        if ($null -ne $currentListener) {
            if ($currentListener -ne $script:Child.Id) { Reject 'A different process occupied the port during startup.' }
            try {
                $running = Read-Runtime $currentListener
                if ($running.checkoutId -eq $expected.checkoutId -and $running.startupRevision -eq $expected.revision -and
                    $running.startupDigest -eq $expected.digest -and $running.diskDigest -eq $expected.digest -and
                    $running.diskRevision -eq $expected.revision -and $running.restart_required -eq $false -and
                    $running.applicationCodeDirty -eq $false -and $running.sourceAvailable -eq $true) {
                    $running | ConvertTo-Json -Compress
                    exit 0
                }
            } catch { } # A listener can appear just before HTTP startup completes.
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    Reject 'Dashboard startup verification timed out; inspect the private ignored logs.'
} catch {
    if ($null -ne $script:Child) {
        $script:Child.Refresh()
        if (-not $script:Child.HasExited) { $script:Child.Kill() }
    }
    if ($script:Stopped) {
        Write-Output 'Previous dashboard stopped. Source and private environment were retained; restore the previous revision and rerun Start for rollback.'
        if ($null -ne $script:Previous) { $script:Previous | ConvertTo-Json -Compress }
    }
    Write-Output $script:Failure
    exit 1
}
