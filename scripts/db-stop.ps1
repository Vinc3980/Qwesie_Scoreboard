$PG_BIN = "C:\Program Files\PostgreSQL\17\bin"
$PG_DATA = "$PSScriptRoot\..\.local\pgdata"

Write-Host "Stopping PostgreSQL on port 5433..." -ForegroundColor Cyan
& "$PG_BIN\pg_ctl.exe" -D $PG_DATA stop -m fast
Write-Host "PostgreSQL stopped." -ForegroundColor Green
