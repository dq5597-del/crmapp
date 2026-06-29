Set oShell = CreateObject("WScript.Shell")
Dim q: q = Chr(34)
Dim sPath: sPath = "C:\Users\10319\Claude\Projects\CRM APP" & ChrW(35070) & ChrW(20316)
Dim sCmd: sCmd = "cmd /k cd /d " & q & sPath & q & " && npm install && npm run dev"
oShell.Run sCmd, 1, False
