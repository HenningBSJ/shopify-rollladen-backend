$ErrorActionPreference = "Stop"
$targets = @(
  "C:\Projects\Shopify\backend\scripts\ubuntu\install-full.sh",
  "C:\Projects\Shopify\backend\scripts\ubuntu\env.template",
  "C:\Projects\Shopify\backend\scripts\ubuntu\rollladen-backend.service",
  "C:\Projects\Shopify\backend\scripts\ubuntu\rollladen-cloudflared.service"
)
$count = 0
foreach ($f in $targets) {
  if (Test-Path $f) {
    $raw = [System.IO.File]::ReadAllText($f)
    $new = $raw -replace "`r`n", "`n"
    if ($new -ne $raw) {
      [System.IO.File]::WriteAllText($f, $new, [System.Text.UTF8Encoding]::new($false))
      Write-Output ("[LF fixed] " + $f)
    } else {
      Write-Output ("[already LF] " + $f)
    }
    $count++
  } else {
    Write-Output ("[missing] " + $f)
  }
}
Write-Output ("---")
Write-Output ("Done. $count files processed.")
Write-Output ("--- Bash syntax check via Git Bash (if installed) ---")
$gitBash = "C:\Program Files\Git\bin\bash.exe"
if (Test-Path $gitBash) {
  $bashCode = @'
bash -n "/c/Projects/Shopify/backend/scripts/ubuntu/install-full.sh"
rc=$?
if [ $rc -eq 0 ]; then
  echo "[OK] install-full.sh: bash -n SYNTAX OK (no output is good!)"
else
  echo "[FAIL] install-full.sh: bash -n SYNTAX ERROR (exit $rc)"
fi
exit $rc
'@
  & $gitBash -c $bashCode
} else {
  Write-Output "Git Bash not found at $gitBash. Verify later on Ubuntu with: bash -n install-full.sh"
}
