# MRP API (NestJS)

Control plane for Circle invites / consent / FCM. **Live location stays on Firebase RTDB.**

```bash
cd api
npm install
npm run start:dev
```

| Endpoint | Auth |
|---|---|
| `GET /v1/health` | Public |
| `GET/PATCH /v1/devices/...` | Firebase Bearer JWT (P8-3) |
| `/v1/circles/...` | Firebase Bearer JWT (P8-3) |

Smoke tests:

```bash
npm run test:load-health
npm run test:auth-guard
# with local bypass:
# MRP_AUTH_BYPASS=1 npm run start:dev
# MRP_AUTH_BYPASS_PROBE=1 npm run test:auth-guard
```

Admin emails: `MRP_ADMIN_EMAILS` (or `ADMIN_EMAILS`) — same allowlist as web.

See [P8_STORE_RELEASE.md](../docs/store/P8_STORE_RELEASE.md), [MRP/CIRCLE_LIVE.md](../MRP/CIRCLE_LIVE.md), [firebase/CIRCLE_LIVE_TTL.md](firebase/CIRCLE_LIVE_TTL.md).
