package com.mrp.domain.usecase

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.Location
import android.os.BatteryManager
import android.os.SystemClock
import android.util.Log
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.data.local.GpsTrailDao
import com.mrp.data.local.TrustedSnapshotStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicLong

/**
 * GPS trail append for JPNI day packs.
 *
 * - [enqueueTrusted]: dense path from a fresh GPS wake (speed-based interval).
 * - [enqueueStamp]: event / heartbeat / idle breadcrumb **without** waking GPS —
 *   uses last trusted snapshot or explicit coords so path fills when events exist.
 */
object GpsTrailWriter {

    private const val TAG = "GpsTrailWriter"
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val lastSampleElapsed = AtomicLong(0L)
    private val lastStampElapsed = AtomicLong(0L)

    /** Soft gap between event/heartbeat/idle stamps (same-place OK). */
    private const val STAMP_MIN_INTERVAL_MS = 45_000L
    /** Idle ticker can stamp once per minute. */
    const val IDLE_TICK_MS = 60_000L

    enum class StampReason {
        EVENT,
        HEARTBEAT,
        IDLE_TICK,
        GEOFENCE,
    }

    fun enqueueTrusted(
        context: Context,
        location: Location,
        accuracyM: Float,
        tier: String,
    ) {
        if (location.latitude == 0.0 && location.longitude == 0.0) return
        val app = context.applicationContext
        val emergency = DeviceTrackingPrefs.isEmergencyTracking(app)
        val speed = if (location.hasSpeed()) location.speed else 0f
        val minInterval = when {
            emergency -> 5_000L
            speed >= 2.5f -> 15_000L
            speed >= 0.5f -> 25_000L
            else -> 90_000L
        }
        val nowElapsed = SystemClock.elapsedRealtime()
        val last = lastSampleElapsed.get()
        if (last > 0L && nowElapsed - last < minInterval) return
        lastSampleElapsed.set(nowElapsed)
        lastStampElapsed.set(nowElapsed)

        insertPoint(
            app = app,
            capturedAtMs = if (location.time > 0L) location.time else System.currentTimeMillis(),
            latitude = location.latitude,
            longitude = location.longitude,
            speedMps = speed,
            headingDeg = if (location.hasBearing()) location.bearing else 0f,
            accuracyM = accuracyM,
            altitudeM = if (location.hasAltitude()) location.altitude else 0.0,
            tier = tier,
            motion = motionFromSpeed(speed),
        )
    }

    /**
     * Breadcrumb for path filling — no GPS wake.
     * Prefer [TrustedSnapshotStore]; fall back to explicit lat/lng from the event stamp.
     */
    fun enqueueStamp(
        context: Context,
        reason: StampReason,
        latitude: Double? = null,
        longitude: Double? = null,
        accuracyM: Float? = null,
        tier: String? = null,
        force: Boolean = false,
    ) {
        val app = context.applicationContext
        val snap = TrustedSnapshotStore.read(app)
        val lat = when {
            latitude != null && (kotlin.math.abs(latitude) > 1e-7 || (longitude != null && kotlin.math.abs(longitude) > 1e-7)) ->
                latitude
            snap != null -> snap.latitude
            else -> return
        }
        val lng = when {
            longitude != null && (kotlin.math.abs(lat) > 1e-7 || kotlin.math.abs(longitude) > 1e-7) ->
                longitude
            snap != null -> snap.longitude
            else -> return
        }
        if (lat == 0.0 && lng == 0.0) return

        val nowElapsed = SystemClock.elapsedRealtime()
        val minGap = when (reason) {
            StampReason.EVENT, StampReason.GEOFENCE -> if (force) 0L else 15_000L
            StampReason.HEARTBEAT -> STAMP_MIN_INTERVAL_MS
            StampReason.IDLE_TICK -> IDLE_TICK_MS - 5_000L
        }
        val last = lastStampElapsed.get()
        if (!force && last > 0L && nowElapsed - last < minGap) {
            Log.d(TAG, "stamp skip $reason (gap)")
            return
        }
        lastStampElapsed.set(nowElapsed)

        val acc = accuracyM ?: snap?.accuracyM ?: 50f
        val t = tier ?: snap?.tier ?: "stamp"
        insertPoint(
            app = app,
            capturedAtMs = System.currentTimeMillis(),
            latitude = lat,
            longitude = lng,
            speedMps = 0f,
            headingDeg = 0f,
            accuracyM = acc,
            altitudeM = 0.0,
            tier = t,
            motion = "idle",
        )
        Log.d(TAG, "stamp $reason lat=$lat lng=$lng")
    }

    /** Stamp from engine event stamp when coords are present. */
    fun enqueueFromEventCoords(
        context: Context,
        hasCoords: Boolean,
        latitude: Double,
        longitude: Double,
        accuracyM: Float,
        tier: String,
        reason: StampReason = StampReason.EVENT,
    ) {
        if (!hasCoords) {
            // Still try trusted snapshot so path can advance on events without coords on the row.
            enqueueStamp(context, reason)
            return
        }
        enqueueStamp(
            context = context,
            reason = reason,
            latitude = latitude,
            longitude = longitude,
            accuracyM = accuracyM,
            tier = tier,
            force = reason == StampReason.EVENT || reason == StampReason.GEOFENCE,
        )
    }

    private fun insertPoint(
        app: Context,
        capturedAtMs: Long,
        latitude: Double,
        longitude: Double,
        speedMps: Float,
        headingDeg: Float,
        accuracyM: Float,
        altitudeM: Double,
        tier: String,
        motion: String,
    ) {
        scope.launch {
            try {
                val networkType = when {
                    LocationResolver.isWifiConnected(app) -> "wifi"
                    LocationResolver.isCellularAvailable(app) -> "cell"
                    else -> "offline"
                }
                GpsTrailDao(app).insert(
                    GpsTrailDao.TrailPoint(
                        capturedAtMs = capturedAtMs,
                        latitude = latitude,
                        longitude = longitude,
                        speedMps = speedMps,
                        headingDeg = headingDeg,
                        accuracyM = accuracyM,
                        altitudeM = altitudeM,
                        batteryPct = readBatteryPct(app),
                        networkType = networkType,
                        gpsOk = tier == "gps" || accuracyM in 0.1f..80f,
                        motion = motion,
                    ),
                )
            } catch (e: Exception) {
                Log.w(TAG, "insert failed", e)
            }
        }
    }

    private fun motionFromSpeed(speed: Float): String = when {
        speed < 0.5f -> "idle"
        speed < 2.5f -> "walk"
        else -> "drive"
    }

    private fun readBatteryPct(context: Context): Int {
        return try {
            val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            if (level >= 0 && scale > 0) level * 100 / scale else -1
        } catch (_: Exception) {
            -1
        }
    }
}
