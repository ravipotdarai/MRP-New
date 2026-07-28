# MRP security posture (v1)

Companion to [`V1_DRIVE_ONLY_RELEASE.md`](V1_DRIVE_ONLY_RELEASE.md).

## Custody model

| Data | Where | Who can read |
|---|---|---|
| Timeline, selfies, live snapshot | Device SQLite / files | Device user |
| Encrypted vault | User Google Drive `appData` | User with PIN (app or MRP Web browser) |
| Sync / emergency policy | Firebase RTDB `device_config/{uid}` | Owner UID + allowlisted admin (policy only) |
| Circle live ciphertext | RTDB (v2 only) | Circle members with invite key — **disabled in v1** |

**MRP Nest / Admin never receive vault plaintext or selfie bytes.**

## Controls shipped

- Nest Firebase JWT + UID ownership + admin email allowlist
- RTDB rules deny `device_live` / `event_feed`
- Drive scope `drive.appdata` only
- Web CSP + `X-Frame-Options` + Permissions-Policy on Hosting
- Circle feature flag off for store builds
- Emergency interval floor ≥ 5 minutes (battery + abuse)

## Limits (honest)

- Stolen phone + known PIN → attacker can decrypt Drive vault (same as any PIN vault)
- Compromised Google account with Drive scope → attacker can fetch ciphertext (still needs PIN)
- Device root / malware outside MRP is out of scope

We harden **MRP custody and authz**, not absolute unhackability.
