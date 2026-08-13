# MRP Digital Safety Plan

**Status:** Canonical implementation and go-live plan  
**Audience:** Product, engineering, QA, release, security review  
**Scope:** Mobile app first. Web parity follows after mobile feature completion.  
**Goal:** Deliver a production-ready Digital Safety product with complete subscription gating, consistent UX, maximum safe automation, and no knowingly missing released functionality.  
**Updated:** 2026-08-12 (IA: Hub kept, Vault tab removed, App Usage tab restored, DoD punch-list §10.1)

---

## 1. Executive decision

The fastest safe route to launch is **not** to keep extending the current fragmented navigation and tool set. The mobile app already has multiple overlapping entry points (`Home`, `Security`, `Hub`, `App Usage`, `Digital Safety` sub-routes), which increases both product confusion and implementation risk.

This plan therefore treats the work as **two parallel programs**:

1. **Product completion:** finish the partially implemented Digital Safety features and add the missing core systems.
2. **UX consolidation:** reorganize the mobile information architecture so the final product is understandable and claim-safe.

**Release principle:** no screen may ship with placeholder claims or silently missing behavior. If a feature is incomplete, it stays behind a feature flag and does not appear in subscriber-facing navigation.

**Automation principle:** automate everything that is technically reliable, privacy-minimized, and Play-safe; require explicit user action only where Android or policy prevents safe universal automation.

---

## 2. Current-state reality check

### 2.1 What exists today

- Safe Link heuristic scanning exists.
- Redirect resolution exists.
- QR camera scanning exists.
- OTP / scam paste heuristics exist.
- Security posture scanning exists.
- Secure Vault and Emergency Card exist in some form.
- Timeline events and Drive chunk sync pipelines already exist and are reusable.

### 2.2 What does **not** exist yet in production-ready form

- Real Network Guardian blocking stack
- Curated ad / tracker / malware / phishing rule-list system
- Threat-intelligence reputation feed integration
- Strong brand impersonation / typosquat detection
- Cellular anomaly monitor with debounced scoring
- Unified scam protection orchestration
- Fully coherent Digital Safety mobile UX
- Complete subscription entitlement enforcement across all Digital Safety surfaces

---

## 3. Product architecture to ship

### 3.1 Final mobile information architecture

**Approved bottom navigation (2026-08-12):**

1. **Home**
2. **Safety** (Digital Safety)
3. **Security**
4. **App Usage**
5. **Hub**

There is **no separate Vault tab**. Secure Vault lives under **Safety → Secure**. Drive Sync, geofence, subscriptions, and Key features live under **Hub**.

`Hub` remains a first-class tab for services, settings, Key features grid, and Drive Sync.

### 3.2 Final Digital Safety IA

Digital Safety (**Safety** tab) is structured as:

- **Protect**
  - Safe Link
  - Network Guardian
  - Scam Protection
  - QR Protection
  - Cellular Security

- **Monitor**
  - Security Advisor
  - Threat Analyzer
  - Timeline (→ Security tab)
  - Automation (clipboard opt-in, breach watch)

- **Recover**
  - Lost Mobile
  - SIM Recovery
  - Emergency Card
  - Panic (→ Home)

- **Secure**
  - Secure Vault (in-tab; no separate Vault tab)

**Hub** (separate tab) owns:

- Drive Sync
- Geofence
- Emergency monitoring
- SIM Recovery (also linked from Safety Recover)
- Subscriptions, Policy, About
- Key features grid (Device Protection → Safety tab)

### 3.3 Shared architecture layers

All features must route through these shared layers:

- `RiskPolicyEngine`
- `DomainListManager`
- `ThreatIntelProvider`
- `ScamSignalAggregator`
- `NetworkGuardianVpnService`
- `CellularAnomalyScorer`
- `SecureVaultRepository`
- existing `TimelineEventLogger` / `CreateTimelineEntryUseCase`
- existing `DriveVaultSync` event/chunk path

---

## 3.4 Automation strategy (maximum automation, no policy risk)

