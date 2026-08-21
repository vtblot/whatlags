@echo off
setlocal
cd /d "%~dp0.."
if not exist "node_modules\" (
  echo Installe les dependances : npm install
  pause
  exit /b 1
)
if not exist ".next\BUILD_ID" (
  call npm run build
  if errorlevel 1 exit /b 1
)
call npm start
