# Build JAVIS for Windows (NSIS installer, x64). Run in PowerShell from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts\build-win.ps1
# Output: dist\JAVIS-<version>-x64.exe + latest.yml. Never publishes.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

node -v | Out-Null
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
npm test
if ($LASTEXITCODE -ne 0) { throw "tests failed" }
npm run build:renderer
if ($LASTEXITCODE -ne 0) { throw "renderer bundle build failed" }

$required = @(
  "assets\live2d\runtime\live2dcubismcore.min.js",
  "assets\live2d\hiyori\Hiyori.model3.json",
  "assets\javis-companion\ui\javis-companion.js",
  "assets\icon.ico",
  "src\bundles\live2d.bundle.js"
)
foreach ($f in $required) { if (-not (Test-Path $f)) { throw "Missing $f" } }

npx electron-builder --win --x64 --publish never
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

Get-ChildItem dist\JAVIS-*.exe | Format-Table Name, Length
Write-Host "Done. Running the installer updates the existing 'Clawd on Desk' install in place (same appId)."
