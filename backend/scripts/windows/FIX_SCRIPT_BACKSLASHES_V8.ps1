$ErrorActionPreference = 'Stop'
$file = 'C:\Projects\Shopify\backend\src\routes\display.js'
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# ========== FIX V8 ==========
# DAS GEGENSTÜCK ZU FIX V7!
# Nach Fix V7 haben wir zu VIEL Backslashes (Faktor 2 zu viel!)
#   Backend Source: 4 Backslashes → rendert → Frontend: 2 Backslashes ❌
# Wir brauchen:
#   Backend Source: 2 Backslashes → rendert → Frontend: 1 Backslash ✅
#
# FIX V8: Gehe durch ALLE <script> Blöcke und ersetze JEDES `\\` (genau 2 Backslashes)
#         durch GENAU 1 `\`!
# ABER: Wiederhole dies NICHT endlos (nicht wie REVERT)! Wir machen GENAU 1 Runde!
#      Weil 4 → 2 richtig ist! Nicht 2 → 1!
#
# ACHTUNG: Einfaches .Replace('\\','\') würde aber auch die Backslashes aus
#          den bereits korrekten 2er Gruppen machen! Und 4 → 2 in einem Schritt:
#          '\\\\'.Replace('\\','\') = '\\' ✅
#          '\\a'.Replace('\\','\')  = '\a' ✅
#          Genau das brauchen wir! Weil .Replace() ALLE Vorkommen ersetzt, auch überlappende?
#          Nein, String.Replace ersetzt von LINKS nach RECHTS und nicht überlappend!
#          Also: '\\\\' → Position 0-1: '\\' → '\' ; Rest ist '\\' → Position 1-2: '\\' → '\'
#          Ergebnis: '\\' (also 4 → 2!) ✅ PERFEKT!
# ================================

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

    # MAGIC V8: GENAU EINMAL '\\' → '\' im gesamten Body! (4→2, 2→1, alles RICHTIG!)
    $fixedBody = $body.Replace('\\', '\')

    $before = $content.Substring(0, $tagEnd)
    $after  = $content.Substring($idxClose)
    $content = $before + $fixedBody + $after

    $removedChars = $body.Length - $fixedBody.Length
    Write-Host "Fix V8 #$($count.ToString().PadLeft(2,' ')) | index $($idxOpen.ToString().PadLeft(7,' ')) | body $($bodyLen.ToString().PadLeft(7,' ')) chars | removed $removedChars backslashes"

    $searchIdx = $idxClose + '</script>'.Length - $removedChars
    if ($searchIdx -ge $content.Length) { break }
}

Write-Host ""
Write-Host "=== Total Fixed V8: $count <script> Blocks ==="
[System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
Write-Host "✅ display.js FIX V8 GESPEICHERT!"
