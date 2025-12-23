# Check Database Tables Script
# This script checks if sink connector tables were created in PostgreSQL

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PostgreSQL Tables Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$expectedTables = @(
    "raw_dl_rte",
    "raw_oeordh",
    "raw_oeordl",
    "raw_otslog",
    "raw_ship_code",
    "raw_wmopckh"
)

Write-Host "Checking TimescaleDB container..." -ForegroundColor Yellow
$containerRunning = docker ps --filter "name=timescaledb" --format "{{.Names}}"
if ($containerRunning -ne "timescaledb") {
    Write-Host "✗ TimescaleDB container is not running!" -ForegroundColor Red
    Write-Host "Start it with: docker-compose up -d timescaledb" -ForegroundColor Yellow
    exit 1
}
Write-Host "✓ TimescaleDB container is running" -ForegroundColor Green
Write-Host ""

Write-Host "Expected Tables:" -ForegroundColor Yellow
$expectedTables | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
Write-Host ""

Write-Host "Checking actual tables in database..." -ForegroundColor Yellow
try {
    # List all tables in grafana database
    $tables = docker exec timescaledb psql -U postgres -d grafana -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
    
    Write-Host ""
    Write-Host "Tables found in 'grafana' database:" -ForegroundColor Cyan
    
    $foundTables = @()
    $tables -split "`n" | ForEach-Object {
        $tableName = $_.Trim()
        if ($tableName -ne "") {
            $foundTables += $tableName
            $isExpected = $expectedTables -contains $tableName
            if ($isExpected) {
                Write-Host "  ✓ $tableName" -ForegroundColor Green
            } else {
                Write-Host "  · $tableName" -ForegroundColor Gray
            }
        }
    }
    
    Write-Host ""
    Write-Host "Summary:" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    
    $found = 0
    $missing = 0
    
    foreach ($table in $expectedTables) {
        if ($foundTables -contains $table) {
            Write-Host "  ✓ $table" -ForegroundColor Green
            $found++
        } else {
            Write-Host "  ✗ $table (NOT CREATED)" -ForegroundColor Red
            $missing++
        }
    }
    
    Write-Host ""
    Write-Host "  Found:   $found / $($expectedTables.Count)" -ForegroundColor $(if ($found -eq $expectedTables.Count) { "Green" } else { "Yellow" })
    Write-Host "  Missing: $missing" -ForegroundColor $(if ($missing -eq 0) { "Green" } else { "Red" })
    
    if ($missing -eq 0) {
        Write-Host ""
        Write-Host "✓ All expected tables have been created!" -ForegroundColor Green
        
        # Show row counts
        Write-Host ""
        Write-Host "Row counts:" -ForegroundColor Yellow
        foreach ($table in $expectedTables) {
            $count = docker exec timescaledb psql -U postgres -d grafana -t -c "SELECT COUNT(*) FROM $table;"
            Write-Host "  $table : $($count.Trim()) rows" -ForegroundColor Cyan
        }
    } else {
        Write-Host ""
        Write-Host "⚠ Some tables are missing!" -ForegroundColor Yellow
        Write-Host "This might be normal if connectors haven't received data yet." -ForegroundColor Gray
        Write-Host "Tables are auto-created when first data arrives (auto.create=true)" -ForegroundColor Gray
    }
    
} catch {
    Write-Host "✗ Error accessing database: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Table Structure Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Do you want to see table structures? (Y/N): " -NoNewline -ForegroundColor Yellow
$response = Read-Host

if ($response -eq "Y" -or $response -eq "y") {
    foreach ($table in $expectedTables) {
        if ($foundTables -contains $table) {
            Write-Host ""
            Write-Host "Structure of $table" -ForegroundColor Cyan -BackgroundColor DarkGray
            docker exec timescaledb psql -U postgres -d grafana -c "\d $table"
        }
    }
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
