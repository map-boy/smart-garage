#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$AppPath       = 'C:\projects_test\BIG DATA FACTORY\garage-aimable\garage',
    [string]$DashboardPath = 'C:\projects_test\BIG DATA FACTORY\garage-aimable\garage-boss-dashboard',
    [string]$ProjectId     = 'garage-management-6f1eb',
    [switch]$SkipTests,
    [switch]$SkipDeploy,
    [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'
$script:Failures = @()
$script:Warnings = @()

$ExpectedFunctions = @(
    'sendInvoiceWhatsApp',
    'sendManualWhatsApp',
    'createWhatsAppSession',
    'getWhatsAppSessionStatus',
    'getWhatsAppQr',
    'requestWhatsAppPairingCode',
    'restartWhatsAppSession',
    'disconnectWhatsAppSession',
    'wakeVm',
    'getVmStatus',
    'stopGarageVm',
    'stopIdleVm',
    'pruneWhatsAppLogs'
)

$RemovedFunctions = @(
    'onInvoiceIssued',
    'onInvoicePaid',
    'retryFailedInvoiceMessages',
    'sendScheduledMessages'
)

$RequiredSecrets = @(
    'OPENWA_API_KEY',
    'OPENWA_URL',
    'AZURE_APP_ID',
    'AZURE_PASSWORD',
    'AZURE_TENANT',
    'AZURE_SUBSCRIPTION_ID'
)

function Write-Step { param($m) Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "  [OK]   $m" -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "  [WARN] $m" -ForegroundColor Yellow; $script:Warnings += $m }
function Write-Bad  { param($m) Write-Host "  [FAIL] $m" -ForegroundColor Red;    $script:Failures += $m }

function Invoke-Step {
    param([string]$Name, [string]$WorkDir, [string]$Exe, [string[]]$CmdArgs, [switch]$NonFatal)
    Push-Location $WorkDir
    try {
        Write-Host "  > $Exe $($CmdArgs -join ' ')" -ForegroundColor DarkGray
        & $Exe @CmdArgs 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        if ($LASTEXITCODE -ne 0) {
            if ($NonFatal) { Write-Warn "$Name exited $LASTEXITCODE" } else { Write-Bad "$Name exited $LASTEXITCODE" }
            return $false
        }
        Write-Ok $Name
        return $true
    } catch {
        if ($NonFatal) { Write-Warn "$Name : $($_.Exception.Message)" } else { Write-Bad "$Name : $($_.Exception.Message)" }
        return $false
    } finally { Pop-Location }
}

function Get-CmdPath { param($n) (Get-Command $n -ErrorAction SilentlyContinue).Source }

Write-Host "GARAGE DEPLOY + HEALTH CHECK" -ForegroundColor White
Write-Host "Project : $ProjectId"
Write-Host "App     : $AppPath"
Write-Host "Board   : $DashboardPath"

# ---------------------------------------------------------------- prerequisites
Write-Step 'Prerequisites'

if (-not (Test-Path $AppPath)) { Write-Bad "App path not found: $AppPath"; exit 1 }
Write-Ok "App path exists"

if (Test-Path $DashboardPath) { Write-Ok "Dashboard path exists" }
else { Write-Warn "Dashboard path not found - rules sync will be skipped" }

$npm = Get-CmdPath 'npm.cmd'; if (-not $npm) { $npm = Get-CmdPath 'npm' }
if (-not $npm) { Write-Bad 'npm not found on PATH'; exit 1 }
Write-Ok "npm: $npm"

$node = Get-CmdPath 'node.exe'; if (-not $node) { $node = Get-CmdPath 'node' }
if ($node) { Write-Ok "node: $(& $node --version)" } else { Write-Bad 'node not found on PATH'; exit 1 }

$fb = Get-CmdPath 'firebase.cmd'; if (-not $fb) { $fb = Get-CmdPath 'firebase' }
if (-not $fb) {
    Write-Warn 'firebase CLI not found - installing globally'
    & $npm install -g firebase-tools
    $fb = Get-CmdPath 'firebase.cmd'; if (-not $fb) { $fb = Get-CmdPath 'firebase' }
}
if (-not $fb) { Write-Bad 'firebase CLI unavailable'; exit 1 }
Write-Ok "firebase: $fb"

$java = Get-CmdPath 'java.exe'; if (-not $java) { $java = Get-CmdPath 'java' }
if ($java) { Write-Ok 'java present (rules tests can run)' }
else { Write-Warn 'java not found - Firestore emulator rules tests will be skipped' }

foreach ($f in @('firestore.rules','firestore.indexes.json','firebase.json','.firebaserc')) {
    if (Test-Path (Join-Path $AppPath $f)) { Write-Ok "found $f" } else { Write-Bad "missing $f" }
}
if ($script:Failures.Count -gt 0) { Write-Host "`nAborting: prerequisites failed." -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------- auth
Write-Step 'Firebase authentication'
Push-Location $AppPath
$loginOut = & $fb login:list 2>&1 | Out-String
Write-Host "    $($loginOut.Trim())" -ForegroundColor DarkGray
if ($loginOut -match 'No authorized accounts|not logged in') {
    Write-Warn 'Not logged in - launching firebase login'
    & $fb login
}
try {
    $useOut = & $fb use $ProjectId 2>&1 | Out-String
    Write-Host "    $($useOut.Trim())" -ForegroundColor DarkGray
} catch {
    Write-Host "    (firebase CLI crashed on exit - known Windows libuv bug, checking result anyway)" -ForegroundColor DarkGray
}
$firebasercPath = Join-Path $AppPath '.firebaserc'
$usedProject = $null
if (Test-Path $firebasercPath) {
    try { $usedProject = (Get-Content $firebasercPath -Raw | ConvertFrom-Json).projects.default }
    catch { $usedProject = $null }
}
if ($usedProject -ne $ProjectId) { Pop-Location; Write-Bad "Could not select project $ProjectId"; exit 1 }
Write-Ok "Using project $ProjectId"
Pop-Location

# ---------------------------------------------------------------- source check
Write-Step 'Source verification'

$indexTs = Join-Path $AppPath 'functions\src\index.ts'
if (Test-Path $indexTs) {
    $src = Get-Content $indexTs -Raw
    foreach ($fn in $ExpectedFunctions) {
        if ($src -match "export const $fn\b") { Write-Ok "source exports $fn" }
        else { Write-Bad "source is MISSING $fn" }
    }
    foreach ($fn in $RemovedFunctions) {
        if ($src -match "export const $fn\b") { Write-Bad "source still exports removed function $fn" }
        else { Write-Ok "source clean of $fn" }
    }
} else { Write-Bad "functions/src/index.ts not found" }

$rulesFile = Join-Path $AppPath 'firestore.rules'
$rules = Get-Content $rulesFile -Raw
$rulesChecks = @{
    'quota fields locked'        = 'whatsappMessagesLimit'
    'session fields locked'      = 'whatsappSessionId'
    'delivery records locked'    = 'whatsappPaid'
    'audit log server-only'      = 'whatsappLogs'
    'archive chunks rule'        = 'archives/\{archiveId\}/records'
    'vmState blocked'            = 'match /system/\{docId\}'
    'BOSS full access'           = 'allow read, write: if isSuper\(\)'
}
foreach ($k in $rulesChecks.Keys) {
    if ($rules -match $rulesChecks[$k]) { Write-Ok "rules: $k" } else { Write-Bad "rules: MISSING $k" }
}

# ---------------------------------------------------------------- rules sync
Write-Step 'Sync rules to dashboard'
if (Test-Path $DashboardPath) {
    $dashRules = Join-Path $DashboardPath 'firestore.rules'
    $same = $false
    if (Test-Path $dashRules) {
        $same = ((Get-FileHash $rulesFile).Hash -eq (Get-FileHash $dashRules).Hash)
    }
    if ($same) { Write-Ok 'dashboard rules already identical' }
    else {
        if (Test-Path $dashRules) {
            $bak = "$dashRules.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
            Copy-Item $dashRules $bak -Force
            Write-Ok "backed up old dashboard rules -> $(Split-Path $bak -Leaf)"
        }
        Copy-Item $rulesFile $dashRules -Force
        Write-Ok 'dashboard rules updated from garage_management'
    }
} else { Write-Warn 'dashboard path missing - sync skipped' }

# ---------------------------------------------------------------- install
Write-Step 'Install dependencies'
if (-not (Test-Path (Join-Path $AppPath 'node_modules'))) {
    Invoke-Step 'npm install (app)' $AppPath $npm @('install','--no-audit','--no-fund') | Out-Null
} else { Write-Ok 'app node_modules present' }

$fnPath = Join-Path $AppPath 'functions'
if (-not (Test-Path (Join-Path $fnPath 'node_modules'))) {
    Invoke-Step 'npm install (functions)' $fnPath $npm @('install','--no-audit','--no-fund') | Out-Null
} else { Write-Ok 'functions node_modules present' }

# ---------------------------------------------------------------- build + test
if (-not $VerifyOnly) {
    Write-Step 'Build and typecheck'
    Invoke-Step 'app typecheck'    $AppPath $npm @('run','lint')  | Out-Null
    Invoke-Step 'app build'        $AppPath $npm @('run','build') | Out-Null
    Invoke-Step 'functions lint'   $fnPath  $npm @('run','lint')  | Out-Null
    Invoke-Step 'functions build'  $fnPath  $npm @('run','build') | Out-Null

    if (-not $SkipTests -and $java) {
        Write-Step 'Firestore rules security tests'
        $testFile = Join-Path $AppPath 'tests\firestore-rules.test.mjs'
        if (Test-Path $testFile) {
            Invoke-Step 'rules tests' $AppPath $npm @('run','test:rules') | Out-Null
        } else { Write-Warn 'tests/firestore-rules.test.mjs not found - skipped' }
    } elseif (-not $java) {
        Write-Warn 'rules tests skipped (no java)'
    }
}

if ($script:Failures.Count -gt 0) {
    Write-Host "`nAborting before deploy - $($script:Failures.Count) failure(s):" -ForegroundColor Red
    $script:Failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}

# ---------------------------------------------------------------- secrets
Write-Step 'Cloud Functions secrets'
foreach ($s in $RequiredSecrets) {
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $chk = & $fb functions:secrets:get $s --project $ProjectId 2>&1 | Out-String
    } catch {
        $chk = "error: $($_.Exception.Message)"
    }
    $ErrorActionPreference = $prevEAP
    if ($LASTEXITCODE -eq 0 -and $chk -notmatch 'not found|NOT_FOUND') { Write-Ok "secret set: $s" }
    else { Write-Warn "secret missing or unreadable: $s  (firebase functions:secrets:set $s)" }
}

# ---------------------------------------------------------------- deploy
if (-not $SkipDeploy -and -not $VerifyOnly) {
    Write-Step 'Deploy Firestore rules'
    Invoke-Step 'deploy rules' $AppPath $fb @('deploy','--only','firestore:rules','--project',$ProjectId,'--non-interactive') | Out-Null

    Write-Step 'Deploy Firestore indexes'
    Invoke-Step 'deploy indexes' $AppPath $fb @('deploy','--only','firestore:indexes','--project',$ProjectId,'--non-interactive') | Out-Null

    Write-Step 'Deploy Cloud Functions'
    Write-Host '  --force is required: removed functions must be deleted server-side' -ForegroundColor DarkGray
    Invoke-Step 'deploy functions' $AppPath $fb @('deploy','--only','functions','--project',$ProjectId,'--non-interactive','--force') | Out-Null
} else {
    Write-Warn 'deploy skipped by switch'
}

# ---------------------------------------------------------------- verify live
Write-Step 'Verify deployed functions'
$live = & $fb functions:list --project $ProjectId 2>&1 | Out-String
Write-Host $live -ForegroundColor DarkGray

$deployed = @()
foreach ($fn in $ExpectedFunctions) {
    if ($live -match "\b$fn\b") { Write-Ok "live: $fn"; $deployed += $fn }
    else { Write-Bad "NOT deployed: $fn" }
}
foreach ($fn in $RemovedFunctions) {
    if ($live -match "\b$fn\b") { Write-Bad "still live (should be deleted): $fn" }
    else { Write-Ok "removed: $fn" }
}

Write-Step 'Verify deployed rules'
$liveRules = & $fb firestore:rules:get --project $ProjectId 2>&1 | Out-String
if ($LASTEXITCODE -eq 0 -and $liveRules.Trim()) {
    foreach ($k in $rulesChecks.Keys) {
        if ($liveRules -match $rulesChecks[$k]) { Write-Ok "live rules: $k" }
        else { Write-Bad "live rules MISSING: $k" }
    }
} else { Write-Warn 'could not read live rules (this Firebase CLI has no firestore:rules:get)' }

Write-Step 'Recent function errors'
foreach ($fn in @('sendInvoiceWhatsApp','sendManualWhatsApp','getWhatsAppSessionStatus')) {
    Write-Host "  --- $fn ---" -ForegroundColor DarkGray
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $fb functions:log --only $fn --project $ProjectId 2>&1 |
            Select-Object -First 12 |
            ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    } catch {
        Write-Warn "could not fetch logs for $fn (CLI crash) - check console manually"
    }
    $ErrorActionPreference = $prevEAP
}

# ---------------------------------------------------------------- summary
Write-Step 'SUMMARY'
Write-Host ("  Functions expected : {0}" -f $ExpectedFunctions.Count)
Write-Host ("  Functions live     : {0}" -f $deployed.Count)
Write-Host ("  Warnings           : {0}" -f $script:Warnings.Count) -ForegroundColor Yellow
Write-Host ("  Failures           : {0}" -f $script:Failures.Count) -ForegroundColor $(if ($script:Failures.Count) {'Red'} else {'Green'})

if ($script:Warnings.Count) {
    Write-Host "`n  Warnings:" -ForegroundColor Yellow
    $script:Warnings | ForEach-Object { Write-Host "   - $_" -ForegroundColor Yellow }
}
if ($script:Failures.Count) {
    Write-Host "`n  Failures:" -ForegroundColor Red
    $script:Failures | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
    Write-Host "`nRESULT: FAILED" -ForegroundColor Red
    exit 1
}

Write-Host "`nRESULT: ALL GREEN" -ForegroundColor Green
exit 0
