Set oShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim appdata: appdata = oShell.ExpandEnvironmentStrings("%APPDATA%")
Dim localapp: localapp = oShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
Dim progfiles: progfiles = oShell.ExpandEnvironmentStrings("%PROGRAMFILES%")
Dim progfilesx86: progfilesx86 = oShell.ExpandEnvironmentStrings("%PROGRAMFILES(X86)%")

' Search common Node.js install locations
Dim candidates(6)
candidates(0) = progfiles & "\nodejs"
candidates(1) = progfilesx86 & "\nodejs"
candidates(2) = localapp & "\Programs\nodejs"
candidates(3) = appdata & "\nvm\current"
candidates(4) = localapp & "\nvm\current"
candidates(5) = "C:\nodejs"
candidates(6) = localapp & "\nvs\default"

Dim npmDir: npmDir = ""
Dim i
For i = 0 To 6
    If fso.FileExists(candidates(i) & "\npm.cmd") Then
        npmDir = candidates(i)
        Exit For
    End If
    If fso.FileExists(candidates(i) & "\npm") Then
        npmDir = candidates(i)
        Exit For
    End If
Next

If npmDir = "" Then
    ' Last resort: show message with found info
    MsgBox "找不到 Node.js。" & vbCrLf & "APPDATA=" & appdata & vbCrLf & "LOCALAPPDATA=" & localapp
Else
    ' Inject Node path into environment
    Dim curPath: curPath = oShell.ExpandEnvironmentStrings("%PATH%")
    oShell.Environment("PROCESS")("PATH") = npmDir & ";" & appdata & "\npm;" & curPath
    oShell.Run "cmd /k npm install && npm run dev", 1, False
End If
