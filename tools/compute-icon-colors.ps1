# Computes dominant-ish colors for icon PNGs and writes a JSON map.
# Uses average color of non-transparent pixels after downscaling.

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$iconDir = Join-Path $root "assets\\computer-app-icons"
$outFile = Join-Path $iconDir "icon-colors.json"

[void][System.Reflection.Assembly]::LoadWithPartialName("System.Drawing")

function Get-AverageColorHex {
    param([string]$Path)
    $img = [System.Drawing.Bitmap]::FromFile($Path)
    $thumb = New-Object System.Drawing.Bitmap 32, 32
    $g = [System.Drawing.Graphics]::FromImage($thumb)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, 32, 32)
    $g.Dispose()
    $img.Dispose()

    $r = 0L; $gSum = 0L; $b = 0L; $count = 0L
    for ($y = 0; $y -lt 32; $y++) {
        for ($x = 0; $x -lt 32; $x++) {
            $c = $thumb.GetPixel($x, $y)
            if ($c.A -lt 20) { continue }
            $r += $c.R; $gSum += $c.G; $b += $c.B; $count++
        }
    }
    $thumb.Dispose()
    if ($count -eq 0) { return "#000000" }
    $rr = [int][math]::Round($r / $count)
    $gg = [int][math]::Round($gSum / $count)
    $bb = [int][math]::Round($b / $count)
    return ("#{0:X2}{1:X2}{2:X2}" -f $rr, $gg, $bb)
}

$map = @{}
Get-ChildItem -Path $iconDir -Filter "*.png" | ForEach-Object {
    $hex = Get-AverageColorHex -Path $_.FullName
    $map[$_.Name] = $hex
}

$json = $map | ConvertTo-Json -Depth 2
$json | Set-Content -Path $outFile -Encoding UTF8

Write-Host "Wrote $outFile"
