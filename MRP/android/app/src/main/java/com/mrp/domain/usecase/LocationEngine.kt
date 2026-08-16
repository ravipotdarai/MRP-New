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
        /** Home soft load — never wake GPS; stamp from trusted snapshot / prefs only. */
        object HomePeek : Demand()
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
                is Demand.HomePeek -> LocationResolver.Severity.UI
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
                is Demand.HomePeek -> "home_peek"
                is Demand.EmergencyTick -> "emergency"
                is Demand.DriveHeartbeat -> "drive_stale"
                is Demand.GeofenceOs -> "geofence_os"
                is Demand.Event -> "event:${demand.eventType}"
            }
            Log.i(TAG_BATTERY, "LocationEngine wake GPS demand=$timeoutNote")
            val idle = DevicePowerMode.isIdle(app)
            val highAcc = DeviceTrackingPrefs.isHighAccuracy(app)
            val highSev = demand is Demand.Event &&
                LocationWakePolicy.isHighSeverity(demand.eventType)
            val bypassCache = !idle && (highAcc || highSev)
            resolved = LocationResolver.resolveSync(
                app,
                severity,
                bypassCache = bypassCache,
                highAccuracy = highAcc || highSev,
            )
            lastAnyGpsElapsed.set(SystemClock.elapsedRealtime())
            if (demand is Demand.Event && LocationWakePolicy.isLockUnlock(demand.eventType)) {
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
            val osInside = DeviceTrackingPrefs.lastGeofenceInside(app)
            val osFenceId = DeviceTrackingPrefs.lastGeofenceId(app)
            // OS ENTER is authority when a new fix still evaluates Away (stale last-known).
            val useOsEnter = demand is Demand.GeofenceOs && osInside == true && !geo.insideFence
            val insideFence = if (useOsEnter) true else geo.insideFence
            val fenceId = if (useOsEnter) osFenceId else geo.fenceId
            val zoneName = if (useOsEnter) {
                com.mrp.data.local.GeofenceStorage.list(app).firstOrNull { it.id == osFenceId }?.name
                    ?: geo.zoneName
            } else {
                geo.zoneName
            }
            val parts = helper.reverseGeocodePartsSync(loc.latitude, loc.longitude)
            val address = parts?.formatted
                ?: helper.reverseGeocodeSync(loc.latitude, loc.longitude)

            DeviceTrackingPrefs.rememberGeofence(app, insideFence, fenceId)

            published = TrustedSnapshotStore.Snapshot(
                latitude = loc.latitude,
                longitude = loc.longitude,
                accuracyM = loc.accuracy,
                fixMs = if (loc.time > 0L) loc.time else System.currentTimeMillis(),
                tier = resolved.tier,
                quality = FixQuality.TRUSTED.name,
                insideFence = insideFence,
                fenceId = fenceId,
                zoneName = zoneName,
                awayM = if (!insideFence && geo.awayMeters.isFinite()) {
                    geo.awayMeters.toDouble()
                } else {
                    null
                },
                distanceToCenterM = if (insideFence && geo.distanceToCenter.isFinite() && !useOsEnter) {
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
            GpsTrailWriter.enqueueTrusted(app, loc, loc.accuracy, resolved.tier)
            Log.i(
                TAG,
                "published TRUSTED inside=$insideFence zone=$zoneName " +
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
        return applyOsFenceToResult(app, result, entered, fenceId, zoneName)
    }

    /**
     * Idle reuse can keep an old Away snapshot. OS ENTER/EXIT still wins the badge.
     */
    private fun applyOsFenceToResult(
        app: Context,
        result: EngineResult,
        entered: Boolean,
        fenceId: String?,
        zoneName: String?
    ): EngineResult {
        val stamp = result.stamp
        if (entered && fenceId != null) {
            val alreadyInsideThis = stamp.insideFence && stamp.fenceId == fenceId
            if (alreadyInsideThis) return result
            DeviceTrackingPrefs.rememberGeofence(app, true, fenceId)
            val patchedSnap = result.snapshot?.copy(
                insideFence = true,
                fenceId = fenceId,
                zoneName = zoneName ?: result.snapshot.zoneName,
                awayM = null,
            )
            if (patchedSnap != null) {
                TrustedSnapshotStore.write(app, patchedSnap)
                writeLiveStore(app, patchedSnap, "os_enter:$fenceId")
            }
            return result.copy(
                snapshot = patchedSnap ?: result.snapshot,
                stamp = stamp.copy(
                    insideFence = true,
                    fenceId = fenceId,
                    zoneName = zoneName ?: stamp.zoneName,
                    awayM = null,
                    locationDeferred = stamp.locationDeferred,
                    strategy = "${stamp.strategy}/os_enter"
                )
            )
        }
        if (!entered && fenceId != null && stamp.insideFence && stamp.fenceId == fenceId) {
            DeviceTrackingPrefs.rememberGeofence(app, false, fenceId)
            val patchedSnap = result.snapshot?.copy(
                insideFence = false,
                fenceId = fenceId,
                zoneName = zoneName ?: result.snapshot.zoneName,
                distanceToCenterM = null,
            )
            if (patchedSnap != null) {
                TrustedSnapshotStore.write(app, patchedSnap)
                writeLiveStore(app, patchedSnap, "os_exit:$fenceId")
            }
            return result.copy(
                snapshot = patchedSnap ?: result.snapshot,
                stamp = stamp.copy(
                    insideFence = false,
                    fenceId = fenceId,
                    zoneName = zoneName ?: stamp.zoneName,
                    distanceToCenterM = null,
                    strategy = "${stamp.strategy}/os_exit"
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
        val hasTrusted = previous != null && previous.quality == FixQuality.TRUSTED.name
        val age = previous?.ageWallMs() ?: Long.MAX_VALUE
        val now = SystemClock.elapsedRealtime()
        val last = lastLockGpsElapsed.get()
        val lockOk = last <= 0L || (now - last) >= LOCK_GPS_COALESCE_MS
        val kind = when (demand) {
            is Demand.HomeRefresh -> LocationWakePolicy.KIND_HOME_REFRESH
            is Demand.HomePeek -> LocationWakePolicy.KIND_HOME_PEEK
            is Demand.EmergencyTick -> LocationWakePolicy.KIND_EMERGENCY
            is Demand.DriveHeartbeat -> LocationWakePolicy.KIND_DRIVE
            is Demand.GeofenceOs -> LocationWakePolicy.KIND_GEOFENCE
            is Demand.Event -> LocationWakePolicy.KIND_EVENT
        }
        val eventType = (demand as? Demand.Event)?.eventType
        return LocationWakePolicy.shouldWakeGps(
            idle = DevicePowerMode.isIdle(context),
            demandKind = kind,
            eventType = eventType,
            hasTrusted = hasTrusted,
            snapshotAgeMs = age,
            lockGpsCoalesceOk = lockOk,
        )
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
        if (t == "last_known" || t == "cache") {
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
}
