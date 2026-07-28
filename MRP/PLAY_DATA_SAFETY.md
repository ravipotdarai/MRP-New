# Play Data Safety — MRP (v1 / Drive-only)

Fill Google Play Console → App content → **Data safety** using this sheet. Keep in sync with in-app disclosure (`BackgroundLocationDisclosure`) and [`V1_DRIVE_ONLY_RELEASE.md`](../docs/store/V1_DRIVE_ONLY_RELEASE.md).

## Listing copy (canonical)

> MRP keeps your security data on your device. If you turn on backup, an encrypted copy goes only to your private Google Drive app folder, unlocked with your PIN. MRP does not sell your data and does not keep a readable copy of your vault on MRP servers.

## Data collected

| Data type | Collected? | Shared? | Purpose | Notes |
|---|---|---|---|---|
| Location (precise) | Yes (optional) | No to MRP servers | App functionality, fraud prevention / security | On-device; optional encrypted Drive `appData` |
| Location (approximate) | Yes (optional) | No | Same | |
| Photos / media | Yes (intruder selfies) | No to MRP | Security / evidence | Device; Premium+ may sync encrypted to Drive |
| App activity / usage | Yes (usage stats, optional) | No | App functionality | On-device |
| Device or other IDs | Yes (Firebase Auth UID when signed in) | With Google/Firebase | Account management | Identity + sync policy only |
| Crash logs | Optional (if Crashlytics later) | With Google | Stability | Not required for MVP |

## Not collected by MRP cloud

- Raw GPS streams in Firebase RTDB (`device_live` / `event_feed` **denied**)
- Broad Google Drive file listing (scope = `drive.appdata` only)
- Admin download of user vault / selfies
- Multi-user Circle live share (**disabled in v1** — `CIRCLE_ENABLED=false`)

## Encryption

- Drive vault: AES-GCM with user PIN-derived key (see `DRIVE_SYNC.md`)
- Decrypt only on user device / user browser (MRP Web)

## User controls

- Monitoring toggles, geofence / background tracking off, Drive sync off, Find-my-device / emergency off, revoke OS permissions, soft wipe / clear timeline
