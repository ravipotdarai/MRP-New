package com.mrp.data.local

import android.content.Context
import com.mrp.billing.EntitlementCache
import com.mrp.ops.DeviceIdentity

/**
 * Sync / tracking policy — mirrored to Firebase RTDB device_config/{uid} only.
 * Payload data never goes to Firebase (privacy MVP).
 */
object DeviceTrackingPrefs {

    private const val PREFS = "mrp_device_tracking"

    private const val KEY_MOVEMENT = "movement_tracking"
    private const val KEY_BACKGROUND = "background_tracking"
    private const val KEY_HIGH_ACCURACY = "high_accuracy"
    private const val KEY_EVENT_SYNC = "event_sync_enabled"
    private const val KEY_SYNC_WIFI = "sync_on_wifi"
    private const val KEY_SYNC_MOBILE = "sync_on_mobile_data"
    private const val KEY_SYNC_LOCATION = "sync_location"
    private const val KEY_SYNC_GEOFENCE = "sync_geofence_changes"
    private const val KEY_SYNC_SELFIES = "sync_selfies_premium"
    private const val KEY_SYNC_FREQ_MIN = "sync_frequency_minutes"
    private const val KEY_EMERGENCY = "emergency_tracking"
    private const val KEY_EMERGENCY_MIN = "emergency_interval_minutes"
    private const val KEY_EMERGENCY_SIM_AUTO = "emergency_auto_sim"
    private const val KEY_LAST_GEOFENCE_INSIDE = "last_geofence_inside"
    private const val KEY_LAST_GEOFENCE_ID = "last_geofence_id"
    private const val KEY_LAST_SYNC_MS = "last_drive_sync_ms"
    private const val KEY_LAST_ACTIVITY = "last_activity_type"
    private const val KEY_LAST_ACTIVITY_ELAPSED = "last_activity_elapsed_ms"
    private const val KEY_SCREEN_INTERACTIVE = "screen_interactive"
    private const val KEY_SCREEN_SET = "screen_interactive_set"
    private const val KEY_LAST_APPLIED_IDLE = "last_applied_idle"
    private const val KEY_HB_FENCE = "heartbeat_last_fence"
    private const val KEY_HB_LAT = "heartbeat_last_lat"
    private const val KEY_HB_LNG = "heartbeat_last_lng"

    /** Non-emergency Drive cadence floor (minutes). Emergency interval stays ≥1. */
    const val MIN_SYNC_FREQUENCY_MINUTES = 10

