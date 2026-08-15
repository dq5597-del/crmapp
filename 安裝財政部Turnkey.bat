@echo off
setlocal
set "JAVA_HOME=D:\Guanghui_AI_System\CRMAPP\Tools\Temurin17\jdk-17.0.20+8"
set "PATH=%JAVA_HOME%\bin;%PATH%"

if not exist "%JAVA_HOME%\bin\java.exe" (
  echo [ERROR] OpenJDK 17 not found: %JAVA_HOME%
  pause
  exit /b 1
)

set "TURNKEY_SETUP=D:\Guanghui_AI_System\CRMAPP\Temp\Turnkey_v3.2.1_Windows_x64\windows\EINVTurnkey_setup_3.2.1.exe"
if not exist "%TURNKEY_SETUP%" (
  echo [ERROR] Turnkey installer not found: %TURNKEY_SETUP%
  pause
  exit /b 1
)

echo Starting MOF E-Invoice Turnkey v3.2.1 installer...
"%TURNKEY_SETUP%"
set "INSTALL_EXIT=%ERRORLEVEL%"

if not "%INSTALL_EXIT%"=="0" (
  echo.
  echo [ERROR] Turnkey installer exit code: %INSTALL_EXIT%
  pause
)
exit /b %INSTALL_EXIT%
