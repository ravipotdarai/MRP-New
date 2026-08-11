# MRP Digital Safety — Implementation Plan

**Status:** Phase A implemented (A0–A5) — feasibility validated  
**Last updated:** 2026-08-10  
**Feasibility review:** `.cursor/plans/digital_safety_feasibility_78c62a74.plan.md`  
**Spec authority:** User-provided Digital Safety specification (Digital Will / Legacy **excluded**)  
**Brand source:** `assets/c__Users_manav_AppData_Roaming_Cursor_User_workspaceStorage_b67ac6e137ab398d5cddbc0992717ae7_images_App_design2-5b907571-c937-4adc-8edc-2faa3d2f46ba.png`

---

## 1. Executive summary

MRP already ships a strong **anti-theft evidence platform** (Watch → Capture → Sync → Review) plus **Security Center Phases 1–3** (Advisor, Threat Analyzer, Fraud hub, paste-based URL/QR/OTP/breach tools). The Digital Safety spec adds **active protection** (VPN DNS filtering, camera QR, share-intent Safe Link), **unified risk scoring**, **cellular anomaly detection**, **Emergency Card (ICE)**, and a **user secrets Secure Vault** (CRUD + encrypted Drive backup) — distinct from today’s **evidence vault**.

This plan groups existing and new capabilities under one product umbrella:

```
MRP DIGITAL SAFETY
├── PROTECT   — Network Guardian, Safe Link, Scam Protection, Cellular Security
├── MONITOR   — Security Timeline, Network/Cellular events, Risk scores
├── RECOVER   — Emergency Card, SIM Recovery, GPS Recovery, Drive Backup (existing)
└── SECURE    — Secure Vault (secrets CRUD), Encrypted Storage, Encrypted Drive Backup
```

**Non-negotiable:** Reuse Event Engine, Timeline, Drive chunk sync, PIN/Keystore auth. No parallel timeline DB. No plaintext vault on Firebase/Drive. No Digital Will.

---

## 2. Current-state audit (feature → code map)

| Spec module | Status | Existing implementation | Gap |
|---|---|---|---|
| **Safe Link Scanning** | Partial | `MRP/src/features/security-center/urlScan.ts`, `SecurityCenterScreen.tsx` TOOLS tab, `HomeScreen.tsx` Scan URL tile | Paste-only heuristics; no 0–100 score, redirect resolution, brand impersonation, share intent, reason-code policy engine, timeline events |
| **Network Guardian** | Partial | `BreachPostureScanner.kt` (`checkVpnActive`, proxy, Wi‑Fi crypto), Advisor UI | Detects *other* VPNs; no MRP `VpnService`, DNS lists, block counters, guardian dashboard |
| **Scam Protection** | Partial | `otpHeuristics.ts`, `breachEmailCheck.ts`, FRAUD hub, `AppRiskScorer.kt`, `SimChangeRecoveryAlertUseCase.kt` | Not unified; manual paste only; no `SCAM_DETECTED` events; no cross-signal risk engine |
| **QR Protection** | Partial | `urlScan.ts` Wi‑Fi QR parse; TOOLS paste | No camera scanner, no preview-before-open, no `QR_*` events |
| **Cellular Security** | Partial | SIM change events, `ussdCodes.ts`, `SimRecoveryPanel`, `MrpMonitorService` | No MCC/MNC/cell-id monitoring, anomaly score, debounced alerts |
| **Emergency Card** | None | Panic SMS, emergency monitoring, soft wipe (related recovery) | No ICE profile, per-field lock-screen visibility, medical/contacts card |
| **Secure Vault (secrets)** | None* | Evidence vault: `VaultBackupCrypto.kt`, `DriveVaultSync.kt`, web `vault-chunks.ts` | *Evidence vault is complete; spec vault (passport/Aadhaar/notes CRUD) does not exist |
| **Security Timeline integration** | Partial | `TimelineEntry.kt`, `CreateTimelineEntryUseCase.kt`, `TimelineEventLogger.kt` | Digital Safety scan events not emitted |
| **Web portal** | Partial | Dashboard reads `deviceHealth.security`; Drive unlock | No Digital Safety hub, no Safe Link/Guardian stats, no secrets vault |

