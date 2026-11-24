@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ==========================================
echo   Qwesie TV - Production Start
echo ==========================================

REM Ensure production mode for end-to-end smoke test
set "NODE_ENV=production"

echo [1/3] Checking PostgreSQL availability...
where pg_isready >nul 2>nul
if %errorlevel%==0 (
  pg_isready -h localhost -p 5432 >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] PostgreSQL is not accepting connections on localhost:5432.
    echo         Start it (e.g. "npm run db:start") or your PostgreSQL service, then retry.
    exit /b 1
  ) else (
    echo [OK] PostgreSQL is reachable.
  )
) else (
  powershell -NoProfile -Command "try { $c=New-Object Net.Sockets.TcpClient; $iar=$c.BeginConnect('127.0.0.1',5432,$null,$null); $ok=$iar.AsyncWaitHandle.WaitOne(1500,$false); if($ok){$c.EndConnect($iar)}; $c.Close(); if(-not $ok){exit 1} } catch { exit 1 }" >nul 2>nul
  if errorlevel 1 (
    echo [WARN] Could not verify PostgreSQL (pg_isready not found and port 5432 not reachable).
    echo        Ensure PostgreSQL is running and DATABASE_URL in server\.env is correct.
  ) else (
    echo [OK] PostgreSQL port 5432 is reachable.
  )
)

echo [2/3] Building shared + server + client...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build failed.
  exit /b 1
)

echo [3/3] Starting Qwesie TV server (API + sockets + built client, NODE_ENV=production)...
echo        Login/setup at the Console URL printed below. Overlay /out/* URLs stay public.
call npm start

endlocal
