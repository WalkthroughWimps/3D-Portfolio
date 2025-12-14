# Helper: rename the GLB file and update HTML reference (safe idempotent)
$old = Join-Path (Get-Location) 'glb\Tablet 23.glb'
$new = Join-Path (Get-Location) 'glb\tablet-23.glb'
if (Test-Path $old) {
  Rename-Item -LiteralPath $old -NewName 'tablet-23.glb'
  Write-Host "Renamed: $old -> $new"
} else {
  Write-Host "No file at $old - skipping rename"
}

# Update HTML reference (if present)
$html = Get-Content -Raw 'videos-tablet.html'
if ($html -like '*Tablet 23.glb*') {
  $html = $html -replace 'glb/Tablet 23.glb', 'glb/tablet-23.glb'
  Set-Content -Path 'videos-tablet.html' -Value $html
  Write-Host "Updated videos-tablet.html reference to glb/tablet-23.glb"
} else {
  Write-Host "videos-tablet.html already references tablet-23.glb or no match found"
}
