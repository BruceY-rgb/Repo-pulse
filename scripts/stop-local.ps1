$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $RepoRoot '.dev-services'

function Stop-ManagedProcess {
  param(
    [string]$Name,
    [string]$PidFile
  )

  if (-not (Test-Path $PidFile)) {
    Write-Host "$Name is not running."
    return
  }

  $pidValue = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($pidValue) {
    $process = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
    if ($null -ne $process) {
      Stop-Process -Id $process.Id -Force
      Write-Host "Stopped $Name (PID $pidValue)."
    } else {
      Write-Host "$Name PID file existed, but the process is already gone."
    }
  }

  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

Stop-ManagedProcess -Name 'API' -PidFile (Join-Path $RuntimeDir 'api.pid')
Stop-ManagedProcess -Name 'Web' -PidFile (Join-Path $RuntimeDir 'web.pid')
