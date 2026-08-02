@echo off
setlocal

REM ============================================
REM  用法： push.bat "這次改了什麼"
REM  範例： push.bat "fix: 調撥單庫存不足檢查"
REM ============================================

if "%~1"=="" (
    echo.
    echo [錯誤] 請提供 commit 訊息
    echo 用法： push.bat "描述這次改了什麼"
    echo.
    pause
    exit /b 1
)

echo.
echo === 1/4 檢查是否為 git repo ===
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [錯誤] 這個資料夾不是 git repo，請確認位置。
    pause
    exit /b 1
)

echo.
echo === 2/4 先加入本機變更 ===
git add -A
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "%~1"
    if errorlevel 1 (
        echo [錯誤] commit 失敗，請看上方訊息。
        pause
        exit /b 1
    )
) else (
    echo 沒有新的變更需要 commit，繼續同步遠端。
)

echo.
echo === 3/4 拉取遠端更新 ^(rebase^) ===
git pull --rebase
if errorlevel 1 (
    echo.
    echo [中止] pull 發生衝突或失敗，尚未 push。
    echo 請先解決衝突後，執行：git rebase --continue
    echo 若要放棄這次 rebase：git rebase --abort
    pause
    exit /b 1
)

echo.
echo === 4/4 推送到 GitHub ===
git push
if errorlevel 1 (
    echo.
    echo [錯誤] push 失敗，請看上方訊息。
    pause
    exit /b 1
)

echo.
echo ============================================
echo  完成！已推送： %~1
echo ============================================
pause
