Set oShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim sResult: sResult = "=== PATH DIAGNOSTIC ===" & vbCrLf

' Read PATH from registry
On Error Resume Next
Dim uPath: uPath = oShell.RegRead("HKCU\Environment\Path")
Err.Clear
Dim sPath: sPath = oShell.RegRead("HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment\Path")
Err.Clear
On Error GoTo 0

sResult = sResult & "USER_PATH=" & uPath & vbCrLf & vbCrLf
sResult = sResult & "SYS_PATH=" & sPath & vbCrLf & vbCrLf

Dim app: app = oShell.ExpandEnvironmentStrings("%APPDATA%")
Dim loc: loc = oShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
Dim usr: usr = oShell.ExpandEnvironmentStrings("%USERPROFILE%")

sResult = sResult & "APPDATA=" & app & vbCrLf
sResult = sResult & "LOCALAPPDATA=" & loc & vbCrLf
sResult = sResult & "USERPROFILE=" & usr & vbCrLf & vbCrLf

' Check nvm folders
Dim nvmPaths(3)
nvmPaths(0) = app & "\nvm"
nvmPaths(1) = loc & "\nvm"
nvmPaths(2) = usr & "\.nvm"
nvmPaths(3) = "C:\ProgramData\nvm"

Dim i
For i = 0 To 3
    If fso.FolderExists(nvmPaths(i)) Then
        sResult = sResult & "NVM_EXISTS: " & nvmPaths(i) & vbCrLf
        Dim nvmF: Set nvmF = fso.GetFolder(nvmPaths(i))
        Dim sf
        For Each sf In nvmF.SubFolders
            sResult = sResult & "  SUBDIR: " & sf.Name & vbCrLf
        Next
    Else
        sResult = sResult & "NVM_MISSING: " & nvmPaths(i) & vbCrLf
    End If
Next

' Check other Node.js locations
Dim nodePaths(5)
nodePaths(0) = "C:\Program Files\nodejs"
nodePaths(1) = "C:\Program Files (x86)\nodejs"
nodePaths(2) = loc & "\Programs\nodejs"
nodePaths(3) = usr & "\.volta"
nodePaths(4) = usr & "\scoop\apps\nodejs"
nodePaths(5) = loc & "\fnm"

sResult = sResult & vbCrLf
For i = 0 To 5
    sResult = sResult & "DIR " & nodePaths(i) & " = " & fso.FolderExists(nodePaths(i)) & vbCrLf
Next

' Write to CRM folder via CurrentDirectory (no ChrW needed!)
Dim cwd: cwd = oShell.CurrentDirectory
Dim dst: dst = cwd & "\path-info.txt"
On Error Resume Next
Set f = fso.CreateTextFile(dst, True, False)
If Err.Number <> 0 Then
    ' Fallback: write to C:\Users\10319\
    dst = "C:\Users\10319\path-info.txt"
    Set f = fso.CreateTextFile(dst, True, False)
    Err.Clear
End If
On Error GoTo 0
f.Write sResult
f.Close

MsgBox "Written to: " & dst & vbCrLf & vbCrLf & Left(sResult, 400)
