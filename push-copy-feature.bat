@echo off
chcp 65001 >nul
cd /d "C:\Users\10319\Claude\Projects\CRMAPP"

echo === 清除殘留 lock ===
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
for /r ".git" %%f in (*.lock) do del /f /q "%%f" 2>nul

echo === 目前待推送的 commit ===
git log --oneline origin/main..HEAD

echo.
echo === 推送到 GitHub（觸發 Vercel 部署）===
echo === 若跳出 GitHub 登入視窗，請完成登入 ===
git push origin main

echo.
echo === 若上方顯示 main -^> main 即代表成功，Vercel 會自動部署 ===
echo === 按任意鍵關閉此視窗 ===
pause
