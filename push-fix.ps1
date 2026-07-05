Set-Location "C:\Users\10319\Claude\Projects\CRMAPP"

# 清除所有 git lock files
Get-ChildItem -Path ".git" -Filter "*.lock" -Recurse | Remove-Item -Force -ErrorAction SilentlyContinue
Remove-Item ".git\refs\heads\.lock" -Force -ErrorAction SilentlyContinue

Write-Host "Git log:" -ForegroundColor Cyan
git log --oneline -3

Write-Host "`n加入修復的 settings 檔案..." -ForegroundColor Yellow
git add "src/app/(dashboard)/settings/page.tsx"

git status

git commit -m "fix: 修復 settings/page.tsx 截斷導致 Vercel build 失敗"

Write-Host "`nPushing to GitHub..." -ForegroundColor Yellow
git push origin main

Write-Host "`n=== 完成！Vercel 將在 1-2 分鐘後更新 ===" -ForegroundColor Green
pause
