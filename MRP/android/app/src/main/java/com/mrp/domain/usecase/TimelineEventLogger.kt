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
            val addressParts = location?.let {
                locationHelper.reverseGeocodePartsSync(it.latitude, it.longitude)
            }
            val address = addressParts?.formatted
            val geofenceResult = location?.let {
                locationHelper.evaluateGeofence(it.latitude, it.longitude)
            }

            val enrichedMeta = buildMap {
                putAll(metadata)
                if (resolved != null) {
                    put("location_tier", resolved.tier)
                    put("location_cache_hit", resolved.cacheHit)
                    put("location_duration_ms", resolved.durationMs)
                }
                if (addressParts != null) {
                    put("address_country", addressParts.country)
                    put("address_state", addressParts.state)
                    put("address_city", addressParts.city)
                    put("address_postal", addressParts.postalCode)
                }
                if (geofenceResult != null) {
                    put("geofence_name", geofenceResult.zoneName)
                    put("geofence_distance_m", geofenceResult.distanceToCenter)
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
                    insideFence = geofenceResult?.insideFence ?: false,
                    fenceId = geofenceResult?.fenceId
                ),
                metadata = enrichedMeta
            )

            timelineStorage.appendTimelineEntrySync(entry)
            EventSyncPublisher.publishAsync(context, entry, addressParts)

            // Soft geofence ENTER/EXIT when an event's location crosses a zone
            // (OS GeofencingClient is primary; this covers cases without Play Services trigger yet)
            if (geofenceResult != null && !eventType.startsWith("GEOFENCE_")) {
                val prevInside = com.mrp.data.local.DeviceTrackingPrefs.lastGeofenceInside(context)
                val prevId = com.mrp.data.local.DeviceTrackingPrefs.lastGeofenceId(context)
                val crossed = prevInside != null &&
                    (prevInside != geofenceResult.insideFence ||
                        (prevId ?: "") != (geofenceResult.fenceId ?: ""))
                if (crossed) {
                    GeofenceTimeline.emitTransition(
                        context = context,
                        entered = geofenceResult.insideFence,
                        zoneName = geofenceResult.zoneName,
                        fenceId = geofenceResult.fenceId,
                        distanceM = geofenceResult.distanceToCenter,
                        lat = location!!.latitude,
                        lng = location.longitude,
                        accuracy = location.accuracy,
                        addressParts = addressParts
                    )
                }
                com.mrp.data.local.DeviceTrackingPrefs.rememberGeofence(
                    context,
                    geofenceResult.insideFence,
                    geofenceResult.fenceId
                )
            }

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
