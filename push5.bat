@echo off
cd /d "C:\Users\10319\Claude\Projects\CRMAPP"
del /f ".git\index.lock" 2>nul
git stash
git fetch origin
git rebase origin/main
git stash pop
git push
pause
