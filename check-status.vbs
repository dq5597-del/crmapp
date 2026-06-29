Set oShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim result: result = ""

' 1. 確認目前 PATH 中是否有 node
Dim sysP: sysP = oShell.RegRead("HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment\Path")
Dim usrP: usrP = oShell.RegRead("HKCU\Environment\Path")
Dim fullP: fullP = oShell.ExpandEnvironmentStrings(sysP & ";" & usrP)

' 2. 用 PowerShell 取得 node/npm 版本（PowerShell 直接讀最新 registry PATH）
Dim oExec
Set oExec = oShell.Exec("powershell -NoProfile -Command """ & _
    "$env:PATH=[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User'); " & _
    "Write-Output ('NODE='+((node --version 2>&1) -join '')); " & _
    "Write-Output ('NPM='+((npm --version 2>&1) -join '')); " & _
    "Write-Output ('PORT3000='+(netstat -an | Select-String ':3000 .*LISTEN' | Measure-Object -Line).Lines)" & _
    """")

WScript.Sleep 8000

Dim out: out = ""
Do While Not oExec.StdOut.AtEndOfStream
    out = out & oExec.StdOut.ReadLine() & vbCrLf
Loop

result = "=== Node/npm STATUS ===" & vbCrLf & out

' 3. 寫出結果
Dim cwd: cwd = oShell.CurrentDirectory
Dim dst: dst = cwd & "\status.txt"
Set f = fso.CreateTextFile(dst, True, False)
f.Write result
f.Close
