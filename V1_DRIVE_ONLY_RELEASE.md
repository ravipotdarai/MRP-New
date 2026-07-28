# V1 release — Drive-only locate · Circle off · Web expand

**Status:** Active (2026-07-28)  
**Locate model:** **Option A — Drive-only** (encrypted vault on user’s Google Drive)  
**Circle:** Code retained; `CIRCLE_ENABLED = false` in `MRP/src/config/featureFlags.ts` (v2)

---

## 1. Privacy claim (canonical)

> MRP keeps your security data on **your device**. If you turn on backup, an encrypted copy goes only to **your private Google Drive app folder**, unlocked with your PIN. MRP does not sell your data and does not keep a readable copy of your vault on MRP servers. Optional Google sign-in is used for account features and sync policy only.

**Do not claim:** “we store no user data” or “zero collection.”

**Play Data Safety still declares:** location, photos, app activity, Auth UID — matching monitoring / Drive / Auth.

---

## 2. Circle kill-switch

| Flag | File |
|---|---|
| `CIRCLE_ENABLED = false` | `MRP/src/config/featureFlags.ts` |

**Gated:** Hub menu, Home banner, App FCM/deep links, `CircleScreen` unlock, About copy.

**Not deleted:** `CircleLiveModule`, Nest `/circles`, invite landing (optional QA flag).

### Preserved in v1 (not removed)

| Feature | Where |
|---|---|
| Panic SMS | Home hold-to-panic + banner |
| Emergency / Find-my-device | Hub Sync policy + Web Monitoring (interval min **1**) |
| Geofence | Hub → Geofence; Web shows vault fence events |
| SIM Change Recovery | Hub → SIM |
| Drive Sync / vault | Hub Drive + Web decrypt |
| Monitoring / Timeline / Selfies | Phone + Web Monitoring |
| App risk / breach posture | Home |

Only **Circle live share** is flagged off for Play v1.

---

## 3. Drive-only locate (Web)

1. Phone writes encrypted `liveLocation` (+ timeline / selfies) into Drive vault per `device_config`.
2. Web decrypts in-browser (PIN) — never sends plaintext to Nest/Firebase.
3. **Find my device** on Web sets `emergencyTracking` + shorter sync interval on RTDB `device_config/{uid}`.
4. Phone responds with GPS one-shots + Drive sync (mobile data allowed when policy says so).
5. Web refreshes vault / map until user cancels emergency.

Latency = sync frequency (minutes), not seconds. Honest UX required.

**Not in v1:** Multi-user Circle RTDB live; raw GPS on Firebase.

---

## 4. Security posture

| Control | Mechanism |
|---|---|
| Vault at rest | AES-GCM PIN-derived (PBKDF2 120k); Drive `appdata` only |
| Firebase | Auth + `device_config` policy; `device_live` / `event_feed` denied |
| Nest | Firebase JWT required; UID ownership; admin allowlist |
| Admin | Never receives vault bytes |
| Web | Decrypt client-side only; CSP / no vault in logs |
| Tamper | Release builds: Circle off; no hardcoded billing in production (`mode: play` when ready) |

“No one can hack/monitor through MRP” is a goal, not a guarantee — we harden custody (no MRP-readable vault) and authz. Device compromise / stolen PIN remains out of scope.

---

## 5. Battery (Pixel)

See `BATTERY_OPTIMIZATION_PLAN.md`. With Circle off, prioritize:

- Default emergency interval **5 min**; Find-my-device preset may use **1 min** (warns on battery)
- Observer debounce
- Balanced / Precise / Find presets via `device_config`

---

## 6. MRP Web themes

Theme IDs: `field` (default), `slate`, `dawn` — persisted in `localStorage`, toggled in shell.

---

## 7. Milestones

| ID | Deliverable |
|---|---|
| M1 | Circle flag + wording + Data Safety align |
| W1 | Map, selfies, paths, Find-my-device, sync presets |
| W2 | Geofence events + SIM history + event graph + auto-refresh on Web |
| Store | Play internal → production (no Circle claims) — [`STORE_V1_CHECKLIST.md`](STORE_V1_CHECKLIST.md) **started** |
| v2 | `CIRCLE_ENABLED = true` + P8 Circle E2E |

---

## Related

- [`SECURITY_V1.md`](SECURITY_V1.md)
- [`PLAY_DATA_SAFETY.md`](MRP/PLAY_DATA_SAFETY.md)
- [`MRP/DRIVE_SYNC.md`](MRP/DRIVE_SYNC.md)
- [`P8_STORE_RELEASE.md`](P8_STORE_RELEASE.md)
- [`BATTERY_OPTIMIZATION_PLAN.md`](BATTERY_OPTIMIZATION_PLAN.md)
