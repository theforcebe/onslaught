param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('BattleNet', 'BattleNetSecret', 'GitHub', 'Owner')]
    [string]$Step,
    [string]$ExpectedClientId = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$wranglerPath = Join-Path $projectRoot 'node_modules/wrangler/bin/wrangler.js'
$nodePath = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath $wranglerPath)) { throw 'Install project dependencies with npm ci first.' }
$secretNames = switch ($Step) {
    'BattleNet' { @('BNET_CLIENT_ID', 'BNET_CLIENT_SECRET') }
    'BattleNetSecret' { @('BNET_CLIENT_SECRET') }
    'GitHub' { @('GITHUB_TOKEN') }
    'Owner' { @('ADMIN_BNET_IDS') }
}
$statusDirectory = Join-Path $projectRoot '.wrangler'
New-Item -ItemType Directory -Path $statusDirectory -Force | Out-Null
$statusPath = Join-Path $statusDirectory "setup-$Step.json"
@{ step = $Step; complete = $false } | ConvertTo-Json | Set-Content -LiteralPath $statusPath
Write-Host ''
Write-Host 'Onslaught secure gateway setup' -ForegroundColor Cyan
Write-Host 'Paste each value into this window. Input is masked.'
Write-Host 'Values go directly to Cloudflare secret storage through process stdin.'
Write-Host 'They are never written to a file or included in command arguments.'
Write-Host ''

$failureKind = 'input'
$inputShape = $null
try {
    foreach ($secretName in $secretNames) {
        $secretInput = Read-Host "Paste $secretName, then press Enter" -AsSecureString
        $pointer = [IntPtr]::Zero
        $plain = $null
        try {
            $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretInput)
            $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
            if ($secretName -eq 'GITHUB_TOKEN') { $plain = $plain -replace '\s', '' }
            if (-not $plain -or $plain.Contains("`n") -or $plain.Contains("`r")) {
                $failureKind = 'empty-or-multiline-input'
                throw 'Use one non-empty credential value per prompt.'
            }
            if ($secretName -eq 'BNET_CLIENT_SECRET' -and $ExpectedClientId -and $plain -eq $ExpectedClientId) {
                $failureKind = 'client-id-instead-of-secret'
                Write-Host 'That value is the client ID. Use the Client Secret value instead.' -ForegroundColor Yellow
                throw 'Client ID entered in secret prompt.'
            }
            if ($secretName -eq 'ADMIN_BNET_IDS' -and $plain -notmatch '^\d+(,\d+)*$') {
                $failureKind = 'invalid-account-id'
                throw 'Use only numeric Battle.net account IDs, separated by commas.'
            }
            if ($secretName -eq 'GITHUB_TOKEN' -and $plain -notmatch '^github_pat_[A-Za-z0-9_]{35,}$') {
                $failureKind = 'not-a-fine-grained-token'
                $inputShape = @{ length = $plain.Length; expectedPrefix = $plain.StartsWith('github_pat_'); containsControlCharacters = [regex]::IsMatch($plain, '[\x00-\x1f\x7f]') }
                Write-Host 'Use the generated fine-grained token, not its name or a webpage URL.' -ForegroundColor Yellow
                throw 'A fine-grained GitHub token is required.'
            }
            $failureKind = 'starting-secret-upload'
            $startInfo = [Diagnostics.ProcessStartInfo]::new()
            $startInfo.FileName = $nodePath
            $startInfo.WorkingDirectory = $projectRoot
            $startInfo.UseShellExecute = $false
            $startInfo.CreateNoWindow = $true
            $startInfo.RedirectStandardInput = $true
            $startInfo.RedirectStandardOutput = $true
            $startInfo.RedirectStandardError = $true
            foreach ($arg in @($wranglerPath, 'secret', 'put', $secretName)) { $startInfo.ArgumentList.Add($arg) }
            $process = [Diagnostics.Process]::new()
            $process.StartInfo = $startInfo
            [void]$process.Start()
            $failureKind = 'sending-secret-to-cloudflare'
            $stdoutTask = $process.StandardOutput.ReadToEndAsync()
            $stderrTask = $process.StandardError.ReadToEndAsync()
            $process.StandardInput.WriteLine($plain)
            $process.StandardInput.Close()
            $plain = $null
            $process.WaitForExit()
            $safeOutput = $stdoutTask.GetAwaiter().GetResult() + $stderrTask.GetAwaiter().GetResult()
            if ($process.ExitCode -ne 0) {
                $failureKind = if ($safeOutput -match 'Authentication|not authenticated|authorization|Unauthorized') { 'cloudflare-authentication' } elseif ($safeOutput -match 'network|fetch failed|ENOTFOUND|ETIMEDOUT') { 'network-connection' } else { 'cloudflare-upload-rejected' }
                $safeOutput = $null
                throw 'Cloudflare did not accept this secret.'
            }
            $safeOutput = $null
            $process.Dispose()
            Write-Host "Stored $secretName in Cloudflare." -ForegroundColor Green
        } finally {
            $plain = $null
            if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
            $secretInput.Dispose()
        }
    }
    @{ step = $Step; complete = $true; names = $secretNames; at = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $statusPath
    Write-Host ''
    Write-Host 'Setup step complete. Return to the chat and say Done.' -ForegroundColor Green
} catch {
    @{ step = $Step; complete = $false; failureKind = $failureKind; errorType = $_.Exception.GetType().Name; inputShape = $inputShape } | ConvertTo-Json | Set-Content -LiteralPath $statusPath
    Write-Host ''
    Write-Host 'Setup could not finish. No credential values were displayed or written to a file.' -ForegroundColor Yellow
    Write-Host "Reason: $failureKind" -ForegroundColor Yellow
    Write-Host 'Return to the chat for help. Do not paste secret values into chat.'
}
[void](Read-Host 'Press Enter to close this window')
