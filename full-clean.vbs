Set oShell = CreateObject("WScript.Shell")
Dim q: q = Chr(34)
Dim p: p = "C:\Users\10319\Claude\Projects\CRM APP" & ChrW(35069) & ChrW(20316)

' Kill all node processes first, wait for them to die
oShell.Run "taskkill /f /im node.exe", 0, True
oShell.Run "taskkill /f /im npm.cmd", 0, True
WScript.Sleep 2000

' Now open CMD and delete node_modules + package-lock.json, then fresh install
Dim cmd: cmd = "cmd.exe /k cd /d " & q & p & q & " && del /f /q package-lock.json & rd /s /q node_modules & npm install && npm run dev"
oShell.Run cmd, 1, False
