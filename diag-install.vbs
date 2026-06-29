Set oFSO = CreateObject("Scripting.FileSystemObject")
Dim msiPath: msiPath = "C:\Users\10319\Downloads\node-v22.16.0-x64.msi"

Dim msg: msg = "=== Node.js 安裝診斷 ===" & vbCrLf & vbCrLf

If oFSO.FileExists(msiPath) Then
    Dim fi: Set fi = oFSO.GetFile(msiPath)
    msg = msg & "MSI 檔案：找到！" & vbCrLf
    msg = msg & "大小：" & fi.Size & " bytes" & vbCrLf & vbCrLf
    msg = msg & "現在按下「確定」將開始安裝 Node.js" & vbCrLf
    msg = msg & "（接著會出現 UAC 提示，請點『是』）"

    Dim answer: answer = MsgBox(msg, 1, "Node.js 安裝器")

    If answer = 1 Then  ' OK clicked
        Set objSA = CreateObject("Shell.Application")
        objSA.ShellExecute "msiexec.exe", "/i """ & msiPath & """", "", "runas", 1
        MsgBox "安裝程式已啟動！請完成安裝後回來。", 64, "啟動中"
    Else
        MsgBox "已取消。", 64, "取消"
    End If
Else
    MsgBox "❌ 找不到 MSI 檔案！" & vbCrLf & "路徑：" & msiPath, 16, "錯誤"
End If
