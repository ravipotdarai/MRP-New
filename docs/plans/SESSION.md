# SESSION.md — 2026-07-18

## Completed this session

### Bug fixes (Phase 1)
- Home Live Location: live GPS + reverse geocode via `getCurrentLocationWithAddress`
- Selfie matching: shared `selfieMatcher.ts` (prefix + 45s), Gallery ported, Camera2Helper naming aligned
- App Usage: ACTIVITY_RESUMED/PAUSED + MOVE_TO_*; 30-day range; today screen time; Reports aggregate by app
- Security header: MRP Timeline removed; tabs realigned earlier

### SIM Change Recovery Alert + Offline GNSS (Phases 2–5)
- Encrypted `SimRecoveryStorage` (contacts, baseline, pending sync, history)
- `SimIdentityTracker`, `CaptureOfflineGnssUseCase` (Fresh→GPS→LastKnown→Cached→NoFix, 30s)
- `SendSimChangeSmsUseCase` + `SimChangeRecoveryAlertUseCase` orchestrator
- Wired into `MrpMonitorService` + `SimStateReceiver`
- RN: `SimRecoveryPanel` in Monitoring; Home Recovery Contact status live
- Bridge APIs for status / contacts / test SMS / history
- `SEND_SMS` + `READ_PHONE_NUMBERS` permissions
- Unit tests: selfieMatcher, simRecoveryLogic

### Deferred (Future)
- Google Drive upload of `sim_changes.json` / events / selfies (PendingSync queue is written)

## How to verify
1. Security → Monitoring → enable SIM Change Recovery (consent) → add contact → Test SMS
2. Home Live Location shows address when online
3. App Usage Dashboard / Reports with usage permission
4. Timeline selfies only on capture-enabled events
