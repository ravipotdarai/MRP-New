# MRP Implementation Plan
## Bug Completion + SIM Change Recovery Alert + Offline GNSS

**Date:** 2026-07-18  
**Status:** Phase 1–5 implemented (2026-07-18). Drive sync still deferred.  
**Constraint:** Integrate with existing architecture — no redesign  
**Out of scope now:** Google Drive sync (listed under Future)

---

## 0. Current State (from code + graphify)

### Graph anchors (reuse, do not replace)

| Concept | Source | Role |
|---------|--------|------|
| Event write path | `TimelineEventLogger` → `TimelineStorage` → `EventDao` | All new events go here |
| SIM detect (partial) | `MrpMonitorService.handleSimStateChangeExplicit` + `SimStateReceiver` | Hook for recovery orchestration |
| Location | `LocationHelper` (Fused + last-known + geocode) | Extend for FixStatus / 30s GNSS |
| Selfie capture | `TakeSelfieOnEventUseCase` → `MrpMonitorService.requestPhoto` | Keep; JS matching fixed separately |
| App usage | `MrpNativeModule.getAppUsage` + `AppUsageTracker` | Bridge rewritten; tracker still legacy |
| Crypto pattern | `PinLockModule` EncryptedSharedPreferences | Reuse for recovery contacts |
| RN bridge | `MrpNativeModule` / `useNativeBridge` | Expose SIM recovery APIs |
| Settings UI | `MonitoringScreen` + `HomeScreen` overview stubs | Wire Recovery Contact |

### Working-tree partial fixes

| Area | ~Done | Verdict |
|------|-------|---------|
| Security header UI | 95% | Finish with visual QA |
| Selfie matching | 60% | Matcher exists; Gallery + naming gaps |
| App Usage data | 55% | On-demand UsageStats; ACTIVITY_* gap |
| Home address | 40% | UI shows address; geocode/source still weak |
| SIM Change Recovery | 0% | Only remove/insert logging today |
| Offline GNSS FixStatus | 0% | No FixStatus enum / 30s fresh / SMS payload |
| Google Drive | — | Explicitly deferred |

---

## Phase 1 — Finish bug fixes (ship first)

Goal: close the four reported bugs before starting the new feature.

### 1.1 Home — Current Location address

**Problem:** Live Location only shows address when `timeline[0].location.detailed_address` is set and not `"Address Unavailable (Offline)"`. Geocode often fails (needs network; API 33+ async geocode has a 500ms race in `LocationHelper.reverseGeocode`).

**Plan:**
1. Add `MrpNativeModule.getCurrentLocationWithAddress()` → `LocationHelper.getCurrentLocation` + robust reverse geocode (await API 33 callback properly, timeout ~2–3s, fallback to `"Lat: x, Long: y"`).
2. Home Live Location card: prefer live fetch; fall back to latest timeline entry with non-empty address.
3. Optional: when online, backfill `detailedAddress` on recent timeline rows that still say Unavailable.
4. Device-test offline (coords + lat/long label) and online (full street address).

**Files:** `LocationHelper.kt`, `MrpNativeModule.kt`, `HomeScreen.tsx`, `useNativeBridge.ts`

### 1.2 Selfie ↔ event matching

**Problem:** Old 180s nearest-photo attached lock/unlock (no selfie) to wrong events. Partial fix: `selfieMatcher.ts` (prefix + 20s) on Home + Timeline.

**Plan:**
1. Port `PhotoGallery.tsx` to `findMatchingSelfie` (still uses 180s time-only).
2. Align `NO_SELFIE_EVENTS` with real capture policy:
   - Confirm `SCREEN_LOCK` / `SCREEN_UNLOCK` never call `requestPhoto`.
   - Fix `WRONG_BIOMETRIC`: either remove from no-selfie set or stop capturing — today capture is enabled but matcher blocks.
3. Unify photo filename prefixes (`EVENTTYPE_yyyyMMdd_HHmmss.jpg` vs `intruder_*` from `Camera2Helper`) so prefix match works.
4. Validate window (20s vs lock-screen delay); adjust only with device evidence.
5. Unit tests for `selfieMatcher.ts` (no-selfie, WRONG_PASSWORD→WRONG_UNLOCK_ATTEMPT, window, wrong prefix).