    private fun p(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isMovementTracking(context: Context): Boolean =
        p(context).getBoolean(KEY_MOVEMENT, true)

    fun isBackgroundTracking(context: Context): Boolean =
        p(context).getBoolean(KEY_BACKGROUND, false)

    fun isHighAccuracy(context: Context): Boolean =
        p(context).getBoolean(KEY_HIGH_ACCURACY, false)

    fun isEventSyncEnabled(context: Context): Boolean =
        p(context).getBoolean(KEY_EVENT_SYNC, true)

    fun syncOnWifi(context: Context): Boolean =
        p(context).getBoolean(KEY_SYNC_WIFI, true)

    fun syncOnMobileData(context: Context): Boolean =
        p(context).getBoolean(KEY_SYNC_MOBILE, true)

    fun syncLocation(context: Context): Boolean =
        p(context).getBoolean(KEY_SYNC_LOCATION, true)

    fun syncGeofenceChanges(context: Context): Boolean =
        p(context).getBoolean(KEY_SYNC_GEOFENCE, true)

    fun syncSelfiesPremium(context: Context): Boolean =
        p(context).getBoolean(KEY_SYNC_SELFIES, true)

    /** Premium / family / enterprise (not free/basic). */
    fun isPremiumPlus(context: Context): Boolean {
        val map = EntitlementCache(context).readSnapshot()
        val tier = map.getString("tier") ?: "free"
        return tier == "premium" || tier == "family" || tier == "enterprise"
    }

    /**
     * Capture + Drive include selfies only for Premium+ when Sync Policy toggle is on.
     * Free/basic: never capture or pack selfies into the vault.
     */
    fun shouldIncludeSelfies(context: Context): Boolean {
        if (!syncSelfiesPremium(context)) return false
        return isPremiumPlus(context)
    }

    /** Alias for camera path — same Premium+ + toggle gate. */
    fun mayCaptureSelfies(context: Context): Boolean = shouldIncludeSelfies(context)

    /** Normal Drive sync cadence (minutes). Emergency uses its own interval. */
    fun syncFrequencyMinutes(context: Context): Int {
        val prefs = p(context)
        val raw = prefs.getInt(KEY_SYNC_FREQ_MIN, 15)
        val clamped = raw.coerceAtLeast(MIN_SYNC_FREQUENCY_MINUTES)
        if (raw < MIN_SYNC_FREQUENCY_MINUTES) {
            prefs.edit().putInt(KEY_SYNC_FREQ_MIN, clamped).apply()
        }
        return clamped
    }

    fun isEmergencyTracking(context: Context): Boolean =
        p(context).getBoolean(KEY_EMERGENCY, false)

    /** Emergency sync interval — default 1, never less than 1. */
    fun emergencyIntervalMinutes(context: Context): Int =
        p(context).getInt(KEY_EMERGENCY_MIN, 1).coerceAtLeast(1)

    fun isEmergencySimAuto(context: Context): Boolean =
        p(context).getBoolean(KEY_EMERGENCY_SIM_AUTO, false)

    /**
     * Find-my-device profile when SIM is removed (theft / swap).
     * Marks auto-emergency only when emergency was off; manual emergency stays manual.
     */
    fun activateEmergencyForSimRemoval(context: Context) {
        val prefs = p(context)
        val wasOn = prefs.getBoolean(KEY_EMERGENCY, false)
        val e = prefs.edit()
            .putBoolean(KEY_EMERGENCY, true)
            .putBoolean(KEY_EVENT_SYNC, true)
            .putBoolean(KEY_SYNC_LOCATION, true)
            .putBoolean(KEY_SYNC_WIFI, true)
            .putBoolean(KEY_SYNC_MOBILE, true)
            .putBoolean(KEY_BACKGROUND, true)
            .putBoolean(KEY_HIGH_ACCURACY, true)
            .putInt(KEY_EMERGENCY_MIN, 1)
        if (!wasOn) {
            e.putBoolean(KEY_EMERGENCY_SIM_AUTO, true)
        }
        e.apply()
    }

    /** Turn off emergency only when it was auto-enabled by SIM removal. */
    fun clearEmergencyIfSimAuto(context: Context): Boolean {
        val prefs = p(context)
        if (!prefs.getBoolean(KEY_EMERGENCY_SIM_AUTO, false)) return false
        prefs.edit()
            .putBoolean(KEY_EMERGENCY, false)
            .remove(KEY_EMERGENCY_SIM_AUTO)
            .apply()
        return true
    }

    fun lastDriveSyncMs(context: Context): Long =
        p(context).getLong(KEY_LAST_SYNC_MS, 0L)

    fun markDriveSynced(context: Context) {
        p(context).edit().putLong(KEY_LAST_SYNC_MS, System.currentTimeMillis()).apply()
    }

    fun lastGeofenceInside(context: Context): Boolean? {
        val prefs = p(context)
        if (!prefs.contains(KEY_LAST_GEOFENCE_INSIDE)) return null
        return prefs.getBoolean(KEY_LAST_GEOFENCE_INSIDE, false)
    }

    fun lastGeofenceId(context: Context): String? =
        p(context).getString(KEY_LAST_GEOFENCE_ID, null)

    fun lastActivityType(context: Context): String =
        p(context).getString(KEY_LAST_ACTIVITY, "UNKNOWN") ?: "UNKNOWN"

    fun lastActivityElapsedMs(context: Context): Long =
        p(context).getLong(KEY_LAST_ACTIVITY_ELAPSED, 0L)

    fun setLastActivity(context: Context, type: String) {
        p(context).edit()
            .putString(KEY_LAST_ACTIVITY, type)
            .putLong(KEY_LAST_ACTIVITY_ELAPSED, android.os.SystemClock.elapsedRealtime())
            .apply()
    }

    fun screenInteractive(context: Context): Boolean? {
        val prefs = p(context)
        if (!prefs.contains(KEY_SCREEN_SET)) return null
        return prefs.getBoolean(KEY_SCREEN_INTERACTIVE, true)
    }

    fun setScreenInteractive(context: Context, on: Boolean) {
        p(context).edit()
            .putBoolean(KEY_SCREEN_SET, true)
            .putBoolean(KEY_SCREEN_INTERACTIVE, on)
            .apply()
    }

    fun lastAppliedIdle(context: Context): Boolean? {
        val prefs = p(context)
        if (!prefs.contains(KEY_LAST_APPLIED_IDLE)) return null
        return prefs.getBoolean(KEY_LAST_APPLIED_IDLE, false)
    }

    fun setLastAppliedIdle(context: Context, idle: Boolean) {
        p(context).edit().putBoolean(KEY_LAST_APPLIED_IDLE, idle).apply()
    }

    fun heartbeatUnchanged(context: Context, fenceId: String?, lat: Double, lng: Double): Boolean {
        val prefs = p(context)
        if (!prefs.contains(KEY_HB_LAT)) return false
        val prevFence = prefs.getString(KEY_HB_FENCE, null)
        val dLat = prefs.getFloat(KEY_HB_LAT, 0f).toDouble()
        val dLng = prefs.getFloat(KEY_HB_LNG, 0f).toDouble()
        val sameFence = (prevFence ?: "") == (fenceId ?: "")
        val samePoint = kotlin.math.abs(dLat - lat) < 1e-4 && kotlin.math.abs(dLng - lng) < 1e-4
        return sameFence && samePoint
    }

    fun markHeartbeatLocation(context: Context, fenceId: String?, lat: Double, lng: Double) {
        p(context).edit()
            .putString(KEY_HB_FENCE, fenceId)
            .putFloat(KEY_HB_LAT, lat.toFloat())
            .putFloat(KEY_HB_LNG, lng.toFloat())
            .apply()
    }

    fun rememberGeofence(context: Context, inside: Boolean, fenceId: String?) {
        p(context).edit()
            .putBoolean(KEY_LAST_GEOFENCE_INSIDE, inside)
            .putString(KEY_LAST_GEOFENCE_ID, fenceId)
            .apply()
    }

    fun applyRemote(
        context: Context,
        map: Map<String, Any?>
    ) {
        val e = p(context).edit()
        (map["movementTracking"] as? Boolean)?.let { e.putBoolean(KEY_MOVEMENT, it) }
        (map["backgroundTracking"] as? Boolean)?.let { e.putBoolean(KEY_BACKGROUND, it) }
        (map["highAccuracy"] as? Boolean)?.let { e.putBoolean(KEY_HIGH_ACCURACY, it) }
        (map["eventSyncEnabled"] as? Boolean)?.let { e.putBoolean(KEY_EVENT_SYNC, it) }
        (map["syncOnWifi"] as? Boolean)?.let { e.putBoolean(KEY_SYNC_WIFI, it) }
        (map["syncOnMobileData"] as? Boolean)?.let { e.putBoolean(KEY_SYNC_MOBILE, it) }
        (map["syncLocation"] as? Boolean)?.let { e.putBoolean(KEY_SYNC_LOCATION, it) }
        (map["syncGeofenceChanges"] as? Boolean)?.let { e.putBoolean(KEY_SYNC_GEOFENCE, it) }
        (map["syncSelfiesPremium"] as? Boolean)?.let { e.putBoolean(KEY_SYNC_SELFIES, it) }
        when (val v = map["syncFrequencyMinutes"]) {
            is Number -> e.putInt(KEY_SYNC_FREQ_MIN, v.toInt().coerceAtLeast(MIN_SYNC_FREQUENCY_MINUTES))
            is String -> v.toIntOrNull()?.let {
                e.putInt(KEY_SYNC_FREQ_MIN, it.coerceAtLeast(MIN_SYNC_FREQUENCY_MINUTES))
            }
        }
        (map["emergencyTracking"] as? Boolean)?.let { e.putBoolean(KEY_EMERGENCY, it) }
        when (val v = map["emergencyIntervalMinutes"]) {
            is Number -> e.putInt(KEY_EMERGENCY_MIN, v.toInt().coerceAtLeast(1))
            is String -> v.toIntOrNull()?.let { e.putInt(KEY_EMERGENCY_MIN, it.coerceAtLeast(1)) }
        }
        e.apply()
    }

    fun snapshot(context: Context): Map<String, Any> = mapOf(
        "movementTracking" to isMovementTracking(context),
        "backgroundTracking" to isBackgroundTracking(context),
        "highAccuracy" to isHighAccuracy(context),
        "eventSyncEnabled" to isEventSyncEnabled(context),
        "syncOnWifi" to syncOnWifi(context),
        "syncOnMobileData" to syncOnMobileData(context),
        "syncLocation" to syncLocation(context),
        "syncGeofenceChanges" to syncGeofenceChanges(context),
        "syncSelfiesPremium" to syncSelfiesPremium(context),
        "syncFrequencyMinutes" to syncFrequencyMinutes(context),
        "emergencyTracking" to isEmergencyTracking(context),
        "emergencyIntervalMinutes" to emergencyIntervalMinutes(context)
    )

    /** Config-only map for Firebase RTDB (no location/event payloads). */
    fun toFirebaseConfigMap(context: Context): Map<String, Any> =
        snapshot(context) + DeviceIdentity.hints(context) + mapOf(
            "updatedAtMs" to System.currentTimeMillis(),
            "source" to "device"
        )
}
