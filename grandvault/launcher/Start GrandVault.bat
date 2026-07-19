@echo off
rem GrandVault — double-click to open. Runs entirely on this PC, no internet.
cd /d "%~dp0"
set PORT=8787

rem Start the tiny local server in its own (minimized) window. Closing that
rem window quits GrandVault.
start "GrandVault (keep open - close to quit)" /min powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port %PORT%

rem Give the server a moment, then open the app in its own window if possible.
ping -n 2 127.0.0.1 >nul

set "EDGE1=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "EDGE2=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "CHROME1=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "CHROME2=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if exist "%EDGE1%"   ( start "" "%EDGE1%"   --app=http://127.0.0.1:%PORT%/ & goto done )
if exist "%EDGE2%"   ( start "" "%EDGE2%"   --app=http://127.0.0.1:%PORT%/ & goto done )
if exist "%CHROME1%" ( start "" "%CHROME1%" --app=http://127.0.0.1:%PORT%/ & goto done )
if exist "%CHROME2%" ( start "" "%CHROME2%" --app=http://127.0.0.1:%PORT%/ & goto done )
start "" http://127.0.0.1:%PORT%/
:done