**Security Center backlog:** Phases 1–3 marked **Done** in `docs/plans/SECURITY_CENTER_BACKLOG.md`.

---

## 3. Brand & design integration (from attached kit)

### 3.1 Extract assets from brand sheet

Source image contains logo, palette, typography, feature icons, and UI mockups. Slice into:

| Asset | Source region | Target path | Usage |
|---|---|---|---|
| Primary logo (stacked) | Top-left logo block | `MRP/assets/brand/logo-stacked.png` | Splash, onboarding, About |
| Logo horizontal | Logo variations row | `MRP/assets/brand/logo-horizontal.png` | Home header, web nav |
| App icon 512/192/48 | App icon grid | `MRP/android/app/src/main/res/mipmap-*/ic_launcher.png` | Play Store, launcher |
| Feature icons (8) | Feature icons row | `MRP/assets/brand/features/*.png` | Digital Safety hub tiles |
| Favicon | Favicon row | `MRP Web/public/favicon.ico`, `MRP Web/public/icon-192.png` | Web console |
| Play feature graphic | Bottom banner | `docs/store/feature-graphic.png` | Store listing |

**Tooling:** Export at 1×/2×/3× for RN `Image`; use WebP where Android allows; keep `@2x`/`@3x` in RN asset folders.

### 3.2 Design tokens (align with kit)

Add Google-inspired tokens alongside existing `theme.ts` (do not remove theme picker):

| Token | Value | Maps to existing |
|---|---|---|
| Google Blue | `#1A73E8` | `sky` / primary actions |
| Google Red | `#EA4335` | `red` / critical |
| Google Yellow | `#FBBC04` | `amber` / caution |
| Google Green | `#34A853` | `emerald` / safe |
| Onyx | `#202124` | dark text / midnight bg |
| Surface | `#F8FAFD` | light theme surface |

Typography: **Inter** (web already close); add Inter via RN `expo-font` or bundled TTF for headings. Body stays system/Roboto on Android.

### 3.3 UI surfaces to rebrand

1. **Home** — Replace generic greeting block with logo + tagline *"Your Mobile. Always Protected."*; quick tiles use feature icons from kit.
2. **Digital Safety hub** (new shell around Security Center) — Section headers PROTECT / MONITOR / RECOVER / SECURE with kit iconography.
3. **Safe Link result screen** — Premium card layout from mockup (trust indicator, domain, reasons, dominant safe action on CRITICAL).
4. **Web console** — Add Digital Safety nav group; reuse logo horizontal in `AppShell` header.

---

## 4. Target architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     MRP Digital Safety (RN UI)                   │
│  Hub: DigitalSafetyScreen → sub-screens per module               │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│              Unified Risk / Policy Engine (NEW)                    │
│  Kotlin: RiskPolicyEngine.kt  +  TS: riskPolicy.ts (mirror)      │
│  normalize → score → reason codes → action (allow/warn/block)    │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
 SafeLinkPipeline      NetworkGuardianService   QrScanPipeline
 CellularMonitor       ScamSignalAggregator     EmergencyCardStore
 SecureVaultRepository (secrets — NEW SQLite)
        │                    │                    │
        └────────────────────┼────────────────────┘
                             ▼
              CreateTimelineEntryUseCase / TimelineEventLogger
                             ▼
              TimelineStorage → DriveVaultSync (chunks)
                             ▼
              Security Center / Timeline UI / Web portal
