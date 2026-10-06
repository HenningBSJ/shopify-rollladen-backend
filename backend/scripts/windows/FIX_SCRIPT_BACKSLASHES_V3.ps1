$ErrorActionPreference = 'Stop'
$file = 'C:\Projects\Shopify\backend\src\routes\display.js'
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

function FixScriptBlockByIndex([string]$html, [int]$startSearchAtIndex, [ref]$outNextIndex) {
    $idxOpen = $html.IndexOf('<script>', $startSearchAtIndex)
    if ($idxOpen -lt 0) {
        $outNextIndex.Value = -1
        return $html
    }
    $tagEnd = $idxOpen + '<script>'.Length
    $idxClose = $html.IndexOf('</script>', $tagEnd)
    if ($idxClose -lt 0) {
        $outNextIndex.Value = -1
        return $html
    }

    $bodyLen = $idxClose - $tagEnd
    $body = $html.Substring($tagEnd, $bodyLen)
    $fixedBody = $body.Replace('\', '\\')

    $before = $html.Substring(0, $tagEnd)
    $after  = $html.Substring($idxClose)
    $result = $before + $fixedBody + $after
    $outNextIndex.Value = $idxClose + '</script>'.Length
    return $result
}

Write-Host "=== Fix Block 1 (materials route / FIRST <script>) ==="
$nextIdx = 0
$content = FixScriptBlockByIndex $content 0 ([ref]$nextIdx)
Write-Host "Nächster Startindex nach Block 1: $nextIdx"

Write-Host ""
Write-Host "=== Fix Block 2 (display route / SECOND <script>) ==="
$content = FixScriptBlockByIndex $content $nextIdx ([ref]$nextIdx)
Write-Host "Nächster Startindex nach Block 2: $nextIdx"

[System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
Write-Host ""
Write-Host "✅ display.js FIXED V3! NUR 2 Blöcke, Rest unberührt!"