**Files:** `selfieMatcher.ts`, `HomeScreen.tsx`, `TimelineScreen.tsx`, `PhotoGallery.tsx`, `Camera2Helper.kt` / save path in `MrpMonitorService`, `__tests__/selfieMatcher.test.ts`

### 1.3 App Usage — Dashboard / Timeline / Reports

**Problem:** DAO poll lost sessions; UI read empty `getEvents()`. Partial fix: on-demand `queryEvents` (24h) + `getTimeline` + photo count.

**Plan:**
1. In `getAppUsage`, handle **both** `ACTIVITY_RESUMED`/`ACTIVITY_PAUSED` (API 29+) **and** `MOVE_TO_FOREGROUND`/`MOVE_TO_BACKGROUND` (matches `AppUsageTracker`).
2. Accept a `rangeMs` / period arg (today / 24h / 7d / 30d) so Reports are not capped at 24h.
3. Dashboard: “Screen time today” = sessions overlapping today, not full query window.
4. Reports: aggregate by app (duration sum), not raw session sort for top/bottom.
5. Decide fate of background `AppUsageTracker` (disable write path if bridge is source of truth, or keep for enrichment only).
6. Permission-empty / multi-app QA checklist.

**Files:** `MrpNativeModule.kt`, `AppUsageScreen.tsx`, `AppUsageDashboard.tsx`, `AppUsageReports.tsx`, `AppUsageUtils.ts`, optionally `AppUsageTracker.kt`

### 1.4 Security header UI

**Problem:** Cluttered header + “MRP Timeline”.

**Plan:**
1. Visual QA on small widths (horizontal tabs already in `ScrollView`).
2. Remove unused `headerTitle` styles in `TimelineScreen` / `SecurityScreen`.
3. Mark done after QA.

**Files:** `SecurityScreen.tsx`, `TimelineScreen.tsx`

**Phase 1 exit criteria:** All four bugs verified on device; unit tests for selfie matcher green.

---

## Phase 2 — SIM Change Recovery foundation (domain + storage)

### 2.1 Models

Create under `domain/model/` (mirror existing style):

- `RecoveryContact` — name, phone, relationship, priority (1–3), verified, createdAt  
- `SimIdentity` — iccid, subscriptionId, carrier, simSlot, phoneNumber?, imsi?  
- `SimChangeEvidence` — device info + GPS + network + battery + timestamps  
- `GpsFixStatus` — `FreshFix | WarmFix | LastKnown | Cached | NoFix`  
- `GpsCapture` — lat/lng/accuracy/altitude/bearing/speed/provider/satellites/timestamp/fixStatus  

Event constants already include `SIM_CHANGE` in `TimelineEntry.EventTypes` — **use it** for identity mismatch (keep `SIM_REMOVED` / `SIM_INSERTED` / `SIM_LOCKED` for state transitions).

### 2.2 Encrypted SQLite tables

Extend `DatabaseHelper` (bump `DATABASE_VERSION`), plain SQLite for telemetry; **encrypt PII columns** (recovery phones) with Android Keystore AES (same MasterKey pattern as PIN) before insert — never log raw numbers.

| Table | Purpose |
|-------|---------|
| `recovery_contacts` | Max 3 contacts; phone ciphertext + mask display field |
| `sim_information` | Baseline enrolled SIM identity |
| `sim_change_events` | Evidence rows for each change |
| `events` | Existing — also emit timeline events |
| `pending_sync` | Queue rows for future Drive (write queue now; upload later) |

**Never** upload recovery phone numbers to Drive (even when Drive exists).

### 2.3 Repositories / storage

Pragmatic pattern (same as today): `*Storage` classes + optional interfaces in `Repositories.kt`.

- `RecoveryContactStorage` — CRUD, mask (`********4521`), max 3, consent flag  
- `SimInformationStorage` — get/set baseline  
- `SimChangeEventStorage` — insert evidence  
- `PendingSyncStorage` — enqueue `SIM_CHANGE` evidence (no Drive upload yet)

### 2.4 Use cases

- `EnrollSimBaselineUseCase` — on enable / first READY  
- `CompareSimIdentityUseCase` — ICCID + subscriptionId + carrier + slot  
- `CaptureOfflineGnssUseCase` — see Phase 3  
- `SendSimChangeSmsUseCase` — SmsManager + templates  
- `SimChangeRecoveryAlertUseCase` — orchestrator (detect → device info → GPS → store → SMS → queue sync → timeline + notify)

