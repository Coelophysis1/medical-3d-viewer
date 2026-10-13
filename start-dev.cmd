@echo off
rem ============================================
rem  Medical 3D Viewer - Dev Server Launcher
rem  自动定位 Node 22（better-sqlite3 依赖要求）
rem ============================================
set "NODE22="
for /d %%D in ("%USERPROFILE%\.workbuddy\binaries\node\versions\22.*") do set "NODE22=%%D"

if not defined NODE22 (
  echo [ERROR] 未找到 Node 22 运行时，无法启动
  echo         better-sqlite3 需要 Node 22，请先安装对应版本
  pause
  exit /b 1
)

set "PATH=%NODE22%;C:\Users\f\AppData\Roaming\npm;%PATH%"
cd /d "%~dp0"

echo.
echo   ==========================================
echo     Medical 3D Viewer  (dev mode)
echo     Node: %NODE22%
echo     URL:  http://localhost:5000
echo   ==========================================
echo.

pnpm dev
