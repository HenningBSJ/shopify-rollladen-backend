$ErrorActionPreference = 'Stop'
$file = 'C:\Projects\Shopify\backend\src\routes\display.js'
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# CORRECT APPROACH:
# We need to target ONLY the <script>...</script> BLOCKS inside the generated HTML strings (template literals).
# In those blocks, EVERY backslash character `\` in the source file represents an escape that will be consumed by the
# backend JS template literal, so it MUST be doubled to `\\` to end up as a single `\` in the browser.
#
# Simple safe regex: match every occurrence of `<script>` followed by anything followed by `</script>`.
# This is safe because the template literals contain <script> exactly ONCE per HTML.
#
# Replacement: For the matched body (between tags), replace every single `\` with `\\`.

$scriptRegex = [regex]::new('(?s)(<script[^>]*>)(.*?)(</script>)', [System.Text.RegularExpressions.RegexOptions]::Singleline)

$newContent = $scriptRegex.Replace($content, {
    param($m)
    $openTag  = $m.Groups[1].Value
    $body     = $m.Groups[2].Value
    $closeTag = $m.Groups[3].Value
    # Double every single backslash in the script body.
    $fixedBody = $body.Replace('\', '\\')
    return ($openTag + $fixedBody + $closeTag)
})

[System.IO.File]::WriteAllText($file, $newContent, [System.Text.Encoding]::UTF8)
Write-Host "✅ display.js FIXED!"
Write-Host "   Vorher: $($content.Length) chars"
Write-Host "   Nachher: $($newContent.Length) chars"
Write-Host "   Hinzugefügt: $($newContent.Length - $content.Length) Backslashes"
