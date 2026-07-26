# Firebase RTDB indexes (Realtime Database)

Indexes for Realtime Database are declared with `.indexOn` inside
[`database.rules.json`](database.rules.json).

| Path | `.indexOn` | Purpose |
|---|---|---|
| `device_config` | `updatedAtMs`, `source` | Admin/web list/filter of sync policies |
| `circles` / `circle_live` | (unchanged) | Circle left as-is for now |

## Privacy MVP

- **Allowed:** `device_config/{uid}` — sync policy only (what / when / frequency / emergency).
- **Denied:** `device_live`, `event_feed` — no location/event/media payloads in Firebase.
- **Data plane:** device local storage + Google Drive `appData` encrypted vault.

Deploy rules:

```bash
cd api
firebase deploy --only database
```
