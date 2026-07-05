@echo off
cd /d "C:\Users\10319\Claude\Projects\CRMAPP"
del /f ".git\index.lock" 2>nul
del /f ".git\HEAD.lock" 2>nul
git fetch origin
git reset --mixed origin/main
git add "src/components/clients/ProjectsTab.tsx"
git add "supabase/add_project_photos.sql"
git commit -m "feat: add project photo management with 3 categories"
git push origin main
pause
