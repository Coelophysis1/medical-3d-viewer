@echo off
rem ============================================
rem  Medical 3D Viewer - Dev Server Launcher
rem  Uses Node 22 (required by better-sqlite3)
rem ============================================
set "PATH=C:\Users\f\.workbuddy\binaries\node\versions\22.22.2-3;C:\Users\f\AppData\Roaming\npm;%PATH%"
cd /d "%~dp0"

echo.
echo   ==========================================
echo     Medical 3D Viewer  (dev mode)
echo     URL:  http://localhost:5000
echo     Login: admin / admin123
echo            doctor1 / Doctor@123
echo   ==========================================
echo.

pnpm dev
