param(
  # Rebuild out/renderer before serving. The renderer build is the memory
  # bottleneck (8400+ modules) and wipes out/renderer before it writes, so a
  # failed build leaves nothing to serve.
  [switch]$SkipBuild,
  # Heap ceiling for the build process. Vite's default is not enough here; the
  # build dies with "Ineffective mark-compacts near heap limit".
  [int]$MaxOldSpaceMB = 8192,
  [int]$Port = 25809,
  # Bind 0.0.0.0 so a Tailscale peer can reach the board from a phone.
  # Leave off to serve localhost only.
  [switch]$Remote,
  [string]$BackendBin = '',
  # packages/web-host/src/backend-launcher.ts picks 'debug' whenever isPackaged is
  # false, and the WebUI CLI always runs unpackaged. At debug the once-per-second
  # aionui_ai_agent::idle_scanner line drowns everything else in the console.
  [ValidateSet('error', 'warn', 'info', 'debug')]
  [string]$LogLevel = 'info'
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$RendererDir = Join-Path $RepoRoot 'out\renderer'

function Resolve-Bun {
  # Prefer the real executable. `Get-Command bun` resolves to bun.ps1, the npm
  # shim, which only works when the PowerShell execution policy allows scripts.
  $candidates = @(
    (Join-Path $env:USERPROFILE '.bun\bin\bun.exe'),
    (Join-Path $env:APPDATA 'npm\node_modules\bun\bin\bun.exe')
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  $cmd = Get-Command bun -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw 'bun not found. Install it, or run: npm i -g bun'
}

function Resolve-AioncoreBinary {
  if ($BackendBin) {
    if (-not (Test-Path -LiteralPath $BackendBin)) { throw "AIONUI binary not found: $BackendBin" }
    return $BackendBin
  }
  if ($env:AIONUI_BACKEND_BIN -and (Test-Path -LiteralPath $env:AIONUI_BACKEND_BIN)) {
    return $env:AIONUI_BACKEND_BIN
  }
  $roots = @(
    (Join-Path $env:USERPROFILE 'Desktop\AionUi\resources\bundled-aioncore'),
    (Join-Path $RepoRoot 'resources\bundled-aioncore')
  )
  $exe = if ($IsWindows -or $env:OS -eq 'Windows_NT') { 'aioncore.exe' } else { 'aioncore' }
  foreach ($root in $roots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    $hit = Get-ChildItem -LiteralPath $root -Recurse -File -Filter $exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { return $hit.FullName }
  }
  throw 'aioncore binary not found. Install the desktop app, or pass -BackendBin.'
}

function Get-TailnetIPv4 {
  $ts = Get-Command tailscale -ErrorAction SilentlyContinue
  if (-not $ts) { return $null }
  $raw = & tailscale ip -4 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  $addr = ($raw | Select-Object -First 1)
  if ($addr -match '^\d{1,3}(\.\d{1,3}){3}$') { return $addr }
  return $null
}

function Show-Preconditions {
  $os = Get-CimInstance Win32_OperatingSystem
  $freeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
  $totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)

  $running = @(Get-Process -Name 'AionUi', 'aioncore' -ErrorAction SilentlyContinue)
  Write-Host ("Free memory: {0} GB of {1} GB" -f $freeGB, $totalGB)

  if ($running.Count -gt 0) {
    Write-Warning ("{0} AionUi/aioncore process(es) still running." -f $running.Count)
    Write-Warning 'Each one holds the machine memory this build needs. This is the usual cause of:'
    Write-Warning '  "Ineffective mark-compacts near heap limit / JavaScript heap out of memory"'
    Write-Warning 'Quit the desktop app completely, then run this again.'
    if ($freeGB -lt 6) {
      Write-Warning ("Only {0} GB free - the renderer build needs about 6 GB to finish." -f $freeGB)
    }
  }
}

$bun = Resolve-Bun
$bin = Resolve-AioncoreBinary
Write-Host ("bun:          {0}" -f $bun)
Write-Host ("aioncore:     {0}" -f $bin)

if (-not $SkipBuild) {
  Show-Preconditions
  $env:NODE_OPTIONS = "--max-old-space-size=$MaxOldSpaceMB"
  Write-Host ''
  Write-Host ("Building renderer with --max-old-space-size={0} MB ..." -f $MaxOldSpaceMB)
  Write-Host 'This takes a few minutes. Do not close this window.'
  Write-Host ''

  Push-Location $RepoRoot
  try {
    & $bun run package
    if ($LASTEXITCODE -ne 0) { throw "bun run package failed with exit code $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
  Write-Host 'Build finished.'
  Write-Host ''
} elseif (-not (Test-Path -LiteralPath (Join-Path $RendererDir 'index.html'))) {
  throw "SkipBuild was requested but $RendererDir has no index.html. Run without -SkipBuild first."
}

$env:AIONUI_BACKEND_BIN = $bin
$env:AIONUI_HOST = if ($Remote) { '0.0.0.0' } else { '127.0.0.1' }
$env:AIONUI_ALLOW_REMOTE = if ($Remote) { '1' } else { '0' }
$env:AIONUI_OPEN_BROWSER = '0'
$env:AIONUI_LOG_LEVEL = $LogLevel

$webuiArgs = @('run', 'webui', '--', '--no-build', '--no-open')
if ($Remote) { $webuiArgs += '--remote' }
if ($Port -ne 25809) { $webuiArgs += '--port'; $webuiArgs += "$Port" }

Write-Host ("Serving {0}" -f $RendererDir)
Write-Host ("  local:  http://127.0.0.1:{0}/kanban" -f $Port)

if ($Remote) {
  $tailnet = Get-TailnetIPv4
  if ($tailnet) {
    Write-Host ("  phone:  http://{0}:{1}/kanban   (Tailscale)" -f $tailnet, $Port)
  } else {
    Write-Warning '-Remote was requested but no Tailscale IPv4 address was found.'
    Write-Warning 'Check that Tailscale is connected, or use the machine LAN address instead.'
  }
} else {
  Write-Host '  (not exposed to the network - pass -Remote to reach it from a phone)'
}

Write-Host ''
Write-Host 'Press Ctrl+C to stop.'
Write-Host ''

Push-Location $RepoRoot
try {
  & $bun @webuiArgs
} finally {
  Pop-Location
}
