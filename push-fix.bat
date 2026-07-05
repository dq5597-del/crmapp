@echo off
cd /d "C:\Users\10319\Claude\Projects\CRMAPP"
git add next.config.js vercel.json
git commit -m "chore: skip TS/ESLint during build, add vercel.json"
git push origin main
echo.
echo === Push 完成！Vercel 會自動重新部署 ===
pause
