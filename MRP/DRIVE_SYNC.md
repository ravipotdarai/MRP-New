# Drive Sync (P5+)

## Privacy

- Firebase RTDB holds **sync configuration only** (`device_config`).
- Ciphertext lives in **Drive appData** (PIN AES-GCM). Nest never sees event/selfie bodies.

## Primary Drive SoT = chunks (append-only creates)

Automatic sync **never** replaces the multi‑MB vault on every event.

| Transport | Chunks (evt/selfie/live) | Full vault |
|-----------|--------------------------|------------|
| **Wi‑Fi** | Yes when `syncOnWifi` | Hub manual (respects Hub Wi‑Fi-only) |
| **Cellular / mobile radio (LTE/5G)** | Yes when `syncOnMobileData` **or** event sync on (default) | Hub manual only if mobile allowed |
| **Ethernet** | Yes | Hub manual |

On `CONNECTIVITY_CHANGE` / mobile data ON → `DriveVaultSync.onNetworkAvailable` flushes pending chunks.

| File | Write | Network |
|------|-------|---------|
| `mrp_evt_{YYYY-MM-DD}_{HH}_{seq}.enc` | **Create only** from local timeline | Wi‑Fi **or** cellular (when event sync / mobile prefs allow) |
| `mrp_selfie_{eventId}.enc` | **Create once** (skip if name listed) | Same |
| `mrp_live.enc` | **Replace only** (tiny) | Heartbeat / panic / emergency |
| `mrp_vault_backup.v1.enc` | **Manual Hub only** (optional snapshot from local DB) | Not required for Web/restore |
| `mrp_gps_*` | Unchanged day packs | Alongside chunk flush |

**Rejected:** download hour/vault → append → re-upload. Writers build ciphertext from **local SQLite** only.

**Coalesce:** `event*` + `event_selfie` wait ~45s → one evt pack + ≤1 selfie per eventId (stops double multi‑MB uploads).

## Flow

1. Premium+ · Google Sign-In · recovery ack · Hub backup once (stores auto-PIN)
2. Events → coalesced chunk flush (cellular-first when event sync on)
3. Heartbeat → `mrp_live.enc` only
4. Panic → tiny critical evt (+ live), any network
5. Hub “Backup now” → optional full vault + chunk flush + GPS
6. Web unlock → list/decrypt/merge chunks (+ legacy vault baseline if present)
7. Android restore → chunk merge primary; vault = legacy fallback

## Code map

| Piece | Location |
|-------|----------|
| Sync router | `DriveVaultSync.kt` |
| Writers | `EventMicroPackWriter`, `SelfiePackWriter`, `LivePackWriter` |
| Retention | `DriveChunkRetention` (age purge; no vault catch-up gate) |
| Restore | `DriveChunkRestore` / `DriveVaultModule.restoreLatest` |
| Web merge | `MRP Web/src/lib/vault-chunks.ts` + `vault-session.tsx` |
| GPS packs | `GpsDayPackWriter` |

## Acceptance (cellular)

- USB on cellular → `mrp_evt_*` + optional `mrp_selfie_*`; **no** automatic `mrp_vault_backup.v1.enc`
- Heartbeat → live only
- Web unlock with chunks only shows timeline
- Restore from chunks only loses no flushed event ids
