@echo off
cd /d "C:\Users\10319\Claude\Projects\CRMAPP"
del /f ".git\index.lock" 2>nul
git fetch origin
git reset --mixed origin/main
git add "src/components/clients/ProjectsTab.tsx"
git commit -m "feat: integrate site survey into project edit form"
git push origin main
pause
