Set oShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' CWD inherited from File Explorer = CRM directory (no need for ChrW)
Dim cwd: cwd = oShell.CurrentDirectory
Dim src: src = "C:\Users\10319\debug-node.txt"
Dim dst: dst = cwd & "\node-info.txt"

If fso.FileExists(src) Then
    fso.CopyFile src, dst
    MsgBox "OK: " & dst
Else
    ' Also try the diag-write.vbs result path
    MsgBox "Not found: " & src & vbCrLf & "CWD=" & cwd
End If