**Phase 2 exit criteria:** Unit tests for compare, encrypt/mask, SMS template generation (no Android device required for pure logic).

---

## Phase 3 — Offline GNSS location

Extend `LocationHelper` (do not replace):

```
Fresh GPS (max 30s, Fused HIGH_ACCURACY)
  → else LocationManager GPS_PROVIDER
  → else last known (Fused / LM)
  → else EventDao / in-memory cached coords
  → else NoFix
```

- Never block UI (coroutines / callback).  
- Store full `GpsCapture` + `FixStatus`.  
- Emit timeline side-events where useful: `GPS_CAPTURED`, `GPS_TIMEOUT`, `GPS_LAST_KNOWN`, `GPS_NO_FIX`.  
- Capture connectivity flags: internet / wifi / mobile data / BT / airplane / GPS enabled (for evidence, not for gating GPS).

**Phase 3 exit criteria:** Unit/integration tests for timeout → last-known → NoFix cascade.

---

## Phase 4 — Detection + SMS + background

### 4.1 Detection workflow

Wire **one** orchestrator into both paths:

1. `MrpMonitorService.handleSimStateChangeExplicit` (primary)  
2. `SimStateReceiver.handleSimStateChange` (when service not running)

Flow:

```
Boot / SIM_STATE_CHANGED / app restart
  → read current SIM identity
  → compare to stored baseline
  → if changed:
       collect device info + battery + network
       CaptureOfflineGnssUseCase (≤30s)
       store SimChangeEvents + Timeline SIM_CHANGED / SIM_INSERTED / SIM_REMOVED
       Send SMS to all recovery contacts
       queue PendingSync
       notifications
  → if first enroll / enable: store baseline only
```

Dual-SIM / eSIM: compare active subscription list; treat any ICCID set difference as change.

### 4.2 SMS

- Permission: `SEND_SMS` (+ existing `READ_PHONE_STATE` / numbers as available).  
- Graceful degrade if denied (still store evidence + notify “SMS Failed”).  
- Templates per spec (full + phone-unavailable / masked ICCID).  
- Events: `SMS_SENT` / `SMS_FAILED`.  
- **Mask phones in all logs.**

### 4.3 Device information capture

IMEI where permitted, Android ID, manufacturer/brand/model, Android version, battery %, charging, network type, SIM slot/carrier/phone/ICCID/IMSI/subscriptionId, UTC timestamp, timezone, locale.

### 4.4 Background

- Rely on existing `MrpMonitorService` FGS + presentation `BootReceiver` (do not add a parallel service).  
- Optional: WorkManager one-shot for SMS retry when `SMS_FAILED` and permission later granted.  
- Battery optimization: reuse `OemBatteryMitigation` / existing ignore-optimizations prompt.

### 4.5 Permissions + privacy

- Consent screen before enable (what / why / when SMS).  
- PermissionsScreen rows: SMS, phone state, location (already), notifications.  
- Disable anytime clears baseline optional keep / contacts keep encrypted until user deletes.

**Phase 4 exit criteria:** Device test: swap SIM offline → SMS received with coords; reboot still detects; deny SMS → evidence stored.

---

## Phase 5 — RN UI (Dashboard + Settings)

### Settings (Monitoring / Security)

- Enable/disable SIM Change Recovery (consent gate)  
- Manage up to 3 recovery contacts (name, phone, relationship, priority)  
- Test SMS  
- Export history / Delete history  
- Masked phone display only

### Dashboard (Home overview + optional Security panel)

- SIM Protection enabled  
- Recovery contacts count  
- Last SIM change / Last SMS  
- Current carrier / Current SIM (masked ICCID)  
- GPS status / Pending sync count  

Replace Home stubs:

```ts
{ label: 'Recovery Contact', ok: false }  // → real
{ label: '...Drive...', ok: false }       // stay false until Future
```

### Bridge methods (`MrpNativeModule`)

- `getSimRecoveryStatus` / `setSimRecoveryEnabled`  
- `getRecoveryContacts` / `saveRecoveryContact` / `deleteRecoveryContact`  
- `testRecoverySms`  
- `getSimChangeHistory` / `exportSimChangeHistory` / `deleteSimChangeHistory`  
- `enrollCurrentSimBaseline`

**Phase 5 exit criteria:** Full setup → test SMS → dashboard reflects state; numbers always masked in UI.

