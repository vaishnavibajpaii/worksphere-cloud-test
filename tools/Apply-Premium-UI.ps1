# Apply only the WorkSphere premium frontend changes to an already running local project.
# Nothing in backend/, prisma/, .env, or the PostgreSQL database is touched.
param(
  [Parameter(Mandatory=$true)][string]$ProjectRoot
)
$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$targetRoot = (Resolve-Path $ProjectRoot).Path
if ($sourceRoot -eq $targetRoot) { throw 'Choose your EXISTING WorkSphere folder, not this downloaded upgrade folder.' }
foreach ($required in @('frontend\src\main.tsx','frontend\src\styles.css','backend\package.json','prisma\schema.prisma')) {
  if (-not (Test-Path (Join-Path $targetRoot $required))) { throw "Not a WorkSphere project. Missing: $required" }
}
$files = @(
  'frontend\index.html',
  'frontend\src\main.tsx',
  'frontend\src\components\Layout.tsx',
  'frontend\src\pages\Dashboard.tsx',
  'frontend\src\pages\Insights.tsx',
  'frontend\src\premium.css'
)
$backup = Join-Path $targetRoot ('_ui_upgrade_backup_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$manifest = @()
try {
  foreach ($relative in $files) {
    $sourceFile = Join-Path $sourceRoot $relative
    $targetFile = Join-Path $targetRoot $relative
    if (-not (Test-Path $sourceFile)) { throw "Upgrade source missing: $relative" }
    $existed = Test-Path $targetFile
    if ($existed) {
      $backupFile = Join-Path $backup $relative
      New-Item -ItemType Directory -Path (Split-Path $backupFile) -Force | Out-Null
      Copy-Item -LiteralPath $targetFile -Destination $backupFile -Force
    }
    $manifest += [pscustomobject]@{path=$relative;existed=$existed}
  }
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $backup 'manifest.json') -Encoding UTF8
  foreach ($relative in $files) {
    $sourceFile = Join-Path $sourceRoot $relative
    $targetFile = Join-Path $targetRoot $relative
    New-Item -ItemType Directory -Path (Split-Path $targetFile) -Force | Out-Null
    Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force
  }
} catch {
  Write-Warning 'Upgrade failed. See backup folder to restore your previous frontend files.'
  throw
}
Write-Host 'Premium UI frontend files applied.' -ForegroundColor Green
Write-Host "Backup: $backup"
Write-Host 'Your backend, Prisma schema, migrations, .env, and PostgreSQL data are unchanged.'
Write-Host 'Next: open the EXISTING project in VS Code and run npm run dev.'
