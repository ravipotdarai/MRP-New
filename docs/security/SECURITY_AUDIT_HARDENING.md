# Security audit — anti-clone / client hardening baseline

**Status:** Phase 1 baseline (docs) — started 2026-08-02 with Security Center Phase 1.  
**Plan:** [`ANTI_CLONE_HARDENING.md`](ANTI_CLONE_HARDENING.md)

## Findings (current)

| Area | State |
|------|--------|
| Release ProGuard/R8 | `enableProguardInReleaseBuilds = false` in `MRP/android/app/build.gradle` |
| Release signing | `signingConfig signingConfigs.debug` for release — **must change before Play AAB** |
| Drive vault | PIN + AES-GCM (`VaultBackupCrypto` / web `vault-crypto`) — primary confidentiality |
| EncryptedSharedPreferences | Used for PIN / SIM recovery paths |
| Timeline SQLite | **Not** SQLCipher — plaintext local DB until schema freeze + migration |
| Evidence hash-chain | **Not** implemented |
| Play Integrity | **Not** gated |
| Hardcoded billing | Release should force `ALLOW_HARDCODED_BILLING=false` when store-ready |
| Verbose logs | Camera / SIM / location paths still log in debug; strip for release |

## Execution order (unchanged)

1. Data boundary (vault / Keystore) — keep  
2. Play-signed AAB + R8 + log strip  
3. Signature / root / debug / Frida → `SECURITY_*` timeline events  
4. Play Integrity per policy table (vault restore / recovery contacts / premium)  
5. Evidence SHA-256 chain + signed export  
6. SQLCipher after schema stable  

## Do not claim

Reverse engineering prevention, permanent Frida/Magisk defeat, or “zero client IDs in APK.”

## Next concrete steps

1. Create Play upload keystore (outside git); wire release signing.  
2. Enable R8 with RN/Firebase/CameraX/Billing keep rules.  
3. Add `RuntimeIntegrityChecker` → `TimelineEventLogger` (`SECURITY_ROOT` / `SECURITY_DEBUGGER` / …).  
4. Spec evidence hash fields on `EventDao` before SQLCipher migration.
