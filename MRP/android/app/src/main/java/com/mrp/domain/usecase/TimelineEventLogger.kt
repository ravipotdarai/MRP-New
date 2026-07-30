package com.mrp.domain.usecase

import android.content.Context
import android.location.Location
import android.os.SystemClock
import android.util.Log
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.data.local.GeofenceStorage
import com.mrp.data.local.TimelineStorage
import com.mrp.domain.model.*
import kotlinx.coroutines.*
import java.util.concurrent.atomic.AtomicLong

/**
 * Centralized event logger that creates timeline entries with location and geofencing.
 * Location uses [LocationResolver] Wi‑Fi → cell → GPS cascade with event severity.
 *
 * GEOFENCE_ENTER / GEOFENCE_EXIT timeline rows are owned only by
 * [com.mrp.presentation.receiver.GeofenceTransitionReceiver] (OS fence) and
 * high-confidence presence paths — never invented from Wi‑Fi / screen / other events.
 *
 * Strategies: see [docs/battery/GEOFENCE_GPS_STRATEGIES.md]
 * - Lock/unlock → middle-path (prefs + GPS only if accuracy > 50m and throttle allows)
 * - Other events → GPS-every-event for geofence resolve (SECURITY)
 */
class TimelineEventLogger(private val context: Context) {

    private val timelineStorage = TimelineStorage(context)
    private val locationHelper = LocationHelper(context)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /**
     * Log an event with optional location data reliably in a background coroutine
     */
    fun logEvent(
        eventType: String,
        status: String,
        metadata: Map<String, Any?> = emptyMap()
    ) {
        if (shouldDebounce(eventType, status)) {
            Log.d(TAG, "Debounced duplicate logEvent: $eventType:$status")
            return
        }
        scope.launch {
            logEventSyncInternal(eventType, status, metadata, checkDebounce = false)
        }
    }

    /**
     * Log event synchronously (for use in BroadcastReceivers)
     */
    fun logEventSync(eventType: String, status: String, metadata: Map<String, Any?> = emptyMap()) {
        logEventSyncInternal(eventType, status, metadata, checkDebounce = true)
    }

