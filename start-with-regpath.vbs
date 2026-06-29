Set oShell = CreateObject("WScript.Shell")

' Read full PATH from Windows registry (bypasses stale explorer.exe environment)
Dim systemPath: systemPath = ""
Dim userPath: userPath = ""
On Error Resume Next
systemPath = oShell.RegRead("HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment\Path")
Err.Clear
userPath = oShell.RegRead("HKCU\Environment\Path")
Err.Clear
On Error GoTo 0

' Expand env vars and combine user+system PATH
Dim fullPath: fullPath = oShell.ExpandEnvironmentStrings(userPath & ";" & systemPath)

' Inject into this process so cmd inherits it
oShell.Environment("PROCESS")("PATH") = fullPath

' Launch CMD - will inherit corrected PATH and CWD from File Explorer
oShell.Run "cmd /k npm install && npm run dev", 1, False
