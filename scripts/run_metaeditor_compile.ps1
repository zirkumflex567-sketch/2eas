param(
    [Parameter(Mandatory = $true)][string]$Compiler,
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$IncludeRoot
)

$arguments = @(
    ('/compile:"{0}"' -f $Source),
    ('/include:"{0}"' -f $IncludeRoot),
    '/log'
) -join ' '
$process = Start-Process -FilePath $Compiler -ArgumentList $arguments -WorkingDirectory (Split-Path -Parent $Compiler) -WindowStyle Hidden -Wait -PassThru
exit $process.ExitCode
