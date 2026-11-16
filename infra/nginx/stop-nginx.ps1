# PowerShell helper to stop running NGINX
$ErrorActionPreference = "Continue"

Write-Host "Stopping NGINX..." -ForegroundColor Yellow
$nginxExe = "c:\tools\nginx\nginx.exe"
$nginxDir = "c:\tools\nginx"

if (Test-Path $nginxExe) {
    & $nginxExe -p "$nginxDir" -s stop 2>$null
}

Get-Process nginx -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "NGINX stopped." -ForegroundColor Green

