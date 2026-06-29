Set oShell = CreateObject("WScript.Shell")
' PowerShell loads $PROFILE which contains NVM/Volta PATH - unlike cmd
' CWD inherited from File Explorer (the CRM directory)
oShell.Run "powershell -NoExit -ExecutionPolicy Bypass -Command ""npm install; npm run dev""", 1, False
