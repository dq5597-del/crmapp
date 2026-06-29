Set oShell = CreateObject("WScript.Shell")
Dim q: q = Chr(34)
Dim p: p = "C:\Users\10319\Claude\Projects\CRM APP" & ChrW(35069) & ChrW(20316)
oShell.Run "cmd.exe /k cd /d " & q & p & q & " && npm install && npm run dev", 1, False
