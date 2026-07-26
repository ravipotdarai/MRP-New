# P7 security review checklist (P7-9)

Run before store release. Mark each item when verified.

## Privacy plane

- [ ] RTDB rules deny `device_live` and `event_feed` (read/write false)
- [ ] `device_config` validates no `lat`/`lng`/`timeline`/`selfie` children
- [ ] Mobile Drive OAuth scope is only `https://www.googleapis.com/auth/drive.appdata`
- [ ] Web Drive GIS scope is only `drive.appdata` (`MRP Web/src/lib/drive-appdata.ts`)
- [ ] Admin web UI has no vault binary download / selfie fetch

## Auth & admin

- [ ] Admin gate uses allowlisted emails (`NEXT_PUBLIC_ADMIN_EMAILS`)
- [ ] Admin RTDB writes limited to config/audit paths
- [ ] Nest device endpoints not publicly writable without JWT (add guard before hosting API)

## Client

- [ ] Background location disclosure shown before enabling `backgroundTracking`
- [ ] Panic SMS requires SEND_SMS + recovery contacts
- [ ] PIN vault / Drive restore still gated by recovery ack where required

## Pass criteria (plan)

No vault bytes in Firebase; no broad Drive scope; disclosures match Data Safety form.
