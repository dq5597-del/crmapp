Set oShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim r: r = ""

' 1. 檢查 winget 常見安裝路徑
Dim paths(5)
paths(0) = "C:\Program Files\nodejs\node.exe"
paths(1) = "C:\Program Files (x86)\nodejs\node.exe"
paths(2) = oShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\nodejs\node.exe"
paths(3) = oShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\nodejs-24.0.0-x64.msi"
paths(4) = "C:\Users\10319\AppData\Roaming\nvm\nvm.exe"
paths(5) = "C:\Program Files\nodejs\npm.cmd"

r = "=== Node.js 路徑掃描 ===" & vbCrLf
Dim i
For i = 0 To 5
    If fso.FileExists(paths(i)) Then
        r = r & "FOUND: " & paths(i) & vbCrLf
    Else
        r = r & "MISS:  " & paths(i) & vbCrLf
    End If
Next

' 2. 檢查 C:\Program Files\nodejs 目錄
r = r & vbCrLf & "=== C:\Program Files\nodejs ===" & vbCrLf
If fso.FolderExists("C:\Program Files\nodejs") Then
    Dim nd: Set nd = fso.GetFolder("C:\Program Files\nodejs")
    Dim f2
    For Each f2 In nd.Files
        r = r & "  " & f2.Name & vbCrLf
    Next
Else
    r = r & "  (資料夾不存在)" & vbCrLf
End If

' 3. 用 PowerShell 直接讀取最新 PATH 後查 node
Dim oExec
Set oExec = oShell.Exec("powershell -NoProfile -NonInteractive -Command """ & _
    "$env:PATH=[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User');" & _
    "$n=(Get-Command node -ErrorAction SilentlyContinue);" & _
    "if($n){Write-Output ('NODE_PATH='+$n.Source+' | ver='+(node --version 2>&1))}else{Write-Output 'NODE_PATH=NOT_FOUND'};" & _
    "$np=(Get-Command npm -ErrorAction SilentlyContinue);" & _
    "if($np){Write-Output ('NPM_PATH='+$np.Source)}else{Write-Output 'NPM_PATH=NOT_FOUND'}" & _
    """")

WScript.Sleep 8000

Dim out: out = ""
Do While Not oExec.StdOut.AtEndOfStream
    out = out & oExec.StdOut.ReadLine() & vbCrLf
Loop

r = r & vbCrLf & "=== PowerShell Get-Command ===" & vbCrLf & out

' 4. 寫出
Dim cwd: cwd = oShell.CurrentDirectory
Set f = fso.CreateTextFile(cwd & "\node-search.txt", True, False)
f.Write r
f.Close
