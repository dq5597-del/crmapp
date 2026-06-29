Set oShell = CreateObject("WScript.Shell")
WScript.Sleep 300
' Try to activate the CMD window by partial title match
Dim bOK
bOK = oShell.AppActivate("APP")
If Not bOK Then bOK = oShell.AppActivate("cmd")
If Not bOK Then bOK = oShell.AppActivate("CRM")
WScript.Sleep 500
oShell.SendKeys "npm install && npm run dev{ENTER}"
