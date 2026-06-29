Set oShell = CreateObject("WScript.Shell")
oShell.Run "cmd /k npm install && npm run dev", 1, False
