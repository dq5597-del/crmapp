Set oShell = CreateObject("WScript.Shell")
WScript.Sleep 300
oShell.AppActivate "cmd.exe"
WScript.Sleep 500
oShell.SendKeys "npm run dev{ENTER}"
