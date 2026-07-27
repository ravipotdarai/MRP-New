# circle_live TTL (P8-6)

Authoritative cleanup for stale `circle_live/{circleId}/{uid}` points.
Freshness field: **`atMs`** (not `updatedAtMs`). Client also filters ~15m.

## Shipped

### A) Nest Admin purge (works on Spark — no Blaze required)

```http
POST /v1/admin/circle-live/purge
Authorization: Bearer <admin Firebase ID token>
```

Allowlisted via `MRP_ADMIN_EMAILS`. Local:

```bash
MRP_AUTH_BYPASS=1 NODE_ENV=development npm run start
MRP_AUTH_BYPASS_PROBE=1 npm run test:circle-purge
```

### B) Cloud Functions (ready — needs **Blaze**)

Code: [`functions/index.js`](../functions/index.js)

| Export | Trigger |
|---|---|
| `purgeStaleCircleLive` | Schedule every 10 minutes |
| `purgeStaleCircleLiveHttp` | HTTP + `x-mrp-purge-secret` |

Deploy after upgrading billing:

```bash
cd api
firebase deploy --only functions
# set MRP_PURGE_SECRET in Functions env for HTTP trigger
```

Upgrade URL (if deploy fails on Spark):  
https://console.firebase.google.com/project/mobileresilienceplatform/usage/details

## Status

- [x] Confirm RTDB field = `atMs`
- [x] Nest Admin purge endpoint
- [x] Cloud Function source in `api/functions`
- [ ] Scheduled CF live (blocked until Blaze plan)
- [x] Tick P8-6 Nest path in `OPEN_PHASE_ITEMS.md`