### Automation target

The product should default to **maximum safe automation**, with each source classified into one of three buckets:

1. **Automatic by default** — safe, consented, policy-friendly
2. **Automatic only after explicit opt-in** — privacy-sensitive but still defensible
3. **Manual by design** — platform/policy limits make background automation unsafe or misleading

### 3.4.1 Automatic by default

| Source | Automation mode | Why safe |
|---|---|---|
| Network / domain threats | DNS blocking through `NetworkGuardianVpnService` | User-consented VPN model, no content inspection |
| Rule-list refresh | Scheduled background update with signature/integrity checks | No user-content access |
| Guardian counters | Aggregate blocked counts only | Privacy-safe metrics |
| Known user-approved breach emails | Scheduled re-check | Explicit user enrollment, narrow scope |
| Device posture checks | Scheduled / app-resume scan | Already local-only and low risk |
| Safe Link from share intent | Auto-analyze immediately when user shares to MRP | User-initiated handoff |
| Deep-link Safe Link open | Auto-analyze incoming MRP deep link | Same app-owned context |

### 3.4.2 Automatic only after explicit opt-in

| Source | Automation mode | Guardrail |
|---|---|---|
| Clipboard URL detection | Foreground-only clipboard watcher, URL-only parse | Explicit opt-in, clear disclosure, no background history |
| Incoming SMS scam scan | Local-only on-device pattern scan | Ship only if final policy review says acceptable |
| Repeated breach checks | User must explicitly save emails for monitoring | Revocable enrollment |
| Guardian category personalization | Allowlist / custom blocklist | User-controlled only |

### 3.4.3 Manual by design

| Source | Reason |
|---|---|
| All URLs opened across all apps | Android does not allow reliable universal interception for normal apps |
| Mailbox content scanning | Excessive privacy/compliance scope for v1 |
| Background QR scanning | Requires camera behavior that is not appropriate for background protection |
| Universal message/app-content scanning via Accessibility/OCR | Too privacy-sensitive and difficult to defend for launch |
| HTTPS content inspection / MITM | Out of scope, high trust and policy risk |

### 3.4.4 Product promise

Go-live wording should be:

- **Automatic protection where Android allows**
- **Manual scan where privacy or platform limits apply**

Never claim:

- "MRP scans everything automatically"
- "all links across all apps are intercepted"
- "all emails/SMS are monitored automatically"
- "fake towers are definitively detected"

---

## 4. Subscription model

### 4.1 Commercial principle

Feature gating must be **capability-based**, not screen-based. A locked feature can still appear in navigation if product wants discoverability, but all protected actions must enforce entitlement at execution time.

### 4.2 Capability matrix

| Capability | Free | Basic | Premium | Family | Enterprise |
|---|---:|---:|---:|---:|---:|
| Safe Link manual scan | Yes | Yes | Yes | Yes | Yes |
| Safe Link share-to-MRP auto scan | Yes | Yes | Yes | Yes | Yes |
| Clipboard URL scan (opt-in) | No | Yes | Yes | Yes | Yes |
| QR scan + preview | Yes | Yes | Yes | Yes | Yes |
| Scam paste check | Yes | Yes | Yes | Yes | Yes |
| SMS scam auto-scan (opt-in, local only) | No | No | Yes | Yes | Enterprise policy |
| Security Advisor | Yes | Yes | Yes | Yes | Yes |
| Threat Analyzer | Limited | Yes | Yes | Yes | Yes |
| Scheduled email breach re-check | No | Yes | Yes | Yes | Yes |
| Timeline retention | Limited | 30d | 90d | 180d | Policy-based |
| Lost Mobile / emergency locate | No | Limited | Yes | Yes | Yes |
| SIM Recovery automation | No | Yes | Yes | Yes | Yes |
| Secure Vault CRUD | No | Limited | Yes | Yes | Yes |
| Secure Vault backup / restore | No | No | Yes | Yes | Yes |
| Network Guardian | No | No | Yes | Yes | Yes |
| Guardian allowlist / category controls | No | No | Yes | Yes | Yes |
| Family shared safety views | No | No | No | Yes | Optional |
| Enterprise admin policy | No | No | No | No | Yes |

