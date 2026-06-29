Set oShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim sResult: sResult = ""

' Capture 'where node' output via Exec
On Error Resume Next
Dim oExec: Set oExec = oShell.Exec("where node")
If Err.Number <> 0 Then
    sResult = sResult & "Exec error: " & Err.Description & vbCrLf
    Err.Clear
Else
    WScript.Sleep 2000
    Do While Not oExec.StdOut.AtEndOfStream
        sResult = sResult & "NODE: " & oExec.StdOut.ReadLine() & vbCrLf
    Loop
    Do While Not oExec.StdErr.AtEndOfStream
        sResult = sResult & "NODE_ERR: " & oExec.StdErr.ReadLine() & vbCrLf
    Loop
End If

' Capture 'where npm'
Set oExec = oShell.Exec("where npm")
WScript.Sleep 2000
Do While Not oExec.StdOut.AtEndOfStream
    sResult = sResult & "NPM: " & oExec.StdOut.ReadLine() & vbCrLf
Loop
Do While Not oExec.StdErr.AtEndOfStream
    sResult = sResult & "NPM_ERR: " & oExec.StdErr.ReadLine() & vbCrLf
Loop

' Get PATH
sResult = sResult & "PATH=" & oShell.ExpandEnvironmentStrings("%PATH%") & vbCrLf

' Write to CRM folder using FSO (handles Unicode path)
Dim sOutPath: sOutPath = "C:\Users\10319\Claude\Projects\CRM APP" & ChrW(35070) & ChrW(20316) & "\debug-node.txt"
Set f = fso.CreateTextFile(sOutPath, True, True)
f.Write sResult
f.Close

MsgBox "完成！" & vbCrLf & sResult
