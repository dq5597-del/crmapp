@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   光輝影音科技 CRM 啟動中...
echo ============================================
echo.

if not exist ".env.local" (
    echo [錯誤] 找不到 .env.local 設定檔！
    echo.
    echo 請先把 .env.local.example 複製為 .env.local
    echo 並填入你的 Supabase 和 Anthropic API Key。
    echo.
    pause
    exit /b 1
)

echo [1/2] 安裝/更新套件...
call npm install
echo.
echo [2/2] 啟動開發伺服器...
echo.
echo 啟動後請用瀏覽器開啟：http://localhost:3000
echo 按 Ctrl+C 可停止伺服器
echo.
call npm run dev
pause
