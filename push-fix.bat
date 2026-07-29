@echo off
cd /d "%~dp0"
echo ==========================================
echo  Push latest fixes to GitHub (Vercel deploy)
echo ==========================================
echo.
del /f /q ".git\index.lock" 2>nul
del /f /q "crm-ui-spec_SKILL.md.gdoc" 2>nul
git rm --cached -f -r --ignore-unmatch *.gdoc *.gsheet *.gslides > push-log.txt 2>&1
git add .gitignore >> push-log.txt 2>&1
git add src package.json >> push-log.txt 2>&1
git commit -m "fix: print layout spacing, stamp size, pnl categories import, nonop income/expense split" >> push-log.txt 2>&1
git push origin main >> push-log.txt 2>&1
echo Done. Result saved to push-log.txt
type push-log.txt
echo.
pause
