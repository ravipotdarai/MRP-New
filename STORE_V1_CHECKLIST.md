# Store v1 — Play internal → production

**Started:** 2026-07-28  
**Product:** Drive-only locate · Circle **off** · Panic / Emergency / Geofence / SIM / Drive **on**  
**Trackers:** [`P8_STORE_RELEASE.md`](P8_STORE_RELEASE.md) · [`V1_DRIVE_ONLY_RELEASE.md`](V1_DRIVE_ONLY_RELEASE.md) · [`PLAY_BILLING_INCOMPLETE.md`](PLAY_BILLING_INCOMPLETE.md)

---

## Goal

Ship an **Internal testing** AAB that matches Play Data Safety + privacy claims, with no Circle marketing, then promote to production when billing is real.

---

## Agent-ready (this pass)

| # | Item | Status |
|---|---|---|
| S1 | `CIRCLE_ENABLED=false` verified for store build | Done (flag) |
| S2 | Hardcoded billing gated via `mrpAllowHardcodedBilling` (Gradle) | Done — flip to `false` before production |
| S3 | Catalog / About / listing copy — no Circle as shipping feature | Done |
| S4 | Data Safety paste guide aligned to V1 | Done — paste in Console (P8-1) |
| S5 | `versionName` `1.0.0` / `versionCode` `1` | Done |

---

## Human / Console (do next)

### P8-1 — Data Safety
1. Open [Play Console → Data safety](https://play.google.com/console).
2. Paste answers from [`MRP/P7_PLAY_DATA_SAFETY_PASTE.md`](MRP/P7_PLAY_DATA_SAFETY_PASTE.md).
3. Short description (store listing):

> Device security monitoring with Panic SMS, SIM recovery, geofence, and optional encrypted Google Drive backup. Find your phone via emergency sync to your private Drive vault.

**Do not** claim Circle / live family map for v1.

### P8-2 — Billing (blocks paid production)
1. Pay Play Developer ($25) if needed.
2. Create SKUs `mrp_premium`, `mrp_premium_family`, `mrp_enterprise` (+ monthly/yearly).
3. License testers + Internal testing track.
4. Set `MRP/src/features/subscription/Subscriptions.json` → `"mode": "play"`.
5. Set `MRP/android/gradle.properties` → `mrpAllowHardcodedBilling=false`.
6. Upload signed **release** AAB (upload keystore — not debug).

### Build / upload
```bash
cd MRP/android
./gradlew bundleRelease
# Output: app/build/outputs/bundle/release/app-release.aab
```

Before production: generate a real upload keystore and replace `signingConfigs.release` (currently debug for local release smoke).

### Optional ops
- Blaze → deploy `api/functions` TTL schedule (P8-6-cf).
- Service account → `npm run test:jwt-live` (P8-3-sa).
- Deploy MRP Web after Monitoring changes: `firebase deploy --only hosting` from `MRP Web`.

### Deferred (Circle off)
- P8-7 two-device Circle E2E → v2 when `CIRCLE_ENABLED=true`.

---

## Store listing draft

| Field | Copy |
|---|---|
| Short (≤80) | Protect your Android phone — Panic, SIM alerts, geofence, encrypted Drive backup |
| Full | MRP watches for lock-screen misuse, SIM change, USB, and zone events on your device. Hold Panic to SMS recovery contacts. Optional encrypted backup goes only to your Google Drive app folder (PIN unlock). Web console decrypts your vault in the browser. Find-my-device uses emergency tracking into that vault — MRP does not keep a readable copy on our servers. Circle live share is not included in this release. |

Privacy policy URL: use your hosted policy (must match Data Safety).

---

## Acceptance (Internal testing)

- [ ] Install from Play Internal track
- [ ] Circle entry hidden; Panic / SIM / Geofence / Drive / Monitoring work
- [ ] Web Monitoring decrypt + Find-my-device
- [ ] Data Safety form Complete
- [ ] No hardcoded paid unlock on production build (`mrpAllowHardcodedBilling=false` + `mode: play`)
