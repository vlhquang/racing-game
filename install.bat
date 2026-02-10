@echo off
echo Starting installation... > install.log
npm --version >> install.log 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo NPM not found in PATH >> install.log
  exit /b 1
)
echo NPM found, installing... >> install.log
call npm install >> install.log 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo NPM install failed with error %ERRORLEVEL% >> install.log
  exit /b %ERRORLEVEL%
)
echo Installation successful >> install.log