```

**Two vault domains (critical distinction):**

| Domain | Purpose | Storage | Backup |
|---|---|---|---|
| **Evidence vault** (existing) | Timeline, selfies, GPS, app usage, deviceHealth | Native DB + Drive chunks | `DriveVaultSync`, `vault-chunks.ts` |
| **Secrets vault** (new) | User documents, recovery codes, secure notes | Encrypted SQLite + encrypted files dir | Separate Drive prefix `mrp_secrets_*` or encrypted blob in appData |

Reuse `VaultBackupCrypto.kt` patterns (AES-GCM, Keystore) but **separate DB file** and **never merge plaintext into evidence payload**.

---

## 5. Navigation — group under “MRP Digital Safety”

### 5.1 Mobile (`App.tsx` / Hub menu)

Rename Hub entry **Security Center** → **Digital Safety** (`digital-safety` route). Internal structure:

| Section | Screens | Reuses |
|---|---|---|
| **PROTECT** | Safe Link, Network Guardian, Scam Check, QR Scanner, Cellular Security | Extend Security Center TOOLS + new native screens |
| **MONITOR** | Security Timeline (link), Risk activity feed (new summary) | Existing Timeline tab |
| **RECOVER** | Emergency Card, SIM Recovery, Lost Mobile, Panic | `SimRecoveryPanel`, FRAUD lost-mobile, Home panic |
| **SECURE** | Secure Vault, Drive Sync status | New vault CRUD + existing `DriveSyncScreen` |

Keep bottom tab **Security** for anti-theft Setup / Timeline / Photos (unchanged).

`securityCenterNav.ts` → expand tabs or nest under Digital Safety:

```typescript
export type DigitalSafetySection = 'PROTECT' | 'MONITOR' | 'RECOVER' | 'SECURE';
export type DigitalSafetyTab =
  | 'HUB' | 'SAFE_LINK' | 'NETWORK_GUARDIAN' | 'SCAM' | 'QR' | 'CELLULAR'
  | 'EMERGENCY_CARD' | 'SECURE_VAULT';
