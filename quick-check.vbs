Set oShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim la: la = oShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
Dim tmp: tmp = oShell.ExpandEnvironmentStrings("%TEMP%")

Dim r: r = ""
r = r & "NodeDir:  " & (fso.FolderExists(la & "\Programs\nodejs")) & vbCrLf
r = r & "node.exe: " & (fso.FileExists(la & "\Programs\nodejs\node.exe")) & vbCrLf
r = r & "npm.cmd:  " & (fso.FileExists(la & "\Programs\nodejs\npm.cmd")) & vbCrLf
r = r & "zip file: " & (fso.FileExists(tmp & "\nodejs-lts.zip")) & vbCrLf
r = r & "crm.ps1:  " & (fso.FileExists(tmp & "\crm.ps1")) & vbCrLf
r = r & "extract:  " & (fso.FolderExists(tmp & "\node-extract")) & vbCrLf

' Also check zip size if exists
If fso.FileExists(tmp & "\nodejs-lts.zip") Then
    Dim zf: Set zf = fso.GetFile(tmp & "\nodejs-lts.zip")
    r = r & "zip size: " & zf.Size & " bytes" & vbCrLf
End If

Dim cwd: cwd = oShell.CurrentDirectory
Set f = fso.CreateTextFile(cwd & "\quick-status.txt", True, False)
f.Write r
f.Close
