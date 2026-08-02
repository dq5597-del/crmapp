@echo off
REM 用法：push.bat "這次改了什麼"
REM 範例：push.bat "fix: 調撥單來源倉庫存不足檢查"

if "%~1"=="" (
    echo 錯誤：請提供 commit 訊息
    echo 用法： push.bat "描述這次改了什麼"
    exit /b 1
)

git add -A
git commit -m "%~1"
git push

echo.
echo 已推送：%~1
