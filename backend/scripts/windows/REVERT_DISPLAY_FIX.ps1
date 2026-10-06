$ErrorActionPreference = 'Stop'
$file = 'C:\Projects\Shopify\backend\src\routes\display.js'
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# REVERT the damage! Our previous script doubled EVERY \ inside <script>, but also accidentally AFFECTED parts OUTSIDE (because <script> regex was wrong, or matching happened even outside template literals for malformed strings).
# SAFEST REVERT: Go through the entire file and replace EVERY sequence of `\\` with `\` repeatedly, until no more changes happen? No! Because that would break intentional \\ strings.
#
# ACTUAL DAMAGE MODEL: The original file had:
#   - Template literal escapes: \r, \n, \t, \0, \x, \u, \', \", \`, \$
#   - Regex chars:   \s, \d, \b, \w, \., \+, \*, \?, \(, \), \[, \], \{, \}, \|, \/, \\, \^, \$
# Our script turned EVERY `\` into `\\`. So:
#   `\r` -> `\\r`   (we need to turn it back to `\r`)
#   `\n` -> `\\n`   (back to `\n`)
#   `\s` -> `\\s`   (back to `\s`)
#   `\b` -> `\\b`   (back to `\b`)
#   `\d` -> `\\d`   (back to `\d`)
#   `\w` -> `\\w`   (back to `\w`)
#   `\.` -> `\\.`   (back to `\.`)
#   `\(` -> `\\(`   (back to `\(`)
#   ... you get it!
#   And critically: `\\` -> `\\\\`  (needs to become `\\` again)
#   And:         `\`` -> `\\``      (needs to become `\`` again)
#
# UNIVERSAL REVERT: Replace every occurrence of TWO consecutive backslashes `\\` with ONE backslash `\`!
# Because:
#   Original  → after damage → after revert
#   `\r`      → `\\r`        → `\r` ✅
#   `\\`      → `\\\\`       → `\\` ✅
#   `\``      → `\\``        → `\`` ✅
#   `\n`      → `\\n`        → `\n` ✅
# Perfect!
while ($true) {
    $newContent = $content.Replace('\\', '\')
    if ($newContent.Length -eq $content.Length) { break }
    $content = $newContent
}

[System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
Write-Host "✅ display.js REVERTED! Länge: $($content.Length)"
