# Digital Safety device QA run

**Started:** 2026-08-12 22:00:29  
**Completed:** 2026-08-12 22:02:30

## Environment

- **Model:** Pixel 6 Pro
- **Android:** 17 (API 37)
- **Build:** debug v1.0.3 (versionCode 4)
- **Changes under test:** Subscription gates, Safe Link automation matrix, breach entitlement hooks, Emergency Info checklist, claim-safe timeline labels, DsScreenState, web DS aggregates

## Build: PASS

Gradle `:app:assembleDebug` + `:app:assembleDebugAndroidTest` succeeded.

## Install: PASS

Installed `app-debug.apk` and `app-debug-androidTest.apk` on Pixel 6 Pro.

## Instrumentation tests: PASS (18/18)

```
Starting 18 tests on Pixel 6 Pro - 17
Finished 18 tests on Pixel 6 Pro - 17
BUILD SUCCESSFUL
```

Suite: `DigitalSafetyDeviceQaTest` (Safe Link, scam, Guardian lists, cellular claim-safe copy, automation flags, entitlement gates, privacy spot-checks).

## Deep link safe-link: triggered (manual verify UI)

`adb shell am start -a android.intent.action.VIEW -d "mrp://safe-link?text=https%3A%2F%2Fexample.com" com.mrp`

## Share-to-MRP: triggered (manual verify UI)

`adb shell am start -a android.intent.action.SEND -t "text/plain" --es android.intent.extra.TEXT "https://example.com" -n com.mrp/.SafeLinkShareActivity`

## Logcat privacy spot-check: PASS

No obvious vault/clipboard leak patterns in last 200 log lines.

## Manual follow-ups (device UI — still required for full P0-3)

- [ ] Network Guardian — VPN consent, key icon, browser load, doubleclick.net block
- [ ] Timeline — single NETWORK_GUARDIAN_ENABLED per enable
- [ ] Hub lock badges + Safety subscription gates
- [ ] Automation matrix — clipboard off by default; enable on Basic+
- [ ] QR camera + payment confirm
- [ ] Emergency Card save/clear + Open Android Emergency Info
- [ ] Secure Vault CRUD + Drive backup (Premium)
- [ ] Breach email enroll with consent

## Overall: PASS (automated) — complete manual items above for full sign-off

**Script note:** `run-digital-safety-device-qa.ps1` now uses `$ErrorActionPreference = Continue` so Gradle stderr no longer aborts the run mid-report.
