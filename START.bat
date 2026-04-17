@echo off
chcp 65001 >nul 2>&1
title CLAUDIUS
color 0E
echo.
echo  ========================================
echo    CLAUDIUS - Film Intelligence System
echo  ========================================
echo.

cd /d "%~dp0"

:: --- Check Node.js ---
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found in PATH.
    echo  Install from https://nodejs.org or add it to PATH.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo  Node.js %%v detected.

:: --- Check node_modules ---
if not exist "node_modules\" (
    echo.
    echo  [SETUP] node_modules missing - running npm install...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo  [ERROR] npm install failed.
        pause
        exit /b 1
    )
    echo.
    echo  [OK] Dependencies installed.
)

:: --- Check .env ---
if not exist ".env" (
    echo.
    echo  [ERROR] .env file is missing! The app won't start without it.
    echo  Create .env with at minimum: APP_PASSWORD, TMDB_API_KEY, PORT
    echo.
    pause
    exit /b 1
)
echo  .env file found.

:: --- Check database ---
if exist "db\claudius.db" (
    echo  Database found.
) else (
    echo  [WARN] No database found - the app will start but the library will be empty.
    echo         Use the Admin panel to run an import after login.
)

echo.
echo  Starting backend + frontend...
echo.

:: --- Launch both via concurrently (single window) ---
call npx concurrently -n "SERVER,APP" -c "blue,green" "node server/index.js" "npx vite"

echo.
echo  Servers stopped.
pause
