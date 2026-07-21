param(
  [int]$Port = 8000,
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$expectedApiVersion = "managed-auth-v1"
$projectRoot = Split-Path -Parent $PSScriptRoot
$url = "http://127.0.0.1:$Port/"
$healthUrl = "${url}api/health"

function Show-StartupError([string]$message) {
  Write-Host $message -ForegroundColor Red
  if (-not $NoOpen) {
    try {
      Add-Type -AssemblyName PresentationFramework
      [System.Windows.MessageBox]::Show($message, "CATV Network") | Out-Null
    } catch {}
  }
}

function Get-RatisHealth {
  try {
    return Invoke-RestMethod -UseBasicParsing -Uri $healthUrl -TimeoutSec 2
  } catch {
    return $null
  }
}

function Get-ListeningProcessId {
  $escapedPort = [Regex]::Escape([string]$Port)
  $listener = netstat -ano -p tcp |
    Where-Object { $_ -match ":${escapedPort}\s+.*\s+LISTENING\s+(\d+)\s*$" } |
    Select-Object -First 1
  if (-not $listener) { return $null }
  if ($listener -match "LISTENING\s+(\d+)\s*$") { return [int]$Matches[1] }
  return $null
}

function Test-RatisServerProcess([int]$processId) {
  try {
    $process = Get-Process -Id $processId -ErrorAction Stop
    return [bool]($process -and $process.ProcessName -eq "node" -and $health -and $health.ok)
  } catch {
    return $false
  }
}

function Set-SessionMasterKey {
  if (-not [string]::IsNullOrWhiteSpace($env:RATIS_MASTER_KEY)) { return $true }
  if ($NoOpen) {
    Show-StartupError "RATIS_MASTER_KEY is not set."
    return $false
  }

  Add-Type -AssemblyName PresentationFramework
  $window = New-Object System.Windows.Window
  $window.Title = "CATV server master key"
  $window.SizeToContent = "WidthAndHeight"
  $window.WindowStartupLocation = "CenterScreen"
  $window.ResizeMode = "NoResize"
  $window.Topmost = $true

  $panel = New-Object System.Windows.Controls.StackPanel
  $panel.Margin = New-Object System.Windows.Thickness(24)
  $message = New-Object System.Windows.Controls.TextBlock
  $message.Text = "Enter RATIS_MASTER_KEY to start the server.`nThe value is not displayed or saved to a file."
  $message.Margin = New-Object System.Windows.Thickness(0, 0, 0, 14)
  $passwordBox = New-Object System.Windows.Controls.PasswordBox
  $passwordBox.Width = 360
  $passwordBox.Margin = New-Object System.Windows.Thickness(0, 0, 0, 14)
  $confirmButton = New-Object System.Windows.Controls.Button
  $confirmButton.Content = "Start server"
  $confirmButton.Width = 110
  $confirmButton.Height = 36
  $confirmButton.HorizontalAlignment = "Right"
  $confirmButton.IsDefault = $true
  $confirmButton.Add_Click({ $window.DialogResult = $true })
  [void]$panel.Children.Add($message)
  [void]$panel.Children.Add($passwordBox)
  [void]$panel.Children.Add($confirmButton)
  $window.Content = $panel
  $window.Add_ContentRendered({ $passwordBox.Focus() })

  $accepted = $window.ShowDialog()
  if (-not $accepted -or $passwordBox.SecurePassword.Length -eq 0) {
    Show-StartupError "The server was not started because the master key was not entered."
    return $false
  }

  $secureKey = $passwordBox.SecurePassword.Copy()
  $passwordBox.Clear()
  $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  try {
    $env:RATIS_MASTER_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    $secureKey.Dispose()
  }
  return $true
}

Set-Location $projectRoot
$health = Get-RatisHealth
if ($health -and $health.apiVersion -eq $expectedApiVersion) {
  if (-not $NoOpen) { Start-Process $url }
  exit 0
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Show-StartupError "Node.js is not installed. Install Node.js and try again."
  exit 1
}

if (-not (Set-SessionMasterKey)) { exit 1 }

$listenerProcessId = Get-ListeningProcessId
if ($listenerProcessId) {
  if (-not (Test-RatisServerProcess $listenerProcessId)) {
    Show-StartupError "Port ${Port} is used by another program. The process was not replaced."
    exit 1
  }
  Stop-Process -Id $listenerProcessId -Force
  for ($attempt = 0; $attempt -lt 20 -and (Get-ListeningProcessId); $attempt += 1) {
    Start-Sleep -Milliseconds 250
  }
}

$env:PORT = [string]$Port
$env:HOST = "127.0.0.1"
$nodePath = (Get-Command node).Source
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $nodePath
$startInfo.Arguments = "server.mjs"
$startInfo.WorkingDirectory = $projectRoot
$startInfo.UseShellExecute = $true
$startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
$serverProcess = [System.Diagnostics.Process]::Start($startInfo)

for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
  Start-Sleep -Milliseconds 250
  $health = Get-RatisHealth
  if ($health -and $health.apiVersion -eq $expectedApiVersion) {
    if (-not $NoOpen) { Start-Process $url }
    exit 0
  }
  if ($serverProcess.HasExited) { break }
}

Show-StartupError "The new server did not start. Check the port and server environment variables."
exit 1
