@echo off
setlocal

set "MOCHILENS_NODE=C:\Program Files\nodejs\node.exe"

if not exist "%MOCHILENS_NODE%" (
  echo MochiLens could not find Node.js at "%MOCHILENS_NODE%".
  echo Please reinstall Node.js or update MOCHILENS_NODE in start-local.cmd.
  exit /b 1
)

cd /d "%~dp0"
"%MOCHILENS_NODE%" --env-file-if-exists=.env server.js
