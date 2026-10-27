param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$taskRuntime = Join-Path $PSScriptRoot 'local-runtime'
$taskExe = Join-Path $taskRuntime 'ezbookkeeping.exe'
$taskPidFile = Join-Path $taskRuntime 'data/server.pid'
$taskUrl = 'http://127.0.0.1:8766/'
if (-not (Test-Path -LiteralPath $taskExe)) { throw 'ezBookkeeping runtime is missing.' }
$taskRunning = $false
if (Test-Path -LiteralPath $taskPidFile) {
    $taskServerId = [int](Get-Content -LiteralPath $taskPidFile -Raw)
    $taskProcess = Get-Process -Id $taskServerId -ErrorAction SilentlyContinue
    if ($taskProcess -and $taskProcess.Path -eq $taskExe) { $taskRunning = $true }
}
if (-not $taskRunning) {
    $taskProcess = Start-Process -FilePath $taskExe -ArgumentList @('server','run') -WorkingDirectory $taskRuntime -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskRuntime 'log/server.stdout.log') -RedirectStandardError (Join-Path $taskRuntime 'log/server.stderr.log') -PassThru
    Set-Content -LiteralPath $taskPidFile -Value $taskProcess.Id
}
$taskReady = $false
for ($taskAttempt = 0; $taskAttempt -lt 30; $taskAttempt++) {
    try {
        $taskResponse = Invoke-WebRequest -Uri $taskUrl -UseBasicParsing -TimeoutSec 2
        if ($taskResponse.StatusCode -eq 200) { $taskReady = $true; break }
    } catch { Start-Sleep -Milliseconds 300 }
}
if (-not $taskReady) { throw 'Server did not start. See local-runtime/log/server.stderr.log.' }
if (-not $NoBrowser) { Start-Process $taskUrl }
Write-Output $taskUrl
