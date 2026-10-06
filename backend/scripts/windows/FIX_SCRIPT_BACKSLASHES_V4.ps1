$ErrorActionPreference = 'Stop'
$file = 'C:\Projects\Shopify\backend\src\routes\display.js'
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

$searchIdx = 0
$count = 0
while ($true) {
    $idxOpen = $content.IndexOf('<script>', $searchIdx)
    if ($idxOpen -lt 0) { break }

    $tagEnd = $idxOpen + '<script>'.Length
    $idxClose = $content.IndexOf('</script>', $tagEnd)
    if ($idxClose -lt 0) { break }

    $count++
    $bodyLen = $idxClose - $tagEnd
    $body = $content.Substring($tagEnd, $bodyLen)
    $fixedBody = $body.Replace('\', '\\')
    $before = $content.Substring(0, $tagEnd)
    $after  = $content.Substring($idxClose)
    $content = $before + $fixedBody + $after
    Write-Host "Fix #$count : <script> at index $idxOpen — body length $bodyLen fixed"

    $searchIdx = $idxClose + '</script>'.Length
    if ($searchIdx -ge $content.Length) { break }
}

Write-Host ""
Write-Host "=== Total gefixt: $count <script> Blöcke ==="

[System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
Write-Host "✅ display.js V4 gespeichert!"
