Set oShell = CreateObject("WScript.Shell")
Dim q: q = Chr(34)
Dim p: p = "C:\Users\10319\Claude\Projects\CRM APP" & ChrW(35069) & ChrW(20316)
Dim cmd: cmd = "cmd.exe /k cd /d " & q & p & q & " && taskkill /f /im node.exe & rd /s /q node_modules && npm install && npm run dev"
oShell.Run cmd, 1, False
