# Play Data Safety — MRP (P7-4)

Fill Google Play Console → App content → **Data safety** using this sheet. Keep in sync with in-app disclosure (`BackgroundLocationDisclosure`) and Class A/B/C rules in the implementation plan.

## Data collected

| Data type | Collected? | Shared? | Purpose | Notes |
|---|---|---|---|---|
| Location (precise) | Yes (optional) | No to MRP servers | App functionality, fraud prevention / security events | On-device timeline; optional encrypted Drive `appData` vault |
| Location (approximate) | Yes (optional) | No | Same | |
| Photos / media | Yes (intruder selfies) | No to MRP | Security / evidence | Device storage; Premium+ may sync encrypted to Drive appData |
| App activity / usage | Yes (usage stats, optional) | No | App functionality | On-device |
| Device or other IDs | Yes (Firebase Auth UID when signed in) | With Google/Firebase | Account management | Identity only |
| Crash logs | Optional (if Crashlytics enabled later) | With Google | Stability | Not required for MVP |

## Not collected by MRP cloud

- Raw GPS streams in Firebase RTDB (`device_live` / `event_feed` **denied**)
- Broad Google Drive file listing (scope = `drive.appdata` only)
- Admin download of user vault / selfies

## Encryption

- Drive vault: AES-GCM with user PIN-derived key (see `DRIVE_SYNC.md`)
- Circle live payloads: E2E encrypted (see Circle docs); RTDB holds ciphertext

## User controls

- Monitoring toggles, geofence / background tracking off, Drive sync off, revoke OS permissions, soft wipe / clear timeline

## Listing copy (short)

> MRP monitors security events on your device. Location and evidence stay on the phone and, if you choose, in your private encrypted Google Drive app folder. MRP does not sell your data.
