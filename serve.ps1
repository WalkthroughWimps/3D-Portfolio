# Simple PowerShell static server (serves current folder at http://127.0.0.1:3000)
# Usage: powershell -ExecutionPolicy Bypass -File .\serve.ps1
# Default prefix updated to 127.0.0.1:3000 to avoid conflicts with other localhost listeners
$prefix = 'http://127.0.0.1:3000/'
# Serve from the script's folder so you can run this from anywhere
$root  = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving $root at $prefix (Ctrl+C to stop)"

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
  $rawPath = $req.Url.AbsolutePath.TrimStart('/')
  # Decode URL-encoded characters so spaces and unicode in filenames work
  $rawPath = [System.Uri]::UnescapeDataString($rawPath)
    if ([string]::IsNullOrEmpty($rawPath)) { $rawPath = 'videos-tablet.html' }

    $file = Join-Path $root $rawPath
    if (-not (Test-Path $file)) {
      Write-Host "404: $rawPath -> $file"
      $ctx.Response.StatusCode = 404
      $ctx.Response.Close()
      continue
    }

    $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
    switch ($ext) {
      '.html' { $type = 'text/html' }
      '.css'  { $type = 'text/css' }
      '.js'   { $type = 'application/javascript' }
      '.json' { $type = 'application/json' }
      '.png'  { $type = 'image/png' }
      '.jpg'  { $type = 'image/jpeg' }
      '.jpeg' { $type = 'image/jpeg' }
      '.gif'  { $type = 'image/gif' }
      '.svg'  { $type = 'image/svg+xml' }
      '.glb'  { $type = 'model/gltf-binary' }
      '.mp4'  { $type = 'video/mp4' }
      '.m4v'  { $type = 'video/mp4' }
      '.webm' { $type = 'video/webm' }
      '.ogv'  { $type = 'video/ogg' }
      '.mov'  { $type = 'video/quicktime' }
      default { $type = 'application/octet-stream' }
    }

    $ctx.Response.ContentType = $type

    # Stream files and support HTTP Range for large media (seeking)
    $ctx.Response.AddHeader('Accept-Ranges', 'bytes')
    $fs = [System.IO.File]::OpenRead($file)
    try {
      $length = $fs.Length
      $start = 0L
      $end = $length - 1
      $rangeHeader = $req.Headers['Range']
      if ($null -ne $rangeHeader -and $rangeHeader -match 'bytes=(\d*)-(\d*)') {
        if ($matches[1] -ne '') { $start = [int64]$matches[1] }
        if ($matches[2] -ne '') { $end = [int64]$matches[2] }
        if ($end -ge $length) { $end = $length - 1 }
        if ($start -gt $end) { $start = 0; $end = $length - 1 }
        $chunkSize = $end - $start + 1
        $ctx.Response.StatusCode = 206
        $ctx.Response.AddHeader('Content-Range', "bytes $start-$end/$length")
        $ctx.Response.ContentLength64 = $chunkSize
        $fs.Position = $start
        $buffer = New-Object byte[] 65536
        $remaining = $chunkSize
        while ($remaining -gt 0) {
          $toRead = [System.Math]::Min($buffer.Length, [int]$remaining)
          $read = $fs.Read($buffer, 0, $toRead)
          if ($read -le 0) { break }
          $ctx.Response.OutputStream.Write($buffer, 0, $read)
          $remaining -= $read
        }
      } else {
        $ctx.Response.StatusCode = 200
        $ctx.Response.ContentLength64 = $length
        $buffer = New-Object byte[] 65536
        while (($read = $fs.Read($buffer, 0, $buffer.Length)) -gt 0) {
          $ctx.Response.OutputStream.Write($buffer, 0, $read)
        }
      }
      $ctx.Response.OutputStream.Close()
    } finally {
      $fs.Close()
    }
  } catch {
    Write-Host "Server error: $_"
  }
}
