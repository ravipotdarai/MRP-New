# Open phase items — Not started · Partial · Untested

Living tracker for work that is **not fully Done**.  
Source of acceptance criteria: [`PROJECT_IMPLEMENTATION_PLAN.md`](PROJECT_IMPLEMENTATION_PLAN.md) §8.

**Last updated:** 2026-08-01 (Web portal PathSync IA refresh — nav groups Home/Security/Hub/App Usage; Locate timeline icon+geo+fence+status+selfie; Find-my-device movement trail; Travel date path; Devices+Sync Policy under Hub)  
**Rule going forward:** When you finish or smoke-test an item, move it out of this file (or into the Done log at the bottom). When you start a new gap, add it here under the right status.

### Status meanings

| Status | Meaning |
|---|---|
| **Not started** | No meaningful implementation yet |
| **Partial** | Code or stub exists; plan pass criteria not fully met |
| **Untested** | Implemented enough to try, but formal/device/E2E pass not recorded |

Items that are **Done** (code + accepted) are listed only in the short Done log — not repeated in the open tables.

---

## P0 — Documentation

### Untested
| ID | Item | Notes |
|---|---|---|
| P0-5 | Peer review / stakeholder sign-off on data-class rules (A/B/C) | Docs exist; formal sign-off not recorded |

*(P0-1…P0-4 treated as Done.)*

---

## Security Center (mobile) — deferred after web

### Untested / not started
| ID | Item | Notes |
|---|---|---|
| SEC-CENTER | Security Advisor + Threat Analyzer + Report Fraud hub + Quick Tiles | Plan: [`SECURITY_CENTER_BACKLOG.md`](SECURITY_CENTER_BACKLOG.md). **Start only after web portal track.** No competitor branding in docs. |

---

## Security — Anti-clone & hardening (deferred)

### Not started
| ID | Item | Notes |
|---|---|---|
| SEC-AC | Anti-clone / client hardening | Full plan: [`ANTI_CLONE_HARDENING.md`](ANTI_CLONE_HARDENING.md). Start **after** MRP Web pending work; align with Play-signed AAB. Data-first → APK harden → detect/Integrity → evidence hash-chain → SQLCipher when schema stable. |

---

## Web — Portal parity

### Untested
| ID | Item | Notes |
|---|---|---|
| WEB-PARITY | MRP Web desktop companion | Plan: [`WEB_PORTAL_PARITY.md`](WEB_PORTAL_PARITY.md). Code shipped; Hosting deployed 2026-07-31 → https://mobileresilienceplatform.web.app. **2026-08-01 UI IA:** PathSync nav groups (Home / Security / Hub / App Usage); Locate & Timeline enriched (icon, geo, geofence, status, selfie); Find-my-device live trail; Travel date+path polish; Hub Devices + Sync Policy + Drive Sync + SIM Recovery stub; user-facing “vault” copy softened. Route smoke + interactive Google+PIN E2E still **manual**. pathsync.in still GoDaddy until DNS cutover. |

---

## P1 — Hub + Home UX

### Untested
| ID | Item | Notes |
|---|---|---|
| P1-5 | Subscribe hidden when paid | Needs check across Premium/Family/Enterprise |
| P1-7 | Panic SMS delivery to recovery contact | Device proof with real SMS |
| P1-8 | Panic rate limit (4th in 15 min) | Confirm message + block |
| P1-9 | Panic without contacts — clear error | Manual |
| P1-12 | Full regression (Security, App Usage, PIN) | After each major phase |

*(P1-1…P1-4, P1-6, P1-10, P1-11 largely shipped / smoke OK.)*

---

## P2 — Identity + PIN recovery

### Not started
| ID | Item | Notes |
|---|---|---|
| P2-3 | Device register `devices/{uid}/{deviceId}` via Nest API | Local device registry only today |
| P2-9 | NestJS auth guard (401/200 Firebase JWT) | Needs live Nest auth middleware + tests |
| P2-10 | Invalid JWT → 401 | Same |
| P2-11 | Multi-account Google picker → correct UID | Not formally built/verified |

