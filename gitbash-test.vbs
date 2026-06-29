Set oShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim gitBash: gitBash = "C:\Program Files\Git\bin\bash.exe"

If Not fso.FileExists(gitBash) Then
    MsgBox "Git Bash not found!"
End If

' Run Git Bash interactively (-i loads .bashrc where nvm/fnm might be configured)
' -l (login) loads .bash_profile too
Dim oExec: Set oExec = oShell.Exec(Chr(34) & gitBash & Chr(34) & " -i -l -c ""echo NPM=$(npm --version 2>&1); echo NODE=$(node --version 2>&1); echo NPMPATH=$(which npm 2>&1); cat ~/.bashrc 2>&1 | head -20""")

WScript.Sleep 8000

Dim result: result = ""
Do While Not oExec.StdOut.AtEndOfStream
    result = result & oExec.StdOut.ReadLine() & vbCrLf
Loop
Do While Not oExec.StdErr.AtEndOfStream
    result = result & "ERR: " & oExec.StdErr.ReadLine() & vbCrLf
Loop

Dim cwd: cwd = oShell.CurrentDirectory
Set f = fso.CreateTextFile(cwd & "\gitbash-result.txt", True, False)
f.Write "GitBash Result:" & vbCrLf & result
f.Close

MsgBox "RESULT:" & vbCrLf & Left(result, 400)
