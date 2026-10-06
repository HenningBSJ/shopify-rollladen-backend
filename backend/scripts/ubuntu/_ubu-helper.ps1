# ROLLLADEN MIGRATION REMOTE HELFER (Posh-SSH, Password Auth "rafes" : "000000")
# Enthält Funktionen: Invoke-Ubu(cmd, sudo) + CopyTo-Ubu(local, remote)
[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
# NuGet / PSGallery 100% non-interactive (keine Prompts, immer Ja!)
try {
  Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser -ForceBootstrap | Out-Null
} catch { try { Install-PackageProvider -Name NuGet -Force -Scope CurrentUser -ForceBootstrap | Out-Null } catch {} }
try {
  Set-PSRepository -Name PSGallery -InstallationPolicy Trusted -ErrorAction Stop | Out-Null
} catch { try { Register-PSRepository -Name PSGallery -SourceLocation https://www.powershellgallery.com/api/v2/ -InstallationPolicy Trusted | Out-Null } catch {} }
if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
  Write-Host "  → Install Posh-SSH CurrentUser (dauert 10-30s)..." -ForegroundColor Cyan
  Install-Module -Name Posh-SSH -Scope CurrentUser -Force -AllowClobber -Repository PSGallery -Confirm:$false | Out-Null
}
Import-Module Posh-SSH -Force -ErrorAction Stop
Write-Host "  → Posh-SSH v$((Get-Module Posh-SSH).Version) geladen." -ForegroundColor DarkGray
$SEC_PW = ConvertTo-SecureString "000000" -AsPlainText -Force
$GLOBAL:UBU_CRED = [PSCredential]::new("rafes", $SEC_PW)
$GLOBAL:UBU_HOST = "100.98.136.86"

function Get-UbuSess([int]$timeout=20) {
    # Idempotent: reuse existing session
    $existing = Get-SSHSession -ComputerName $GLOBAL:UBU_HOST -ErrorAction SilentlyContinue
    if ($existing -and $existing.IsConnected) { return $existing[0] }
    # Cleanup stale
    Get-SSHSession | Remove-SSHSession | Out-Null
    $s = New-SSHSession -ComputerName $GLOBAL:UBU_HOST -Credential $GLOBAL:UBU_CRED -AcceptKey -ConnectionTimeout $timeout -ErrorAction Stop
    return $s
}

function Invoke-UbuCmd([Parameter(Mandatory)][string]$Command, [switch]$Sudo, [int]$Timeout=300) {
    $sess = Get-UbuSess
    $fullCmd = $Command
    if ($Sudo) {
        # sudo -S -p '' reads password from stdin without prompt
        $fullCmd = "echo '000000' | sudo -S -p '' -- bash -c `"$($Command.Replace('"','\"'))`""
    }
    Write-Host "  ➜ SSH $(if($Sudo){'SUDO '})→ $($Command.Substring(0,[Math]::Min(120,$Command.Length)))$(if($Command.Length -gt 120){'…'})" -ForegroundColor DarkGray
    $res = Invoke-SSHCommand -SessionId $sess.SessionId -Command $fullCmd -TimeOut $Timeout -ErrorAction Stop
    if ($res.ExitStatus -ne 0) {
        Write-Host "  ❌ ExitStatus=$($res.ExitStatus)" -ForegroundColor Red
        if ($res.Error) { $res.Error | ForEach-Object { Write-Host "    stderr: $_" -ForegroundColor DarkRed } }
        throw "REMOTE_FAIL exit=$($res.ExitStatus): CMD=$Command"
    }
    return $res
}

function CopyTo-Ubu([Parameter(Mandatory)][string]$LocalPath, [Parameter(Mandatory)][string]$RemotePath, [switch]$Overwrite) {
    if (-not (Test-Path $LocalPath)) { throw "LOCAL_MISSING: $LocalPath" }
    if ($Overwrite) {
        try { Invoke-UbuCmd "rm -rf '$RemotePath'" -Sudo | Out-Null } catch {}
    }
    # Use direct Renci.SshNet ScpClient (loaded by Posh-SSH assembly) with PLAIN string password
    $plain = (New-Object System.Net.NetworkCredential("rafes", $SEC_PW)).Password
    $scp = New-Object Renci.SshNet.ScpClient($GLOBAL:UBU_HOST, 22, "rafes", $plain)
    $scp.Connect()
    try {
        $fi = Get-Item $LocalPath
        if ($fi.PSIsContainer) {
            $scp.Upload($fi.FullName, $RemotePath)
            $sz = (Get-ChildItem $fi.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
            Write-Host "  ➜ SCP DIR OK → $RemotePath ($([math]::Round($sz/1KB,1)) KB)" -ForegroundColor DarkGray
        } else {
            $scp.Upload($fi, $RemotePath)
            Write-Host "  ➜ SCP FILE OK → $RemotePath ($([math]::Round($fi.Length/1KB,1)) KB)" -ForegroundColor DarkGray
        }
    } finally {
        $scp.Disconnect(); $scp.Dispose()
    }
}

function Get-Script([string]$Rel) {
    return Join-Path "C:\Projects\Shopify\backend\scripts\ubuntu" $Rel
}
Write-Host "✅ Ubu-Helfer geladen. Host=$GLOBAL:UBU_HOST User=rafes" -ForegroundColor Green