### Partial
| ID | Item | Notes |
|---|---|---|
| P2-1 | Google Sign-In → Firebase UID | Works when Web client + SHA-1 OK; `ensureFirebaseAuth` added; Account shows Firebase UID |
| P2-5 | Recovery acknowledgment before Drive | **Wired** — Drive connect/backup rejects without `recovery_ack` |

### Untested
| ID | Item | Notes |
|---|---|---|
| P2-2 | Sign-out clears tokens; cloud gated | |
| P2-4 | 12-word recovery shown once at PIN setup | UI present (`RecoveryCodeSetupModal`) |
| P2-6 | PIN reset via recovery code | `ForgotPinScreen` |
| P2-7 | PIN reset via Google re-auth | |
| P2-8 | Forgot PIN — unrecoverable path | |

---

## P3 — Billing + entitlements

> See also [`docs/store/PLAY_BILLING_INCOMPLETE.md`](../store/PLAY_BILLING_INCOMPLETE.md). **Do not mark P3 complete** until Play Console is real.

### Not started
| ID | Item | Notes |
|---|---|---|
| P3-1 | Premium purchase (license tester) via Play | Hardcoded catalog workaround |
| P3-2 | Family purchase + invite seats | |
| P3-4 | Restore purchases after reinstall | Real Play restore |
| P3-5 | Cancel → period end → downgrade | |
| P3-9 | NestJS `GET /subscriptions/me` mirrors Play | |
| P3-10 | Admin Enterprise grant (API + Web) | Needs P6 admin |

### Partial
| ID | Item | Notes |
|---|---|---|
| P3-3 | Enterprise unlocks Circle | Hardcoded/Enterprise test path; not Play purchase |
| P3-6 | Offline grace 7 days | Logic may exist; Play-backed grace not verified |
| P3-7 | Grace expired → Free | |
| P3-8 | Circle gate non-Enterprise | Paywall exists; confirm on Free/Premium |
| P3-11 | FeatureGate unit tests | Tests exist; keep matrix complete vs plan |
| P3-12 | Free caps enforced | Partial enforcement; full matrix unproven |

### Untested
| ID | Item | Notes |
|---|---|---|
| P3-* (Play path) | All real IAP flows once `"mode": "play"` | Blocked on Play Developer Console setup |

---

## P4 — Enterprise Circle

> Detail E2E testing deferred to **end of project** (owner decision 2026-07-24).

### Not started
| ID | Item | Notes |
|---|---|---|
| P4-11 | Family guardian role | Catalog notes “later” |
| P4-15 | Panic → Circle FCM | Panic SMS only today |

### Partial
| ID | Item | Notes |
|---|---|---|
| P4-1 | Create per category + caps | App OK; Nest API stub only |
| P4-3 | Invite + accept | Invite **code** + Firebase directory; **no FCM/deep link** |
| P4-6 | Live map 2 devices | OSM UI + RTDB smoke (encrypted points); formal map E2E deferred |
| P4-8 | Battery adaptive | JS heuristic; not formal stationary/moving proof |
| P4-10 | Network reconnect | Publish backoff only |
| P4-12 | One-to-one 3rd member rejected | Client/native maxMembers; not Nest-authoritative |
| P4-13 | Leave / revoke consent | Local leave + revoke UI; full peer E2E deferred |
| P4-14 | TTL cleanup | Client ~15m filter/delete; **no Cloud Function** |

### Untested
| ID | Item | Notes |
|---|---|---|
| P4-2 | Non-Enterprise paywall on create | Code present |
| P4-4 | Mutual consent blocks live until both approve | Smoke only |
| P4-5 | E2E encryption (payload useless without key) | Crypto shipped; security review pending |
| P4-7 | Interval 20s / 1m / 10m ± jitter | UI wired |
| P4-9 | Share OFF removes relay node | Smoke only |

