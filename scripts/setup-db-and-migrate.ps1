$PG_BIN = "C:\Program Files\PostgreSQL\17\bin"
$PG_DATA = "$PSScriptRoot\..\.local\pgdata"
$LOG_FILE = "$PG_DATA\server.log"

Write-Host "1. Ensuring PostgreSQL is started on port 5433..." -ForegroundColor Cyan
& "$PG_BIN\pg_ctl.exe" -D $PG_DATA -l $LOG_FILE start
Start-Sleep -Seconds 2

Write-Host "2. Ensuring database 'qwesie_tv' exists..." -ForegroundColor Cyan
& "$PG_BIN\createdb.exe" -h 127.0.0.1 -p 5433 -U postgres qwesie_tv 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Database 'qwesie_tv' created." -ForegroundColor Green
} else {
    Write-Host "Database 'qwesie_tv' ready." -ForegroundColor Yellow
}

Write-Host "3. Running Prisma migrations..." -ForegroundColor Cyan
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/qwesie_tv?schema=public"
npx prisma migrate dev --name init --schema=server/prisma/schema.prisma

Write-Host "4. Running safe database seed..." -ForegroundColor Cyan
npx tsx server/prisma/seed.ts

Write-Host "Database setup, migration and seed completed." -ForegroundColor Green
