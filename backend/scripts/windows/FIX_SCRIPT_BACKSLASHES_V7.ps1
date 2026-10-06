$ErrorActionPreference = 'Stop'
$file = 'C:\Projects\Shopify\backend\src\routes\display.js'
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# ========== FIX V7 ==========
# WICHTIGER VORAUSSETZUNGS-HINWEIS:
# MUSS NACH DEM REVERT ausgeführt werden! (REVERT macht alle Backslashes SINGLE)
# Weil wir davon ausgehen, dass JEDER Backslash im Source (außer \$ und \`)
# GENAU EINMAL verdoppelt werden muss!
#
# Pattern: \\([^`$])  -> match: \ + char, char ist NICHT ` oder $
# Replace: \\\\$1     -> mache \ + \ + char (also: verdopple den Backslash!)
#
# Ergebnis nach Template Literal:
#   Backend-Source  |  Backend rendert  |  Frontend bekommt
#   \\s             |  \s               |  \s   ✅
#   \\/             |  \/               |  \/   ✅ (Regex: /\/+$/)
#   \\\\            |  \\               |  \\   ✅ (Regex Literal Backslash)
#   \$              |  $                |  $    ✅ (Backend Template Variable)
#   \`              |  `                |  `    ✅ (Backend Backtick Escape)
# ================================
$fixRegexV7 = [regex]::new('\\([^`' + '$' + '])')

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

    # MAGIC V7: JEDEN einzelnen Backslash verdoppeln (außer Backend Escapes \$ und \`)
    $fixedBody = $fixRegexV7.Replace($body, '\\\\$1')

    $before = $content.Substring(0, $tagEnd)
    $after  = $content.Substring($idxClose)
    $content = $before + $fixedBody + $after

    $addedChars = $fixedBody.Length - $body.Length
    Write-Host "Fix V7 #$($count.ToString().PadLeft(2,' ')) | index $($idxOpen.ToString().PadLeft(7,' ')) | body $($bodyLen.ToString().PadLeft(7,' ')) chars | added $addedChars backslashes"

    $searchIdx = $idxClose + '</script>'.Length + $addedChars
    if ($searchIdx -ge $content.Length) { break }
}

Write-Host ""
Write-Host "=== Total Fixed V7: $count <script> Blocks ==="
[System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
Write-Host "✅ display.js FIX V7 GESPEICHERT!"