---

## P5 — Drive sync + geofence / privacy tracking

> **Privacy MVP:** Firebase = Auth + `device_config` only. Data = device + Drive.  
> Docs: [`MRP/DRIVE_SYNC.md`](MRP/DRIVE_SYNC.md), [`MRP/DEVICE_TRACKING.md`](MRP/DEVICE_TRACKING.md), [`api/firebase/INDEXES.md`](api/firebase/INDEXES.md).  
> Circle RTDB unchanged.

### Untested (mobile — code done; formal E2E optional)
| ID | Item | Notes |
|---|---|---|
| P5-2 | Backup encrypt | Includes liveLocation + Premium+ selfies in vault v2 |
| P5-3 | Same-device round-trip | Manual on Pixel recommended |
| P5-5 | PAUSED_QUOTA | Error path present |
| P5-7 | Denied Drive scope | Connect error path present |
| P5-G | Hub Geofence + distance + address parts | Soft zones; Premium gate |
| P5-S | Drive auto-sync (events / geofence / emergency) | No Firebase location payloads |
| P5-C | device_config policy (wifi/mobile/freq/emergency) | Local + RTDB config-only |

---

## P6 — NestJS API + Web

> Web app: [`MRP Web/`](MRP%20Web/) — Hosting https://mobileresilienceplatform.web.app  
> Privacy: Drive vault decrypt in browser; Firebase `device_config` + `admin_audit` only.

### Not started / deferred
| ID | Item | Notes |
|---|---|---|
| P6-5 | Web Circle live map | Deferred with Circle detail work |
| P6-9-play | Real Play subscription grant/revoke | Needs Play Console + Nest billing |
| P6-13 | Broader API integration tests | Smoke CI exists; expand later |

### Partial
| ID | Item | Notes |
|---|---|---|
| P6-1 | Nest hosted health | Local `/v1/health` + CI smoke; cloud host optional |
| P6-9 | Admin subscription notes | Audit notes only — not Play Billing |
| — | Circle / panic Nest modules | Stubs under `api/src/` |
| — | Nest Admin SDK RTDB write | Wired when `FIREBASE_SERVICE_ACCOUNT_JSON` / ADC set |

### Untested (implemented — E2E / manual)
| ID | Item | Notes |
|---|---|---|
| P6-2 | Web Google SSO → dashboard | Hosting live; verify OAuth origins |
| P6-3 | Web monitoring (Drive decrypt) | Client vault decrypt + timeline UI |
| P6-4 | Web reports CSV | From decrypted vault |
| P6-6 | Web devices list | Own + admin RTDB `device_config` metadata |
| P6-7 | Admin login / non-admin blocked | `NEXT_PUBLIC_ADMIN_EMAILS` |
| P6-8 | Admin user search | uid / accountEmail filter; no vault fields |
| P6-10 | Admin cannot open selfies / vault binary | No admin vault routes |
| P6-11 | CORS | Hosting origins in Nest default allowlist |
| P6-12 | Web/mobile OAuth scope parity | Code = `drive.appdata` only; confirm consent screen |
| P6-* | End-to-end with real Firebase + Drive | Manual on admin account |

---

## P7 — Polish + compliance

> Docs: [`MRP/PLAY_DATA_SAFETY.md`](MRP/PLAY_DATA_SAFETY.md), [`MRP/SECURITY_REVIEW_P7.md`](MRP/SECURITY_REVIEW_P7.md), [`MRP/P7_REGRESSION_CHECKLIST.md`](MRP/P7_REGRESSION_CHECKLIST.md).

### Deferred (explicitly out of P7 close)
| ID | Item | Notes |
|---|---|---|
| P7-4 | Play Data Safety form | **Deferred to end / P8** — paste guide: [`MRP/P7_PLAY_DATA_SAFETY_PASTE.md`](MRP/P7_PLAY_DATA_SAFETY_PASTE.md) |

