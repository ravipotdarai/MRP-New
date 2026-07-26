# Device tracking + privacy sync (P5)

## Privacy MVP (2026-07-26)

| Store | Allowed content |
|---|---|
| **Firebase Auth** | Login identity (`uid`) |
| **Firebase RTDB `device_config/{uid}`** | Sync **policy only**: what / when / frequency / emergency |
| **Device** | Timeline, live location, geofences, selfies |
| **Google Drive appData** | Encrypted vault (timeline + live location + Premium+ selfies) |

**Denied in Firebase:** `device_live`, `event_feed` (rules `.read/.write: false`). Circle RTDB paths unchanged for now.

## Flow

1. Movement / events update **on-device** (`LiveLocationStore`, timeline).
2. Geofence enter/exit → queue **Drive** sync (if enabled).
3. Emergency Tracking → Drive sync every N minutes (default **1**, min **1**).
4. Manual Hub → Drive “Back up now” encrypts vault with PIN and enables auto-sync PIN on device.
5. Web (P6) reads Drive vault — not Firebase location nodes.

## Config fields (`device_config`)

- `movementTracking`, `backgroundTracking`, `highAccuracy`
- `eventSyncEnabled`, `syncOnWifi`, `syncOnMobileData`
- `syncLocation`, `syncGeofenceChanges`, `syncSelfiesPremium`
- `syncFrequencyMinutes` (≥1), `emergencyTracking`, `emergencyIntervalMinutes` (≥1)

## Battery

Defaults: balanced fused location (~5 min / 150 m), background off, high accuracy off, Wi‑Fi sync preferred.
