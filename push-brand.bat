@echo off
chcp 65001 >nul
cd /d D:\Guanghui_AI_System\CRMAPP
del /f ".git\index.lock" 2>nul
(
echo === git add ===
git --literal-pathspecs add "src/app/api/train/route.ts" "src/components/dashboard/TrainWidget.tsx"
echo === git status ===
git status
echo === git commit ===
git commit -m "feat: train timetable falls back to next day when no trains left today"
echo === git push ===
git push origin main
echo === done ===
) > push-brand-log.txt 2>&1
