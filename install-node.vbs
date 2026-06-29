Set oFSO = CreateObject("Scripting.FileSystemObject")
Dim msiPath: msiPath = "C:\Users\10319\Downloads\node-v22.16.0-x64.msi"

If oFSO.FileExists(msiPath) Then
    Set objShellApp = CreateObject("Shell.Application")
    objShellApp.ShellExecute "msiexec", "/i """ & msiPath & """", "", "runas", 1
Else
    MsgBox "找不到 MSI！路徑：" & msiPath, 16, "錯誤"
End If
