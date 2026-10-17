# Roll back a previous Apply-Premium-UI.ps1 run using its backup folder.
param(
  [Parameter(Mandatory=$true)][string]$ProjectRoot,
  [Parameter(Mandatory=$true)][string]$BackupFolder
)
$ErrorActionPreference = 'Stop'
$targetRoot = (Resolve-Path $ProjectRoot).Path
$backup = (Resolve-Path $BackupFolder).Path
$manifestPath = Join-Path $backup 'manifest.json'
if (-not (Test-Path $manifestPath)) { throw 'Backup manifest not found.' }
$entries = @(Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json)
foreach ($item in $entries) {
  $targetFile = Join-Path $targetRoot $item.path
  if ($item.existed) {
    $backupFile = Join-Path $backup $item.path
    if (-not (Test-Path $backupFile)) { throw "Backup file missing: $($item.path)" }
    New-Item -ItemType Directory -Path (Split-Path $targetFile) -Force | Out-Null
    Copy-Item -LiteralPath $backupFile -Destination $targetFile -Force
  } elseif (Test-Path $targetFile) {
    Remove-Item -LiteralPath $targetFile -Force
  }
}
Write-Host 'Previous frontend files restored. No database changes were made.' -ForegroundColor Green