### 4.3 Entitlement contract

Create and enforce these internal capabilities:

- `safeLinkManual`
- `safeLinkShare`
- `clipboardUrlScan`
- `qrProtection`
- `scamCheck`
- `smsScamAutoScan`
- `securityAdvisor`
- `threatAnalyzer`
- `breachEmailMonitoring`
- `timelineRetentionDays`
- `lostMobile`
- `simRecovery`
- `secureVault`
- `secureVaultBackup`
- `networkGuardian`
- `guardianCustomRules`
- `familySharing`
- `enterpriseControls`

### 4.4 Gating rules

Every gated feature must enforce at four levels:

1. navigation visibility
2. CTA enabled/disabled state
3. native action execution
4. timeline / sync behavior where applicable

### 4.5 Recommended default automation by plan tier

The table below defines the **default** automation stance per subscription tier. "Default" means what the product enables or recommends out of the box, not what the user can later toggle.

| Automation surface | Free | Basic | Premium | Family | Enterprise |
|---|---|---|---|---|---|
| Safe Link share-to-MRP auto analysis | On | On | On | On | On |
| Deep-link Safe Link auto analysis | On | On | On | On | On |
| Manual Safe Link paste scan | On | On | On | On | On |
| Clipboard URL detection | Off | Off by default, available as opt-in | Off by default, available as opt-in | Off by default, available as opt-in | Admin/default-policy controlled |
| Scheduled device posture scan | On | On | On | On | On |
| Security Advisor app-resume refresh | On | On | On | On | On |
| Scheduled breach-email monitoring | Off | Off by default, available after email enrollment | On after email enrollment | On after email enrollment | Policy controlled after enrollment |
| QR destination analysis after scan | On | On | On | On | On |
| Payment QR manual-open protection | On | On | On | On | On |
| Network Guardian DNS blocking | Off | Off | On after explicit consent | On after explicit consent | On after explicit consent or admin policy |
| Rule-list background refresh | Off | Off | On | On | On |
| Guardian category toggles | Off | Off | On | On | Policy controlled |
| Guardian allowlist/blocklist | Off | Off | On | On | Policy controlled |
| SMS scam auto-scan | Off | Off | Off by default, feature-flagged opt-in only after policy approval | Off by default, feature-flagged opt-in only after policy approval | Disabled unless compliance/policy explicitly approves |
| Cellular anomaly monitoring | Off | Limited manual surface | On (informational) | On (informational) | On (informational or policy controlled) |

### 4.6 Tier-default design rules

- **Free:** only obvious, user-driven protection; no background content-oriented automation.
- **Basic:** adds convenience automation that stays narrow and user-enrolled, such as breach re-checks.
- **Premium / Family:** adds the strongest safe automation, especially guardian-based network protection.
- **Enterprise:** same protection base as Premium, but all automations must be overrideable by admin policy and compliant with organization rules.

---

## 5. UX consistency remediation program

### 5.1 Problems to fix before launch

1. **Overlapping product surfaces**  
   Users cannot easily tell when they should go to `Security`, `Hub`, `Digital Safety`, or `App Usage`.

2. **Indirect navigation**  
   Several Digital Safety features still depend on older Security Center tabs and hidden internal routing.

3. **Inconsistent interaction models**  
   Some tools use scan-first, some paste-first, some nested tabs, some cards, and some deep-links into old shells.

4. **Mixed terminology**  
   "Security Center", "Digital Safety", "Advisor", "Fraud", "Hub", and "Secure Vault" are not consistently positioned in user language.

### 5.2 UX design rules

- one product area = one home surface
- one tool = one clear CTA
- all scan results use one shared result framework
- all risk results use the same severity bands
- all automation toggles explain **what is scanned, when, and where data stays**
- every screen includes:
  - what it does
  - what it stores
  - what the user should do next

