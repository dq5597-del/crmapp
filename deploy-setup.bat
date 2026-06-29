@echo off
cd /d "C:\Users\10319\Claude\Projects\CRMAPP"
if exist ".git" (
  git add .
  git commit -m "update"
  git push
  goto done
)
git init
git add .
git commit -m "CRM init"
echo.
echo === Paste GitHub repo URL below ===
set /p REPO_URL="GitHub URL: "
git remote add origin %REPO_URL%
git branch -M main
git push -u origin main
:done
echo.
echo === Done! Go to https://vercel.com ===
pause
