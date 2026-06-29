Set oShell = CreateObject("WScript.Shell")
oShell.CurrentDirectory = "C:\Users\10319\Claude\Projects\CRM APP製作"
oShell.Run "cmd /k npm install && npm run dev", 1, False
