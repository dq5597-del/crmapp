Set-Location "C:\Users\10319\Claude\Projects\CRMAPP"
Remove-Item ".git\HEAD.lock" -Force -ErrorAction SilentlyContinue
Remove-Item ".git\index.lock" -Force -ErrorAction SilentlyContinue
git add src/app/api/accounting src/app/(dashboard)/accounting src/components/Sidebar.tsx src/app/(dashboard)/settings/page.tsx
git commit -m "feat: 會計管理模組 — 支出記錄 + 損益表 + 科目管理"
git push origin main
Write-Host "`n=== Push 完成！===" -ForegroundColor Green
pause
