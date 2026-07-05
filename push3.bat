@echo off
cd /d "C:\Users\10319\Claude\Projects\CRMAPP"
del /f ".git\index.lock" 2>nul
git pull --rebase origin main
git push
pause
