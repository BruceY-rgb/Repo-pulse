param(
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$SkipInfra
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $RepoRoot '.dev-services'
$ApiPort = 3001
$WebPort = 4173
$ApiUrl = "http://127.0.0.1:$ApiPort"
$WebUrl = "http://127.0.0.1:$WebPort"
$PowerShellExe = Join-Path $PSHOME 'powershell.exe'

$ApiPidFile = Join-Path $RuntimeDir 'api.pid'
$WebPidFile = Join-Path $RuntimeDir 'web.pid'
$ApiOutLog = Join-Path $RuntimeDir 'api.out.log'
$ApiErrLog = Join-Path $RuntimeDir 'api.err.log'
$WebOutLog = Join-Path $RuntimeDir 'web.out.log'
$WebErrLog = Join-Path $RuntimeDir 'web.err.log'

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Quote-PowerShell {
  param([string]$Value)
  return "'" + $Value.Replace("'", "''") + "'"
}

function Assert-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

function Invoke-Native {
  param(
    [string]$Command,
    [string[]]$Arguments,
    [string]$WorkingDirectory = $RepoRoot
  )

  Push-Location $WorkingDirectory
  try {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed: $Command $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function Invoke-NativeWithRetry {
  param(
    [string]$Command,
    [string[]]$Arguments,
    [string]$WorkingDirectory = $RepoRoot,
    [int]$MaxAttempts = 3,
    [int]$DelaySeconds = 3
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      Invoke-Native -Command $Command -Arguments $Arguments -WorkingDirectory $WorkingDirectory
      return
    } catch {
      if ($attempt -ge $MaxAttempts) {
        throw
      }

      Write-Warning "Command failed on attempt $attempt/$MaxAttempts. Retrying in $DelaySeconds seconds..."
      Start-Sleep -Seconds $DelaySeconds
    }
  }
}

function Get-ListenerPid {
  param([int]$Port)

  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if ($null -ne $connection) {
    return [int]$connection.OwningProcess
  }

  return $null
}

function Stop-ManagedProcess {
  param(
    [string]$Name,
    [string]$PidFile
  )

  if (-not (Test-Path $PidFile)) {
    return
  }

  $pidValue = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($pidValue) {
    $process = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
    if ($null -ne $process) {
      Write-Step "Stopping existing $Name process (PID $pidValue)"
      Stop-Process -Id $process.Id -Force
      Start-Sleep -Seconds 1
    }
  }

  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

function Assert-PortAvailable {
  param(
    [int]$Port,
    [string]$Name
  )

  $listenerPid = Get-ListenerPid -Port $Port
  if ($null -ne $listenerPid) {
    throw "$Name port $Port is already in use by PID $listenerPid. Stop that process first or run scripts/stop-local.ps1."
  }
}

function Wait-ForHttp {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  throw "Timed out waiting for $Url"
}

function Test-PrismaClientAvailable {
  $engine = Get-ChildItem `
    -Path (Join-Path $RepoRoot 'node_modules\.pnpm') `
    -Filter 'query_engine-windows.dll.node' `
    -Recurse `
    -ErrorAction SilentlyContinue |
    Select-Object -First 1

  return $null -ne $engine
}

function Get-ViteBinPath {
  $directPath = Join-Path $RepoRoot 'node_modules\vite\bin\vite.js'
  if (Test-Path $directPath) {
    return $directPath
  }

  $pnpmPath = Get-ChildItem `
    -Path (Join-Path $RepoRoot 'node_modules\.pnpm') `
    -Filter 'vite.js' `
    -Recurse `
    -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like '*\node_modules\vite\bin\vite.js' } |
    Select-Object -First 1

  if ($null -eq $pnpmPath) {
    throw 'Could not locate vite.js in node_modules.'
  }

  return $pnpmPath.FullName
}

function Start-BackgroundPowerShell {
  param(
    [string]$Name,
    [string]$Command,
    [string]$OutLog,
    [string]$ErrLog,
    [string]$PidFile
  )

  foreach ($logFile in @($OutLog, $ErrLog)) {
    if (Test-Path $logFile) {
      Remove-Item -LiteralPath $logFile -Force
    }
  }

  $process = Start-Process `
    -FilePath $PowerShellExe `
    -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $Command `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog `
    -PassThru

  Set-Content -LiteralPath $PidFile -Value $process.Id
  Write-Host "$Name PID: $($process.Id)"
}

New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null

Write-Step 'Checking prerequisites'
Assert-Command -Name 'node'
Assert-Command -Name 'corepack'

$env:COREPACK_HOME = Join-Path $RepoRoot '.corepack'
$envFile = Join-Path $RepoRoot '.env'
$envExampleFile = Join-Path $RepoRoot '.env.example'

if (-not (Test-Path $envFile)) {
  if (-not (Test-Path $envExampleFile)) {
    throw 'Missing .env and .env.example. Cannot continue.'
  }

  Write-Step 'Creating .env from .env.example'
  Copy-Item -LiteralPath $envExampleFile -Destination $envFile
}

Write-Step 'Stopping previously managed processes'
Stop-ManagedProcess -Name 'API' -PidFile $ApiPidFile
Stop-ManagedProcess -Name 'Web' -PidFile $WebPidFile

Assert-PortAvailable -Port $ApiPort -Name 'API'
Assert-PortAvailable -Port $WebPort -Name 'Web'

if (-not $SkipInfra) {
  $dockerCommand = Get-Command 'docker' -ErrorAction SilentlyContinue
  if ($null -ne $dockerCommand) {
    Write-Step 'Starting PostgreSQL and Redis via docker compose'
    Invoke-Native -Command $dockerCommand.Source -Arguments @('compose', 'up', '-d')
  } else {
    Write-Warning 'docker not found. Skipping infrastructure startup.'
  }
}

if (-not $SkipInstall) {
  Write-Step 'Installing workspace dependencies'
  Invoke-Native -Command 'corepack' -Arguments @('pnpm', 'install')
}

Write-Step 'Generating Prisma client'
try {
  Invoke-NativeWithRetry -Command 'corepack' -Arguments @('pnpm', '--filter', '@repo-pulse/database', 'db:generate')
} catch {
  if (Test-PrismaClientAvailable) {
    Write-Warning 'Prisma generate did not finish cleanly, but an existing generated client was found. Continuing.'
  } else {
    throw
  }
}

if (-not $SkipBuild) {
  Write-Step 'Building shared packages'
  Invoke-Native -Command 'corepack' -Arguments @('pnpm', '--filter', '@repo-pulse/shared', 'build')
  Invoke-Native -Command 'corepack' -Arguments @('pnpm', '--filter', '@repo-pulse/ai-sdk', 'build')
  Invoke-Native -Command 'corepack' -Arguments @('pnpm', '--filter', '@repo-pulse/database', 'build')

  Write-Step 'Building applications'
  Invoke-Native -Command 'corepack' -Arguments @('pnpm', '--filter', '@repo-pulse/api', 'build')
  Invoke-Native -Command 'corepack' -Arguments @('pnpm', '--filter', '@repo-pulse/web', 'build')
}

$NodePath = (Get-Command 'node').Source
$ApiWorkingDirectory = Join-Path $RepoRoot 'apps\api'
$ApiEntry = Join-Path $ApiWorkingDirectory 'dist\main.js'
$WebWorkingDirectory = Join-Path $RepoRoot 'apps\web'
$ViteBinPath = Get-ViteBinPath

if (-not (Test-Path $ApiEntry)) {
  throw "API entry not found: $ApiEntry"
}

$ApiCommand = @(
  '$env:APP_PORT = ''3001'''
  ('$env:FRONTEND_URL = ' + (Quote-PowerShell -Value $WebUrl))
  ('Set-Location ' + (Quote-PowerShell -Value $ApiWorkingDirectory))
  ('& ' + (Quote-PowerShell -Value $NodePath) + ' ' + (Quote-PowerShell -Value $ApiEntry))
) -join '; '

$WebCommand = @(
  ('Set-Location ' + (Quote-PowerShell -Value $WebWorkingDirectory))
  ('& ' + (Quote-PowerShell -Value $NodePath) + ' ' + (Quote-PowerShell -Value $ViteBinPath) + " preview --host 127.0.0.1 --port $WebPort")
) -join '; '

Write-Step 'Starting API'
Start-BackgroundPowerShell -Name 'API' -Command $ApiCommand -OutLog $ApiOutLog -ErrLog $ApiErrLog -PidFile $ApiPidFile
Wait-ForHttp -Url "$ApiUrl/docs"

Write-Step 'Starting frontend preview'
Start-BackgroundPowerShell -Name 'Web' -Command $WebCommand -OutLog $WebOutLog -ErrLog $WebErrLog -PidFile $WebPidFile
Wait-ForHttp -Url $WebUrl

Write-Step 'Project started'
Write-Host "Frontend: $WebUrl"
Write-Host "Swagger:  $ApiUrl/docs"
Write-Host "API log:  $ApiOutLog"
Write-Host "Web log:  $WebOutLog"
Write-Host ""
Write-Host 'Use scripts/stop-local.ps1 to stop the managed processes.'
