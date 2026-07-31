# MRP Parity Changes — 2026-07-31

**Status:** In progress (overnight unattended)  
**PIN for E2E:** `1111`  
**Device:** Pixel 6 Pro (`1A111FDEE002J6`)  
**Web domain:** `https://pathsync.in` (also keep legacy Hosting URLs)

## Confirmed product defaults

| Item | Value |
|---|---|
| App Usage in Drive vault | **Daily only** (today’s sessions, non-system) |
| Emergency interval default | **1 minute** (only while Emergency / Find-my-device is ON) |
| Circle / geofence math / Play Billing / iOS | **Out of scope** |

## Battery / regression guardrails

- App Usage + Safety snapshots run **only inside Drive vault build** (or Safety screen pull-to-refresh) — **no new polling loops**.
- Normal Drive cadence stays ≥10 min; emergency 1 min applies **only** when `emergencyTracking == true`.
- Data-risk timeline events: **no selfie**; debounced like App Misuse.
- Do not change geofence distance heuristics.
- Existing selfie / timeline / SIM / Panic / lock-unlock no-selfie paths preserved.

## Deliverables

### Android
1. Vault schema **v3** additive fields: `appUsage`, `deviceHealth`, `geofences`, safety sections.
2. Emergency prefs default **1** min (Nest + Kotlin + Web Find-my-device).
3. App Usage → Safety: SMS / Camera / Mic sections (exclude system apps).
4. Data-risk timeline events (`DATA_RISK_APP`) — metadata only, no camera.
5. `pathsync.in` links in About / promo where web URL is shown.

### Web
1. CORS + docs + shell branding for `pathsync.in`.
2. Consume vault v3: App Usage + Safety + health banner.
3. Monitoring map / timeline / selfies polish (smooth UI, no Circle).
4. Deploy Hosting when credentials allow.

### Docs / Graphify
- This file + `graphify update .` after code changes.

## Acceptance smoke (Pixel + Web)

- [x] `installDebug` on Pixel; unlock with PIN 1111
- [ ] Drive Back up now → vault `version >= 3`, `appUsage.day` = today *(user: Hub → Drive Sync)*
- [x] Safety shows SMS/Camera/Mic sections in App Usage → Safety
- [x] Emergency default interval = 1 (prefs + Nest + Find-my-device)
- [x] Web build includes `/app-usage`; pathsync.in branding + CORS
- [x] Hosting deploy attempted (see changelog)
- [x] Lock/unlock still no selfie; App Misuse / DATA_RISK no selfie
- [x] Graphify rebuilt (6567 nodes)

## Changelog (implementation log)

- Created this plan doc.
- Vault v3: `appUsage` (daily), `deviceHealth`, `geofences`; built only at Drive sync.
- Emergency interval default **1** min (Kotlin prefs + Nest defaults). Find-my-device already used 1.
- Safety: SMS / Camera / Mic sections (non-system); native `getSensitivePermissionSections`.
- `DATA_RISK_APP` timeline rules (debounced 6h, no selfie); package-change + vault sync evaluate.
- Web: `pathsync.in` CORS/branding; App Usage page; monitoring health + usage teaser; map soft UI.
- Pixel: `app:installDebug` succeeded on `1A111FDEE002J6`.
- Graphify: 6567 nodes / 7364 edges.
- Web `npm run build` OK; Firebase Hosting deploy completed (exit 0).
- **CSP fix (2026-07-31):** allow `accounts.google.com` GSI script; stop production from calling `localhost:3000` Nest health (optional API).

## Remaining / optional

- Manual: Hub → Drive Sync → Back up now (PIN 1111) → https://pathsync.in → App Usage / Locate.
- Nest API cloud redeploy if production CORS still lacks pathsync (source defaults updated).
