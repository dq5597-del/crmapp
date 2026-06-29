Set oShell = CreateObject("WScript.Shell")
Dim sPath
sPath = "C:\Users\10319\Claude\Projects\CRM APP" & ChrW(35070) & ChrW(20316)
oShell.Run "cmd /k """ & sPath & "\start-crm.bat""", 1, False
