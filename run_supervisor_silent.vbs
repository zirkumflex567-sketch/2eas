Option Explicit

Dim shell, fileSystem, environment, repository, supervisor, powerShell, command
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

repository = fileSystem.GetParentFolderName(WScript.ScriptFullName)
supervisor = fileSystem.BuildPath(repository, "service_supervisor.ps1")
If Not fileSystem.FileExists(supervisor) Then WScript.Quit 2

If WScript.Arguments.Count = 1 Then
    If WScript.Arguments(0) = "--self-test" Then
        WScript.Echo "DASHBOARD_REPO_PATH=" & repository
        WScript.Quit 0
    End If
End If

powerShell = "C:\Program Files\PowerShell\7\pwsh.exe"
If Not fileSystem.FileExists(powerShell) Then powerShell = "powershell.exe"

Set environment = shell.Environment("PROCESS")
environment("DASHBOARD_REPO_PATH") = repository

command = Chr(34) & powerShell & Chr(34) & _
    " -NoProfile -ExecutionPolicy Bypass -File " & _
    Chr(34) & supervisor & Chr(34)
shell.Run command, 0, False
