$ErrorActionPreference = 'Stop'
$file = 'C:\Projects\Shopify\backend\src\routes\display.js'
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# ========== PERFECT FIX ==========
# For every <script>...</script> block in the source file,
# we want to double every backslash EXCEPT those followed by:
#   $  (dollar sign escape in template literal)
#   `  (backtick escape in template literal)
# So regex: match backslash + char | replace with double backslash + char
# BUT ONLY if char is NOT ($ or `).
# Pattern for PowerShell:   \\([^`$])
# Replacement:              \\\\$1
# ================================
$fixRegex = [regex]::new('\\([^`' + '$' + '])')

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

    # MAGIC: only double backslashes that are NOT Backend Template Literal Escapes ($ or `)
    $fixedBody = $fixRegex.Replace($body, '\\\\$1')

    $before = $content.Substring(0, $tagEnd)
    $after  = $content.Substring($idxClose)
    $content = $before + $fixedBody + $after

    $addedChars = $fixedBody.Length - $body.Length
    Write-Host "Fix #$($count.ToString().PadLeft(2,' ')) | index $($idxOpen.ToString().PadLeft(7,' ')) | body $($bodyLen.ToString().PadLeft(7,' ')) chars | added $addedChars backslashes"

    $searchIdx = $idxClose + '</script>'.Length + $addedChars
    if ($searchIdx -ge $content.Length) { break }
}

Write-Host ""
Write-Host "=== Total Fixed: $count <script> Blocks ==="
[System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
Write-Host "✅ display.js FIX V5 GESPEICHERT!"
