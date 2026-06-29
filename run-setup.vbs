Set oShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Step 1: 從 CRM 資料夾（Unicode 路徑）複製 setup.ps1 到純 ASCII 路徑
Dim src: src = oShell.CurrentDirectory & "\setup.ps1"
Dim dst: dst = oShell.ExpandEnvironmentStrings("%TEMP%") & "\crm.ps1"

If fso.FileExists(src) Then
    fso.CopyFile src, dst
    ' Step 2: 用純 ASCII 路徑執行 PowerShell 腳本（避開 Unicode 命令列問題）
    oShell.Run "powershell -NoExit -ExecutionPolicy Bypass -File """ & dst & """", 1, False
Else
    MsgBox "找不到 setup.ps1！請確認 CRM APP 資料夾中有此檔案。", 16, "錯誤"
End If
