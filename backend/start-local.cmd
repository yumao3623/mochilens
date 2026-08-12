@echo off
setlocal

where node >nul 2>nul
if errorlevel 1 (
  echo MochiLens could not find Node.js in PATH.
  echo Install Node.js 24 or newer, then reopen this terminal.
  exit /b 1
)

cd /d "%~dp0"
node --env-file-if-exists=.env server.js