### 5.3 Mandatory mobile UX outputs

- new bottom nav structure
- Digital Safety landing shell
- shared `RiskResultCard`
- shared `ProtectionActionBar`
- shared empty/error/offline states
- subscription-locked states with explanation
- shared `AutomationConsentCard` and `AutomationStatusRow`
- no hidden tab switching for primary Digital Safety flows

---

## 6. Delivery model

### 6.1 Workstreams

Run these workstreams in parallel:

1. **Architecture & contracts**
2. **Navigation / UX shell**
3. **Safe Link / QR / Scam**
4. **Network Guardian**
5. **Cellular Security**
6. **Vault / Emergency**
7. **QA / Release**

### 6.2 Release strategy

Ship in three controlled mobile releases:

- **R1:** UX foundation + Safe Link + QR + Scam + Security Advisor + Vault + Emergency Card
- **R1.1:** Network Guardian DNS blocker + dashboard + rule lists
- **R1.2:** Cellular anomaly monitoring + threat intel enhancements + impersonation hardening

This avoids waiting for the hardest platform-dependent work before shipping real user value.

---

## 7. 8-week execution plan

The timeline below assumes:

- one senior mobile lead
- one Android/native engineer
- one RN/UI engineer
- one QA / release engineer
- one part-time product/design owner

If staffing is lower, keep the order but increase duration.

### Week 1 — product freeze + UX architecture

**Objectives**
- finalize claims, entitlement matrix, and mobile IA
- stop exposing misleading partial features

**Tasks**
- audit all user-facing labels and replace unsafe claims
- freeze subscription capability matrix
- define final bottom nav and Digital Safety section map
- remove duplicate feature entry points from go-live routes
- define `RiskBand`, `RiskAction`, `GuardianState`, and event metadata schema
- define automation policy matrix: automatic / opt-in / manual

**Owners**
- Product/design
- Senior architect
- Mobile lead

**Acceptance**
- approved nav blueprint
- approved capability matrix
- approved risk/event schema
- approved automation matrix
- go-live copy review complete

### Week 2 — UX shell implementation

**Objectives**
- implement navigation simplification and Digital Safety shell

**Tasks**
- replace current bottom nav with final structure
- move `Hub` responsibilities into settings/profile shell
- make `Digital Safety` first-class destination
- add shared screen shell for Protect/Monitor/Recover/Secure sections
- create shared result card and severity tokens
- add subscription lock-state components
- add automation settings surface with clear consent copy

**Owners**
- RN/UI engineer
- Mobile lead

**Acceptance**
- no hidden tab-based routing for primary Digital Safety actions
- all Digital Safety tools launch from one coherent shell
- visual consistency pass complete
- automation controls are understandable and revocable

### Week 3 — Risk foundation

**Objectives**
- create production scoring and normalization foundation

**Tasks**
- implement `UrlNormalizer.kt`
- extend `RiskPolicyEngine.kt`
- add `RiskReasonCode` contract
- mirror types in TypeScript
- define retention-safe URL metadata policy
- wire new event constants through timeline model and icon map
- define source tags for `manual`, `shared`, `clipboard`, `sms_auto`, `guardian_dns`

**Owners**
- Android/native engineer
- Senior architect

**Acceptance**
- normalized URL output contract stable
- score bands stable
- event payloads exclude full sensitive URLs
- automation source metadata is available without storing sensitive content

### Week 4 — Safe Link completion

**Objectives**
- turn Safe Link from heuristic tool into complete mobile feature

**Tasks**
- upgrade redirect analysis
- add share-intent flow
- add local allowlist
- add better domain / structure checks
- connect result screen to timeline events
- connect subscription gating where needed
- add foreground-only clipboard URL detection behind explicit opt-in

**Owners**
- Android/native engineer
- RN/UI engineer

**Acceptance**
- paste scan works
- share-to-MRP works
- redirect depth/timeouts enforced
- allowlist works
- timeline events emitted correctly
- clipboard auto-detection can be enabled/disabled and never stores clipboard history

