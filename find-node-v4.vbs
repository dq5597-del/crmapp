Set oShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim sResult: sResult = ""
Dim loc: loc = oShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
Dim app: app = oShell.ExpandEnvironmentStrings("%APPDATA%")

' List all subfolders of LOCALAPPDATA\Programs
sResult = sResult & "=== %LOCALAPPDATA%\Programs subfolders ===" & vbCrLf
Dim progsPath: progsPath = loc & "\Programs"
If fso.FolderExists(progsPath) Then
    Dim pf: Set pf = fso.GetFolder(progsPath)
    Dim sf
    For Each sf In pf.SubFolders
        sResult = sResult & "  " & sf.Name & vbCrLf
    Next
Else
    sResult = sResult & "NOT FOUND" & vbCrLf
End If

' Check for node.exe in LOCALAPPDATA\Programs subfolders (non-recursive)
sResult = sResult & vbCrLf & "=== node.exe search in Programs subfolders ===" & vbCrLf
If fso.FolderExists(progsPath) Then
    Set pf = fso.GetFolder(progsPath)
    For Each sf In pf.SubFolders
        If fso.FileExists(sf.Path & "\node.exe") Then
            sResult = sResult & "  FOUND node.exe in: " & sf.Path & vbCrLf
        End If
        If fso.FileExists(sf.Path & "\npm.cmd") Then
            sResult = sResult & "  FOUND npm.cmd in: " & sf.Path & vbCrLf
        End If
        If fso.FileExists(sf.Path & "\npm") Then
            sResult = sResult & "  FOUND npm in: " & sf.Path & vbCrLf
        End If
    Next
End If

' Check Program Files top level folders for "node"
sResult = sResult & vbCrLf & "=== C:\Program Files folders with 'node' ===" & vbCrLf
Dim pfiles: pfiles = "C:\Program Files"
If fso.FolderExists(pfiles) Then
    Dim pf2: Set pf2 = fso.GetFolder(pfiles)
    Dim sf2
    For Each sf2 In pf2.SubFolders
        If InStr(LCase(sf2.Name), "node") > 0 Then
            sResult = sResult & "  " & sf2.Name & vbCrLf
        End If
    Next
End If

' Check APPDATA top-level for anything node-related
sResult = sResult & vbCrLf & "=== %APPDATA% folders with 'node' or 'npm' ===" & vbCrLf
If fso.FolderExists(app) Then
    Dim af: Set af = fso.GetFolder(app)
    Dim sf3
    For Each sf3 In af.SubFolders
        If InStr(LCase(sf3.Name), "node") > 0 Or InStr(LCase(sf3.Name), "npm") > 0 Then
            sResult = sResult & "  " & sf3.Name & vbCrLf
        End If
    Next
End If

' Use cmd to run 'where node' with full PATH from reg
Dim sysP: sysP = oShell.RegRead("HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment\Path")
Dim usrP: usrP = oShell.RegRead("HKCU\Environment\Path")
Dim fullP: fullP = oShell.ExpandEnvironmentStrings(usrP & ";" & sysP)
oShell.Environment("PROCESS")("PATH") = fullP

On Error Resume Next
Dim oExec: Set oExec = oShell.Exec("cmd /c where node 2>&1")
WScript.Sleep 2000
Dim whereResult: whereResult = ""
Do While Not oExec.StdOut.AtEndOfStream
    whereResult = whereResult & oExec.StdOut.ReadLine() & vbCrLf
Loop
Err.Clear
On Error GoTo 0

sResult = sResult & vbCrLf & "=== 'where node' with full PATH ===" & vbCrLf & whereResult

' Write to CRM folder
Dim cwd: cwd = oShell.CurrentDirectory
Dim dst: dst = cwd & "\path-info3.txt"
Set f = fso.CreateTextFile(dst, True, False)
f.Write sResult
f.Close

MsgBox Left(sResult, 500)
