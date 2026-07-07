@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='http://127.0.0.1:8000/'; try { Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 2 | Out-Null } catch { if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Node.js가 설치되어 있지 않습니다. Node.js를 설치한 뒤 다시 실행해주세요.','CATV 전송망 조회') | Out-Null; exit 1 }; Start-Process -FilePath node -ArgumentList 'server.mjs' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden; Start-Sleep -Seconds 2 }; Start-Process $url"

endlocal
