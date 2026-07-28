# P8 — Store release readiness

Started after P7 close (excl. Data Safety form). Tracker: [`OPEN_PHASE_ITEMS.md`](../plans/OPEN_PHASE_ITEMS.md).

## Checklist

| ID | Item | Owner | Status |
|---|---|---|---|
| **P8-1** | Play Data Safety form | Console | Ready to paste — [`MRP/P7_PLAY_DATA_SAFETY_PASTE.md`](../MRP/P7_PLAY_DATA_SAFETY_PASTE.md) |
| **P8-2** | Play Billing `"mode": "play"` | Console + app | Blocked on Play Developer — [`PLAY_BILLING_INCOMPLETE.md`](PLAY_BILLING_INCOMPLETE.md) |
| **P8-3** | Nest JWT guards | API | **Done** — smoke + admin allowlist; `npm run test:auth-guard` / `test:jwt-live` (needs SA for mint) |
| **P8-4** | Circle FCM + deep links | API + app | **Done** (code) — RTDB rules live; assetlinks ready; 2-device → P8-7 |
| **P8-5** | Interactive Circle map | App | Optional; ArcGIS static + Google Maps open works |
| **P8-6** | `circle_live` TTL CF | Firebase | **Nest purge done**; CF source ready — scheduled deploy needs **Blaze** |
| **P8-7** | Formal Circle 2-device E2E | QA | Needs 2 devices after FCM |
| **P8-8** | Drive restore PIN clean device | QA | Optional re-verify |

## Nest auth (P8-3) — how to call

```http
GET /v1/health
# public

GET /v1/devices/{uid}/config/defaults
Authorization: Bearer <Firebase ID token>
# 401 without token; 403 if uid ≠ token.uid (unless admin email allowlisted)

PATCH /v1/devices/{uid}/config
Authorization: Bearer <Firebase ID token>
```

Admin allowlist (server): `MRP_ADMIN_EMAILS` or `ADMIN_EMAILS` (comma-separated), same list as web `NEXT_PUBLIC_ADMIN_EMAILS`.

Local bypass (never production):

```bash
MRP_AUTH_BYPASS=1 NODE_ENV=development MRP_ADMIN_EMAILS=you@example.com npm run start:dev
# header: X-MRP-Dev-Uid: <uid>
# optional: X-MRP-Dev-Email: you@example.com
```

Live ID token smoke (needs service account):

```bash
# FIREBASE_SERVICE_ACCOUNT_JSON='{...}' or GOOGLE_APPLICATION_CREDENTIALS=/path/key.json
npm run test:jwt-live
```

Admin TTL purge:

```bash
POST /v1/admin/circle-live/purge
```

## Next actions (human / console)

1. Paste Data Safety answers (P8-1) — [`MRP/P7_PLAY_DATA_SAFETY_PASTE.md`](../MRP/P7_PLAY_DATA_SAFETY_PASTE.md).
2. Finish Play subscriptions + set `"mode": "play"` + `mrpAllowHardcodedBilling=false` (P8-2).
3. Upload Internal testing AAB — follow [`STORE_V1_CHECKLIST.md`](STORE_V1_CHECKLIST.md).
4. TTL: Nest purge ready; upgrade to **Blaze** then `firebase deploy --only functions` for schedule.
5. Optional: set `FIREBASE_SERVICE_ACCOUNT_JSON` and run `npm run test:jwt-live`.

**Store v1 code prep (2026-07-28):** billing gate + listing draft + version `1.0.0` — see `STORE_V1_CHECKLIST.md`.