```

Home quick tiles map 1:1 to PROTECT tools (kit icons).

### 5.2 Web (`AppShell.tsx`)

Add nav group **Digital Safety**:

- `/digital-safety` — summary dashboard (posture from `deviceHealth.security`, guardian stats when synced)
- `/digital-safety/timeline` — filter Digital Safety event types
- `/digital-safety/vault` — secrets vault (authorized unlock only; read-only metadata on web v1)

---

## 6. Shared Risk / Policy Engine (implement first)

Centralizes scoring for Safe Link, QR, Scam, Cellular.

### 6.1 Kotlin (`MRP/android/.../domain/risk/`)

```
RiskPolicyEngine.kt       — orchestrator
RiskScore.kt              — 0–100 + band enum
RiskReasonCode.kt         — enum + user-facing strings
RiskAction.kt             — ALLOW | WARN | BLOCK | INFO
UrlNormalizer.kt          — punycode, IDN, IP, short-link detect
BrandImpersonationChecker.kt
RedirectResolver.kt       — HEAD/GET with depth limit, timeout
DomainListMatcher.kt      — blocklist, ads, trackers, malware categories
```

### 6.2 TypeScript mirror (`MRP/src/features/digital-safety/risk/`)

Same types for RN UI preview; heavy work stays on native for share-intent / VPN paths.

### 6.3 Score bands (spec)

| Score | Band | UI |
|---|---|---|
| 0–19 | SAFE | Green trust indicator |
| 20–39 | LOW | Neutral + tips |
| 40–59 | SUSPICIOUS | Amber warning |
| 60–79 | HIGH | Strong warning |
| 80–100 | CRITICAL | Block-first UI |

Metadata in timeline events: `{ score, band, reasonCodes[], domainHash, action }` — **never full URL** in production logs; store truncated domain or hash.

---

## 7. Module implementation slices

### Slice A — Safe Link Scanner (extend existing)

**Reuse:** `urlScan.ts` heuristics → migrate into `RiskPolicyEngine`; `SecurityCenterScreen` TOOLS UI patterns.

**Add:**

| Layer | Work |
|---|---|
| Native | `SafeLinkModule.kt` — normalize, redirect resolve, brand check, optional Safe Browsing API (graceful offline) |
| Intent | `AndroidManifest.xml` `<intent-filter>` for `ACTION_SEND` text/plain; `SafeLinkShareActivity` |
| RN | `SafeLinkScreen.tsx` — result UI per spec §8; false-positive report → local allowlist file |
| Events | `SAFE_LINK_SCANNED`, `SAFE_LINK_ALLOWED`, `SAFE_LINK_WARNED`, `SAFE_LINK_BLOCKED` |

**Pipeline:** URL → `UrlNormalizer` → local rules → `DomainListMatcher` → redirect → brand → TI (optional) → score → action → event.

**Do not claim:** universal interception in all apps.

---

### Slice B — Network Guardian (new native service)

**Reuse:** `BreachPostureScanner.checkVpnActive` for conflict detection only.

**Add:**

| Component | Path |
|---|---|
| `NetworkGuardianVpnService.kt` | extends `VpnService`, DNS-only filtering |
| `DnsPacketHandler.kt` | parse DNS queries, match domain lists |
| `DomainListManager.kt` | curated lists, version, SHA-256 verify, local cache |
| `NetworkGuardianModule.kt` | RN bridge: enable/disable, stats, state |
| `NetworkGuardianScreen.tsx` | dashboard §11 |

**UX:** Explicit consent screen before first enable; conflict alert if another VPN active; never silent enable.

**Events:** `NETWORK_GUARDIAN_ENABLED`, `NETWORK_GUARDIAN_DISABLED`, `AD_BLOCKED`, `TRACKER_BLOCKED`, `MALICIOUS_DOMAIN_BLOCKED`.

**Counts only** — no full browsing history retention.

---

### Slice C — Scam Protection (unify existing)

**Reuse:** `otpHeuristics.ts`, `breachEmailCheck.ts`, `urlScan.ts`, FRAUD hub content.

**Add:**

| Work | Detail |
|---|---|
| `ScamSignalAggregator.kt` | Combine URL, OTP text, urgency keywords, UPI patterns |
| `ScamCheckScreen.tsx` | Manual message paste (baseline — no READ_SMS) |
| Policy | Same `RiskPolicyEngine`; emit `SCAM_DETECTED` with reason codes |
| SMS path | **Deferred** — only if Play eligibility confirmed; feature-flagged |

Wire QR and Safe Link outputs into aggregator for unified timeline view.

---

### Slice D — QR Protection (camera)

**Reuse:** Safe Link pipeline for URL QRs; `parseWifiQr` for Wi‑Fi QRs.

**Add:**

| Component | Detail |
|---|---|
| `QrScannerScreen.tsx` | `react-native-vision-camera` or `expo-camera` |
| Native decode | ML Kit barcode API optional for performance |
| Flow | Camera → decode → classify → preview destination → user confirm → Safe Link pipeline |
| Events | `QR_SCANNED`, `QR_BLOCKED` |

**Never:** auto-open payments, auto-execute QR actions.

---

### Slice E — Cellular Security (anomaly detection)

**Reuse:** SIM events in `MrpMonitorService`, `TimelineEventLogger`.

**Add:**

| Component | Detail |
|---|---|
| `CellularMonitor.kt` | `TelephonyManager` cell info listeners (API-level gated) |
| `CellularAnomalyScorer.kt` | weak signals → score; debounce roaming |
| `CellularSecurityScreen.tsx` | informational copy — no “IMSI catcher detected” claims |
| Events | `CELLULAR_ANOMALY_DETECTED` |

Monitor: MCC/MNC, LAC/TAC, network type, operator, signal, rapid changes.

---

### Slice F — Emergency Card (greenfield)

**Add:**

| Component | Detail |
|---|---|
| `EmergencyCardEntity.kt` + Room/SQLite | name, blood group, allergies, contacts, insurance, notes |
| `EmergencyCardStore.kt` | CRUD, per-field lock-screen visibility flags |
| `EmergencyCardScreen.tsx` | high-contrast editor + preview |
| Android | `DevicePolicyManager` / emergency info intent where supported |
| Events | `EMERGENCY_CARD_UPDATED` |

**Never** expose Secure Vault contents on lock screen.

---

### Slice G — Secure Vault secrets CRUD (greenfield)

**Reuse:** `VaultBackupCrypto.kt`, PIN lock from `DriveVaultModule`, biometric APIs, Drive `appDataFolder`.

**Add:**

| Component | Detail |
|---|---|
| `SecureVaultDatabase.kt` | encrypted metadata (SQLCipher or EncryptedFile + JSON index) |
| `SecureVaultRepository.kt` | CRUD, categories, expiry reminders |
| `SecureVaultFileStore.kt` | encrypted attachments on disk |
| `SecureVaultDriveSync.kt` | encrypted blob/chunk backup — separate from evidence chunks |
| `SecureVaultScreen.tsx` | category grid, item detail, biometric/PIN gate |
| Events | `VAULT_ITEM_*`, `VAULT_BACKUP_*`, `VAULT_AUTH_FAILED` |

Categories: passport, Aadhaar, PAN, insurance, certificates, invoices, warranty, photos, recovery codes, notes, custom.

Expiry reminders → local notification + timeline reminder event.

---

## 8. Event type additions

Add to `EventTypes` in `TimelineEntry.kt` and mirror in `HomeScreen.tsx` / `EventTimeline.tsx` icons:

```
SAFE_LINK_SCANNED | SAFE_LINK_ALLOWED | SAFE_LINK_WARNED | SAFE_LINK_BLOCKED
NETWORK_GUARDIAN_ENABLED | NETWORK_GUARDIAN_DISABLED
AD_BLOCKED | TRACKER_BLOCKED | MALICIOUS_DOMAIN_BLOCKED
SCAM_DETECTED
QR_SCANNED | QR_BLOCKED
CELLULAR_ANOMALY_DETECTED
EMERGENCY_CARD_UPDATED
VAULT_ITEM_CREATED | VAULT_ITEM_VIEWED | VAULT_ITEM_UPDATED | VAULT_ITEM_DELETED
VAULT_BACKUP_CREATED | VAULT_BACKUP_RESTORED | VAULT_BACKUP_FAILED | VAULT_AUTH_FAILED
```

**Metadata rules:** reason codes + truncated domain hash + counts; no OTP/CVV/passwords/document numbers.

Wire all modules through `CreateTimelineEntryUseCase` → existing Drive chunk flush.

---

## 9. Web portal work

| Page | Work |
|---|---|
| `/digital-safety` | Cards: posture, guardian stats, last scan summary from vault metadata |
| Timeline filters | Digital Safety event types + icons |
| `/digital-safety/vault` | Unlock gate → list secrets metadata (not file bytes on web v1 unless scoped) |
| Dashboard | Extend `deviceHealth.security` snapshot with guardian enabled, list versions, anomaly count |

Deploy via existing Firebase Hosting flow (`MRP Web`).

---

## 10. Implementation sequence (recommended)

| Phase | Deliverable | Depends on |
|---|---|---|
| **0** | Brand assets extracted; theme tokens; Home rebrand | — |
| **1** | Risk/Policy Engine (Kotlin + TS types); event constants | — |
| **2** | Safe Link v2 + share intent + timeline events + result UI | Phase 1 |
| **3** | Scan → event wiring for existing OTP/breach tools | Phase 1 |
| **4** | Network Guardian VPN + lists + dashboard | Phase 1 |
| **5** | QR camera scanner + Safe Link integration | Phase 2 |
| **6** | Scam aggregator UI | Phases 2–3 |
| **7** | Cellular monitor + anomaly UI | Phase 1 |
| **8** | Emergency Card CRUD | — |
| **9** | Secure Vault secrets CRUD + encrypted Drive backup | VaultBackupCrypto |
| **10** | Digital Safety hub nav + web portal | Phases 2–9 |
| **11** | Tests, device validation, graphify, docs | All |

After each phase touching architecture: `graphify update .`

---

## 11. Permissions matrix

| Feature | Permission | Notes |
|---|---|---|
| Safe Link share | None for paste; intent handler | No broad URL access |
| Network Guardian | `BIND_VPN_SERVICE` + user consent | Explain DNS-only |
| QR camera | `CAMERA` | Contextual rationale |
| Cellular | `READ_PHONE_STATE`, `ACCESS_FINE_LOCATION` (cell info) | API 29+ gated; degrade gracefully |
| Emergency Card | None for storage; lock-screen visibility | User-controlled |
| Secure Vault | Biometric / device credential | Reuse app PIN |
| SMS scam | **None in baseline** | Manual paste only |

Document all in Permissions Center (existing Security tab).

---

## 12. Testing plan

### Unit
- `UrlNormalizer`, score bands, brand impersonation, redirect depth limit
- `DomainListMatcher`, policy actions
- Cellular anomaly debounce
- Secure Vault encrypt/decrypt, CRUD, expiry math

### Integration
- Share URL → Safe Link → event → Drive chunk → web timeline
- VPN enable → DNS block → counter → event
- QR scan → warn → block payment URL
- Vault CRUD → encrypted backup → restore

### Security
- No plaintext in logs/SQLite/Drive
- Tampered backup rejected
- Vault auth lockout
- VPN conflict handling

### Device
- Pixel 6 Pro cellular + Wi‑Fi + guardian stress test
- Release APK with `GRADLE_USER_HOME=C:\g` on Windows

---

## 13. Definition of done (per spec §34)

- [ ] All scoped modules implemented or platform limits documented in UI
- [ ] Digital Will absent (no nav, models, placeholders)
- [ ] Existing MRP anti-theft features unchanged
- [ ] Safe Link works for supported intents + manual entry
- [ ] Network Guardian requires explicit consent
- [ ] Cellular framed as anomaly detection
- [ ] Emergency Card with per-field privacy
- [ ] Secure Vault full CRUD + encrypted at rest + Drive backup
- [ ] Digital Safety events in Timeline + Security Center
- [ ] Web Digital Safety summary live
- [ ] Tests pass; graphify updated; `DRIVE_SYNC.md` / this doc updated

---

## 14. AI agent implementation prompt template

When implementing a slice, each agent prompt must include:

1. **Objective** — slice ID + user-visible outcome  
2. **Existing code to reuse** — file paths from §2  
3. **Architecture changes** — new packages only where listed in §4  
4. **Data model** — entities, event metadata schema  
5. **Android APIs** — VpnService, TelephonyManager, Keystore, etc.  
6. **Permissions** — from §11  
7. **UI/UX** — brand tokens §3, loading/empty/offline/error states  
8. **Offline behavior** — cached lists, degraded TI  
9. **Security** — no plaintext, no secrets in events  
10. **Events** — types from §8  
11. **Tests** — from §12  
12. **Graphify** — run update after merge  
13. **Definition of done** — slice-specific checklist  

---

## 15. Explicit exclusions (reminder)

- Digital Will / Digital Legacy  
- Universal third-party app URL interception  
- HTTPS MITM content inspection  
- Definitive fake-cell-tower identification  
- Unrestricted SMS read/upload  
- Plaintext cloud vault  
- Replacing existing Event Engine or evidence vault architecture  

---

## 16. Quick reference — key files

| Area | Path |
|---|---|
| URL heuristics (extend) | `MRP/src/features/security-center/urlScan.ts` |
| Security Center UI | `MRP/src/features/security-center/SecurityCenterScreen.tsx` |
| Home tiles | `MRP/src/features/home/HomeScreen.tsx` |
| Posture scanner | `MRP/android/.../BreachPostureScanner.kt` |
| Event model | `MRP/android/.../TimelineEntry.kt` |
| Event write | `MRP/android/.../CreateTimelineEntryUseCase.kt` |
| Drive sync | `MRP/android/.../DriveVaultSync.kt` |
| Vault crypto | `MRP/android/.../VaultBackupCrypto.kt` |
| Web vault read | `MRP Web/src/lib/vault-chunks.ts`, `vault-session.tsx` |
| Backlog | `docs/plans/SECURITY_CENTER_BACKLOG.md` |
| Brand source | `assets/...App_design2-....png` |

---

## 17. Feasibility reality check (validated 2026-08-10)

**Will these features really work?** Yes — for **user-initiated** protection. Partially for VPN/cellular. No for omniscient auto-blocking.

| Module | Works reliably? | Honest user promise |
|---|---|---|
| Safe Link (paste + share) | **Yes** | "Check before you open" — not auto-block every app link |
| QR camera + preview | **Yes** | Preview destination; never auto-pay |
| Scam (paste) | **Yes** | Copy message into MRP — no silent SMS read |
| Emergency Card | **Yes** | In-app ICE; lock-screen varies by OEM |
| Secure Vault CRUD | **Yes** | Encrypted docs; separate from evidence vault |
| Timeline events | **Yes** | Reuse `CreateTimelineEntryUseCase` — proven pipeline |
| Network Guardian DNS | **Partial** | DNS filter when enabled; not 100% ad removal |
| Cellular anomaly | **Partial** | "Unusual network behavior" — never "fake tower detected" |
| Universal URL intercept | **No** | Excluded — Android sandbox |
| HTTPS MITM / auto SMS | **No** | Excluded — Play policy |

**Phasing by confidence:** A (95%+) → B (80%) → C (70%). See §18 below.

---

## 18. Phase A — first executable slice (detailed)

**Goal:** Ship highest-confidence Digital Safety value without VPN complexity.  
**Estimated scope:** 6 vertical slices (A0–A5), each independently compilable.

### A0 — Brand + hub shell

| Task | Files | DoD |
|---|---|---|
| Slice brand kit into assets | `MRP/assets/brand/*`, mipmap icons | Logo on Home; 8 feature icons on hub |
| Add Google design tokens | `MRP/src/shared/theme.ts` | Blue/Red/Yellow/Green tokens without breaking theme picker |
| Digital Safety hub screen | New `DigitalSafetyHubScreen.tsx`, Hub menu rename | PROTECT/MONITOR/RECOVER/SECURE sections; deep-link to existing Security Center tabs |

### A1 — Risk engine + events (foundation)

| Task | Files | DoD |
|---|---|---|
| Kotlin risk types | `MRP/android/.../domain/risk/RiskScore.kt`, `RiskReasonCode.kt`, `RiskPolicyEngine.kt` | 0–100 score, bands, reason codes |
| Extend `EventTypes` | `TimelineEntry.kt` | Add `SAFE_LINK_*`, `QR_*`, `SCAM_DETECTED`, `VAULT_*`, `EMERGENCY_CARD_UPDATED` |
| Native bridge | `MrpNativeModule.kt` or `DigitalSafetyModule.kt` | `logDigitalSafetyEvent(type, metadata)` → `CreateTimelineEntryUseCase` |
| TS types mirror | `MRP/src/features/digital-safety/risk/types.ts` | Shared with UI |
| Wire existing scans | `SecurityCenterScreen.tsx`, `urlScan.ts` | Every URL/OTP scan emits event with `{ score, reasonCodes, domainHash }` — no full URL in metadata |

### A2 — Safe Link v2 + share intent

| Task | Files | DoD |
|---|---|---|
| Migrate heuristics to engine | Refactor `urlScan.ts` → call native `RiskPolicyEngine` or shared scorer | 0–100 score + spec bands |
| Share intent activity | `SafeLinkShareActivity.kt`, `AndroidManifest.xml` intent-filter | Chrome Share → MRP → result screen |
| Premium result UI | `SafeLinkResultScreen.tsx` | Safe/caution/risky/critical layouts; "Why unsafe?" reasons |
| Redirect resolver (optional A2.1) | `RedirectResolver.kt` | Max depth 5, timeout 8s; graceful fail offline |

**Proof test:** Share URL from Chrome → score → timeline event → web sync.

### A3 — QR camera scanner

| Task | Files | DoD |
|---|---|---|
| Add barcode dependency | `package.json`, Gradle | ML Kit Barcode or `react-native-vision-camera` + code scanner |
| Scanner screen | `QrScannerScreen.tsx` | Camera preview, decode, show destination |
| Pipe to Safe Link | Reuse A2 pipeline | URL QR → preview → warn/block; Wi‑Fi QR → existing `parseWifiQr` |
| Block auto-payment | Intent filter guard | Never `startActivity` on `upi://` without explicit user tap |

**Proof test:** Scan UPI QR → preview only → no payment launched.

### A4 — Emergency Card

| Task | Files | DoD |
|---|---|---|
| Data model | `EmergencyCardEntity.kt`, Room or SQLite | name, blood, allergies, contacts, insurance, notes, field visibility flags |
| CRUD + UI | `EmergencyCardScreen.tsx` | Create/edit/delete; high-contrast preview |
| System integration (best-effort) | Android emergency info intent | Document OEM limits in UI |
| Event | `EMERGENCY_CARD_UPDATED` on save | No medical content in event metadata |

### A5 — Secure Vault (secrets)

| Task | Files | DoD |
|---|---|---|
| Encrypted DB | `SecureVaultDatabase.kt`, `SecureVaultRepository.kt` | Separate from timeline DB |
| File store | `SecureVaultFileStore.kt` | AES-GCM attachments via Keystore-wrapped key |
| CRUD UI | `SecureVaultScreen.tsx` | Categories, create/read/update/delete, PIN/biometric gate |
| Drive backup | `SecureVaultDriveSync.kt` | Prefix `mrp_secrets_*`; never plaintext; reuse `VaultBackupCrypto` patterns |
| Audit events | `VAULT_ITEM_*`, `VAULT_BACKUP_*` | No document numbers in events |
| Expiry reminders | Local notification + timeline | Passport/insurance/warranty lead times |

**Proof test:** Create item → hex-dump local files → no plaintext; restore from Drive.

### Phase A — definition of done

- [x] Digital Safety hub navigable from Home/Hub
- [x] Safe Link: paste + share intent + scored result UI
- [x] QR: camera scan + preview-before-open
- [x] All A1–A5 modules emit timeline events
- [x] Emergency Card CRUD works offline
- [x] Secure Vault CRUD + encrypted local + encrypted Drive backup
- [x] UI copy audited — no "blocks all scams/ads/links" language
- [x] `graphify update .` after Kotlin/TS changes
- [ ] Release APK smoke on Pixel 6 Pro (APK built; device offline at install time)

**Explicitly deferred to Phase B:** Network Guardian VPN, scam aggregator unification, web `/digital-safety` dashboard, cellular anomaly monitor.

---

## 19. Phase B/C summary (after A ships)

| Phase | Modules | Risk | Proof tests |
|---|---|---|---|
| **B** | Network Guardian `VpnService`, domain lists, dashboard, redirect polish, scam aggregator, web summary | VPN conflicts, battery, DoH bypass | Enable VPN → tracker domain blocked → counter increments |
| **C** | Cellular anomaly monitor, debounced alerts, web timeline filters | OEM API variance | Airplane toggle → one debounced event; no roaming spam |

---

## 20. Required UI copy (honest limits)

Use on every PROTECT screen footer or info sheet:

- **Safe Link:** *"Checks links you paste or share to MRP. Does not scan links opened in other apps unless you share them."*
- **Network Guardian:** *"DNS filtering reduces ads and trackers on many sites. Some ads and all HTTPS content inside apps may still appear."*
- **QR:** *"Always verify the destination before paying or entering passwords."*
- **Cellular:** *"Detects unusual network changes. Cannot confirm fake cell towers."*
- **Scam:** *"Paste suspicious messages to analyze. MRP does not read your SMS automatically."*
- **Secure Vault:** *"Documents encrypted on device and in Google Drive. MRP cannot recover your PIN."*
