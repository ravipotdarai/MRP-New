# Device smoke test for MRP on connected adb device.
# Exit 0 if critical checks pass.

$ErrorActionPreference = "Continue"
$results = @()

function Pass($name, $detail = "") {
  $script:results += [pscustomobject]@{ Status = "PASS"; Name = $name; Detail = $detail }
  Write-Host "PASS  $name  $detail" -ForegroundColor Green
}
function Fail($name, $detail = "") {
  $script:results += [pscustomobject]@{ Status = "FAIL"; Name = $name; Detail = $detail }
  Write-Host "FAIL  $name  $detail" -ForegroundColor Red
}
function Info($msg) { Write-Host "INFO  $msg" -ForegroundColor Cyan }

$dev = (adb devices | Select-String "\tdevice").Line
if (-not $dev) { Fail "adb device"; exit 1 }
Pass "adb device" $dev.Trim()

adb reverse tcp:8081 tcp:8081 | Out-Null
Pass "adb reverse" "8081"

# Fresh launch
adb shell am force-stop com.mrp | Out-Null
adb logcat -c | Out-Null
adb shell am start -n com.mrp/.MainActivity | Out-Null
Start-Sleep -Seconds 6

$appPid = (adb shell pidof -s com.mrp 2>$null).Trim()
if ($appPid) { Pass "app process" "pid=$appPid" } else { Fail "app process" "not running"; exit 1 }

$logs = adb logcat -d --pid=$appPid -t 200 2>$null | Out-String

if ($logs -match "Running `"MRP`"") { Pass "JS bundle load" "Running MRP" }
elseif ($logs -match "ReactNativeJS") { Pass "JS bundle load" "ReactNativeJS active" }
else { Fail "JS bundle load" "no RN JS markers" }

if ($logs -match "FATAL EXCEPTION|AndroidRuntime: FATAL") { Fail "no crash" "FATAL in logcat" }
else { Pass "no crash" }

# Navigate: Home is default tab often — open App Usage via dumpsys / monkey is flaky.
# Trigger App Usage by launching and waiting; also invoke known test SIM intents.
adb shell am broadcast -a com.mrp.TEST_SIM_REMOVED -n com.mrp/.service.MrpMonitorService 2>$null | Out-Null
# Service receives via registered receiver, not component - send global broadcast
adb shell am broadcast -a com.mrp.TEST_SIM_REMOVED 2>$null | Out-Null
Start-Sleep -Seconds 2
adb shell am broadcast -a com.mrp.TEST_SIM_INSERTED 2>$null | Out-Null
Start-Sleep -Seconds 4

$logs2 = adb logcat -d -t 300 2>$null | Out-String

if ($logs2 -match "SIM state changed|Logging SIM event|SIM_REMOVED|SIM_INSERTED|SimChangeRecovery|SIM identity") {
  Pass "SIM test intents" "SIM handler reacted"
} else {
  # Service may not be running — still note
  Fail "SIM test intents" "no SIM log (is monitoring service running?)"
}

# UI dump: confirm activity resumed
$focus = adb shell dumpsys activity activities 2>$null | Select-String "mResumedActivity|topResumedActivity" | Select-Object -First 3
if ("$focus" -match "com.mrp") { Pass "activity focused" ($focus | Select-Object -First 1).ToString().Trim() }
else { Fail "activity focused" "$focus" }

# Package still installed
$pkg = adb shell pm path com.mrp 2>$null
if ($pkg -match "package:") { Pass "apk installed" $pkg.Trim() } else { Fail "apk installed" }

Write-Host ""
Write-Host "===== SUMMARY ====="
$pass = ($results | Where-Object Status -eq PASS).Count
$fail = ($results | Where-Object Status -eq FAIL).Count
Write-Host "PASS=$pass FAIL=$fail"
$results | Format-Table -AutoSize
if ($fail -gt 0) { exit 1 } else { exit 0 }
