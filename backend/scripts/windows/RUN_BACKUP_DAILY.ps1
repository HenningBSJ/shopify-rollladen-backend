<#
=================================================================
ROLLLADEN MONITOR TÄGLICHES BACKUP (WINDOWS)
-----------------------------------------------------------------
Ausgeführt: Täglich 02:05 via Task Scheduler "Rollladen Backup (Daily)"
Speicherort: C:\Projects\Shopify\backups\{slack|env|pg}\
Retention: Löscht automatisch Dateien älter als 7 Tage!
Exit: 0 = OK, 1 = Fehler
=================================================================
#>
param([int]$RetentionDays = 7, [string]$Root = "C:\Projects\Shopify")

$ErrorActionPreference = "Stop"
$TS = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$Day = Get-Date -Format "yyyy-MM-dd"
$LogDir = Join-Path $Root "logs"
$LogFile = Join-Path $LogDir "backup-$Day.log"
$BkRoot = Join-Path $Root "backups"
$SlackDir = Join-Path $BkRoot "slack"
$EnvDir = Join-Path $BkRoot "env"
$PgDir = Join-Path $BkRoot "pg"
New-Item -ItemType Directory -Force -Path $LogDir,$SlackDir,$EnvDir,$PgDir | Out-Null

$global:Ok = 0
$global:Fail = 0

function Log { param([string]$Lvl,[string]$Msg)
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$Lvl] $Msg"
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
  Write-Host "  $line" -ForegroundColor $(if($Lvl -eq "ERROR"){"Red"} elseif($Lvl -eq "WARN"){"Yellow"} else {"Gray"})
}

function Retention-Cleanup {
  Log "INFO" "Retention: Lösche Dateien älter als $RetentionDays Tage in $BkRoot + $LogDir"
  $cut = (Get-Date).AddDays(-1 * $RetentionDays)
  $del = 0
  foreach($dir in @($SlackDir,$EnvDir,$PgDir,$LogDir)){
    Get-ChildItem -Path $dir -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt $cut } | ForEach-Object {
      Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
      $del++
    }
  }
  Log "INFO" "Retention: $del Dateien gelöscht"
}

# ---- .env Laden ----
$EnvPath = Join-Path $Root "backend\.env"
if(-not (Test-Path $EnvPath)){ Log "ERROR" ".env fehlt: $EnvPath" ; exit 1 }
Log "INFO" "=== Backup Start Windows $TS ==="

Get-Content $EnvPath | ForEach-Object {
  if($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$'){
    [System.Environment]::SetEnvironmentVariable("BK_$($Matches[1])", $Matches[2].Trim('"',"'"), "Process")
  }
}

# ---- 1. .env Backup ----
try {
  $out = Join-Path $EnvDir "env-windows-$TS.b64.gz"
  $b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($EnvPath))
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($b64)
  $ms = New-Object System.IO.MemoryStream
  $gz = New-Object System.IO.Compression.GzipStream($ms, [System.IO.Compression.CompressionMode]::Compress, $true)
  $gz.Write($bytes, 0, $bytes.Length)
  $gz.Close()
  [System.IO.File]::WriteAllBytes($out, $ms.ToArray())
  $ms.Close()
  $sz = [math]::Round((Get-Item $out).Length/1KB,1)
  Log "INFO" "[ENV] ✅ OK → env-windows-$TS.b64.gz (${sz} KB, chmod via ACL nur Admin+Owner)"
  # ACL: nur SYSTEM + Owner dürfen lesen!
  $acl = Get-Acl $out
  $acl.SetAccessRuleProtection($true, $false)
  $owner = [System.Security.Principal.NTAccount]"$env:USERDOMAIN\$env:USERNAME"
  $acl.SetOwner($owner)
  $admin = New-Object System.Security.Principal.NTAccount("BUILTIN","Administrators")
  $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($owner,"FullControl","Allow")))
  $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($admin,"FullControl","Allow")))
  Set-Acl -Path $out -AclObject $acl
  $global:Ok++
} catch {
  Log "ERROR" "[ENV] Fail: $($_.Exception.Message)"
  $global:Fail++
}

