# JPNI Phase 4 — Tests, perf, hardening

## Unit tests (Vitest)

```powershell
cd "MRP Web"
npm install
npm test
```

Covers: `journey-heuristics`, `playback-engine`, `journey-heatmap`.

## E2E (Playwright)

```powershell
cd "MRP Web"
npm run test:e2e
```

Starts dev server on :3001 unless `PLAYWRIGHT_BASE_URL` is set.

## Perf bench

```powershell
cd "MRP Web"
npm run bench:journey 100000
```

Target: 100k-point heat grid < 500 ms on dev hardware.

## Map perf

- Trails > 8k points: Douglas–Peucker simplification before render
- Chunk window: unchanged from Phase 1 (`GpsChunkWindow`)

## Nest smoke

```powershell
cd api
npm run start:dev
# separate terminal:
MRP_AUTH_BYPASS=1 npm run test:geocoding
```

## Manual QA checklist

- [ ] Unlock vault → Emergency monitoring loads day
- [ ] Play/pause → address + nearby update when paused
- [ ] Heatmap toggle visible
- [ ] PDF opens print dialog with report
- [ ] GeoJSON/GPX/CSV download
- [ ] Travel page Leaflet path visible

## Exit criteria

Phase 4 complete when unit tests pass, web build passes, geocoding smoke passes against local Nest, and e2e smoke passes.
