# Next version — deferred, removed, and restore notes

Living tracker for work **not in the current Play/v1 product**.  
Update this file when you ship, defer, or restore a feature.

**Current product:** Android app + Drive-only locate + PathSync web. Circle live share **off**. Billing **hardcoded** for testers.

Related: [`OPEN_PHASE_ITEMS.md`](OPEN_PHASE_ITEMS.md) (phase IDs), [`../store/V1_DRIVE_ONLY_RELEASE.md`](../store/V1_DRIVE_ONLY_RELEASE.md), [`../store/PLAY_BILLING_INCOMPLETE.md`](../store/PLAY_BILLING_INCOMPLETE.md).

---

## How to restore (do not rewrite from scratch)

| Feature | Flip / restore |
|---|---|
| Circle live share | `MRP/src/config/featureFlags.ts` → `CIRCLE_ENABLED = true`. Code stays under `MRP/src/features/circle/` + native Circle modules. Then run Circle 2-device E2E (P8-7). |
| Circle invite web landing | `CIRCLE_INVITE_LANDING_ENABLED = true` |
| SMS auto-scan | `SMS_AUTO_SCAN_ENABLED = true` in `featureFlags.ts` **and** `DigitalSafetyFlags.kt`. Register `SmsScamReceiver` + `RECEIVE_SMS` in the manifest (commented today). Automation Settings already shows the consent card when the flag is on. |
| Play Billing | `Subscriptions.json` → `"mode": "play"`; `mrpAllowHardcodedBilling=false`. See Play Billing doc. |
| USB Restriction | Git history (removed 2026-08-05). Needs **Device Owner** — not for consumer Play. |
| Network Guardian DNS VPN | Re-enable the local VPN path; UI categories already exist (`NetworkGuardianScreen`). |
| Family Circle guardian | `circleCatalog.ts` already notes “later”; implement role after Circle v2. |

Keep flags as the kill-switch. Prefer flag-on over copying old trees.

---

## Removed (not in this version)

| Item | Why | Kept |
|---|---|---|
| USB Restriction (Hub Premium+) | Consumer Android cannot enforce charge-only USB without Device Owner | USB **monitor** events + optional selfie |
| Duplicate `screens/MonitoringScreen.tsx` + `useMrpMonitoring` | Unused; live Setup tab is `features/monitoring/MonitoringScreen` | Live monitoring screen |
| Unused `features/graph/EventTimeline.tsx` | Never imported; Activity uses `TimelineScreen` | Timeline |
| Circle as a **store** feature | Privacy + E2E not signed off | Full Circle codebase, gated `CIRCLE_ENABLED=false` |
| About as a bottom tab | Hub / Guide only | About screen |
| Consumer Device Admin wipe/lock/reset | Play-unsafe | `watch-login` only + Find My Device + MRP soft wipe |

---

## Deferred — current version (v1)

Shipped as flag-off, stub, or Console/human work:

- **Circle** — create/join, live map, FCM invites, 2-device E2E, web Circle map, scheduled `circle_live` TTL (Blaze)
- **SMS auto-scan** — no `RECEIVE_SMS` until Play policy write-up; users paste in **Scam Check**
- **Play Billing** — catalog `mode: hardcoded`; no real money, restore, Family seats, or Nest Play mirror
- **Play Data Safety form** — paste guide exists; Console not filled by this repo
- **Network Guardian DNS VPN** — lists/toggles on device; actual VPN filter paused
- **Panic → Circle FCM** — Panic is SMS to recovery contacts only
- **Nest device registry + live JWT mint** — local device id; cloud register / SA JWT optional
- **Promotions / Affiliates tracking** — static links; Remote Config + referral Nest later
- **Anti-clone / Play Integrity / R8 / SQLCipher** — after Play-signed AAB + schema freeze
- **Crashlytics** — optional later
- **Web** — Circle/Subscriptions UI, Maps Platform, PDF (CSV exists), geofence **edit**, WebSocket live GPS
- **iOS** — not in this track

---

## Planned next version (v2+)

1. `CIRCLE_ENABLED=true` + 2-device E2E + invite landing + Family guardian + Panic→Circle
2. Real Play IAP + Family seats + Enterprise API grant
3. SMS auto-scan after Data Safety / `RECEIVE_SMS` justification
4. Network Guardian live DNS VPN
5. USB Restriction **only** on enterprise Device Owner builds
6. Security Center extras: Play Protect / wireless ADB / lock-screen notifs; women-safety preset; signed rule packs
7. Evidence hash-chain + web verify on export
8. Web Excel/PDF reports; `pathsync.in` DNS → Hosting

---

## Intentionally never (consumer)

- Commercial AV / cloud malware DB
- Blockchain app verifier
- Admin decrypt of another user’s Drive vault
- Full-device wipe/lock via consumer Device Admin
- Claiming Circle / live family map on the **v1** Play listing

---

## Dead-code cleanup (this pass)

Removed unused UI only. Native monitoring, photos, timeline, Circle (flagged), SMS heuristics for **paste** Scam Check, and Drive/Travel are unchanged.

| Deleted | Restore from |
|---|---|
| `MRP/src/screens/MonitoringScreen.tsx` | git |
| `MRP/src/hooks/useMrpMonitoring.ts` | git |
| `MRP/src/features/graph/EventTimeline.tsx` | git |

---

## Changelog

| Date | Change |
|---|---|
| 2026-08-16 | Created this file; removed unused Monitoring/EventTimeline duplicates; SMS Settings hides auto-scan card while flag is off |
