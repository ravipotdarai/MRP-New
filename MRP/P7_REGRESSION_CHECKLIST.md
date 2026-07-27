# P7 regression checklist (P7-8)

Critical paths P1–P6. Device: Android 12+.  
**Pass recorded:** 2026-07-27 Pixel 6 Pro · PIN `1111` · **P7-4 excluded** (deferred to end / P8).

## P1 Hub / Home
- [x] Tabs: Home, Security, App Usage, Hub
- [x] Panic hold control visible on Home
- [x] Panic / Circle banners appear when active (`Circle sharing ON · P7 Family`)

## P2 Account
- [x] PIN lock unlock with `1111`
- [x] Google session present (Drive shows `ravipotdarai@gmail.com`)

## P3 Subscriptions
- [x] Feature gates (geofence / Circle / Drive) respect tier (test mode OK — Circle ENTERPRISE, Drive PREMIUM)

## P4 Circle
- [x] Create all categories via **Create all category demos (P7)**
- [x] Mutual consent → Share ON → map points (Family: You + Family 1/2 path trails)
- [x] Peers start ~10 km out and **Peers approach phone** converges to device location
- [~] Pinch zoom — static ArcGIS image map (pan/pinch N/A); **Open in Google Maps** available

## P5 Drive / geofence
- [x] Drive Connected · last backup present · timeline events on device (830+)
- [x] Background tracking disclosure path present (prior smoke + Security → Setup)
- [~] Restore vault with PIN — not re-run this session (backup OK; restore optional)

## P6 Web
- [~] Hosting live from prior P6 smoke — not re-opened this session

## Perf (P7-1/2)
- [x] Timeline / Home event list with large history (830+ local events)
- [x] Hub cards open (Promotions, Affiliates, Drive, Circle) without crash
