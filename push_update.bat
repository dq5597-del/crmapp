@echo off
cd /d C:\Users\10319\Claude\Projects\CRMAPP
git add src/components/clients/ProjectsTab.tsx
git commit -m "feat: integrate site survey into project edit form (9 accordion groups)"
git push
echo.
echo === 完成！按任意鍵關閉 ===
pause
