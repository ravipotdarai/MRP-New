# Open phase items — Not started · Partial · Untested

Living tracker for work that is **not fully Done**.  
Source of acceptance criteria: [`PROJECT_IMPLEMENTATION_PLAN.md`](PROJECT_IMPLEMENTATION_PLAN.md) §8.

**Last updated:** 2026-07-24  
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
| P2-5 | Recovery acknowledgment before Drive | Recovery UI exists; Drive gate not fully wired (P5) |

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

> See also [`PLAY_BILLING_INCOMPLETE.md`](PLAY_BILLING_INCOMPLETE.md). **Do not mark P3 complete** until Play Console is real.

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

## P5 — Drive sync

### Not started
| ID | Item | Notes |
|---|---|---|
| P5-1 | OAuth scopes audit (`drive.appdata` / `drive.file` only) | Phase not started |
| P5-2 | Backup encrypt (ciphertext in Drive) | |
| P5-3 | Backup + restore same device | |
| P5-4 | Restore new device (same Google) | |
| P5-5 | Drive full → PAUSED_QUOTA | |
| P5-6 | Delete old MRP backups only | |
| P5-7 | Denied Drive scope — no crash | |
| P5-8 | Wi‑Fi only schedule | |
| P5-9 | `pending_sync` drain into backup manifest | |
| P5-10 | Web cannot list other Drive files | Depends on P6 web |

---

## P6 — NestJS API + Web

### Not started
| ID | Item | Notes |
|---|---|---|
| P6-2 | Web Google SSO → dashboard | No `web/` app yet |
| P6-3 | Web monitoring (Drive decrypt) | |
| P6-4 | Web reports CSV | |
| P6-5 | Web Circle live map | |
| P6-6 | Web devices list | |
| P6-7 | Admin login / non-admin blocked | |
| P6-8 | Admin user search (no vault fields) | |
| P6-9 | Admin subscription edit + audit | |
| P6-10 | Admin cannot open selfies / vault binary | |
| P6-12 | Web/mobile OAuth scope parity | |
| P6-13 | API integration tests in CI | |

### Partial
| ID | Item | Notes |
|---|---|---|
| P6-1 | API health | Nest `api/` scaffold exists; confirm `GET /health` in deploy |
| P6-11 | CORS | Configure when API is hosted |
| — | Circle / subscriptions / panic modules | Stubs under `api/src/` — not production control plane |

### Untested
| ID | Item | Notes |
|---|---|---|
| P6-1 | Deployed health check | After first host |

---

## P7 — Polish + compliance

### Not started
| ID | Item | Notes |
|---|---|---|
| P7-1 | Timeline FlashList FPS (500+ events) | |
| P7-2 | Hub Reanimated polish | |
| P7-3 | Circle map pinch zoom | |
| P7-4 | Play Data Safety form | |
| P7-5 | Background location disclosure | |
| P7-6 | Panic + Circle sharing indicators | |
| P7-7 | Promotions / affiliates (+ Remote Config) | Hub links may exist; RC optional |
| P7-8 | Full regression P1–P6 | |
| P7-9 | Security review (no vault in Firebase; narrow Drive) | |
| P7-10 | API load test (100 concurrent auth) | |

---

## Cross-cutting blockers (not a single P*-ID)

| Status | Item | Blocks |
|---|---|---|
| Partial | Play Console subscriptions + `"mode": "play"` | P3 complete, real money path |
| Partial | NestJS hosted + Firebase JWT guards | P2-3/9/10, P3-9, P4 API caps, P6 |
| Not started | FCM + deep links for Circle invites | P4-3 plan criteria |
| Not started | TTL Cloud Function for `circle_live` | P4-14 |
| Not started | Next.js `web/` + admin | P6, P5-10, P3-10 |
| Untested | Formal Circle E2E matrix (deferred to project end) | P4 sign-off |

---

## How to maintain (from now on)

1. After implementing something → set status **Untested** (if it was Not started/Partial) or remove when accepted.
2. After a recorded pass (device/E2E/CI) → delete the row from this file and add one line to **Done log** below.
3. Do not mark a phase complete while any of its **critical** open items remain (see plan §9).
4. Keep [`PLAY_BILLING_INCOMPLETE.md`](PLAY_BILLING_INCOMPLETE.md) until Play is real.
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

---

## Document history

| Date | Change |
|---|---|
| 2026-07-24 | Initial open-items tracker (Not started / Partial / Untested) for P0–P7 |
