# Helper: rename the GLB file and update page reference (safe idempotent)
$repoRoot = Split-Path -Parent $PSScriptRoot
$old = Join-Path $repoRoot 'glb\Tablet 23.glb'
$new = Join-Path $repoRoot 'glb\tablet-23.glb'
if (Test-Path $old) {
  Rename-Item -LiteralPath $old -NewName 'tablet-23.glb'
  Write-Host "Renamed: $old -> $new"
} else {
  Write-Host "No file at $old - skipping rename"
}

# Update page reference (if present)
$htmlPath = Join-Path $repoRoot '_2-videos\videos.html'
$html = Get-Content -Raw $htmlPath
if ($html -like '*Tablet 23.glb*') {
  $html = $html -replace 'glb/Tablet 23.glb', 'glb/tablet-23.glb'
  Set-Content -Path $htmlPath -Value $html
  Write-Host "Updated _2-videos/videos.html reference to glb/tablet-23.glb"
} else {
  Write-Host "_2-videos/videos.html already references tablet-23.glb or no match found"
}
