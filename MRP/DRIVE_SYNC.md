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
| Vault file | `mrp_vault_backup.v1.enc` in appDataFolder |
| GPS day packs (JPNI) | `mrp_gps_{YYYY-MM-DD}_index.enc` + `mrp_gps_{YYYY-MM-DD}_{HH}.enc` |

## GPS day packs (JPNI Phase 1)

Dense journey trail stays on-device in SQLite (`gps_trail`), then uploads as **PIN-encrypted** appData blobs on the same Drive sync as the vault (same `VaultBackupCrypto` / PIN). Nest/Firebase never see the trail.

| Artifact | Contents |
|---|---|
| `mrp_gps_{date}_index.enc` | Journey summary: hours[], bbox, distanceM, speeds, stopCount, checksum |
| `mrp_gps_{date}_{HH}.enc` | Compact point array for that local hour (`t,lat,lng,s,h,a,alt,b,n,g,m`) |

Capture: `LocationEngine` TRUSTED fixes → `GpsTrailWriter` (throttled; denser in emergency). Upload: `DriveVaultSync.performBackup` → `GpsDayPackWriter.uploadDirtyDays`.

Web Emergency monitoring / Journey desk lists indexes, decrypts with the vault session PIN, loads hour chunks windowed (current + prefetch next).

## Flow

1. Premium+ · Google Sign-In · recovery code acknowledged  
2. Connect Drive (`drive.appdata`)  
3. PIN → Back up / Restore  
4. Wi‑Fi only (default on)  
5. On each non-critical backup, dirty GPS day packs encrypt + upload alongside the vault
