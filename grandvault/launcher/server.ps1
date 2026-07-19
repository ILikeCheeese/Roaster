# GrandVault local launcher (Windows) — a tiny, dependency-free static web server.
# It serves the ./app folder on 127.0.0.1 so the offline AI (OCR + smart search)
# works. Nothing leaves this computer; no internet is used. Close this window to
# quit GrandVault.
param([int]$Port = 8787)

$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot 'app'
$rootFull = [System.IO.Path]::GetFullPath($root)

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript'
  '.mjs'  = 'text/javascript'
  '.css'  = 'text/css'
  '.json' = 'application/json'
  '.wasm' = 'application/wasm'
  '.onnx' = 'application/octet-stream'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.webmanifest' = 'application/manifest+json'
  '.gz'   = 'application/gzip'
  '.traineddata' = 'application/octet-stream'
  '.data' = 'application/octet-stream'
  '.txt'  = 'text/plain; charset=utf-8'
  '.map'  = 'application/json'
}

try {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
  $listener.Start()
} catch {
  Write-Host "Could not start on port $Port. Is GrandVault already running?"
  Start-Sleep -Seconds 5
  exit 1
}

Write-Host "GrandVault is running.  Keep this window open while you use it."
Write-Host "If your browser did not open, go to:  http://127.0.0.1:$Port/"
Write-Host "Close this window to quit."

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $line = $reader.ReadLine()
    if (-not $line) { $client.Close(); continue }

    $path = ($line -split ' ')[1]
    if (-not $path) { $path = '/' }
    $path = ($path -split '\?')[0]
    if ($path -eq '/') { $path = '/index.html' }
    $rel = [System.Uri]::UnescapeDataString($path).TrimStart('/') -replace '/', '\'
    $file = [System.IO.Path]::GetFullPath((Join-Path $root $rel))

    if ($file.StartsWith($rootFull) -and [System.IO.File]::Exists($file)) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
      $ct = $mime[$ext]; if (-not $ct) { $ct = 'application/octet-stream' }
      $head = "HTTP/1.1 200 OK`r`nContent-Type: $ct`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
      $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
      $stream.Write($hb, 0, $hb.Length)
      $stream.Write($bytes, 0, $bytes.Length)
    } else {
      $body = [System.Text.Encoding]::ASCII.GetBytes('Not found')
      $head = "HTTP/1.1 404 Not Found`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
      $stream.Write($hb, 0, $hb.Length)
      $stream.Write($body, 0, $body.Length)
    }
    $stream.Flush()
  } catch {
    # ignore a dropped connection and keep serving
  } finally {
    $client.Close()
  }
}
