$PG_BIN = "C:\Program Files\PostgreSQL\17\bin"
$PG_DATA = "$PSScriptRoot\..\.local\pgdata"
$LOG_FILE = "$PG_DATA\server.log"

if (!(Test-Path $PG_DATA)) {
    Write-Host "Database cluster not found. Running initialization first..." -ForegroundColor Yellow
    & "$PSScriptRoot\db-init.ps1"
}

Write-Host "Starting PostgreSQL on port 5433..." -ForegroundColor Cyan
& "$PG_BIN\pg_ctl.exe" -D $PG_DATA -l $LOG_FILE start

if ($LASTEXITCODE -eq 0) {
    Write-Host "PostgreSQL started successfully on port 5433." -ForegroundColor Green
} else {
    Write-Host "pg_ctl reported status: $LASTEXITCODE. Checking if server is already running..." -ForegroundColor Yellow
    & "$PG_BIN\pg_ctl.exe" -D $PG_DATA status
}
