# Geofence + location strategies (timeline)

**Last updated:** 2026-07-30  
**Code:** `MRP/android/.../TimelineEventLogger.kt`, `LocationResolver.kt`, `GeofenceTransitionReceiver.kt`

This note preserves the **GPS-every-event** approach so we can restore it, and describes the **middle-path** used for lock/unlock.

---

## A) GPS every event (documented — restorable)

### Intent

Maximize correct **Inside/Outside** and **lat/lng/address** on each timeline row by resolving a GPS-tier fix for geofence evaluation on (almost) every non-`GEOFENCE_*` event.

### Behavior (as of 2026-07-29 / pre–middle-path lock-unlock)

```text
For each TimelineEventLogger event (except GEOFENCE_* rows from GeofenceTimeline):

1. addressResolved =
     cache-only events → resolveBestWithoutGps()
     else             → resolveSync(severityForEvent)

2. geoResolved =
     resolveSync(Severity.SECURITY)   // may wake GPS up to ~12s if accuracy > ~50m
     ?: addressResolved

3. Timeline location + geofence distance check use geoResolved.location
4. Reverse-geocode may use address fix; badge uses distance ≤ zone.radiusMeters + prefs heal
```

### Key constants (`LocationResolver`)

| Constant | Value | Role |
|----------|-------|------|
| `GOOD_ACCURACY_M` | 50f | UI/SECURITY/SIM treat fix as good enough |
| `GPS_TIMEOUT_SECURITY_MS` | 12_000 | Max wait for high-accuracy / GPS |
| Cache-only event list | lock, Wi‑Fi, BT, … | Address path avoided fresh GPS; **geofence path still called SECURITY** |

### Pros

- Best chance of correct geofence vs configured radius when Wi‑Fi/cell are ~150 m off  
- Better addresses when GPS locks  

### Cons

- Extra GPS wakes on frequent events (lock/unlock churn) → battery  
- Indoors / weak GPS → longer waits  

### How to restore (lock/unlock + others)

In `TimelineEventLogger.logEventSyncInternal`, for **all** non-`GEOFENCE_*` events (including lock/unlock), force:

```kotlin
val addressResolved = if (isCacheOnlyEvent(eventType)) {
    LocationResolver.resolveBestWithoutGps(context)
} else {
    LocationResolver.resolveSync(context, severity)
}
val geoResolved = LocationResolver.resolveSync(context, LocationResolver.Severity.SECURITY)
    ?: addressResolved
val location = geoResolved?.location
```

Do **not** gate on `isLockUnlockEvent` / middle-path helpers. Keep geofence badge logic that prefers `distanceEval.insideFence` and heals prefs.

Also keep Hub geofence UI on SECURITY (`GeofenceModule.evaluateHere` / `getCurrentLocationForZone`) — that is separate from timeline strategy.

---

## B) Middle-path — lock/unlock only (current product choice)

### Intent

- **Source of truth for Inside/Outside:** OS-updated prefs (`DeviceTrackingPrefs.last_geofence_*`), maintained by `GeofenceTransitionReceiver` / high-confidence paths  
- **GPS only when** the cheap fix is **coarser than 50 m** (accuracy **> 50 m** or missing), and **GPS throttle** allows another wake  

Accuracy gate is **≤ 50 m** (“good enough”); never treat a >50 m fix as fine for overwriting prefs from distance alone without GPS.

### Scope

| Event | Strategy |
|-------|----------|
| `SCREEN_LOCK`, `SCREEN_UNLOCK` | Middle-path (this section) |
| Other timeline events | Still **GPS-every-event** (section A) for geofence resolve |
| `GEOFENCE_ENTER` / `EXIT` | Owned by OS receiver + `GeofenceTimeline` |

### Algorithm (lock/unlock)

```text
1. cheap = resolveBestWithoutGps()
2. If cheap.accuracy ≤ 50m → use cheap; else GPS if throttle allows (else keep cheap + prefs)
3. Badge decision (never wipe Inside from Magarpatta ~143m):
   a. Strict inside configured radius + accuracy ≤50m → Inside, heal prefs
   b. Soft inside: distance ≤ radius + 50m pad → Inside, heal prefs
   c. Prefs Inside → keep Inside unless accurate and distance > radius + max(acc, 50)
   d. Else prefs / accurate evaluate (do not casually write Outside)
```

Pad for Outside is **≥ 50m** and never treats a 143m Wi‑Fi centroid as “clearly left Home” when prefs still say Inside.

### Tunables (code)

| Name | Cap / value | Meaning |
|------|-------------|---------|
| `LOCK_GOOD_ACCURACY_M` | **50f** (must not raise above 50) | Cheap fix good enough → no GPS |
| `LOCK_GPS_THROTTLE_MS` | e.g. 5 min | Min interval between GPS wakes on lock/unlock when coarse |

Radius for Inside/Outside remains **exactly the zone’s configured `radiusMeters`** when distance is evaluated.

### Trade-off

- Better battery on frequent lock/unlock  
- Badge can lag if OS ENTER never fired and prefs are wrong until a coarse→GPS heal runs  
- Address on lock/unlock may stay coarse when GPS is throttled  

---

## Related files

- `TimelineEventLogger.kt` — strategy switch  
- `LocationResolver.kt` — cascade + accuracy gates  
- `GeofenceTransitionReceiver.kt` — OS ENTER/EXIT → prefs  
- `LocationHelper.evaluateGeofence` — `distance ≤ radiusMeters`  
- Hub: `GeofenceModule.kt` — evaluate/save zone still GPS-tier (SECURITY)
