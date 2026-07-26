# Drive Sync (P5)

## Privacy (P5 complete for mobile)

- Firebase RTDB holds **sync configuration only** (`device_config`).
- Vault ciphertext (timeline, live location, Premium+ selfies) lives in **Drive appData**.
- See [`DEVICE_TRACKING.md`](DEVICE_TRACKING.md).

## Mobile completion

| ID | Item | Status |
|---|---|---|
| P5-1 | OAuth scopes | **Done** — only `drive.appdata` |
| P5-2 | Backup encrypt | **Done** — AES-GCM + PBKDF2(PIN) |
| P5-3 | Same-device backup/restore | **Done** (code) |
| P5-4 | New device restore | **Done** |
| P5-5 | Drive full | **Done** — `PAUSED_QUOTA` |
| P5-6 | Delete old MRP backups | **Done** |
| P5-7 | Denied scope | **Done** |
| P5-8 | Wi‑Fi / mobile policy | **Done** — config `syncOnWifi` / `syncOnMobileData` + legacy wifi-only |
| P5-9 | pending_sync drain | **Done** |
| P5-G | Geofence + distance + address | **Done** |
| P5-S | Event/location → Drive (not Firebase) | **Done** |
| P5-E | Emergency Tracking (≥1 min) | **Done** |
| P5-10 | Web cannot list other Drive files | **P6** — `MRP Web` uses `drive.appdata` + name filter only |

Auto Drive sync unlocks after one successful manual backup (PIN cached in EncryptedSharedPreferences).


## Layout

| Piece | Location |
|---|---|
| Hub → Drive Sync | `MRP/src/features/drive/DriveSyncScreen.tsx` |
| Native | `DriveVaultModule`, `DriveAppDataClient`, `VaultBackupCrypto` |
| File | `mrp_vault_backup.v1.enc` in appDataFolder |

## Flow

1. Premium+ · Google Sign-In · recovery code acknowledged  
2. Connect Drive (`drive.appdata`)  
3. PIN → Back up / Restore  
4. Wi‑Fi only (default on)
