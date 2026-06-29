Set oFSO = CreateObject("Scripting.FileSystemObject")
Set oShell = CreateObject("WScript.Shell")

Dim r: r = "=== Node.js 安裝檢查 ===" & vbCrLf
Dim nodeFound: nodeFound = False

' 常見安裝路徑
Dim paths(4)
paths(0) = "C:\Program Files\nodejs\node.exe"
paths(1) = "C:\Program Files (x86)\nodejs\node.exe"
paths(2) = oShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\nodejs\node.exe"
paths(3) = oShell.ExpandEnvironmentStrings("%APPDATA%") & "\npm\node.exe"
paths(4) = "C:\nodejs\node.exe"

Dim i
For i = 0 To 4
    If oFSO.FileExists(paths(i)) Then
        r = r & "FOUND: " & paths(i) & vbCrLf
        nodeFound = True
    Else
        r = r & "MISS:  " & paths(i) & vbCrLf
    End If
Next

' MSI 還在嗎？
Dim msiPath: msiPath = "C:\Users\10319\Downloads\node-v22.16.0-x64.msi"
r = r & vbCrLf & "MSI 檔案: " & (oFSO.FileExists(msiPath)) & vbCrLf

' PATH 中的 node
Dim pathEnv: pathEnv = oShell.ExpandEnvironmentStrings("%PATH%")
Dim hasNode: hasNode = (InStr(LCase(pathEnv), "nodejs") > 0)
r = r & "PATH 含 nodejs: " & hasNode & vbCrLf

' 寫出結果
Dim cwd: cwd = oShell.CurrentDirectory
Set wf = oFSO.CreateTextFile(cwd & "\node-check.txt", True, False)
wf.Write r
wf.Close
