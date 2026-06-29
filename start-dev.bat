@echo off
cd /d "C:\Users\10319\Claude\Projects\CRM APP製作"
node -v > dev-log.txt 2>&1
npm -v >> dev-log.txt 2>&1
npm run dev >> dev-log.txt 2>&1
pause