### Partial (optional P8 UX)
| ID | Item | Notes |
|---|---|---|
| P7-3 | Map pinch zoom | Streets + colored paths OK (ArcGIS static). Pinch N/A; **Open in Google Maps** works |

*(P7-1, P7-2, P7-5…P7-10 accepted 2026-07-27 — see Done log.)*

---

## P8 — Store release readiness (in progress)

> Close deferred compliance + production blockers.  
> **Active track:** [`docs/store/STORE_V1_CHECKLIST.md`](../store/STORE_V1_CHECKLIST.md) · [`docs/store/P8_STORE_RELEASE.md`](../store/P8_STORE_RELEASE.md).

### Not started (Console / human)
| ID | Item | Notes |
|---|---|---|
| P8-1 | Play Data Safety form (was P7-4) | Paste from `MRP/P7_PLAY_DATA_SAFETY_PASTE.md` |
| P8-2 | Play Billing live (`"mode": "play"`) | See `docs/store/PLAY_BILLING_INCOMPLETE.md`; also set `mrpAllowHardcodedBilling=false` |
| P8-5 | Interactive Circle map (optional pinch) | Deferred — Circle off for v1 |
| P8-7 | Formal Circle 2-device E2E matrix | Deferred to v2 (`CIRCLE_ENABLED`) |
| P8-8 | Drive restore PIN smoke on clean device | Optional re-verify |

### Partial (code prep for store)
| ID | Item | Notes |
|---|---|---|
| P8-store | Store v1 checklist + billing gate + listing draft | **Started 2026-07-28** — Internal testing still needs Console steps |

### Ops follow-ups (code done; infra)
| ID | Item | Notes |
|---|---|---|
| P8-6-cf | Scheduled `purgeStaleCircleLive` on Firebase | Source in `api/functions` — deploy needs **Blaze** plan |
| P8-3-sa | Live ID token mint via Admin | `npm run test:jwt-live` needs `FIREBASE_SERVICE_ACCOUNT_JSON` / ADC file |

### Code ready hooks (shipped)
- V1 Drive-only + Circle flag off; Panic / Emergency / Geofence / SIM preserved
- P8-3 JWT guard + admin allowlist smoke passed
- P8-4 FCM registry + deep links + assetlinks (debug SHA)
- P8-6 Nest `POST /v1/admin/circle-live/purge` (+ CF source)
- Hardcoded billing gate: `BuildConfig.ALLOW_HARDCODED_BILLING` / `mrpAllowHardcodedBilling`

---

## Cross-cutting blockers (not a single P*-ID)

| Status | Item | Blocks |
|---|---|---|
| Partial | Play Console subscriptions + `"mode": "play"` | P3 complete, real money path |
| Partial | NestJS hosted + Firebase JWT guards | **P8-3 done** (smoke); live mint needs SA; host optional |
| Done (code) | FCM + deep links for Circle invites | **P8-4**; formal 2-device → P8-7 |
| Partial | TTL for `circle_live` | **Nest purge done**; scheduled CF awaits Blaze |
| Partial | Nest hosted + Play subscription admin | P6-1 cloud, P6-9-play |
| Untested | Formal Circle E2E matrix (deferred to project end) | P4 sign-off |

---

## How to maintain (from now on)

1. After implementing something → set status **Untested** (if it was Not started/Partial) or remove when accepted.
2. After a recorded pass (device/E2E/CI) → delete the row from this file and add one line to **Done log** below.
3. Do not mark a phase complete while any of its **critical** open items remain (see plan §9).
4. Keep [`docs/store/PLAY_BILLING_INCOMPLETE.md`](../store/PLAY_BILLING_INCOMPLETE.md) until Play is real.
5. Circle **detail testing** stays deferred per owner; keep P4 Untested/Partial rows until that pass.

