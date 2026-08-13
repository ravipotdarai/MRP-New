# Digital Safety device QA runner (physical phone via ADB)
# Usage: powershell -File scripts/run-digital-safety-device-qa.ps1

# Gradle / adb often write progress to stderr; only fail on non-zero exit codes.
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
$AndroidDir = Join-Path $Root "MRP\android"
$ReportDir = Join-Path $Root "docs\qa\reports"
$ReportFile = Join-Path $ReportDir "DIGITAL_SAFETY_DEVICE_QA_RUN.md"
$Package = "com.mrp"

function Write-ReportLine([string]$Line) {
    Add-Content -Path $ReportFile -Value $Line -Encoding UTF8
}

function Wait-ForDevice([int]$TimeoutSec = 120) {
    Write-Host "Waiting for ADB device (up to ${TimeoutSec}s)..."
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $out = adb devices 2>&1 | Out-String
        if ($out -match "`tdevice") { return $true }
        Start-Sleep -Seconds 3
    }
    return $false
}

New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Set-Content -Path $ReportFile -Value @(
    "# Digital Safety device QA run",
    "",
    "**Started:** $ts",
    "",
    "## Environment",
    ""
) -Encoding UTF8

if (-not (Wait-ForDevice)) {
    Write-ReportLine "- **ADB device:** NOT FOUND"
    Write-ReportLine ""
    Write-ReportLine "## Result: BLOCKED"
    Write-ReportLine ""
    Write-ReportLine "No authorized device. Enable USB debugging, connect USB, accept RSA prompt, then re-run."
    Write-Host "ERROR: No ADB device. Enable USB debugging and authorize this PC." -ForegroundColor Red
    exit 2
}

$model = (adb shell getprop ro.product.model 2>$null).Trim()
$android = (adb shell getprop ro.build.version.release 2>$null).Trim()
$api = (adb shell getprop ro.build.version.sdk 2>$null).Trim()
Write-ReportLine "- **Model:** $model"
Write-ReportLine "- **Android:** $android (API $api)"
Write-ReportLine ""

Push-Location $AndroidDir
try {
    Write-Host "Building debug APK + instrumentation tests..."
    .\gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest 2>&1 | Tee-Object -Variable buildOut
    if ($LASTEXITCODE -ne 0) {
        Write-ReportLine "## Build: FAIL"
        Write-ReportLine "``````"
        ($buildOut | Select-Object -Last 40) | ForEach-Object { Write-ReportLine $_ }
        Write-ReportLine "``````"
        exit 1
    }
    Write-ReportLine "## Build: PASS"

    Write-Host "Installing APK..."
    .\gradlew.bat :app:installDebug :app:installDebugAndroidTest 2>&1 | Tee-Object -Variable installOut
    if ($LASTEXITCODE -ne 0) {
        Write-ReportLine "## Install: FAIL"
        exit 1
    }
    Write-ReportLine "## Install: PASS"

    Write-Host "Running on-device instrumentation tests..."
    .\gradlew.bat :app:connectedDebugAndroidTest 2>&1 | Tee-Object -Variable testOut
    $testPass = $LASTEXITCODE -eq 0
    if ($testPass) {
        Write-ReportLine "## Instrumentation tests: PASS"
    } else {
        Write-ReportLine "## Instrumentation tests: FAIL"
        Write-ReportLine "``````"
        ($testOut | Select-String -Pattern "FAILED|AssertionError|Tests on" | Select-Object -Last 30) | ForEach-Object { Write-ReportLine $_.Line }
        Write-ReportLine "``````"
    }

    Write-Host "Deep-link Safe Link smoke..."
    adb shell am start -a android.intent.action.VIEW -d "mrp://safe-link?text=https%3A%2F%2Fexample.com" $Package 2>&1 | Out-Null
    Start-Sleep -Seconds 2
    Write-ReportLine "## Deep link safe-link: triggered (manual verify UI)"

    Write-Host "Share intent smoke..."
    adb shell am start -a android.intent.action.SEND -t "text/plain" --es android.intent.extra.TEXT "https://example.com" -n "$Package/.SafeLinkShareActivity" 2>&1 | Out-Null
    Start-Sleep -Seconds 2
    Write-ReportLine "## Share-to-MRP: triggered (manual verify UI)"

    Write-Host "Logcat privacy spot-check (last 200 lines)..."
    $log = adb logcat -d -t 200 2>&1 | Out-String
    $vaultLeak = $log -match "vault.*plaintext|pin_hash.*log"
    $clipLeak = $log -match "clipboard_text|clipboard_history"
    if (-not $vaultLeak -and -not $clipLeak) {
        Write-ReportLine "## Logcat privacy spot-check: PASS (no obvious vault/clipboard leaks in tail)"
    } else {
        Write-ReportLine "## Logcat privacy spot-check: REVIEW NEEDED"
    }

    Write-ReportLine ""
    Write-ReportLine "## Manual follow-ups (device UI)"
    Write-ReportLine "- [ ] VPN consent + doubleclick.net block in browser"
    Write-ReportLine "- [ ] QR camera scan + payment confirm dialog"
    Write-ReportLine "- [ ] Emergency Card save/clear"
    Write-ReportLine "- [ ] Secure Vault CRUD + backup (Premium tier)"
    Write-ReportLine "- [ ] Breach email enroll with consent dialog"
    Write-ReportLine "- [ ] Hub lock badges + Safety subscription gates"
    Write-ReportLine "- [ ] Automation matrix copy (share free / clipboard Basic+)"
    Write-ReportLine ""
    if ($testPass) {
        Write-ReportLine "## Overall: PASS (automated) - complete manual items above for full sign-off"
        Write-ReportLine ""
        Write-ReportLine ("**Completed:** " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
        exit 0
    } else {
        Write-ReportLine "## Overall: FAIL - fix instrumentation failures first"
        Write-ReportLine ""
        Write-ReportLine ("**Completed:** " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
        exit 1
    }
} finally {
    Pop-Location
}