### Week 5 — QR + Scam unified flow

**Objectives**
- unify QR, URL, and scam checks into one coherent protection flow

**Tasks**
- route URL QR through Safe Link
- route payment QR through warning/manual-open flow
- build `ScamSignalAggregator.kt`
- create `ScamCheckScreen.tsx`
- unify result presentation and reason codes
- emit `SCAM_DETECTED`, `QR_SCANNED`, `QR_BLOCKED`
- add scheduled breach re-check for user-approved emails
- add optional local-only incoming SMS scam scan only if final policy review approves it

**Owners**
- RN/UI engineer
- Android/native engineer

**Acceptance**
- URL QR and payment QR behave differently but consistently
- scam tool produces unified results
- no auto-open of risky/payment destinations
- breach monitoring is enrollment-based and revocable
- SMS automation remains feature-flagged until policy sign-off is recorded

### Week 6 — Network Guardian MVP

**Objectives**
- deliver first production blocker stack

**Tasks**
- implement `NetworkGuardianVpnService.kt`
- implement DNS packet handling
- build `DomainListManager.kt`
- define signed list manifest + integrity verification
- local cache with version/update time
- counters for blocked ads/trackers/malware/phishing/scam
- category toggles + allowlist
- dashboard with guardian state
- background rule-list refresh with integrity verification

**Owners**
- Android/native engineer
- Senior architect
- QA

**Acceptance**
- explicit user consent required
- DNS-only blocking works
- another active VPN is detected and handled
- counters update
- rule list metadata visible
- automatic rule refresh does not require user content access

### Week 7 — Cellular Security + Vault hardening

**Objectives**
- deliver anomaly monitoring MVP and harden secure data features

**Tasks**
- implement `CellularMonitor.kt`
- implement `CellularAnomalyScorer.kt`
- baseline operator/network behavior
- add informational anomaly UI
- harden Secure Vault CRUD, backup/restore, expiry reminders
- verify Emergency Card privacy controls

**Owners**
- Android/native engineer
- RN/UI engineer

**Acceptance**
- anomaly monitoring uses safe language
- no false claim of fake tower detection
- Secure Vault backup/restore succeeds on-device
- Emergency Card respects field privacy

### Week 8 — stabilization and release

**Objectives**
- validate, fix, and ship

**Tasks**
- regression across Home / Security / Digital Safety / Vault
- device validation on Pixel + Samsung + low-end Android
- battery/foreground/VPN conflict testing
- privacy log audit
- release candidate build
- documentation refresh
- go-live checklist sign-off

**Owners**
- QA
- Mobile lead
- Release engineer
- Senior architect

**Acceptance**
- no P0/P1 open bugs
- release notes and claim matrix approved
- store-safe wording approved
- launch feature flags set

---

## 8. Detailed feature completion plan

## 8.1 Safe Link

### Required deliverables
- full normalization pipeline
- redirect-safe analysis
- allowlist
- share intent
- clipboard opt-in automation
- result UI
- timeline events
- retention-safe metadata

### Required files / modules
- `domain/risk/UrlNormalizer.kt`
- `domain/risk/BrandImpersonationChecker.kt`
- `domain/risk/DomainListMatcher.kt`
- `DigitalSafetyModule.kt`
- `SafeLinkResultScreen.tsx`

### Acceptance
- no unsafe URL handling regressions
- scans work offline with local heuristics
- online reputation can enrich but not block app usage if unavailable
- share automation is on by default for explicit MRP share flows
- clipboard automation is foreground-only and explicit opt-in

## 8.2 Network Guardian

### Required deliverables
- DNS-only VPN blocker
- signed rule lists
- local cache
- category toggles
- allowlist
- dashboard
- aggregate counters only

### Required files / modules
- `NetworkGuardianVpnService.kt`
- `DnsPacketHandler.kt`
- `DomainListManager.kt`
- `NetworkGuardianModule.kt`
- `NetworkGuardianScreen.tsx`

