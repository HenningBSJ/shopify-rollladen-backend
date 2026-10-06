# Test 3 - ALS ADMINISTRATOR ausführen! (Rechtsklick PS -> Als Admin)
$ErrorActionPreference = 'SilentlyContinue'

function Test-IsAdmin {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
    Write-Host "`n[FEHLER] Diese PowerShell laeuft NICHT als Administrator!" -ForegroundColor Red
    Write-Host "  -> Bitte Rechtsklick auf PowerShell -> Als Administrator ausfuehren,"
    Write-Host "     dann dieses Skript nochmal starten."
    Write-Host "     Alternativ: Start-Process powershell -Verb RunAs -ArgumentList '-File &quot;" + $PSScriptRoot + "\test3-history-als-admin.ps1&quot;'"
    exit 1
}

Write-Host "`n=== TEST 3 ALS ADMIN: Laufzeiten + Historie ===" -ForegroundColor Cyan

Write-Host "`n--- (1) Alle Rollladen Tasks im Taskplaner (Get-ScheduledTask) ---"
$allTasks = Get-ScheduledTask | Where-Object { $_.TaskName -like 'Rollladen*' }
if (-not $allTasks -or $allTasks.Count -eq 0) {
    Write-Host "  KEINE Rollladen Tasks gefunden! (Unerwartet - Setup lief vorher durch?)" -ForegroundColor Red
} else {
    $overview = $allTasks | Sort-Object TaskName | ForEach-Object {
        $info = $_ | Get-ScheduledTaskInfo -ErrorAction SilentlyContinue
        $lastRes = if ($info -and $info.LastTaskResult -eq 0) { '0 (ERFOLG)' } elseif ($info) { "$($info.LastTaskResult) (FEHLER)" } else { 'nie gelaufen' }
        [PSCustomObject]@{
            Task        = $_.TaskName
            State       = [string]$_.State
            User        = [string]$_.Principal.UserId
            LogonType   = [string]$_.Principal.LogonType
            NextRun     = if ($info -and $info.NextRunTime) { [string]$info.NextRunTime } else { '-' }
            LastRun     = if ($info -and $info.LastRunTime)  { [string]$info.LastRunTime  } else { '-' }
            LastResult  = $lastRes
        }
    }
    $overview | Format-Table -AutoSize -Wrap
}

Write-Host "`n--- (2) Detaillierte Trigger-Infos (Boot-Start / Repetition Watchdogs) ---"
foreach ($t in $allTasks) {
    Write-Host "Task: " -NoNewline ; Write-Host $t.TaskName -ForegroundColor Cyan
    foreach ($tr in $t.Triggers) {
        $tType = $tr.GetType().Name
        if ($tType -match 'LogonTrigger') {
            Write-Host "  -> Trigger: Bei Benutzeranmeldung (AtLogOn)"
        } elseif ($tType -match 'BootTrigger') {
            Write-Host "  -> Trigger: Bei Systemstart (AtBoot/BootTrigger)"
        } elseif ($tType -match 'TimeTrigger') {
            $bound = if ($tr.StartBoundary) { [string]$tr.StartBoundary } else { '?' }
            $rep = if ($tr.Repetition) {
                $intv = [string]$tr.Repetition.Interval
                $dur  = [string]$tr.Repetition.Duration
                "Repetition: Alle $intv (max $dur)"
            } else { 'Keine Wiederholung (einmalig)' }
            Write-Host ("  -> Trigger: Zeitgesteuert (Start: $bound) - " + $rep)
        } else {
            Write-Host "  -> Trigger: Anderer Typ $tType"
        }
    }
}

Write-Host "`n--- (3) Task Scheduler Historie (Id=102 Start, Id=201 Ende) - letzte 24h Rollladen ---"
$from = (Get-Date).AddHours(-24)
try {
    $evt = Get-WinEvent -FilterHashtable @{
        LogName   = 'Microsoft-Windows-TaskScheduler/Operational'
        Id        = 102, 201
        StartTime = $from
    } -ErrorAction Stop
    $history = @()
    foreach ($e in $evt) {
        if ($e.Message -match 'Rollladen') {
            $tname = '?'
            if ($e.Message -match '\bRollladen\s+[^\r\n.]+') { $tname = $matches[0].Trim().TrimEnd('.') }
            $result = '?'
            if ($e.Id -eq 102) { $result = 'START' }
            elseif ($e.Message -match 'Ergebniscode:\s*0\D') { $result = 'ENDE - OK (Code 0)' }
            elseif ($e.Message -match 'Ergebniscode:\s*(\d+)') { $result = "ENDE - FAIL (Code $($matches[1]))" }
            $history += [PSCustomObject]@{
                Zeit       = $e.TimeCreated
                EreignisId = $e.Id
                Ergebnis   = $result
                Task       = $tname
            }
        }
    }
    if ($history.Count -eq 0) {
        Write-Host "  Keine Rollladen-Events in den letzten 24h im Event-Log."
        Write-Host "  (Hinweis: Log 'Microsoft-Windows-TaskScheduler/Operational' muss ggf. erst"
        Write-Host "   in der EventViewer-SnapIn aktiviert werden: Rechtsklick -> Log aktivieren)"
    } else {
        $history | Sort-Object Zeit -Descending | Select-Object -First 25 | Format-Table -AutoSize -Wrap
    }
} catch {
    Write-Host "  (Kein Event-Log-Eintrag lesbar: $($_.Exception.Message))"
}

Write-Host "`n--- (4) Direkte Uptime-Logs als Beweis dass Tasks laufen (letzte 10 Zeilen Watchdogs) ---"
$uptimeDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'data\uptime'
foreach ($prefix in @('ensure-cf-', 'ensure-backend-')) {
    $latest = Get-ChildItem (Join-Path $uptimeDir "$prefix*.log") -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latest) { Write-Host "  $prefix -> KEIN LOG vorhanden" ; continue }
    Write-Host ("  $prefix -> File: " + $latest.Name + " (Size=" + $latest.Length + ", geaendert=" + $latest.LastWriteTime + ")") -ForegroundColor DarkCyan
    $tail = Get-Content $latest.FullName -Tail 5 -ErrorAction SilentlyContinue
    foreach ($l in $tail) { Write-Host ("    | " + $l) }
}

Write-Host "`n=== TEST 3 ABSOLVIERT ===" -ForegroundColor Green
