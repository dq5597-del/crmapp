Set oShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim dl: dl = oShell.ExpandEnvironmentStrings("%USERPROFILE%") & "\Downloads"
Dim r: r = "=== Downloads 資料夾 ===" & vbCrLf

' 列出下載資料夾中所有檔案，按修改時間排序（最新5個）
If fso.FolderExists(dl) Then
    Dim f: Set f = fso.GetFolder(dl)
    ' 找 node 相關
    Dim fi
    For Each fi In f.Files
        If InStr(LCase(fi.Name), "node") > 0 Then
            r = r & "NODE: " & fi.Name & " (" & fi.Size & " bytes)" & vbCrLf
        End If
    Next
    ' 列出最新5個檔案
    r = r & vbCrLf & "--- 最新下載 ---" & vbCrLf
    Dim count: count = 0
    For Each fi In f.Files
        count = count + 1
    Next
    r = r & "檔案總數: " & count & vbCrLf
Else
    r = r & "Downloads 資料夾不存在" & vbCrLf
End If

' 寫出結果
Dim cwd: cwd = oShell.CurrentDirectory
Set wf = fso.CreateTextFile(cwd & "\dl-status.txt", True, False)
wf.Write r
wf.Close
