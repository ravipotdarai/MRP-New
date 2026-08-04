package com.mrp.domain.usecase

import android.content.Context
import android.location.Location
import android.os.SystemClock
import android.util.Log
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.data.local.LiveLocationStore
import com.mrp.data.local.TrustedSnapshotStore
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicLong

/**
 * Single source of truth for live geolocation + geofence badge.
 *
 * - TRUSTED fixes publish to prefs badge, process cache, LiveLocationStore, TrustedSnapshotStore.
 * - PROVISIONAL fixes never flip badge and never poison live/cache/Drive current.
 * - Event stamps are copies of the trusted snapshot (or badge-only if deferred) — immutable at write.
 *
 * Battery: GPS is budgeted per [Demand]; Drive heartbeat prefers reuse.
 */
object LocationEngine {

    private const val TAG = "LocationEngine"
    private const val TAG_BATTERY = LocationResolver.TAG_BATTERY

    /** Reuse last TRUSTED without new GPS if fresher than this. */
    const val T_REUSE_MS = 3 * 60_000L

    /** Lock/unlock coalesce window — at most one GPS wake. */
    private const val LOCK_GPS_COALESCE_MS = 75_000L

    /** Drive heartbeat: wake GPS only if trusted older than this. */
    const val T_DRIVE_STALE_MS = 18 * 60_000L

    /** TRUSTED accuracy gate. */
    private const val TRUSTED_ACCURACY_M = 50f

    /** Max wall-clock age of the Location.time for TRUSTED. */
    private const val TRUSTED_MAX_FIX_AGE_MS = 2 * 60_000L

    enum class FixQuality {
        TRUSTED,
        PROVISIONAL,
        NONE
    }

    sealed class Demand {
        data class Event(val eventType: String) : Demand()
        object GeofenceOs : Demand()
        object HomeRefresh : Demand()
        object EmergencyTick : Demand()
        object DriveHeartbeat : Demand()
    }

    /**
     * Immutable stamp for a timeline row (write once).
     * [hasCoords] false → UI should not show a pin / Away·Xm from ghosts.
     */
    data class EventLocationStamp(
        val hasCoords: Boolean,
        val latitude: Double,
        val longitude: Double,
        val accuracyM: Float,
        val address: String?,
        val insideFence: Boolean,
        val fenceId: String?,
        val zoneName: String?,
        val awayM: Double?,
        val distanceToCenterM: Double?,
        val quality: FixQuality,
        val tier: String,
        val locationDeferred: Boolean,
        val evaluatedAtMs: Long,
        val strategy: String,
        val usedGps: Boolean
    )

    data class EngineResult(
        val snapshot: TrustedSnapshotStore.Snapshot?,
        val stamp: EventLocationStamp,
        val didWakeGps: Boolean,
        val strategy: String
    )

    private val lastLockGpsElapsed = AtomicLong(0L)
    private val lastAnyGpsElapsed = AtomicLong(0L)

    fun peekSnapshot(context: Context): TrustedSnapshotStore.Snapshot? =
        TrustedSnapshotStore.read(context)

