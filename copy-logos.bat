@echo off
cd /d D:\Guanghui_AI_System\CRMAPP
(
for /d %%D in ("D:\Guanghui_AI_System\CRMAPP\*logo*") do xcopy "%%D" "D:\Guanghui_AI_System\CRMAPP\public\brands\" /E /Y /I
echo === files ===
dir /b "D:\Guanghui_AI_System\CRMAPP\public\brands"
) > "D:\Guanghui_AI_System\CRMAPP\copy-logos-log.txt" 2>&1