---

## Done log (brief — accepted or smoke-accepted)

| Date | IDs / area | Note |
|---|---|---|
| 2026-07 | P0-1…P0-4 | Plan, env examples, subscription/Enterprise docs |
| 2026-07 | P1 core UX | Tabs, Hub, Subscribe, Panic hold, Guide |
| 2026-07 | P2 Account Google session | Sign-in UI + local prefs; Firebase link improved 2026-07-24 |
| 2026-07 | P3 FeatureGate + hardcoded catalog | Test-only billing mode |
| 2026-07-24 | P4 shell | Categories, paywall, invite code directory, consent, AES-GCM live, OSM map, Share OFF, intervals, RTDB rules |
| 2026-07-24 | P4 smoke | Publish invite + 2-device join + encrypted `circle_live` points observed |
| 2026-07-24 | P5 first slice | Hub Drive Sync; `drive.appdata`; AES-GCM PIN backup/restore; recovery-ack gate; Wi‑Fi only |
| 2026-07-24 | P5 mobile complete | Scope audit, purge old backups, pending_sync drain, new-device copy; P5-10 → P6 |
| 2026-07-26 | P5 privacy sync | Firebase config-only; device_live/event_feed denied; Drive vault v2 + emergency tracking |
| 2026-07-26 | P6 web scaffold | Independent `MRP Web/` Next.js — Auth, Drive decrypt, CSV, sync policy, admin gate |
| 2026-07-26 | P6 Hosting + doable pack | Firebase Hosting live; Devices/Admin RTDB; admin_audit; Nest CORS + optional Admin SDK; P6 CI smoke; P5-10 closed (appData only) |
| 2026-07-26 | P7 polish pack | FlashList timeline; Hub Reanimated; map pinch; bg location disclosure; panic/circle banners; promos; Data Safety + security + regression docs; health load script |
| 2026-07-26 | P7-10 | Nest local up; `npm run test:load-health` → 100/100 ok (~100ms avg); `firebaseAdmin: true` |
| 2026-07-27 | P7 close (excl. P7-4) | PIN 1111 unlock; all 5 Circle demos; peers ~10 km → meet phone; Home Circle banner; Hub promos/affiliates; Drive Connected (830+ events); P7-9 static security pass; P8 scaffold |
| 2026-07-27 | P7-1…P7-2, P7-5…P7-9 | Device/regression accepted — see `MRP/P7_REGRESSION_CHECKLIST.md` |
| 2026-07-27 | P8 start / P8-3 | Nest Firebase JWT global guard; device UID ownership; admin allowlist; auth smoke script; PushPort + TTL scaffolds |
| 2026-07-27 | P8-4 | FCM token RTDB registry; AdminPushPort; mrp:// + https deep links; Share invite links; web `/circle/join` |
| 2026-07-28 | P8-3/4/6 close | JWT smoke+admin allowlist; Admin SDK honest config; Nest circle_live purge; CF source (Blaze-blocked); assetlinks debug SHA |
| 2026-07-28 | V1 Drive-only | `CIRCLE_ENABLED=false`; privacy wording; Web themes + map/find-my-device/selfies; emergency min 1; see `docs/store/V1_DRIVE_ONLY_RELEASE.md` |
| 2026-07-28 | Store v1 start | `docs/store/STORE_V1_CHECKLIST.md`; billing hardcoded gate; version 1.0.0; listing/Data Safety paste aligned |

---

## Document history

| Date | Change |
|---|---|
| 2026-07-24 | Initial open-items tracker (Not started / Partial / Untested) for P0–P7 |
| 2026-07-27 | P7 regression excl. P7-4; add P8 store-release scaffold |
| 2026-07-27 | P8 kickoff — Nest JWT guards + release checklist doc |
| 2026-07-28 | Store v1 track — checklist + Play Console handoff |
