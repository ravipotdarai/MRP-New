# P7-4 — Paste into Google Play Console (Data safety)

Opened for you: [Play Console](https://play.google.com/console) + source sheet [`PLAY_DATA_SAFETY.md`](PLAY_DATA_SAFETY.md).

Path: **Play Console → Your app (MRP) → App content → Data safety → Start / Manage**.

## Answers to select

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all user data collected encrypted in transit? | **Yes** (HTTPS / Drive / Firebase Auth) |
| Do you provide a way for users to request deletion? | **Yes** (in-app soft wipe / revoke Drive / uninstall; document as account deletion if required) |

### Data types

| Type | Collected | Shared | Ephemeral? | Required / Optional | Purpose |
|---|---|---|---|---|---|
| Location – Precise | Yes | No (not to MRP servers) | No | Optional | App functionality; Fraud prevention / Security |
| Location – Approximate | Yes | No | No | Optional | Same |
| Photos | Yes (intruder selfies) | No | No | Optional | App functionality; Fraud prevention / Security |
| App activity (App interactions / Other) | Yes (usage stats) | No | No | Optional | App functionality |
| Device or other IDs | Yes (Firebase Auth UID) | Yes — with Google/Firebase for auth | No | Optional (account features) | Account management |

### Explicitly **do not** declare as collected by MRP cloud

- Contacts (except user-entered recovery numbers stored on device / SMS)
- SMS or call logs as inbox content (outbound recovery SMS only — do not claim SMS collection if Console has no “sent SMS only” nuance; prefer not listing SMS as collected data)
- Broad Drive file access

### Data safety free-form / listing

Use short copy from `PLAY_DATA_SAFETY.md`:

> MRP monitors security events on your device. Location and evidence stay on the phone and, if you choose, in your private encrypted Google Drive app folder. MRP does not sell your data.

### After submit

Tick **P8-1** (was P7-4) in `OPEN_PHASE_ITEMS.md` / Done log when Console shows Data safety form **complete**. See [`P8_STORE_RELEASE.md`](../P8_STORE_RELEASE.md).
