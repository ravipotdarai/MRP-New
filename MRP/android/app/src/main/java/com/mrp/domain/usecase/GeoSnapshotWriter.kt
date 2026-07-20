package com.mrp.domain.usecase

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.Location
import android.os.BatteryManager
import android.provider.Settings
import android.util.Log
import com.mrp.data.local.GeoSnapshotDao
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Fire-and-forget geo snapshot writes — must not block event or camera paths.
 */
object GeoSnapshotWriter {

    private const val TAG = "GeoSnapshotWriter"
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    fun enqueueFromResolved(
        context: Context,
        resolved: LocationResolver.ResolvedLocation,
        triggerSource: String,
        address: String?,
        insideGeofence: Boolean,
        geofenceId: String?,
        triggerReferenceId: String? = null,
        extraMeta: Map<String, Any?> = emptyMap()
    ) {
        enqueue(context, resolved.location, resolved.tier, resolved.provider, triggerSource,
            address, insideGeofence, geofenceId, triggerReferenceId,
            mapOf(
                "cache_hit" to resolved.cacheHit,
                "duration_ms" to resolved.durationMs
            ) + extraMeta)
    }

    fun enqueue(
        context: Context,
        location: Location,
        locationTier: String,
        provider: String,
        triggerSource: String,
        address: String?,
        insideGeofence: Boolean,
        geofenceId: String?,
        triggerReferenceId: String? = null,
        extraMeta: Map<String, Any?> = emptyMap()
    ) {
        if (location.latitude == 0.0 && location.longitude == 0.0) return
        scope.launch {
            try {
                val dao = GeoSnapshotDao(context.applicationContext)
                val deviceId = Settings.Secure.getString(
                    context.contentResolver,
                    Settings.Secure.ANDROID_ID
                ) ?: "unknown"
                val networkType = when {
                    LocationResolver.isWifiConnected(context) -> "wifi"
                    LocationResolver.isCellularAvailable(context) -> "cell"
                    else -> "offline"
                }
                val meta = JSONObject()
                extraMeta.forEach { (k, v) -> if (v != null) meta.put(k, v) }
                val id = dao.insert(
                    GeoSnapshotDao.GeoSnapshot(
                        deviceId = deviceId,
                        capturedAtMs = System.currentTimeMillis(),
                        latitude = location.latitude,
                        longitude = location.longitude,
                        accuracyM = location.accuracy,
                        altitudeM = location.altitude,
                        provider = provider,
                        locationTier = locationTier,
                        detailedAddress = address,
                        insideGeofence = insideGeofence,
                        geofenceId = geofenceId,
                        triggerSource = triggerSource,
                        triggerReferenceId = triggerReferenceId,
                        batteryPct = readBatteryPct(context),
                        networkType = networkType,
                        jsonMeta = if (meta.length() > 0) meta.toString() else null
                    )
                )
                Log.i(
                    LocationResolver.TAG_BATTERY,
                    "geo_snapshot id=$id trigger=$triggerSource tier=$locationTier network=$networkType"
                )
            } catch (e: Exception) {
                Log.w(TAG, "enqueue failed", e)
            }
        }
    }

    private fun readBatteryPct(context: Context): Int {
        return try {
            val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            if (level >= 0 && scale > 0) (level * 100 / scale) else -1
        } catch (_: Exception) {
            -1
        }
    }
}
