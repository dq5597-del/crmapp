@echo off
chcp 65001 >nul
cd /d "C:\Users\10319\Claude\Projects\CRMAPP"
echo === Pushing to GitHub... ===
git push origin main > push-result.txt 2>&1
type push-result.txt
echo.
echo === Done. Result saved to push-result.txt ===
pause