### Acceptance
- guardian state machine exposed cleanly
- no browsing-history retention
- no silent auto-enable

## 8.3 Scam Protection

### Required deliverables
- shared scam reason codes
- unified URL + QR + OTP aggregation
- scheduled breach-email monitoring
- optional local-only SMS auto-scan path
- user remediation guidance
- event logging

### Acceptance
- no OTP/CVV/password retention
- no inbox-reading requirement in baseline
- all outputs use same risk model
- breach monitoring requires user enrollment
- SMS auto-scan cannot ship without documented policy review

## 8.4 QR Protection

### Required deliverables
- camera scanner
- preview-before-open
- Safe Link integration
- payment QR manual-open protection

### Acceptance
- never auto-open payment links
- URL QR and Wi-Fi QR clearly separated in UI
- QR remains user-triggered by design; no background camera promise

## 8.5 Cellular Security

### Required deliverables
- anomaly baseline
- anomaly scoring
- UI explanation
- timeline events

### Acceptance
- alerting is debounced
- copy says "anomaly" / "unusual behavior", not "fake cell tower detected"
- no attempt to market cellular automation as definitive surveillance/interception

## 8.6 Secure Vault / Emergency Card

### Required deliverables
- full CRUD
- auth gating
- encrypted backup/restore
- expiry reminders
- privacy-safe eventing

### Acceptance
- no plaintext in logs, SQLite, or Drive
- per-field privacy works

---

## 9. Testing strategy

### 9.1 Unit tests

- URL normalization
- redirect depth and timeout
- local list matching
- allowlist precedence
- clipboard URL detection foreground behavior
- risk band scoring
- QR routing logic
- scam phrase scoring
- cellular anomaly debounce
- vault encryption / decryption / CRUD

### 9.2 Integration tests

- paste URL -> result -> event
- share URL -> result -> event
- clipboard URL -> opt-in detect -> result -> event
- QR -> result -> event
- guardian enable -> DNS block -> counter
- allowlist override
- secure vault backup -> restore
- enrolled email -> scheduled breach check -> notification/event
- SMS auto-scan path only if feature flag is enabled in policy-approved builds

### 9.3 Device tests

- Pixel 6/7
- Samsung One UI
- low-end Android device
- Wi-Fi, cellular, airplane, VPN conflict cases

### 9.4 Security validation

- no plaintext secrets in logs
- no raw sensitive URLs in timeline metadata
- list integrity verification works
- tampered vault backup rejected
- VPN conflict handling is deterministic
- clipboard text is never retained beyond immediate URL extraction
- SMS auto-scan, if enabled, remains local-only and non-uploading

---

## 10. Go-live checklist

- [x] Mobile IA finalized and implemented (Home · Security · Hub · Safety · Usage)
- [x] Subscription capabilities enforced at navigation + action layers
- [x] Safe Link complete and claim-safe *(copy + labels; human listing sign-off still required)*
- [x] Safe Link automation matrix implemented (share default, clipboard opt-in)
- [x] QR complete and claim-safe *(copy; human listing sign-off still required)*
- [x] Scam Protection baseline complete *(copy; human listing sign-off still required)*
- [x] Enrolled breach-email monitoring complete *(foreground daily re-check + enrollment UX)*
- [x] Network Guardian DNS blocker complete *(code; P0 device retest still open)*
- [x] Cellular anomaly monitor complete *(code; claim-safe copy)*
- [x] Secure Vault and Emergency Card hardened *(Emergency Info checklist; OS write N/A)*
- [x] All Digital Safety timeline events visible and understandable
- [x] No placeholder or misleading copy remains *(product surfaces audited; RC copy review open)*
- [x] No automatic scan path violates stated privacy/policy constraints *(SMS auto off; clipboard opt-in)*
- [ ] Device QA pass completed
- [ ] Privacy / security review completed
- [ ] Release candidate signed off

---

## 10.1 Definition of Done — implementation punch-list

