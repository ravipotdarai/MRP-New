# P7 security review checklist (P7-9)

Run before store release. Mark each item when verified.  
**Static pass:** 2026-07-27 (code + rules audit). Formal store sign-off still pairs with P7-4 / P8.

## Privacy plane

- [x] RTDB rules deny `device_live` and `event_feed` (read/write false) — `api/firebase/database.rules.json`
- [x] `device_config` / `admin_audit` validate no `lat`/`lng`/`timeline`/`selfie` children
- [x] Mobile Drive OAuth scope is only `https://www.googleapis.com/auth/drive.appdata`
- [x] Web Drive GIS scope is only `drive.appdata` (`MRP Web/src/lib/drive-appdata.ts`)
- [x] Admin web UI has no vault binary download / selfie fetch

## Auth & admin

- [x] Admin gate uses allowlisted emails (`NEXT_PUBLIC_ADMIN_EMAILS`)
- [x] Admin RTDB writes limited to config/audit paths
- [ ] Nest device endpoints not publicly writable without JWT (add guard before hosting API) → **P8**

## Client

- [x] Background location disclosure shown before enabling `backgroundTracking`
- [x] Panic SMS requires SEND_SMS + recovery contacts
- [x] PIN vault / Drive restore still gated by recovery ack where required

## Pass criteria (plan)

No vault bytes in Firebase; no broad Drive scope; disclosures match Data Safety form (form paste = **P7-4 / P8**).
