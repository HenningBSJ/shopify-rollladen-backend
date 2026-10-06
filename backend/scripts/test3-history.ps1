Write-Host "`n=== TEST 3: Laufzeiten + Historie ===" -ForegroundColor Cyan

Write-Host "`n--- Nächste / Letzte Ausführungszeiten ALLER 4 Tasks ---"
$taskNames = @(
    'Rollladen Cloudflared Watchdog',
    'Rollladen Backend Watchdog',
    'Rollladen Cloudflared (Boot-Start)',
    'Rollladen Backend (Boot-Start)'
)
$rows = foreach ($tn in $taskNames) {
    $info = Get-ScheduledTaskInfo -TaskName $tn -ErrorAction SilentlyContinue
    $taskObj = Get-ScheduledTask -TaskName $tn -ErrorAction SilentlyContinue
    $resStr = 'n/a'
    if ($info) {
        if ([int]$info.LastTaskResult -eq 0) { $resStr = '0 (ERFOLG)' }
        else { $resStr = ([string]$info.LastTaskResult) + ' (FEHLER)' }
    }
    [PSCustomObject]@{
        Task       = $tn
        State      = if ($taskObj) { [string]$taskObj.State } else { 'n/a' }
        NextRun    = if ($info -and $info.NextRunTime) { [string]$info.NextRunTime } else { '-' }
        LastRun    = if ($info -and $info.LastRunTime) { [string]$info.LastRunTime } else { '-' }
        LastResult = $resStr
    }
}
$rows | Format-Table -AutoSize

Write-Host "`n--- Historie letzte 48 Stunden TaskScheduler (Id=102=Start, Id=201=Ende) ---"
$from = (Get-Date).AddHours(-48)
try {
    $evts = Get-WinEvent -FilterHashtable @{
        LogName   = 'Microsoft-Windows-TaskScheduler/Operational'
        Id        = 102, 201
        StartTime = $from
    } -ErrorAction Stop

    $filtered = @()
    foreach ($e in $evts) {
        if ($e.Message -match 'Rollladen') {
            $taskName = '?'
            if ($e.Message -match '\bRollladen\s+[^\r\n.]+') { $taskName = $matches[0].Trim().TrimEnd('.') }
            $ergebnis = '?'
            if ($e.Id -eq 102) { $ergebnis = 'Gestartet' }
            elseif ($e.Message -match 'Ergebniscode:\s*0\D') { $ergebnis = 'ERFOLG (Code 0)' }
            elseif ($e.Message -match 'Ergebniscode:\s*(\d+)') { $ergebnis = 'ENDE Code=' + $matches[1] }
            $filtered += [PSCustomObject]@{
                TimeCreated = $e.TimeCreated
                Id          = $e.Id
                Task        = $taskName
                Ergebnis    = $ergebnis
            }
        }
    }
    $filtered = $filtered | Select-Object -First 20
    if ($filtered.Count -gt 0) {
        $filtered | Format-Table -AutoSize
    } else {
        Write-Host "  (Keine Rollladen-Eintraege in den letzten 48h - Tasks erst heute neu installiert)"
    }
} catch {
    Write-Host ("  (Keine Historie lesbar: " + $_.Exception.Message + ")")
}

Write-Host "`n--- Node Prozess aktuell ---"
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id, CPU, StartTime, Path | Format-Table -AutoSize

Write-Host "`n=== ALLE TESTS ABGESCHLOSSEN ===" -ForegroundColor Green
