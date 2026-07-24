param(
  [int]$Port = 8000,
  [string]$SubscriberId = "demo"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$startScript = Join-Path $PSScriptRoot "start-webapp.ps1"
$baseUrl = "http://127.0.0.1:$Port"

function ConvertFrom-SecureValue([Security.SecureString]$secureValue) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Read-ConfirmedPassword([string]$label) {
  while ($true) {
    $first = Read-Host "$label 새 비밀번호 (10~128자)" -AsSecureString
    $second = Read-Host "$label 새 비밀번호 확인" -AsSecureString
    $firstText = ConvertFrom-SecureValue $first
    $secondText = ConvertFrom-SecureValue $second
    try {
      if ($firstText.Length -lt 10 -or $firstText.Length -gt 128) {
        Write-Host "비밀번호는 10~128자로 입력하세요." -ForegroundColor Yellow
        continue
      }
      if ($firstText -cne $secondText) {
        Write-Host "입력한 비밀번호가 서로 다릅니다. 다시 입력하세요." -ForegroundColor Yellow
        continue
      }
      return $first.Copy()
    } finally {
      $firstText = $null
      $secondText = $null
      $first.Dispose()
      $second.Dispose()
    }
  }
}

$adminPassword = $null
$subscriberPassword = $null
$adminPlainText = $null
$subscriberPlainText = $null

try {
  Write-Host "로컬 접속 복구를 시작합니다." -ForegroundColor Cyan
  Write-Host "입력한 비밀번호는 화면, 파일, Git에 저장되지 않습니다."
  $adminPassword = Read-ConfirmedPassword "admin"
  $subscriberPassword = Read-ConfirmedPassword $SubscriberId
  $adminPlainText = ConvertFrom-SecureValue $adminPassword
  $subscriberPlainText = ConvertFrom-SecureValue $subscriberPassword

  $env:RATIS_MASTER_KEY = $adminPlainText
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startScript -Port $Port -NoOpen -ForceRestart
  if ($LASTEXITCODE -ne 0) {
    throw "인증 서버를 새 관리자 비밀번호로 시작하지 못했습니다."
  }

  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $loginPayload = @{ id = "admin"; password = $adminPlainText } | ConvertTo-Json -Compress
  Invoke-RestMethod -UseBasicParsing -Uri "$baseUrl/api/auth/login" -Method Post `
    -ContentType "application/json" -Body $loginPayload -WebSession $session -TimeoutSec 10 | Out-Null

  $encodedSubscriberId = [Uri]::EscapeDataString($SubscriberId)
  $resetPayload = @{ password = $subscriberPlainText } | ConvertTo-Json -Compress
  Invoke-RestMethod -UseBasicParsing -Uri "$baseUrl/api/admin/users/$encodedSubscriberId/password" -Method Post `
    -ContentType "application/json" -Body $resetPayload -WebSession $session -TimeoutSec 10 | Out-Null

  Write-Host ""
  Write-Host "복구 완료: admin 및 $SubscriberId 계정의 새 비밀번호가 적용되었습니다." -ForegroundColor Green
  Write-Host "브라우저에서 새 비밀번호로 로그인하세요."
  Start-Sleep -Seconds 3
} catch {
  Write-Host ""
  Write-Host "복구 실패: $($_.Exception.Message)" -ForegroundColor Red
  Read-Host "Enter 키를 누르면 창을 닫습니다"
  exit 1
} finally {
  $env:RATIS_MASTER_KEY = $null
  $adminPlainText = $null
  $subscriberPlainText = $null
  if ($adminPassword) { $adminPassword.Dispose() }
  if ($subscriberPassword) { $subscriberPassword.Dispose() }
}
