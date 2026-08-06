@echo off
setlocal

REM ============================================
REM  Usage:   push.bat "what changed"
REM  Example: push.bat "fix: stock check on transfer"
REM
REM  NOTE: keep this file ASCII-only. Chinese text here
REM  breaks cmd parsing when the console codepage is 950.
REM ============================================

if "%~1"=="" (
    echo.
    echo [ERROR] Commit message required.
    echo Usage: push.bat "what changed"
    echo.
    pause
    exit /b 1
)

echo.
echo === 1/4 Checking git repo ===
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Not a git repo. Check the folder.
    pause
    exit /b 1
)

echo.
echo === 2/4 Staging local changes ===
git add -A
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "%~1"
    if errorlevel 1 (
        echo [ERROR] Commit failed. See messages above.
        pause
        exit /b 1
    )
) else (
    echo Nothing new to commit. Continuing to sync.
)

echo.
echo === 3/4 Pulling remote (rebase) ===
git pull --rebase
if errorlevel 1 (
    echo.
    echo [ABORTED] Pull conflict or failure. Nothing pushed.
    echo Resolve conflicts, then run: git rebase --continue
    echo To give up this rebase:      git rebase --abort
    pause
    exit /b 1
)

echo.
echo === 4/4 Pushing to GitHub ===
git push
if errorlevel 1 (
    echo.
    echo [ERROR] Push failed. See messages above.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Done. Pushed: %~1
echo ============================================
pause
