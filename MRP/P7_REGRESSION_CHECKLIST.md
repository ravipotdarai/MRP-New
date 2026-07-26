# P7 regression checklist (P7-8)

Critical paths P1–P6. Device: Android 12+.

## P1 Hub / Home
- [ ] Tabs: Home, Security, App Usage, Hub
- [ ] Panic hold 2s sends SMS (with contacts + permission)
- [ ] Panic / Circle banners appear when active

## P2 Account
- [ ] Google Sign-In / sign-out
- [ ] PIN lock + recovery code path

## P3 Subscriptions
- [ ] Feature gates (geofence / Circle / Drive) respect tier (test mode OK)

## P4 Circle
- [ ] Create / join invite
- [ ] Mutual consent → Share ON → map points
- [ ] Pinch zoom on live map preview

## P5 Drive / geofence
- [ ] Backup / restore vault with PIN
- [ ] Geofence enter/exit timeline
- [ ] Background tracking disclosure before enable

## P6 Web
- [ ] https://mobileresilienceplatform.web.app login
- [ ] Monitoring decrypt Drive vault
- [ ] Settings write `device_config`
- [ ] Admin search + policy (admin email)

## Perf (P7-1/2)
- [ ] Timeline scrolls smoothly with large history (FlashList)
- [ ] Hub menu cards animate without jank
