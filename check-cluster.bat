@echo off
echo ========================================
echo Checking Kafka Cluster Setup
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js is installed
node --version
echo.

REM Check if kafkajs is installed
npm list kafkajs >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] KafkaJS not found. Installing...
    npm install kafkajs
    echo.
) else (
    echo [OK] KafkaJS is installed
)

echo.
echo ========================================
echo Verifying Kafka Cluster...
echo ========================================
echo.

node verify-cluster.js

echo.
pause
