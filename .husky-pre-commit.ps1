#!/usr/bin/env pwsh
# Guard: blockiere große Dateien und verbotene Pfade
$ErrorActionPreference = 'Stop'

# Maximale Dateigröße in MB
$maxMB = 75
$maxBytes = $maxMB * 1MB

$blocked = @()

# Kandidaten ermitteln
$files = git diff --cached --name-only --diff-filter=ACM | Where-Object { $_ -ne '' }
foreach ($f in $files) {
  if ($f -match '^(node_modules/|\.next/|\.vercel/|isostadt/)' -or $f -like 'tsconfig.tsbuildinfo') {
    $blocked += "Pfad blockiert: $f"
    continue
  }
  try {
    $size = (Get-Item -LiteralPath $f -ErrorAction Stop).Length
    if ($size -gt $maxBytes) {
      $mb = [math]::Round($size/1MB,2)
      $blocked += "Zu groß ($mb MB > $maxMB MB): $f"
    }
  } catch {}
}

if ($blocked.Count -gt 0) {
  Write-Host "`nCommit abgebrochen. Grund:" -ForegroundColor Red
  $blocked | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
  Write-Host "`nIgnoriere Build/Deps/Caches und nutze Git LFS für Binärdateien > $maxMB MB (falls nötig)." -ForegroundColor Cyan
  exit 1
}

exit 0