    private fun logEventSyncInternal(
        eventType: String,
        status: String,
        metadata: Map<String, Any?>,
        checkDebounce: Boolean
    ) {
        try {
            if (checkDebounce && shouldDebounce(eventType, status)) {
                Log.d(TAG, "Debounced duplicate logEventSync: $eventType:$status")
                return
            }
            Log.d(TAG, "Logging event: $eventType / $status")

            val severity = LocationResolver.severityForEvent(eventType)
            val isGeofenceEvent = eventType.uppercase().startsWith("GEOFENCE_")
            val lockUnlock = isLockUnlockEvent(eventType)

            val resolveResult = resolveLocationForEvent(
                eventType = eventType,
                severity = severity,
                isGeofenceEvent = isGeofenceEvent,
                lockUnlock = lockUnlock
            )
            val resolved = resolveResult.addressResolved
            val location = resolveResult.geoLocation
            val addrLocation = resolveResult.addressLocation ?: location
            val addressParts = addrLocation?.let {
                locationHelper.reverseGeocodePartsSync(it.latitude, it.longitude)
            }
            val address = addressParts?.formatted

            // Geofence badge:
            // Lock/unlock middle-path: prefer OS prefs; only rewrite from distance when fix ≤50m
            //   or after a GPS escalate.
            // Other events: distance eval + heal (GPS-every-event location).
            var lastInside = DeviceTrackingPrefs.lastGeofenceInside(context)
            var lastFenceId = DeviceTrackingPrefs.lastGeofenceId(context)
            val metaName = (metadata["geofence_name"] as? String)?.takeIf { it.isNotBlank() }
            val metaId = (metadata["geofence_id"] as? String)?.takeIf { it.isNotBlank() }

            val zones = GeofenceStorage.list(context)
            val hasCoords = location != null &&
                (kotlin.math.abs(location.latitude) > 1e-7 || kotlin.math.abs(location.longitude) > 1e-7)
            val accuracy = location?.accuracy?.takeIf { it > 0f } ?: 999f
            val accurateFix = accuracy <= LOCK_GOOD_ACCURACY_M

            val distanceEval = if (hasCoords && location != null && zones.isNotEmpty()) {
                locationHelper.evaluateGeofence(location.latitude, location.longitude)
            } else {
                null
            }

            // Heal prefs when we have an accurate fix inside a zone (configured radius).
            if (accurateFix && distanceEval?.insideFence == true && distanceEval.fenceId != null) {
                if (lastInside != true || lastFenceId != distanceEval.fenceId) {
                    DeviceTrackingPrefs.rememberGeofence(context, true, distanceEval.fenceId)
                    Log.i(TAG, "Healed geofence state → inside ${distanceEval.zoneName}")
                }
                lastInside = true
                lastFenceId = distanceEval.fenceId
            } else if (!lockUnlock && lastInside != true && zones.isNotEmpty()) {
                // Non–lock/unlock: also try cache heal (GPS-every-event path)
                val healCandidates = buildList {
                    LocationResolver.peekCache()?.let { add(it) }
                    if (hasCoords && location != null && accuracy <= LOCK_GOOD_ACCURACY_M) add(location)
                }
                for (healLoc in healCandidates) {
                    val insideZone = locationHelper.findContainingZone(
                        healLoc.latitude,
                        healLoc.longitude,
                    ) ?: continue
                    DeviceTrackingPrefs.rememberGeofence(context, true, insideZone.id)
                    lastInside = true
                    lastFenceId = insideZone.id
                    Log.i(TAG, "Healed geofence state → inside ${insideZone.name}")
                    break
                }
            }

            val insideFence: Boolean
            val fenceId: String?
            val zoneName: String?
            val distanceM: Double?

            when {
                isGeofenceEvent -> {
                    insideFence = lastInside == true ||
                        eventType.uppercase().contains("ENTER") ||
                        metadata["transition"] == "enter"
                    fenceId = when {
                        lastInside == true && lastFenceId != null -> lastFenceId
                        else -> metaId ?: lastFenceId
                    }
                    zoneName = fenceId?.let { id -> zones.firstOrNull { it.id == id }?.name }
                        ?: metaName
                    distanceM = (metadata["geofence_distance_m"] as? Number)?.toDouble()
                        ?: if (hasCoords && fenceId != null && location != null) {
                            locationHelper.distanceToZone(
                                fenceId,
                                location.latitude,
                                location.longitude
                            ).takeIf { it.isFinite() }?.toDouble()
                        } else {
                            null
                        }
                }
                // Middle-path lock/unlock: prefs = truth.
                // Never let a "±≤50m" Magarpatta centroid (~143m from Home) overwrite Inside → Outside.
                // Only set Outside when accurate fix is clearly beyond configured radius + pad (≥50m).
                lockUnlock -> {
                    val rememberedZone =
                        lastFenceId?.let { id -> zones.firstOrNull { it.id == id } }
                    val distToRemembered = if (
                        hasCoords && location != null && lastFenceId != null
                    ) {
                        locationHelper.distanceToZone(
                            lastFenceId,
                            location.latitude,
                            location.longitude
                        )
                    } else {
                        Float.NaN
                    }
                    // Soft contain: configured radius + up to 50m uncertainty (not larger).
                    val softInsideZone = if (hasCoords && location != null && zones.isNotEmpty()) {
                        locationHelper.findContainingZone(
                            location.latitude,
                            location.longitude,
                            accuracyPad = LOCK_GOOD_ACCURACY_M,
                        )
                    } else {
                        null
                    }

                    when {
                        // Strict inside configured radius with usable fix → heal Inside
                        accurateFix && distanceEval?.insideFence == true -> {
                            insideFence = true
                            fenceId = distanceEval.fenceId
                            zoneName = distanceEval.zoneName
                            distanceM =
                                distanceEval.distanceToCenter.takeIf { it.isFinite() }?.toDouble()
                            DeviceTrackingPrefs.rememberGeofence(
                                context,
                                true,
                                distanceEval.fenceId
                            )
                        }
                        // Soft inside (radius + ≤50m) → treat as Inside Home (heal prefs)
                        softInsideZone != null -> {
                            insideFence = true
                            fenceId = softInsideZone.id
                            zoneName = softInsideZone.name
                            distanceM = if (hasCoords && location != null) {
                                locationHelper.distanceToZone(
                                    softInsideZone.id,
                                    location.latitude,
                                    location.longitude
                                ).takeIf { it.isFinite() }?.toDouble()
                            } else {
                                null
                            }
                            if (lastInside != true || lastFenceId != softInsideZone.id) {
                                DeviceTrackingPrefs.rememberGeofence(
                                    context,
                                    true,
                                    softInsideZone.id
                                )
                                Log.i(
                                    TAG,
                                    "lock/unlock soft-inside → ${softInsideZone.name} " +
                                        "(pad≤${LOCK_GOOD_ACCURACY_M}m)"
                                )
                            }
                        }
                        // Prefs say Inside: keep unless clearly beyond radius + ≥50m pad
                        lastInside == true && rememberedZone != null -> {
                            val pad = maxOf(accuracy, LOCK_GOOD_ACCURACY_M)
                            val clearlyOutside = accurateFix &&
                                distToRemembered.isFinite() &&
                                distToRemembered > rememberedZone.radiusMeters + pad
                            if (clearlyOutside) {
                                insideFence = false
                                fenceId = lastFenceId
                                zoneName = rememberedZone.name
                                distanceM = distToRemembered.toDouble()
                                DeviceTrackingPrefs.rememberGeofence(context, false, lastFenceId)
                                Log.i(
                                    TAG,
                                    "lock/unlock clearly Outside ${rememberedZone.name} " +
                                        "dist=${distToRemembered.toInt()}m " +
                                        "radius=${rememberedZone.radiusMeters.toInt()}m pad=${pad.toInt()}m"
                                )
                            } else {
                                // Keep Inside — ignore 143m Magarpatta-style Outside
                                insideFence = true
                                fenceId = lastFenceId
                                zoneName = rememberedZone.name
                                distanceM = distToRemembered.takeIf { it.isFinite() }?.toDouble()
                                Log.d(
                                    TAG,
                                    "lock/unlock keep Inside ${rememberedZone.name} " +
                                        "(prefs; dist=${if (distToRemembered.isFinite()) distToRemembered.toInt() else -1}m)"
                                )
                            }
                        }
                        // Prefs Outside / unknown + accurate evaluate
                        accurateFix && distanceEval != null -> {
                            insideFence = distanceEval.insideFence
                            fenceId = distanceEval.fenceId
                                ?: lastFenceId?.takeIf { id -> zones.any { it.id == id } }
                            zoneName = distanceEval.zoneName
                                ?: fenceId?.let { id -> zones.firstOrNull { it.id == id }?.name }
                            distanceM =
                                distanceEval.distanceToCenter.takeIf { it.isFinite() }?.toDouble()
                            if (distanceEval.insideFence && distanceEval.fenceId != null) {
                                DeviceTrackingPrefs.rememberGeofence(
                                    context,
                                    true,
                                    distanceEval.fenceId
                                )
                            }
                            // Do not write Outside to prefs from lock/unlock alone when prefs unknown
                        }
                        else -> {
                            insideFence = lastInside == true
                            fenceId = lastFenceId?.takeIf { id -> zones.any { it.id == id } }
                            zoneName = fenceId?.let { id -> zones.firstOrNull { it.id == id }?.name }
                                ?: distanceEval?.zoneName
                            distanceM = if (hasCoords && fenceId != null && location != null) {
                                locationHelper.distanceToZone(
                                    fenceId,
                                    location.latitude,
                                    location.longitude
                                ).takeIf { it.isFinite() }?.toDouble()
                            } else {
                                distanceEval?.distanceToCenter?.takeIf { it.isFinite() }?.toDouble()
                            }
                        }
                    }
                }
                distanceEval?.insideFence == true -> {
                    insideFence = true
                    fenceId = distanceEval.fenceId
                    zoneName = distanceEval.zoneName
                    distanceM = distanceEval.distanceToCenter.takeIf { it.isFinite() }?.toDouble()
                }
                lastInside == true && lastFenceId != null &&
                    zones.any { it.id == lastFenceId } -> {
                    val homeZone = zones.first { it.id == lastFenceId }
                    val distToHome = if (hasCoords && location != null) {
                        locationHelper.distanceToZone(
                            lastFenceId,
                            location.latitude,
                            location.longitude
                        )
                    } else {
                        Float.NaN
                    }
                    val pad = maxOf(accuracy, 150f)
                    val clearlyOutside = distToHome.isFinite() &&
                        distToHome > homeZone.radiusMeters + pad &&
                        accuracy <= 40f
                    if (clearlyOutside) {
                        if (distanceEval != null && distanceEval.insideFence) {
                            insideFence = true
                            fenceId = distanceEval.fenceId
                            zoneName = distanceEval.zoneName
                            distanceM =
                                distanceEval.distanceToCenter.takeIf { it.isFinite() }?.toDouble()
                            DeviceTrackingPrefs.rememberGeofence(context, true, distanceEval.fenceId)
                        } else {
                            insideFence = false
                            fenceId = lastFenceId
                            zoneName = homeZone.name
                            distanceM = distToHome.takeIf { it.isFinite() }?.toDouble()
                            DeviceTrackingPrefs.rememberGeofence(context, false, lastFenceId)
                        }
                    } else {
                        insideFence = true
                        fenceId = lastFenceId
                        zoneName = homeZone.name
                        distanceM = distToHome.takeIf { it.isFinite() }?.toDouble()
                    }
                }
                accuracy <= LOCK_GOOD_ACCURACY_M && distanceEval != null -> {
                    insideFence = distanceEval.insideFence
                    fenceId = distanceEval.fenceId
                    zoneName = distanceEval.zoneName
                    distanceM = distanceEval.distanceToCenter.takeIf { it.isFinite() }?.toDouble()
                    if (distanceEval.insideFence && distanceEval.fenceId != null) {
                        DeviceTrackingPrefs.rememberGeofence(context, true, distanceEval.fenceId)
                    }
                }
                else -> {
                    insideFence = lastInside == true
                    fenceId = lastFenceId?.takeIf { id -> zones.any { it.id == id } }
                    zoneName = fenceId?.let { id -> zones.firstOrNull { it.id == id }?.name }
                        ?: distanceEval?.zoneName
                    distanceM = if (hasCoords && fenceId != null && location != null) {
                        locationHelper.distanceToZone(
                            fenceId,
                            location.latitude,
                            location.longitude
                        ).takeIf { it.isFinite() }?.toDouble()
                    } else {
                        distanceEval?.distanceToCenter?.takeIf { it.isFinite() }?.toDouble()
                    }
                }
            }

            val enrichedMeta = buildMap {
                putAll(metadata)
                if (resolved != null) {
                    put("location_tier", resolved.tier)
                    put("location_cache_hit", resolved.cacheHit)
                    put("location_duration_ms", resolved.durationMs)
                }
                put("location_accuracy_m", location?.accuracy?.toDouble() ?: 0.0)
                put("geo_strategy", resolveResult.strategy)
                put("geo_used_gps", resolveResult.usedGps)
                if (addressParts != null) {
                    put("address_country", addressParts.country)
                    put("address_state", addressParts.state)
                    put("address_city", addressParts.city)
                    put("address_postal", addressParts.postalCode)
                }
                if (!zoneName.isNullOrBlank()) {
                    put("geofence_name", zoneName)
                }
                if (fenceId != null) {
                    put("geofence_id", fenceId)
                }
                if (distanceM != null) {
                    put("geofence_distance_m", distanceM)
                }
            }

            val entry = TimelineEntry(
                eventType = eventType,
                status = status,
                location = LocationData(
                    latitude = location?.latitude ?: 0.0,
                    longitude = location?.longitude ?: 0.0,
                    accuracyMeters = location?.accuracy ?: 0f,
                    detailedAddress = address ?: "Address Unavailable (Offline)"
                ),
                geofenceStatus = GeofenceStatus(
                    insideFence = insideFence,
                    fenceId = fenceId
                ),
                metadata = enrichedMeta
            )

            timelineStorage.appendTimelineEntrySync(entry)
            EventSyncPublisher.publishAsync(context, entry, addressParts)

            if (location != null) {
                DevicePresenceTracker.pingFromEvent(
                    context,
                    location.latitude,
                    location.longitude,
                    location.accuracy,
                    eventType
                )
            }
            if (resolved != null && location != null) {
                GeoSnapshotWriter.enqueueFromResolved(
                    context = context,
                    resolved = resolved,
                    triggerSource = eventType,
                    address = address,
                    insideGeofence = insideFence,
                    geofenceId = fenceId
                )
            }
            Log.d(
                TAG,
                "Logged event: $eventType / $status strategy=${resolveResult.strategy} " +
                    "acc=${location?.accuracy} inside=$insideFence"
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to log event", e)
        }
    }

    /**
     * Lock/unlock → middle-path; other non-geofence → GPS-every-event.
     * See docs/battery/GEOFENCE_GPS_STRATEGIES.md
     */
    private fun resolveLocationForEvent(
        eventType: String,
        severity: LocationResolver.Severity,
        isGeofenceEvent: Boolean,
        lockUnlock: Boolean
    ): ResolveResult {
        if (isGeofenceEvent) {
            val cheap = LocationResolver.resolveBestWithoutGps(context)
            return ResolveResult(
                addressResolved = cheap,
                addressLocation = cheap?.location,
                geoLocation = cheap?.location,
                strategy = "geofence_event",
                usedGps = false
            )
        }

        if (lockUnlock) {
            val cheap = LocationResolver.resolveBestWithoutGps(context)
            val cheapLoc = cheap?.location
            val cheapAcc = cheapLoc?.accuracy?.takeIf { it > 0f } ?: 999f

            if (cheapLoc != null && cheapAcc <= LOCK_GOOD_ACCURACY_M) {
                Log.d(TAG, "lock/unlock middle-path: cheap ok acc=$cheapAcc (≤$LOCK_GOOD_ACCURACY_M)")
                return ResolveResult(
                    addressResolved = cheap,
                    addressLocation = cheapLoc,
                    geoLocation = cheapLoc,
                    strategy = "lock_middle_cheap",
                    usedGps = false
                )
            }

            val now = SystemClock.elapsedRealtime()
            val lastGps = lastLockUnlockGpsElapsed.get()
            val throttled = lastGps > 0L && (now - lastGps) < LOCK_GPS_THROTTLE_MS
            if (throttled) {
                Log.d(
                    TAG,
                    "lock/unlock middle-path: GPS throttled " +
                        "(${(now - lastGps) / 1000}s < ${LOCK_GPS_THROTTLE_MS / 1000}s) " +
                        "acc=$cheapAcc — prefs trusted"
                )
                return ResolveResult(
                    addressResolved = cheap,
                    addressLocation = cheapLoc,
                    geoLocation = cheapLoc,
                    strategy = "lock_middle_throttled",
                    usedGps = false
                )
            }

            Log.d(TAG, "lock/unlock middle-path: escalating GPS (cheapAcc=$cheapAcc)")
            val gps = LocationResolver.resolveSync(context, LocationResolver.Severity.SECURITY)
            lastLockUnlockGpsElapsed.set(SystemClock.elapsedRealtime())
            val geoLoc = gps?.location ?: cheapLoc
            return ResolveResult(
                addressResolved = cheap ?: gps,
                addressLocation = cheapLoc ?: geoLoc,
                geoLocation = geoLoc,
                strategy = "lock_middle_gps",
                usedGps = gps != null
            )
        }

        // GPS-every-event (documented restorable path) for all other events
        val addressResolved = if (isCacheOnlyEvent(eventType)) {
            LocationResolver.resolveBestWithoutGps(context)
        } else {
            LocationResolver.resolveSync(context, severity)
        }
        val geoResolved = LocationResolver.resolveSync(context, LocationResolver.Severity.SECURITY)
            ?: addressResolved
        return ResolveResult(
            addressResolved = addressResolved,
            addressLocation = addressResolved?.location,
            geoLocation = geoResolved?.location,
            strategy = "gps_every_event",
            usedGps = true
        )
    }

    private data class ResolveResult(
        val addressResolved: LocationResolver.ResolvedLocation?,
        val addressLocation: Location?,
        val geoLocation: Location?,
        val strategy: String,
        val usedGps: Boolean
    )

    companion object {
        private const val TAG = "TimelineEventLogger"
        private val lastEventTimes = java.util.concurrent.ConcurrentHashMap<String, Long>()
        private const val DEBOUNCE_MS = 1000L

        /**
         * Middle-path: cheap fix is good enough only if accuracy ≤ 50m.
         * Do not raise above 50 — that recreates Magarpatta false-Outside.
         */
        private const val LOCK_GOOD_ACCURACY_M = 50f

        /** Min interval between GPS wakes for lock/unlock when cheap fix is coarse. */
        private const val LOCK_GPS_THROTTLE_MS = 5 * 60 * 1000L

        private val lastLockUnlockGpsElapsed = AtomicLong(0L)

        private fun isLockUnlockEvent(eventType: String): Boolean {
            return when (eventType.uppercase()) {
                "SCREEN_LOCK", "SCREEN_UNLOCK" -> true
                else -> false
            }
        }

        private fun isCacheOnlyEvent(eventType: String): Boolean {
            return when (eventType.uppercase()) {
                "SCREEN_LOCK", "SCREEN_UNLOCK",
                "WIFI_CONNECTED", "WIFI_DISCONNECTED",
                "WIFI_ENABLED", "WIFI_DISABLED",
                "BLUETOOTH_ENABLED", "BLUETOOTH_DISABLED",
                "BLUETOOTH_CONNECTED", "BLUETOOTH_DISCONNECTED",
                "MOBILE_DATA_ENABLED", "MOBILE_DATA_DISABLED",
                "AIRPLANE_MODE_ENABLED", "AIRPLANE_MODE_DISABLED",
                "HOTSPOT_ENABLED", "HOTSPOT_DISABLED" -> true
                else -> false
            }
        }

        fun shouldDebounce(eventType: String, status: String): Boolean {
            val key = "$eventType:$status"
            val now = System.currentTimeMillis()
            val lastTime = lastEventTimes[key]
            if (lastTime != null && (now - lastTime) < DEBOUNCE_MS) {
                return true
            }
            lastEventTimes[key] = now
            return false
        }
    }
}
