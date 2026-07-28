package com.mrp.domain.usecase

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.app.ActivityCompat
import com.google.android.gms.location.LocationServices
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.data.local.LiveLocationStore
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

/**
 * On-device live snapshot only — updated from security/network events (and rare emergency one-shots).
 * Does **not** hold continuous fused location updates (avoids persistent location icon).
 */
object DevicePresenceTracker {

    private const val TAG = "DevicePresence"
    private val running = AtomicBoolean(false)
    private var emergencyHandler: Handler? = null
    private var emergencyRunnable: Runnable? = null

    fun start(context: Context) {
        if (!DeviceTrackingPrefs.isMovementTracking(context)) {
            stop(context)
            return
        }
        running.set(true)
        // No continuous GPS — seed from cache only
        LocationResolver.peekCache()?.let { loc ->
            persistLocal(
                context.applicationContext,
                loc.latitude,
                loc.longitude,
                loc.accuracy,
                "cache_seed",
                emitGeofenceTimeline = false
            )
        }
        scheduleEmergency(context.applicationContext)
        Log.i(TAG, "presence ready (event-driven, no continuous location)")
    }

    fun startIfBackgroundAllowed(context: Context) {
        if (!DeviceTrackingPrefs.isBackgroundTracking(context)) {
            Log.d(TAG, "backgroundTracking off — skip service start")
            return
        }
        start(context)
    }

    fun stop(context: Context) {
        running.set(false)
        cancelEmergency()
    }

    fun restart(context: Context) {
        stop(context)
        start(context)
    }

    fun pingFromEvent(
        context: Context,
        lat: Double,
        lng: Double,
        accuracy: Float,
        eventType: String
    ) {
        if (!DeviceTrackingPrefs.isMovementTracking(context) &&
            !eventType.startsWith("GEOFENCE_")
        ) {
            // Still update live store from events for Drive vault completeness
        }
        persistLocal(
            context.applicationContext,
            lat,
            lng,
            accuracy,
            "event:$eventType",
            emitGeofenceTimeline = false // TimelineEventLogger / OS receiver own ENTER/EXIT rows
        )
    }

    /**
     * @param emitGeofenceTimeline when true and fence crosses, logs GEOFENCE_ENTER/EXIT timeline rows.
     */
    fun persistLocal(
        context: Context,
        lat: Double,
        lng: Double,
        accuracy: Float,
        source: String,
        emitGeofenceTimeline: Boolean = true
    ) {
        val helper = LocationHelper(context)
        // Skip reverse-geocode on event/cache seeds — avoids FLP/network on screen-on churn.
        // Emergency oneshots and dedicated geofence paths still geocode.
        val parts = if (
            source.startsWith("event:") ||
            source == "cache_seed"
        ) {
            null
        } else {
            helper.reverseGeocodePartsSync(lat, lng)
        }
        val geo = helper.evaluateGeofence(lat, lng)

        val prevInside = DeviceTrackingPrefs.lastGeofenceInside(context)
        val prevId = DeviceTrackingPrefs.lastGeofenceId(context)
        val geofenceChanged =
            prevInside != null &&
                (prevInside != geo.insideFence || (prevId ?: "") != (geo.fenceId ?: ""))

        val payload = JSONObject()
            .put("atMs", System.currentTimeMillis())
            .put("lat", lat)
            .put("lng", lng)
            .put("accuracyM", accuracy.toDouble())
            .put("source", source)
            .put("address", parts?.formatted ?: "")
            .put("country", parts?.country)
            .put("state", parts?.state)
            .put("city", parts?.city)
            .put("postalCode", parts?.postalCode)
            .put("street", parts?.street)
            .put("insideGeofence", geo.insideFence)
            .put("geofenceId", geo.fenceId)
            .put("geofenceName", geo.zoneName)
            .put(
                "distanceToFenceM",
                if (geo.distanceToCenter.isFinite()) geo.distanceToCenter.toDouble() else JSONObject.NULL
            )
            .put("batteryPct", readBattery(context))
            .put(
                "network",
                when {
                    LocationResolver.isWifiConnected(context) -> "wifi"
                    LocationResolver.isCellularAvailable(context) -> "cell"
                    else -> "offline"
                }
            )
            .put("deviceLabel", "${Build.MANUFACTURER} ${Build.MODEL}")

        LiveLocationStore.save(context, payload)

        // Only dedicated geofence / emergency paths may mutate fence state + timeline.
        // Event pings (Wi‑Fi, screen, etc.) must not invent ENTER/EXIT from a soft evaluate.
        if (!emitGeofenceTimeline) {
            return
        }

        if (geofenceChanged) {
            DeviceTrackingPrefs.rememberGeofence(context, geo.insideFence, geo.fenceId)
            GeofenceTimeline.emitTransition(
                context,
                entered = geo.insideFence,
                zoneName = geo.zoneName,
                fenceId = geo.fenceId,
                distanceM = geo.distanceToCenter,
                lat = lat,
                lng = lng,
                accuracy = accuracy,
                addressParts = parts
            )
            if (DeviceTrackingPrefs.syncGeofenceChanges(context)) {
                EventSyncPublisher.onGeofenceChanged(context, geo.insideFence, geo.fenceId)
            }
        } else if (prevInside == null) {
            DeviceTrackingPrefs.rememberGeofence(context, geo.insideFence, geo.fenceId)
        }
    }

    @SuppressLint("MissingPermission")
    private fun scheduleEmergency(context: Context) {
        cancelEmergency()
        if (!DeviceTrackingPrefs.isEmergencyTracking(context)) return
        val app = context.applicationContext
        if (!hasLocationPermission(app)) return
        val handler = Handler(Looper.getMainLooper())
        emergencyHandler = handler
        val intervalMs = DeviceTrackingPrefs.emergencyIntervalMinutes(app) * 60_000L
        val r = object : Runnable {
            override fun run() {
                if (!DeviceTrackingPrefs.isEmergencyTracking(app)) return
                // One-shot only — never leave a continuous listener registered
                try {
                    val client = LocationServices.getFusedLocationProviderClient(app)
                    client.lastLocation.addOnSuccessListener { loc ->
                        if (loc != null) {
                            persistLocal(
                                app,
                                loc.latitude,
                                loc.longitude,
                                loc.accuracy,
                                "emergency_oneshot",
                                emitGeofenceTimeline = false // OS GeofenceTransitionReceiver owns ENTER/EXIT
                            )
                        }
                        DriveVaultSync.requestSyncAsync(app, "emergency")
                    }.addOnFailureListener {
                        DriveVaultSync.requestSyncAsync(app, "emergency")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "emergency oneshot", e)
                    DriveVaultSync.requestSyncAsync(app, "emergency")
                }
                handler.postDelayed(this, intervalMs.coerceAtLeast(60_000L))
            }
        }
        emergencyRunnable = r
        handler.postDelayed(r, intervalMs.coerceAtLeast(60_000L))
        Log.i(TAG, "emergency one-shot every ${intervalMs / 60000} min")
    }

    private fun cancelEmergency() {
        emergencyRunnable?.let { emergencyHandler?.removeCallbacks(it) }
        emergencyRunnable = null
        emergencyHandler = null
    }

    private fun readBattery(context: Context): Int {
        return try {
            val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
            if (level < 0 || scale <= 0) -1 else (level * 100) / scale
        } catch (_: Exception) {
            -1
        }
    }

    private fun hasLocationPermission(context: Context): Boolean {
        return ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
    }
}
