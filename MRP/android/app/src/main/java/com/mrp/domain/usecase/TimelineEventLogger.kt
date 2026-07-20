package com.mrp.domain.usecase

import android.content.Context
import android.util.Log
import com.mrp.data.local.TimelineStorage
import com.mrp.domain.model.*
import kotlinx.coroutines.*

/**
 * Centralized event logger that creates timeline entries with location and geofencing.
 * Location uses [LocationResolver] Wi‑Fi → cell → GPS cascade with event severity.
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
            val resolved = LocationResolver.resolveSync(context, severity)
            val location = resolved?.location
            val address = location?.let {
                locationHelper.reverseGeocodeSync(it.latitude, it.longitude)
            }
            val geofenceResult = location?.let {
                locationHelper.evaluateGeofence(it.latitude, it.longitude)
            }

            val enrichedMeta = if (resolved != null) {
                metadata + mapOf(
                    "location_tier" to resolved.tier,
                    "location_cache_hit" to resolved.cacheHit,
                    "location_duration_ms" to resolved.durationMs
                )
            } else {
                metadata
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
                    insideFence = geofenceResult?.insideFence ?: false,
                    fenceId = geofenceResult?.fenceId
                ),
                metadata = enrichedMeta
            )

            timelineStorage.appendTimelineEntrySync(entry)
            if (resolved != null && location != null) {
                GeoSnapshotWriter.enqueueFromResolved(
                    context = context,
                    resolved = resolved,
                    triggerSource = eventType,
                    address = address,
                    insideGeofence = geofenceResult?.insideFence ?: false,
                    geofenceId = geofenceResult?.fenceId
                )
            }
            Log.d(TAG, "Logged event: $eventType / $status")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to log event", e)
        }
    }

    companion object {
        private const val TAG = "TimelineEventLogger"
        private val lastEventTimes = java.util.concurrent.ConcurrentHashMap<String, Long>()
        private const val DEBOUNCE_MS = 1000L

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
