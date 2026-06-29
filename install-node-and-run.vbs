' ===================================================
' 安裝 Node.js LTS 並啟動 CRM 開發伺服器
' 說明：用 winget 安裝 Node.js，安裝後自動 npm run dev
' 需要：Windows 11（已內建 winget）
' ===================================================
Set oShell = CreateObject("WScript.Shell")

' 取得 CRM 資料夾路徑（從 File Explorer 的當前目錄繼承）
Dim crmPath: crmPath = oShell.CurrentDirectory

' 建立 PowerShell 指令
Dim ps
ps = ps & "Write-Host '' ; "
ps = ps & "Write-Host '╔═══════════════════════════════════╗' -ForegroundColor Cyan; "
ps = ps & "Write-Host '║  CRM APP - Node.js 安裝中...      ║' -ForegroundColor Cyan; "
ps = ps & "Write-Host '╚═══════════════════════════════════╝' -ForegroundColor Cyan; "
ps = ps & "Write-Host ''; "
ps = ps & "Write-Host 'Step 1: 安裝 Node.js LTS...' -ForegroundColor Yellow; "
ps = ps & "winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements; "
ps = ps & "$code = $LASTEXITCODE; "
ps = ps & "Write-Host ''; "
ps = ps & "if ($code -eq 0 -or $code -eq -1978335189) { "
ps = ps & "  Write-Host 'Step 2: 更新 PATH 環境...' -ForegroundColor Yellow; "
ps = ps & "  $env:PATH = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User'); "
ps = ps & "  Write-Host ''; "
ps = ps & "  Write-Host '  Node 版本: ' -NoNewline; node --version; "
ps = ps & "  Write-Host '  npm 版本:  ' -NoNewline; npm --version; "
ps = ps & "  Write-Host ''; "
ps = ps & "  Write-Host 'Step 3: 進入 CRM 目錄...' -ForegroundColor Yellow; "
ps = ps & "  Set-Location '" & crmPath & "'; "
ps = ps & "  Write-Host '  目錄: ' (Get-Location); "
ps = ps & "  Write-Host ''; "
ps = ps & "  Write-Host 'Step 4: 啟動 npm run dev...' -ForegroundColor Yellow; "
ps = ps & "  Write-Host '  (等待伺服器啟動，然後開啟 http://localhost:3000)' -ForegroundColor Gray; "
ps = ps & "  Write-Host ''; "
ps = ps & "  npm run dev "
ps = ps & "} else { "
ps = ps & "  Write-Host '安裝失敗 (code: ' $code ')' -ForegroundColor Red; "
ps = ps & "  Write-Host '請至 https://nodejs.org 手動下載 LTS 安裝包' -ForegroundColor Red "
ps = ps & "}"

oShell.Run "powershell -NoExit -ExecutionPolicy Bypass -Command """ & ps & """", 1, False