# ---- 2. Slack Lists Backup via Node.js (backend/backup-slack.js) am besten! ----
$nodeExe = Get-Command node.exe -ErrorAction SilentlyContinue
$bkpJs = Join-Path $Root "backend\backup-slack.js"
if($nodeExe -and (Test-Path $bkpJs)){
  try {
    Push-Location (Join-Path $Root "backend")
    Log "INFO" "[Slack] Starte Node.js backup-slack.js (Slack Lists Endpoint via slack.js) ..."
    $outJson = & $nodeExe.Source $bkpJs $SlackDir 2>&1
    foreach($ol in $outJson){ Log "INFO" ("[Slack] "+[string]$ol) }
    $global:Ok++
    Pop-Location
  } catch {
    Log "ERROR" "[Slack] Node.js Fail: $($_.Exception.Message)"
    $global:Fail++
    try { Pop-Location } catch {}
  }
} else {
  Log "WARN" "[Slack] node.exe oder backup-slack.js nicht gefunden - Überspringe Slack Backup via REST Fallback"
  $token = [System.Environment]::GetEnvironmentVariable("BK_SLACK_BOT_TOKEN","Process")
  $lists = @{
    "production" = [System.Environment]::GetEnvironmentVariable("BK_SLACK_LIST_ID","Process")
    "material"   = [System.Environment]::GetEnvironmentVariable("BK_SLACK_MATERIAL_LIST_ID","Process")
  }
  foreach($k in $lists.Keys){
    $listId = $lists[$k]
    if([string]::IsNullOrWhiteSpace($listId) -or [string]::IsNullOrWhiteSpace($token)){
      Log "WARN" "[Slack] $k übersprungen (Token/ListId leer)"
      continue
    }
    try {
      $items = New-Object System.Collections.ArrayList
      $cursor = $null
      $loop = 0
      do {
        $loop++
        $body = @{ list_id = $listId }
        if($cursor){ $body["cursor"] = $cursor }
        $r = Invoke-RestMethod -Uri "https://slack.com/api/slackLists.items.list" -Method Post -Headers @{ "Authorization" = "Bearer $token" } -Body ($body | ConvertTo-Json -Compress) -ContentType "application/json" -ErrorAction Stop
        if(-not $r.ok){ Log "WARN" "[Slack] $k API Error: $($r.error)" ; break }
        if($r.items){ $null = $items.AddRange(@($r.items)) }
        $cursor = $r.response_metadata.next_cursor
      } while($cursor -and $loop -lt 50)
      $out = Join-Path $SlackDir "slack-$k-$TS.json.gz"
      $json = $items | ConvertTo-Json -Depth 10 -Compress
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
      $ms = New-Object System.IO.MemoryStream
      $gz = New-Object System.IO.Compression.GzipStream($ms, [System.IO.Compression.CompressionMode]::Compress, $true)
      $gz.Write($bytes, 0, $bytes.Length) ; $gz.Close()
      [System.IO.File]::WriteAllBytes($out, $ms.ToArray()) ; $ms.Close()
      $sz = [math]::Round((Get-Item $out).Length/1KB,1)
      Log "INFO" "[Slack] ✅ $k REST → $($items.Count) Items, ${sz} KB → slack-$k-$TS.json.gz"
      $global:Ok++
    } catch {
      Log "ERROR" "[Slack] $k Fail: $($_.Exception.Message)"
      $global:Fail++
    }
  }
}

# ---- 3. POSTGRESQL BACKUP via Ubuntu SSH (da Windows kein pg_dump hat!) ----
$UbuHelper = Join-Path $Root "backend\scripts\ubuntu\_ubu-helper.ps1"
if(Test-Path $UbuHelper){
  try {
    . $UbuHelper
    Log "INFO" "[PostgreSQL] Trigger Ubuntu pg_dump via SSH + Download Back..."
    $r = Invoke-UbuCmd -Sudo "bash /usr/local/sbin/rollladen-backup.sh 2>&1 | tail -10 ; echo RC=$?"
    $rc = 0
    $latest = Invoke-UbuCmd "ls -1t /var/backups/rollladen-monitor/pg/ | head -1"
    if($latest -and $latest.Output -and $latest.Output[0]){
      $fname = $latest.Output[0].Trim()
      $dl = Join-Path $PgDir $fname
      try {
        DownloadFrom-Ubu -RemotePath "/var/backups/rollladen-monitor/pg/$fname" -LocalPath $dl
        $sz = [math]::Round((Get-Item $dl).Length/1KB,1)
        Log "INFO" "[PostgreSQL] ✅ Ubuntu → Windows sync OK (${sz} KB → $fname)"
        $global:Ok++
      } catch {
        Log "WARN" "[PostgreSQL] Download fail (Ubuntu Backup lief aber evtl. OK): $_"
      }
    }
  } catch {
    Log "WARN" "[PostgreSQL] Trigger fail: $_"
  }
} else {
  Log "WARN" "[PostgreSQL] UbuHelper fehlt → kein PG Backup via SSH"
}

Retention-Cleanup
Log "INFO" "=== Backup Ende: OK=$global:Ok FAIL=$global:Fail ==="
if($global:Fail -gt 0){
  Write-Warning "Backup hatte $global:Fail Fehler! Log: $LogFile"
}
exit (if($global:Fail -gt $global:Ok){1}else{0})
