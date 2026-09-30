@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url = 'http://127.0.0.1:8000'; try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 | Out-Null; Start-Process $url } catch { Start-Process -FilePath 'python' -ArgumentList 'server.py' -WorkingDirectory '%~dp0' }"
if errorlevel 1 (
  echo Could not start Pawprint. Make sure Python is installed and available as "python".
  pause
)
