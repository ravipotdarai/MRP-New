# Drive Sync (P5)

## Mobile completion (2026-07-24)

| ID | Item | Status |
|---|---|---|
| P5-1 | OAuth scopes | **Done** — only `drive.appdata` in code (`ALLOWED_SCOPES`) |
| P5-2 | Backup encrypt | **Done** — AES-GCM + PBKDF2(PIN); ciphertext uploaded |
| P5-3 | Same-device backup/restore | **Done** (code); manual device pass recommended |
| P5-4 | New device restore | **Done** (same Google + PIN path); UX copy on Drive Sync |
| P5-5 | Drive full | **Done** — `PAUSED_QUOTA`; local intact |
| P5-6 | Delete old MRP backups | **Done** — purge other `mrp_vault_backup*` in appData after upload |
| P5-7 | Denied scope | **Done** — connect fails cleanly |
| P5-8 | Wi‑Fi only | **Done** — gate on backup + tip if stale >24h (no background WorkManager yet) |
| P5-9 | pending_sync drain | **Done** — included in backup then `clearPendingSync()` |
| P5-10 | Web MRP-files-only | **Blocked** — needs P6 `web/` |

**Phase P5 is complete for mobile.** Web (P5-10) tracks under P6.

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
