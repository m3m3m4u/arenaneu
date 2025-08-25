<#!
.SYNOPSIS
  Beendet alle Mongoose/MongoDB-Verbindungen über die Admin-API und zeigt Status davor/danach.

.PARAMETER Domain
  Basis-Domain (ohne abschließenden Slash), z.B. https://mein-projekt.vercel.app

.PARAMETER ApiKey
  Wert der ENV Variable ADMIN_API_KEY (x-api-key Header)

.PARAMETER DryRun
  Wenn gesetzt: nur aktuellen Status abfragen, nicht killen.

.EXAMPLE
  ./kill-db-connections.ps1 -Domain https://mein-projekt.vercel.app -ApiKey "SECRET123" 

.EXAMPLE
  ./kill-db-connections.ps1 -Domain http://localhost:3000 -ApiKey "DEVKEY" -DryRun

.NOTES
  Erfordert PowerShell 5+.
#>
param(
  [Parameter(Mandatory=$true)][string]$Domain,
  [Parameter(Mandatory=$true)][string]$ApiKey,
  [switch]$DryRun
)

function Invoke-Api {
  param([string]$Method,[string]$Url)
  try {
    $resp = Invoke-RestMethod -Method $Method -Uri $Url -Headers @{ 'x-api-key' = $ApiKey } -ErrorAction Stop
    return @{ ok = $true; data = $resp }
  } catch {
    return @{ ok = $false; error = $_.Exception.Message }
  }
}

$base = $Domain.TrimEnd('/')
$statusUrl = "$base/api/admin/db/kill-connections"
$killUrl = "$base/api/admin/db/kill-connections?confirm=1"

Write-Host "[INFO] Hole aktuellen Status..." -ForegroundColor Cyan
$before = Invoke-Api -Method GET -Url $statusUrl
if(-not $before.ok){ Write-Host "[ERROR] Status-Request fehlgeschlagen: $($before.error)" -ForegroundColor Red; exit 1 }
Write-Host "[STATUS] Vorher Verbindungen: $($before.data.count)" -ForegroundColor Yellow

if($DryRun){
  Write-Host "[DRYRUN] Kill übersprungen." -ForegroundColor Magenta
  exit 0
}

Write-Host "[ACTION] Sende Kill-Anfrage..." -ForegroundColor Cyan
$kill = Invoke-Api -Method POST -Url $killUrl
if(-not $kill.ok){ Write-Host "[ERROR] Kill fehlgeschlagen: $($kill.error)" -ForegroundColor Red; exit 2 }

if(-not $kill.data.success){ Write-Host "[ERROR] API meldet Fehler: $($kill.data | ConvertTo-Json -Depth 4)" -ForegroundColor Red; exit 3 }
Write-Host "[KILL] Ergebnis:" -ForegroundColor Green
$kill.data | ConvertTo-Json -Depth 6 | Write-Host

Start-Sleep -Seconds 2
Write-Host "[INFO] Hole Status nach Kill..." -ForegroundColor Cyan
$after = Invoke-Api -Method GET -Url $statusUrl
if($after.ok){ Write-Host "[STATUS] Nachher Verbindungen (Roh): $($after.data.count)" -ForegroundColor Yellow } else { Write-Host "[WARN] Status nach Kill nicht abrufbar: $($after.error)" -ForegroundColor DarkYellow }

Write-Host "[DONE] Fertig." -ForegroundColor Green
