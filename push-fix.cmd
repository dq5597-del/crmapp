@echo off
cd /d "C:\Users\10319\Claude\Projects\CRMAPP"

echo === 清除 git lock files ===
del /f /q ".git\HEAD.lock" 2>nul
del /f /q ".git\refs\heads\main.lock" 2>nul
del /f /q ".git\refs\heads\.lock" 2>nul
for /r ".git" %%f in (*.lock) do del /f /q "%%f" 2>nul

echo === Git log ===
git log --oneline -3

echo === Git add settings ===
git add "src/app/(dashboard)/settings/page.tsx"

echo === Git status ===
git status

echo === Git commit ===
git commit -m "fix: repair settings page.tsx truncation"

echo === Git push ===
git push origin main

echo.
echo === DONE ===
pause
