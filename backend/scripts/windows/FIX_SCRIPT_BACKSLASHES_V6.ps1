$ErrorActionPreference = 'Stop'
$file = 'C:\Projects\Shopify\backend\src\routes\display.js'
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# ========== FIX V6 (BUGFIX V5) ==========
# Fix V5 BUG: Regex \\([^`$]) matchte auch den ERSTEN Backslash von bereits
# doppelten Backslashes (\\) und machte 4 daraus (\\\\). Das zerstörte Frontend
# Regex Literale wie /\/+$/ (Original: \/ also 2 Backslashes) → wurden zu /\\\\/+$/!
#
# FIX V6: Ausschlussgruppe UM BACKSLASH SELBST erweitern!
# → Nur EINFACHE Backslashes (also NUR EINEN Backslash + char) verdoppeln!
# → Bereits doppelte Backslashes (\\ + char) bleiben UNANGETASTET!
#
# Beispiele V6:
#   \s   →   \\s   ✅ (Frontend: \s)
#   \\a  →   \\a   ✅ (Frontend: \a  —  bleibt wie es ist!)
#   \`   →   \`    ✅ (Backend Escape → NICHT anfassen!)
#   \$   →   \$    ✅ (Backend Escape → NICHT anfassen!)
#
# Pattern V6:  \\([^\\`$])
# ======================================
$fixRegexV6 = [regex]::new('\\([^\\`' + '$' + '])')

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

    # MAGIC V6: Nur EINFACHE Backslashes verdoppeln! Doppelte + Backend Escapes lassen!
    $fixedBody = $fixRegexV6.Replace($body, '\\\\$1')

    $before = $content.Substring(0, $tagEnd)
    $after  = $content.Substring($idxClose)
    $content = $before + $fixedBody + $after

    $addedChars = $fixedBody.Length - $body.Length
    Write-Host "Fix V6 #$($count.ToString().PadLeft(2,' ')) | index $($idxOpen.ToString().PadLeft(7,' ')) | body $($bodyLen.ToString().PadLeft(7,' ')) chars | added $addedChars backslashes"

    $searchIdx = $idxClose + '</script>'.Length + $addedChars
    if ($searchIdx -ge $content.Length) { break }
}

Write-Host ""
Write-Host "=== Total Fixed V6: $count <script> Blocks ==="
[System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
Write-Host "✅ display.js FIX V6 GESPEICHERT!"
