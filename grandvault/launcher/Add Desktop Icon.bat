@echo off
rem Creates a "GrandVault" shortcut on the Desktop that launches the app.
cd /d "%~dp0"
set "TARGET=%~dp0Start GrandVault.bat"
set "ICON=%~dp0grandvault.ico"

powershell -ExecutionPolicy Bypass -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([IO.Path]::Combine([Environment]::GetFolderPath('Desktop'),'GrandVault.lnk'));" ^
  "$s.TargetPath='%TARGET%';" ^
  "$s.WorkingDirectory='%~dp0';" ^
  "$s.IconLocation='%ICON%';" ^
  "$s.WindowStyle=7;" ^
  "$s.Description='GrandVault — family finance dashboard';" ^
  "$s.Save()"

echo.
echo A "GrandVault" icon has been added to your Desktop.
echo You can also right-click it and choose "Pin to taskbar".
echo.
pause
