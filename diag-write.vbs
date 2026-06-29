Set oShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim sResult: sResult = "=== NODE DIAGNOSTICS ===" & vbCrLf

' 1. Explorer PATH (inherited)
sResult = sResult & "EXPLORER_PATH=" & oShell.ExpandEnvironmentStrings("%PATH%") & vbCrLf & vbCrLf

' 2. Registry system PATH
On Error Resume Next
sResult = sResult & "REG_SYS_PATH=" & oShell.RegRead("HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment\Path") & vbCrLf & vbCrLf
Err.Clear
sResult = sResult & "REG_USER_PATH=" & oShell.RegRead("HKCU\Environment\Path") & vbCrLf & vbCrLf
Err.Clear
On Error GoTo 0

' 3. Check specific known locations
Dim app: app = oShell.ExpandEnvironmentStrings("%APPDATA%")
Dim loc: loc = oShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
Dim usr: usr = oShell.ExpandEnvironmentStrings("%USERPROFILE%")

Dim locs(14)
locs(0) = "C:\Program Files\nodejs\npm.cmd"
locs(1) = "C:\Program Files (x86)\nodejs\npm.cmd"
locs(2) = app & "\nvm\current\npm.cmd"
locs(3) = loc & "\Programs\nodejs\npm.cmd"
locs(4) = usr & "\.volta\bin\npm.cmd"
locs(5) = usr & "\scoop\shims\npm.cmd"
locs(6) = usr & "\scoop\apps\nodejs-lts\current\npm.cmd"
locs(7) = usr & "\scoop\apps\nodejs\current\npm.cmd"
locs(8) = loc & "\fnm\fnm.exe"
locs(9) = app & "\npm\npm.cmd"
locs(10) = "C:\ProgramData\chocolatey\bin\npm.cmd"
locs(11) = usr & "\AppData\Local\Programs\fnm\npm.cmd"
locs(12) = loc & "\nvs\default\npm.cmd"
locs(13) = loc & "\nvm\npm.cmd"
locs(14) = "C:\ProgramData\nvm\npm.cmd"

sResult = sResult & "LOCATION_CHECKS:" & vbCrLf
Dim i
For i = 0 To 14
    sResult = sResult & locs(i) & " = " & fso.FileExists(locs(i)) & vbCrLf
Next

' 4. Try where node via cmd
On Error Resume Next
Dim oExec: Set oExec = oShell.Exec("cmd /c where node 2>&1")
If Err.Number = 0 Then
    WScript.Sleep 3000
    Do While Not oExec.StdOut.AtEndOfStream
        sResult = sResult & vbCrLf & "WHERE_NODE: " & oExec.StdOut.ReadLine()
    Loop
End If
Err.Clear

Set oExec = oShell.Exec("cmd /c where npm 2>&1")
If Err.Number = 0 Then
    WScript.Sleep 3000
    Do While Not oExec.StdOut.AtEndOfStream
        sResult = sResult & vbCrLf & "WHERE_NPM: " & oExec.StdOut.ReadLine()
    Loop
End If
Err.Clear
On Error GoTo 0

' Write to simple path - NO Unicode
Set f = fso.CreateTextFile("C:\Users\10319\node-debug.txt", True, False)
f.Write sResult
f.Close

MsgBox "OK: C:\Users\10319\node-debug.txt"
