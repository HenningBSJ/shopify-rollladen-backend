param(
  [int]$Port = 3006
)

$root = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $root

$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cf) {
  Write-Host "cloudflared not found in PATH"
  exit 1
}

function Test-Health {
  param([int]$p)
  try {
    Invoke-WebRequest -UseBasicParsing -Uri ("http://127.0.0.1:{0}/health" -f $p) -TimeoutSec 2 | Out-Null
    $true
  } catch {
    $false
  }
}

if (-not (Test-Health -p $Port)) {
  try {
    Start-Process -FilePath "node" -ArgumentList "-r dotenv/config src/index.js" -WorkingDirectory $root -WindowStyle Hidden | Out-Null
  } catch {}
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 250
    if (Test-Health -p $Port) { break }
  }
}

if (-not (Test-Health -p $Port)) {
  Write-Host "Server not reachable on port $Port"
  exit 2
}

Write-Host "Starting Cloudflare tunnel..."
& $cf.Path "tunnel" "--url" ("http://localhost:{0}" -f $Port) "--no-autoupdate" 2>&1 | ForEach-Object {
  $_ | Write-Host
  if ($_ -match 'https://[a-z0-9\-\.]+\.trycloudflare\.com') {
    $url = $Matches[0]
    $disp = $url.TrimEnd('/') + "/display"
    Write-Host ("URL: {0}" -f $disp)
    try { Set-Clipboard -Value $disp } catch {}
  }
}