    fun obtain(context: Context, demand: Demand): EngineResult {
        val app = context.applicationContext
        val helper = LocationHelper(app)
        val previous = TrustedSnapshotStore.read(app)
        val prefsInside = DeviceTrackingPrefs.lastGeofenceInside(app)
        val prefsFenceId = DeviceTrackingPrefs.lastGeofenceId(app)

        val mustWake = shouldWakeGps(app, demand, previous)
        var didWake = false
        var strategy: String
        var resolved: LocationResolver.ResolvedLocation? = null

        if (mustWake) {
            didWake = true
            val severity = when (demand) {
                is Demand.HomeRefresh -> LocationResolver.Severity.UI
                is Demand.EmergencyTick -> LocationResolver.Severity.SECURITY
                is Demand.GeofenceOs -> LocationResolver.Severity.SECURITY
                is Demand.Event -> LocationResolver.severityForEvent(demand.eventType).let {
                    if (it == LocationResolver.Severity.INFORMATIONAL) {
                        LocationResolver.Severity.SECURITY
                    } else {
                        it
                    }
                }
                is Demand.DriveHeartbeat -> LocationResolver.Severity.UI
            }
            val timeoutNote = when (demand) {
                is Demand.HomeRefresh -> "home_refresh"
                is Demand.EmergencyTick -> "emergency"
                is Demand.DriveHeartbeat -> "drive_stale"
                is Demand.GeofenceOs -> "geofence_os"
                is Demand.Event -> "event:${demand.eventType}"
            }
            Log.i(TAG_BATTERY, "LocationEngine wake GPS demand=$timeoutNote")
            resolved = LocationResolver.resolveSync(app, severity, bypassCache = true)
            lastAnyGpsElapsed.set(SystemClock.elapsedRealtime())
            if (demand is Demand.Event && isLockUnlock(demand.eventType)) {
                lastLockGpsElapsed.set(SystemClock.elapsedRealtime())
            }
            strategy = "gps:$timeoutNote"
        } else if (previous != null && previous.quality == FixQuality.TRUSTED.name &&
            previous.ageWallMs() <= T_REUSE_MS
        ) {
            strategy = "reuse_trusted"
        } else {
            strategy = "hold_prefs"
        }

        val quality = classify(resolved?.location, resolved?.tier)
        var published: TrustedSnapshotStore.Snapshot? = previous

        if (quality == FixQuality.TRUSTED && resolved?.location != null) {
            val loc = resolved.location
            val geo = helper.evaluateGeofence(loc.latitude, loc.longitude)
            val parts = helper.reverseGeocodePartsSync(loc.latitude, loc.longitude)
            val address = parts?.formatted
                ?: helper.reverseGeocodeSync(loc.latitude, loc.longitude)

            // Only TRUSTED may flip geofence prefs
            DeviceTrackingPrefs.rememberGeofence(app, geo.insideFence, geo.fenceId)

            published = TrustedSnapshotStore.Snapshot(
                latitude = loc.latitude,
                longitude = loc.longitude,
                accuracyM = loc.accuracy,
                fixMs = if (loc.time > 0L) loc.time else System.currentTimeMillis(),
                tier = resolved.tier,
                quality = FixQuality.TRUSTED.name,
                insideFence = geo.insideFence,
                fenceId = geo.fenceId,
                zoneName = geo.zoneName,
                awayM = if (!geo.insideFence && geo.awayMeters.isFinite()) {
                    geo.awayMeters.toDouble()
                } else {
                    null
                },
                distanceToCenterM = if (geo.insideFence && geo.distanceToCenter.isFinite()) {
                    geo.distanceToCenter.toDouble()
                } else {
                    null
                },
                address = address,
                publishedElapsedMs = SystemClock.elapsedRealtime()
            )
            TrustedSnapshotStore.write(app, published)
            LocationResolver.updateCache(loc, resolved.tier)
            writeLiveStore(app, published, "engine:$strategy")
            Log.i(
                TAG,
                "published TRUSTED inside=${geo.insideFence} zone=${geo.zoneName} " +
                    "tier=${resolved.tier} acc=${loc.accuracy}"
            )
        } else if (mustWake && resolved != null) {
            Log.w(
                TAG,
                "GPS wake did not yield TRUSTED (tier=${resolved.tier} acc=${resolved.location.accuracy}) — hold prior"
            )
            strategy = "$strategy/untrusted_hold"
        }

        val stamp = buildStamp(
            demand = demand,
            published = published,
            previous = previous,
            prefsInside = prefsInside,
            prefsFenceId = prefsFenceId,
            strategy = strategy,
            usedGps = didWake && resolved != null,
            helper = helper,
            app = app
        )

        return EngineResult(
            snapshot = published,
            stamp = stamp,
            didWakeGps = didWake,
            strategy = strategy
        )
    }

    /**
     * Apply OS geofence transition prefs first, then attach TRUSTED coords when budget allows.
     */
    fun onOsGeofenceTransition(
        context: Context,
        entered: Boolean,
        fenceId: String?,
        zoneName: String?
    ): EngineResult {
        val app = context.applicationContext
        if (entered && fenceId != null) {
            DeviceTrackingPrefs.rememberGeofence(app, true, fenceId)
        } else if (!entered) {
            // Leaving: only set Away if evaluate (after obtain) agrees, or no other zone.
            // Prefs Away tentatively; obtain may heal to another inside zone.
            DeviceTrackingPrefs.rememberGeofence(app, false, fenceId)
        }
        val result = obtain(app, Demand.GeofenceOs)
        // If we got TRUSTED inside another zone after EXIT, prefs already updated in publish.
        // If still Away with no TRUSTED, keep OS Away but stamp may be deferred.
        if (zoneName != null && result.stamp.zoneName == null && entered) {
            // Enrich stamp name from OS if reuse had no name
            return result.copy(
                stamp = result.stamp.copy(
                    insideFence = true,
                    fenceId = fenceId ?: result.stamp.fenceId,
                    zoneName = zoneName
                )
            )
        }
        return result
    }

    private fun shouldWakeGps(
        context: Context,
        demand: Demand,
        previous: TrustedSnapshotStore.Snapshot?
    ): Boolean {
        val trustedFresh = previous != null &&
            previous.quality == FixQuality.TRUSTED.name &&
            previous.ageWallMs() <= T_REUSE_MS

        return when (demand) {
            is Demand.HomeRefresh -> true
            is Demand.EmergencyTick -> true
            is Demand.DriveHeartbeat -> {
                previous == null ||
                    previous.quality != FixQuality.TRUSTED.name ||
                    previous.ageWallMs() > T_DRIVE_STALE_MS
            }
            is Demand.GeofenceOs -> !trustedFresh
            is Demand.Event -> {
                val t = demand.eventType.uppercase()
                when {
                    isHighSeverity(t) -> true
                    isLockUnlock(t) -> {
                        if (trustedFresh) return false
                        val now = SystemClock.elapsedRealtime()
                        val last = lastLockGpsElapsed.get()
                        last <= 0L || (now - last) >= LOCK_GPS_COALESCE_MS
                    }
                    else -> !trustedFresh
                }
            }
        }
    }

