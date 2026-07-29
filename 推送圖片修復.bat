@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  推送「Google Drive 圖片顯示修復」到 GitHub
echo  推上去後 Vercel 會自動重新部署（約1~2分鐘）
echo ============================================
echo.
git add src/lib/drive-url.ts src/lib/gdrive.ts src/lib/web-product-mapper.ts "src/app/(dashboard)/products/page.tsx"
git commit -m "fix: Google Drive 圖片改用 thumbnail 端點顯示（修復破圖）"
git push origin main
echo.
echo 完成！請等 1~2 分鐘後重新整理 CRM 頁面查看。
pause