---

## Phase 6 — Testing + docs

### Unit

- SIM comparison (same / changed / dual / absent)  
- SMS template generation  
- GPS timeout / fallback / FixStatus  
- Repository encrypt + mask  
- `selfieMatcher` (from Phase 1)

### Integration

- SIM change end-to-end (instrumented / service test intents already exist: `com.mrp.TEST_SIM_*`)  
- Offline GPS cascade  
- SMS send (Robolectric or device)  
- PendingSync enqueue  
- Boot path

### Docs (create if missing)

- `SESSION.md` — session notes  
- `CHANGELOG.md` — user-facing changes  
- `BUGS.md` or update `MRP/BUGS_AND_MISSING_FEATURES.md`  
- This file kept current  
- Architecture / sequence / DB diagrams (mermaid in docs)

---

## Future — Google Drive only (do not implement now)

When online sync is scheduled:

| Upload path | Content | Notes |
|-------------|---------|-------|
| `Security/sim_changes.json` | Evidence **without** recovery phone numbers | Strip PII |
| `Events/event_xxxxx.json` | Timeline event payloads | |
| `Images/selfie.jpg` | If capture enabled | |
| `location.json` | Latest location | |

Also: drain `pending_sync` → mark `SYNC_COMPLETED`; never put recovery contacts on Drive.

---

## Recommended file map (new vertical slice)

```
android/.../com/mrp/
  domain/model/RecoveryContact.kt, SimIdentity.kt, GpsCapture.kt, ...
  domain/usecase/SimChangeRecoveryAlertUseCase.kt
  domain/usecase/CaptureOfflineGnssUseCase.kt
  domain/usecase/SendSimChangeSmsUseCase.kt
  domain/usecase/CompareSimIdentityUseCase.kt
  data/local/RecoveryContactStorage.kt
  data/local/SimInformationStorage.kt
  data/local/SimChangeEventStorage.kt
  data/local/PendingSyncStorage.kt
  # extend: DatabaseHelper, LocationHelper, MrpMonitorService,
  #         SimStateReceiver, MrpNativeModule, AndroidManifest

src/features/
  sim-recovery/   # Settings + Dashboard panels (or under monitoring/)
  # extend: HomeScreen, MonitoringScreen, PermissionsScreen, types, bridge

__tests__/
  selfieMatcher.test.ts
  simCompare.test.ts (or JVM tests under android/)
```

---

## Execution order

| Order | Work | Depends on |
|-------|------|------------|
| 1 | Phase 1.4 Security QA | — |
| 2 | Phase 1.2 Selfie completion + tests | — |
| 3 | Phase 1.3 App Usage ACTIVITY_* + ranges | — |
| 4 | Phase 1.1 Home live address | — |
| 5 | Phase 2 storage + models + unit tests | — |
| 6 | Phase 3 Offline GNSS | Phase 2 models |
| 7 | Phase 4 Detect + SMS + wire service/receiver | Phase 2–3 |
| 8 | Phase 5 UI + bridge | Phase 4 |
| 9 | Phase 6 docs + remaining tests | Phase 5 |
| — | Google Drive | Explicit future |

---

## Acceptance checklist (feature)

- [ ] Detect SIM change (identity, not only remove/insert)  
- [ ] Capture offline GPS (Fresh → LastKnown → Cached → NoFix)  
- [ ] Max 30s fresh wait; never block UI  
- [ ] Encrypted recovery contacts (max 3); masked UI; no log leak  
- [ ] Auto SMS with template; works Wi‑Fi/data off  
- [ ] Evidence in SQLite + timeline events  
- [ ] PendingSync queued (Drive upload deferred)  
- [ ] Works after reboot / app restart  
- [ ] Consent + disable anytime  
- [ ] Unit + integration tests  
- [ ] No placeholder / compiles  

---

## Risks

1. **ICCID access** restricted on newer Android — degrade to subscriptionId + carrier + number; document.  
2. **SMS permission** user denial — evidence must still persist.  
3. **SIM remove kills data** — GNSS must not depend on network; SMS may need new SIM registered — send as soon as READY.  
4. **App Usage ACTIVITY_* mismatch** — highest risk remaining bug if only MOVE_TO_* used on API 29+.  
5. **Geocoder offline** — address feature needs live fetch + non-network fallback label.
