# JPNI Phase 3 — Places, analytics, exports

## Nest geocoding API (`/v1/geocoding`)

Proxies external geocoders — **never stores GPS trails**.

| Endpoint | Body | Response |
|----------|------|----------|
| `POST /geocoding/reverse` | `{ lat, lng }` | Nominatim address |
| `POST /geocoding/nearby` | `{ lat, lng, radiusM?, categories? }` | Overpass POIs |

- Auth: Firebase JWT (same as devices/circles)
- Cache: in-memory TTL 10 min, coord rounded to 4 decimals
- Rate limit: 40 req/min per UID
- Env: `NOMINATIM_URL`, `OVERPASS_URL`, `MRP_GEO_USER_AGENT`

Smoke: `MRP_AUTH_BYPASS=1 npm run test:geocoding` (Nest on :3000)

## Web client

- `journey-geocode.ts` — calls Nest when playback **paused**
- `journey-heuristics.ts` — stops, overspeed, night driving, frequent clusters (rule-based, **not LLM**)
- `journey-heatmap.ts` — grid density overlay
- `journey-pdf.ts` — print-ready HTML report (Save as PDF)
- Emergency desk: heatmap toggle, nearby panel, PDF export, insights

## Privacy

Drive remains source of truth for trails. Nest sees only single lat/lng lookups.

## Deploy

Set `NEXT_PUBLIC_MRP_API_BASE_URL=https://api.pathsync.in/v1` (or your Nest host) on web hosting.