Tracks gaps against the **In-Depth Product & Implementation Specification**.  
**Out of scope for this list:** Subscription/billing polish, SMS auto-scan, Digital Will/Legacy, **HTTPS content inspection / MITM** (explicitly excluded §35).

### P0 — Block release

| # | Item | Spec | Status |
|---|------|------|--------|
| P0-1 | Network Guardian: single-toggle enable, DNS counters increment, browser ad-domain block on device | §9–11 | **Needs device retest** — awaitReady + DNS routes + activity ring shipped |
| P0-2 | Network Guardian: production signed remote list + threat-intel feed URLs | §9–11, §28 | **Partial** — refresh + `manifestUrlConfigured` wired; production URL still blank until ops sets feed |
| P0-3 | Device QA sign-off (Guardian, Vault CRUD, QR camera, Emergency Card) | §29–30, §34 | **Partial** — Pixel 6 Pro **18/18** instrumentation PASS (2026-08-12); manual UI checklist still open |
| P0-4 | Privacy / security review (logs, timeline payloads, vault backup tamper) | §28, §29.4 | **Not started** |
| P0-5 | Private DNS / VPN conflict UX verified on Pixel + Samsung | §9, §25 | **Incomplete** — Private DNS warning in UI |

### P1 — Core spec gaps

| # | Item | Spec | Status |
|---|------|------|--------|
| P1-1 | Safe Link: full punycode/IDN normalization in pipeline | §5.3 | **Done** — `UrlNormalizer` IDN decode + sensitive query strip |
| P1-2 | Safe Link: configurable brand impersonation list | §6 | **Done** — `BrandListStore` + native add/remove APIs |
| P1-3 | Safe Link: false-positive reporting flow | §8 | **Done** — `FalsePositiveStore` + timeline event + UI |
| P1-4 | Network Guardian: adult/content domain category + dashboard counter | §9–11 | **Done** — CONTENT category (opt-in) + counters + recent activity |
| P1-5 | Vault expiry reminders (notifications + timeline events + lead time) | §18 | **Done** — `VaultExpiryReminderWorker` + schedule API |
| P1-6 | Secure Vault: biometric / device-credential unlock | §17.4 | **Done** — BiometricPrompt gate (PIN still required for crypto) |
| P1-7 | Emergency Card: Android lock-screen / Emergency Information integration | §16 | **Done (claim-safe)** — checklist + opens system Emergency Info; OS medical DB write not available to 3P apps |
| P1-8 | Delete vault item → remove encrypted cloud copy | §17.2 | **Done** — delete re-uploads encrypted Drive backup when entitled |

### P2 — Web portal & polish

| # | Item | Spec | Status |
|---|------|------|--------|
| P2-1 | Web: Network Guardian statistics dashboard | §26 | **Done (aggregates)** — vault-event dashboard cards (not live phone counters) |
| P2-2 | Web: Emergency Card status (authorized) | §26 | **Done (events)** — event counts + claim-safe note; no field edit on web |
| P2-3 | Web: Secure Vault authorized encrypted workflow | §26 | **Explicitly mobile-only** — web shows vault event counts only |
| P2-4 | Web: Security Center Digital Safety summary (beyond vault snapshot) | §26 | **Done** — Protect/Monitor summary cards from vault |
| P2-5 | Unified policy path — all surfaces through `RiskPolicyEngine` | §21 | **Improved** — Safe Link uses brand/blocklist via policy engine |
| P2-6 | Loading / empty / offline / error states on all DS screens | §27 | **Done** — shared `DsScreenState` + screen wiring |
| P2-7 | OEM device matrix (Samsung, low-end) + roaming cellular tests | §29.3 | **Not started** — human device lab |

### P3 — Testing & documentation

