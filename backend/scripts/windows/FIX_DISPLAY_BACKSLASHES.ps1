$ErrorActionPreference = 'Stop'
$file = 'C:\Projects\Shopify\backend\src\routes\display.js'
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# Strategy: find inline <script>...</script> blocks INSIDE the `...` template literals (JS frontend code sent to browser).
# In those blocks, double ALL backslashes that belong to regex or string escapes (i.e., every single `\` that starts an escape).
#
# To keep it safe and targeted: we process the content with a regex that matches `<script>...</script>` (non-greedy, single-line)
# and within the match we replace every `\` with `\\`.
#
# BUT WAIT: The <script>...</script> strings INSIDE the template literal in the JS source are plain text.
# They contain \r, \n, \s, \d, \b, \w, \., \(, \), \[, \], \{, \}, \*, \+, \?, \^, \$, \|, \\, etc.
# In the source file (as text), these appear as literal two-character sequences: backslash + letter/sign.
# We want to turn those two-char sequences into four-char: backslash+backslash+letter/sign.
# But a plain text "backslash r" in the source file IS the two chars "\r".
# So inside every matched <script>...</script> block, we literally just do:
#   Replace `\` -> `\\`   (i.e., every single backslash becomes two backslashes)
#
# EXCEPTION: If a backslash is ALREADY escaped (i.e., part of `\\`), doubling would produce `\\\\` which is correct? Actually no -
# if the source already had `\\`, they wanted a literal backslash in browser JS, so `\\` in source -> after templating -> single `\` in browser.
# If we double, `\\` -> `\\\\`, which in source -> template -> `\\` in browser = still a literal backslash. That is still correct.
# So SAFE: just double every backslash inside inline <script> blocks.

$pattern = '(?s)(<script>)(.*?)(</script>)'
$rx = [regex]::new($pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)

$newContent = $rx.Replace($content, {
    param($m)
    $scriptBody = $m.Groups[2].Value
    $fixedBody = $scriptBody.Replace('\', '\\')
    return ($m.Groups[1].Value + $fixedBody + $m.Groups[3].Value)
})

# Save
[System.IO.File]::WriteAllText($file, $newContent, [System.Text.Encoding]::UTF8)
Write-Host "✅ display.js gepatched! Backslashes in <script>-Tags verdoppelt!"
Write-Host "   (Länge alt: $($content.Length) | neu: $($newContent.Length))"