    private fun classify(loc: Location?, tier: String?): FixQuality {
        if (loc == null) return FixQuality.NONE
        if (!loc.hasAccuracy() || loc.accuracy <= 0f || loc.accuracy > TRUSTED_ACCURACY_M) {
            return FixQuality.PROVISIONAL
        }
        val age = System.currentTimeMillis() - loc.time
        if (age !in 0L..TRUSTED_MAX_FIX_AGE_MS && loc.time > 0L) {
            return FixQuality.PROVISIONAL
        }
        val t = (tier ?: loc.provider ?: "").lowercase()
        // After bypassCache resolve, wifi/cell that somehow report ≤50m still provisional
        // unless tier is gps (fused high-accuracy path finishes as gps).
        if (t.contains("wifi") || t.contains("cell") || t.contains("network") ||
            t == "last_known" || t == "cache"
        ) {
            return FixQuality.PROVISIONAL
        }
        return FixQuality.TRUSTED
    }

    private fun buildStamp(
        demand: Demand,
        published: TrustedSnapshotStore.Snapshot?,
        previous: TrustedSnapshotStore.Snapshot?,
        prefsInside: Boolean?,
        prefsFenceId: String?,
        strategy: String,
        usedGps: Boolean,
        helper: LocationHelper,
        app: Context
    ): EventLocationStamp {
        val now = System.currentTimeMillis()
        val best = published?.takeIf { it.quality == FixQuality.TRUSTED.name }
            ?: previous?.takeIf {
                it.quality == FixQuality.TRUSTED.name && it.ageWallMs(now) <= T_REUSE_MS
            }

        if (best != null) {
            return EventLocationStamp(
                hasCoords = true,
                latitude = best.latitude,
                longitude = best.longitude,
                accuracyM = best.accuracyM,
                address = best.address,
                insideFence = best.insideFence,
                fenceId = best.fenceId,
                zoneName = best.zoneName,
                awayM = best.awayM,
                distanceToCenterM = best.distanceToCenterM,
                quality = FixQuality.TRUSTED,
                tier = best.tier,
                locationDeferred = false,
                evaluatedAtMs = now,
                strategy = strategy,
                usedGps = usedGps
            )
        }

        // No fresh TRUSTED — badge from last trusted prefs / durable snapshot, no ghost coords
        val snap = published ?: previous
        val inside = when {
            snap != null && snap.quality == FixQuality.TRUSTED.name -> snap.insideFence
            prefsInside != null -> prefsInside
            else -> false
        }
        val fenceId = when {
            inside && snap?.fenceId != null -> snap.fenceId
            inside -> prefsFenceId
            else -> null
        }
        val zoneName = fenceId?.let { id ->
            helper.reloadGeofencesFromStorage()
            // use evaluate only for name lookup via storage
            com.mrp.data.local.GeofenceStorage.list(app).firstOrNull { it.id == id }?.name
        } ?: snap?.zoneName?.takeIf { inside }

        return EventLocationStamp(
            hasCoords = false,
            latitude = 0.0,
            longitude = 0.0,
            accuracyM = 0f,
            address = null,
            insideFence = inside,
            fenceId = fenceId,
            zoneName = zoneName,
            awayM = null,
            distanceToCenterM = null,
            quality = FixQuality.NONE,
            tier = "deferred",
            locationDeferred = true,
            evaluatedAtMs = now,
            strategy = strategy,
            usedGps = usedGps
        )
    }

    private fun writeLiveStore(
        context: Context,
        snap: TrustedSnapshotStore.Snapshot,
        source: String
    ) {
        val payload = JSONObject()
            .put("atMs", snap.fixMs)
            .put("lat", snap.latitude)
            .put("lng", snap.longitude)
            .put("accuracyM", snap.accuracyM.toDouble())
            .put("source", source)
            .put("address", snap.address ?: "")
            .put("insideGeofence", snap.insideFence)
            .put("geofenceId", snap.fenceId)
            .put("geofenceName", snap.zoneName)
            .put(
                "distanceToFenceM",
                when {
                    snap.insideFence && snap.distanceToCenterM != null -> snap.distanceToCenterM
                    !snap.insideFence && snap.awayM != null -> snap.awayM
                    else -> JSONObject.NULL
                }
            )
            .put("quality", snap.quality)
            .put("tier", snap.tier)
        LiveLocationStore.save(context, payload)
    }

    private fun isLockUnlock(eventType: String): Boolean {
        val t = eventType.uppercase()
        return t == "SCREEN_LOCK" || t == "SCREEN_UNLOCK"
    }

    private fun isHighSeverity(eventType: String): Boolean {
        return when (eventType.uppercase()) {
            "WRONG_PASSWORD", "WRONG_BIOMETRIC", "WRONG_UNLOCK_ATTEMPT", "UNLOCK_FAILED",
            "USB_CONNECTED", "USB_DISCONNECTED", "FACTORY_RESET",
            "SIM_REMOVED", "SIM_INSERTED", "SIM_CHANGE" -> true
            else -> false
        }
    }
}
