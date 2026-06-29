WScript.Sleep 500
Set oShell = CreateObject("WScript.Shell")
oShell.AppActivate "cmd.exe"
WScript.Sleep 800
oShell.SendKeys "npm install{ENTER}"
