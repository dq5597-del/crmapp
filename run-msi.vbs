Set oFSO = CreateObject("Scripting.FileSystemObject")
Dim msiPath
msiPath = "C:\Users\10319\Downloads\node-v22.16.0-x64.msi"

If oFSO.FileExists(msiPath) Then
    Dim answer
    answer = MsgBox("Node.js v22 MSI found!" & vbCrLf & "Click OK to install. UAC prompt will appear - please click YES.", 1, "Install Node.js")
    If answer = 1 Then
        Set oSA = CreateObject("Shell.Application")
        oSA.ShellExecute "msiexec.exe", "/i """ & msiPath & """", "", "runas", 1
        MsgBox "Installer launched! Please complete the Node.js setup wizard.", 64, "Installing..."
    Else
        MsgBox "Cancelled.", 64, "Cancelled"
    End If
Else
    MsgBox "MSI not found at: " & msiPath, 16, "Error"
End If
