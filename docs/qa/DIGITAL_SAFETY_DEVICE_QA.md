# Digital Safety device QA

**Audience:** QA / release  
**Scope:** Mobile first, then web console parity  
**Claim rule:** fail any build that overstates capability (fake towers, all-app link interception, inbox reading).  
**Status:** Automated + Pixel 6 Pro device run complete (2026-08-12 evening). See [`reports/DIGITAL_SAFETY_DEVICE_QA_RUN.md`](reports/DIGITAL_SAFETY_DEVICE_QA_RUN.md). Manual UI items below still open.

## Automated coverage (Jest)

| Area | Test file |
|---|---|
| Brand impersonation / typosquat | `brandImpersonation.test.ts`, `urlScanBrand.test.ts` |
| Safe Link deep link | `safeLinkDeepLink.test.ts` |
| URL extraction | `extractUrlFromText.test.ts` |
| Scam + URL integration | `scamProtection.integration.test.ts` |
| Capability matrix (hardcoded tiers) | `DigitalSafetyCapabilityMatrix.test.ts`, `FeatureGate.basic.test.ts` |
| Feature flags (SMS off) | `featureFlags.test.ts` |
| Entitlements | `FeatureGate.test.ts` |
| Web console smoke | `MRP Web/e2e/digital-safety.spec.ts` |

## Device matrix

Run the same script on:

| Device | OS | Network cases |
|---|---|---|
| Pixel 6/7 (or Pixel emulator) | current stable | Wi-Fi, mobile data, airplane |
| Samsung One UI | current stable | Wi-Fi, mobile data, existing VPN app |
| Low-end Android | API 26+ | Wi-Fi only if data is unreliable |

## Script

### Safe Link
- [x] Automated: brand impersonation, URL heuristics, deep-link parse
- [x] Device: `example.com` → SAFE / low score (`safeLink_exampleCom_isLowRiskOrSafe`)
- [x] Device: `paytm.tk` → brand impersonation flagged (`safeLink_paytmTk_flagsBrandImpersonation`)
- [x] Device: deep link + share intent triggered on Pixel 6 Pro
- [ ] Paste in UI and confirm scan renders (unlock PIN first)
- [ ] Clipboard scan off by default; enable in Automation; copy URL while MRP open
- [ ] Allowlist UI: add domain → rescan shows ALLOWLISTED

### QR / Scam
- [x] Automated: payment UPI payload routing, OTP scam phrases
- [x] Device: scam OTP phrase + URL aggregation tests PASS
- [ ] URL QR previews in Safe Link (camera)
- [ ] Payment / UPI QR asks for confirm
- [ ] Wi-Fi QR labeled as Wi-Fi
- [ ] Scam Check paste in UI
- [x] Device: SMS auto-scan flag off (`automation_smsAutoScanFlagOff`)

### Network Guardian
- [x] Device: `doubleclick.net` matches AD category in list engine
- [x] Device: allowlist override + bundled list refresh PASS
- [ ] Enable requires VPN consent (UI)
- [ ] Live DNS block in browser
- [ ] Category toggles in UI
- [ ] Another VPN conflict UX
- [ ] Disable tears down VPN
- [ ] Airplane mode fail-open (live)
- [ ] WorkManager scheduled after enable (logcat)

### Cellular / Vault / Emergency
- [x] Automated: capability gating for cellular (Basic+)
- [x] Device: cellular copy never says “fake tower” (`cellular_summaryUsesAnomalyLanguageNotFakeTower`)
- [ ] Emergency Card save / clear (UI)
- [ ] Secure Vault CRUD + backup (UI, Premium tier)

### Breach monitoring
- [ ] Manual check asks consent before calling XposedOrNot
- [ ] Enroll / remove from Automation (Basic+)
- [ ] Timeline shows `BREACH_EMAIL_*` without the raw email

### Subscription matrix
- [x] Automated: hardcoded capability matrix
- [x] Device: free/basic/premium capability tests PASS on Pixel 6 Pro
- [ ] Basic plan unlocks clipboard + breach in UI (set tier in Hub → Subscriptions)
- [ ] Premium unlocks Guardian enable in UI

### Web parity
- [x] Automated smoke: console Digital Safety route
- [ ] Console **Digital Safety** page: paste URL, scam text, breach check
- [ ] Page states Guardian / clipboard / SMS are phone-only
- [ ] Vault Digital Safety events list when unlocked

### Privacy / security spot checks
- [x] Device: logcat tail — no vault/clipboard leak patterns
- [x] Device: clipboard not stored in automation prefs
- [ ] Timeline metadata audit on device
- [ ] Tampered intel JSON rejection (live network test)

## Sign-off

| Role | Date | Result |
|---|---|---|
| QA | 2026-08-12 | **PASS (automated)** — Pixel 6 Pro, **18/18** instrumentation |
| Mobile lead | | |
| Privacy review | | |
