# PowerShell helper to start local NGINX using our project config
$ErrorActionPreference = "Stop"

$configFile = Join-Path $PSScriptRoot "nginx.conf"
$nginxExe = "c:\tools\nginx\nginx.exe"
$nginxDir = "c:\tools\nginx"

if (-not (Test-Path $nginxExe)) {
    Write-Error "NGINX executable not found at $nginxExe"
    exit 1
}

# Stop any currently running nginx processes first to avoid port conflicts
Get-Process nginx -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "Testing NGINX configuration..." -ForegroundColor Cyan
& $nginxExe -p "$nginxDir" -c "$configFile" -t

if ($LASTEXITCODE -eq 0) {
    Write-Host "Starting NGINX reverse proxy on http://localhost:8080 (forwarding to http://localhost:8000)..." -ForegroundColor Green
    Start-Process -FilePath $nginxExe -ArgumentList "-p `"$nginxDir`" -c `"$configFile`"" -WorkingDirectory $nginxDir
    Write-Host "NGINX started successfully in background!" -ForegroundColor Green
    Write-Host "Verify with: http://localhost:8080/nginx-health" -ForegroundColor Yellow
} else {
    Write-Error "NGINX configuration test failed."
}

