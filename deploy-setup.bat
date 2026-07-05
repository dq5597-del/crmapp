@echo off
cd /d "C:\Users\10319\Claude\Projects\CRMAPP"

del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul

git config user.email "dq5597@gmail.com"
git config user.name "adi chuang"

git remote remove origin 2>nul
git remote add origin https://github.com/dq5597-del/crmapp.git

git branch -M main

git push -u origin main

echo.
echo === Push done! Now go to https://vercel.com ===
pause
