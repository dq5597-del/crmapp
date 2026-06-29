Set oShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim sResult: sResult = ""
Dim app: app = oShell.ExpandEnvironmentStrings("%APPDATA%")
Dim loc: loc = oShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")

' 1. List WindowsApps for node/npm executables
Dim wApps: wApps = loc & "\Microsoft\WindowsApps"
sResult = sResult & "=== WindowsApps ===" & vbCrLf
If fso.FolderExists(wApps) Then
    Dim wf: Set wf = fso.GetFolder(wApps)
    Dim file
    For Each file In wf.Files
        If InStr(LCase(file.Name), "node") > 0 Or InStr(LCase(file.Name), "npm") > 0 Or InStr(LCase(file.Name), "npx") > 0 Then
            sResult = sResult & "  FOUND: " & file.Name & vbCrLf
        End If
    Next
    sResult = sResult & "  (checked " & wf.Files.Count & " files)" & vbCrLf
Else
    sResult = sResult & "  NOT FOUND: " & wApps & vbCrLf
End If

' 2. VS Code settings.json
Dim vscPath: vscPath = app & "\Code\User\settings.json"
sResult = sResult & vbCrLf & "=== VS Code Settings ===" & vbCrLf
If fso.FileExists(vscPath) Then
    Dim vscFile: Set vscFile = fso.OpenTextFile(vscPath, 1)
    Dim vscContent: vscContent = vscFile.ReadAll
    vscFile.Close
    ' Find terminal.integrated section
    Dim termIdx: termIdx = InStr(LCase(vscContent), "terminal.integrated")
    If termIdx > 0 Then
        sResult = sResult & "TERMINAL_SECTION_FOUND at char " & termIdx & ":" & vbCrLf
        sResult = sResult & Mid(vscContent, termIdx, 800) & vbCrLf
    Else
        sResult = sResult & "NO terminal.integrated section" & vbCrLf
        ' Show first 400 chars anyway
        sResult = sResult & "FIRST_400: " & Left(vscContent, 400) & vbCrLf
    End If
Else
    sResult = sResult & "NOT FOUND: " & vscPath & vbCrLf
End If

' 3. Check VS Code bin folder itself
Dim vscBin: vscBin = loc & "\Programs\Microsoft VS Code"
sResult = sResult & vbCrLf & "=== VS Code Folder ===" & vbCrLf
If fso.FolderExists(vscBin) Then
    sResult = sResult & "EXISTS: " & vscBin & vbCrLf
    ' Check for node.exe there
    If fso.FileExists(vscBin & "\node.exe") Then sResult = sResult & "  node.exe FOUND!" & vbCrLf
    If fso.FileExists(vscBin & "\Code.exe") Then sResult = sResult & "  Code.exe FOUND" & vbCrLf
Else
    sResult = sResult & "NOT FOUND: " & vscBin & vbCrLf
End If

' 4. nvm settings.txt
Dim nvmSettings: nvmSettings = app & "\nvm\settings.txt"
sResult = sResult & vbCrLf & "=== nvm settings ===" & vbCrLf
If fso.FileExists(nvmSettings) Then
    Dim nvmFile: Set nvmFile = fso.OpenTextFile(nvmSettings, 1)
    sResult = sResult & nvmFile.ReadAll & vbCrLf
    nvmFile.Close
Else
    sResult = sResult & "NOT FOUND: " & nvmSettings & vbCrLf
End If

' 5. Check if node exists in VS Code resources
Dim vscNodePaths(3)
vscNodePaths(0) = loc & "\Programs\Microsoft VS Code\resources\app\node_modules\.bin\npm.cmd"
vscNodePaths(1) = loc & "\Programs\Microsoft VS Code\resources\app\out\vs\workbench\contrib\terminal\browser\terminal.contribution.js"
vscNodePaths(2) = "C:\Program Files\Docker\Docker\resources\bin\node.exe"
vscNodePaths(3) = "C:\Program Files\Docker\Docker\resources\bin\npm.cmd"

sResult = sResult & vbCrLf & "=== Extra Checks ===" & vbCrLf
Dim i
For i = 0 To 3
    sResult = sResult & vscNodePaths(i) & " = " & fso.FileExists(vscNodePaths(i)) & vbCrLf
Next

' Write to CRM folder via CurrentDirectory
Dim cwd: cwd = oShell.CurrentDirectory
Dim dst: dst = cwd & "\path-info2.txt"
Set f = fso.CreateTextFile(dst, True, False)
f.Write sResult
f.Close

MsgBox "Done! " & dst & vbCrLf & Left(sResult, 300)