| # | Item | Spec | Status |
|---|------|------|--------|
| P3-1 | Integration: live VPN → browser block → timeline event | §29.2 | **Partial** — contracts + synthetic packet test; live device still manual |
| P3-2 | Integration: vault CRUD → encrypted SQLite → Drive restore | §29.2 | **Partial** — crypto version contract; full Drive path device QA |
| P3-3 | Cryptographic version migration documented and tested | §17.3 | **Done** — `SECURE_VAULT_CRYPTO_VERSION` + unit test (v1) |
| P3-4 | Implementation status / changelog updated | §32–33 | **Done** — this plan §10 / §10.1 refreshed 2026-08-12 |
| P3-5 | Graphify validated post-architecture change | §33 | **Done in dev** — not recorded in RC sign-off |

### Explicit exclusions (do not implement)

- Digital Will / Digital Legacy (§35)
- Universal third-party app URL interception (§35)
- **HTTPS content inspection / MITM** (§35)
- Definitive fake-cell-tower / IMSI catcher identification (§15, §35)
- Plaintext cloud vault (§35)
- Private API keys in APK (§28)

### Navigation (implemented 2026-08-12)

- Bottom tabs: **Home · Security · Hub · Safety · Usage**
- **No Vault tab** — Secure Vault under Safety → Secure
- **Drive Sync** under Hub (Key features + More services)
- **App Usage** restored as visible tab
- Hub **More services** no longer duplicates Digital Safety (Safety tab only)

### Code complete this pass (2026-08-12)

- Subscription gates on hub tiles + nav + action layers (Guardian / Cellular / Vault / SIM / Lost Mobile / Automation)
- Safe Link automation matrix UI + entitlement-gated clipboard/breach hooks in `App.tsx`
- Claim-safe timeline labels via `formatDigitalSafetyEvent.ts`
- Emergency Card Android Emergency Info checklist
- Web DS aggregate dashboard polish
- Unit/integration contract tests for entitlements, labels, crypto version

---

## 11. Risks and mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| VPN blocker is unstable on some OEMs | High | Ship DNS-only MVP first; strong conflict UX; staged rollout |
| False positives in scam/cellular scoring | High | Conservative thresholds; explain reason codes; collect internal QA corpus |
| Subscription checks drift across screens | High | Single capability contract + centralized entitlement helpers |
| UX still feels fragmented | High | Finish nav overhaul before feature completion exits beta |
| Threat intel dependency delays launch | Medium | Local signed list baseline first; online feed optional enhancement |
| Secure Vault leaks metadata | High | privacy review of event payloads and backup structures before RC |
| Clipboard automation feels creepy or noisy | High | Foreground-only, explicit opt-in, visible indicator, one-tap disable |
| SMS auto-scan creates policy rejection risk | High | Keep feature-flagged until explicit compliance review clears launch scope |

---

## 12. Recommended ownership

| Role | Responsibility |
|---|---|
| Senior architect | contracts, sequencing, claim safety, risk model |
| Mobile lead | delivery coordination, integration, release readiness |
| Android/native engineer | guardian, risk engine, cellular, vault crypto |
| RN/UI engineer | navigation overhaul, shells, result screens, subscription UX |
| QA/release engineer | device matrix, regression, RC management |
| Product/design | wording, IA approval, plan-tier decisions |

---

## 13. Immediate next actions

1. ~~Approve final bottom navigation and Digital Safety IA~~ — **Done:** Home · Security · Hub · Safety · Usage (no Vault tab).
2. ~~Close implementable punch-list (gates, automation matrix, copy, web aggregates, tests)~~ — **Done** 2026-08-12.
3. Close **P0** human/ops items (Guardian device validation, production feeds, manual QA, security review, OEM Private DNS).
4. Approve listing claims vs shipped behavior (claim-safe sign-off).
5. Keep SMS auto-scan behind flags until Play policy review.
6. Update `OPEN_PHASE_ITEMS.md` as P0 items complete.

---

## 14. Success definition

Launch is successful only if:

- a new user can understand where to go for protection in under 30 seconds,
- each released Digital Safety feature actually performs the promised action,
- subscribers only see and run features allowed by their plan,
- no released feature depends on hidden or broken legacy flows,
- and the release can be honestly described without overstating capability.
