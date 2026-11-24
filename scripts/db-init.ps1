$ErrorActionPreference = "Stop"

$PG_BIN = "C:\Program Files\PostgreSQL\17\bin"
$PG_DATA = "$PSScriptRoot\..\.local\pgdata"

if (!(Test-Path $PG_BIN)) {
    Write-Error "PostgreSQL binaries not found at $PG_BIN. Please verify PostgreSQL installation."
    exit 1
}

Write-Host "Initializing Qwesie TV PostgreSQL cluster..." -ForegroundColor Cyan

if (!(Test-Path $PG_DATA)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $PG_DATA -Parent) | Out-Null
    Write-Host "Creating new database cluster at $PG_DATA..." -ForegroundColor Yellow
    & "$PG_BIN\initdb.exe" -D $PG_DATA -U postgres -A trust --no-locale -E UTF8
    Add-Content -Path "$PG_DATA\postgresql.conf" -Value "`nport = 5433`nlisten_addresses = '127.0.0.1'`n"
    Write-Host "Cluster initialized successfully on port 5433." -ForegroundColor Green
} else {
    Write-Host "Cluster already exists at $PG_DATA." -ForegroundColor Yellow
}

Write-Host "Starting PostgreSQL temporarily to ensure database 'qwesie_tv' exists..." -ForegroundColor Cyan
& "$PSScriptRoot\db-start.ps1"
Start-Sleep -Seconds 2

& "$PG_BIN\createdb.exe" -h 127.0.0.1 -p 5433 -U postgres qwesie_tv 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Created database 'qwesie_tv'." -ForegroundColor Green
} else {
    Write-Host "Database 'qwesie_tv' already exists or ready." -ForegroundColor Yellow
}

Write-Host "Database initialization complete." -ForegroundColor Green
