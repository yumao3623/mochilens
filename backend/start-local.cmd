@echo off
setlocal

set "MOCHILENS_NODE=C:\Program Files\nodejs\node.exe"
set "MOCHILENS_LOCAL_PROXY=http://127.0.0.1:7890"

if not exist "%MOCHILENS_NODE%" (
  echo MochiLens could not find Node.js at "%MOCHILENS_NODE%".
  echo Please reinstall Node.js or update MOCHILENS_NODE in start-local.cmd.
  exit /b 1
)

cd /d "%~dp0"
set "HTTP_PROXY=%MOCHILENS_LOCAL_PROXY%"
set "HTTPS_PROXY=%MOCHILENS_LOCAL_PROXY%"
"%MOCHILENS_NODE%" --use-env-proxy --env-file-if-exists=.env server.js
