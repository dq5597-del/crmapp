Set oShell = CreateObject("WScript.Shell")
oShell.AppActivate "命令提示字元"
WScript.Sleep 500
oShell.SendKeys "^v"
WScript.Sleep 200
oShell.SendKeys "{ENTER}"
