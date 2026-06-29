Set oShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim nodePath: nodePath = ""
Dim sResult: sResult = ""

' Check registry for Node.js install path
On Error Resume Next
nodePath = oShell.RegRead("HKLM\SOFTWARE\Node.js\InstallPath")
If Err.Number <> 0 Then
    Err.Clear
    nodePath = oShell.RegRead("HKLM\SOFTWARE\Wow6432Node\Node.js\InstallPath")
    If Err.Number <> 0 Then
        Err.Clear
        nodePath = ""
    End If
End If

' Also check Windows Store / LocalAppData
Dim laa: laa = oShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
Dim aad: aad = oShell.ExpandEnvironmentStrings("%APPDATA%")

Dim extraPaths(3)
extraPaths(0) = laa & "\Microsoft\WindowsApps"
extraPaths(1) = laa & "\Programs\nodejs"
extraPaths(2) = aad & "\nvm\current"
extraPaths(3) = aad & "\npm"

sResult = "Registry NodePath: [" & nodePath & "]" & vbCrLf

Dim i
For i = 0 To 3
    Dim hasNpm: hasNpm = fso.FileExists(extraPaths(i) & "\npm.cmd")
    Dim hasNode: hasNode = fso.FileExists(extraPaths(i) & "\node.exe")
    sResult = sResult & extraPaths(i) & " -> npm.cmd=" & hasNpm & " node.exe=" & hasNode & vbCrLf
Next

' Write result
Dim sOutPath: sOutPath = "C:\Users\10319\Claude\Projects\CRM APP" & ChrW(35070) & ChrW(20316) & "\node-location.txt"
Set f = fso.CreateTextFile(sOutPath, True, True)
f.Write sResult
f.Close

MsgBox sResult
