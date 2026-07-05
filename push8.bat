@echo off
cd /d "C:\Users\10319\Claude\Projects\CRMAPP"
del /f ".git\index.lock" 2>nul
del /f ".git\HEAD.lock" 2>nul
git fetch origin
git reset --mixed origin/main
git add "src/app/(dashboard)/sales-orders/page.tsx"
git add "src/app/(dashboard)/sales-orders/[id]/page.tsx"
git commit -m "feat: sales orders full CRUD with items and notes"
git push origin main
pause
