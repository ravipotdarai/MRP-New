package com.mrp.domain.usecase

import android.content.Context
import android.util.Log
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.data.local.GeofenceStorage
import com.mrp.data.local.TimelineStorage
import com.mrp.domain.model.*
import kotlinx.coroutines.*

/**
 * Centralized event logger that creates timeline entries with location and geofencing.
 * Location uses [LocationResolver] Wi‑Fi → cell → GPS cascade with event severity.
 *
 * GEOFENCE_ENTER / GEOFENCE_EXIT timeline rows are owned only by
 * [com.mrp.presentation.receiver.GeofenceTransitionReceiver] (OS fence) and
 * high-confidence presence paths — never invented from Wi‑Fi / screen / other events.
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
            // Prefer a usable fix for address quality; avoid fresh GPS for routine toggles.
            val resolved = if (isCacheOnlyEvent(eventType)) {
                LocationResolver.resolveBestWithoutGps(context)
            } else {
                LocationResolver.resolveSync(context, severity)
            }
            val location = resolved?.location
            val addressParts = location?.let {
                locationHelper.reverseGeocodePartsSync(it.latitude, it.longitude)
            }
            val address = addressParts?.formatted

            // Snapshot only — do not invent ENTER/EXIT from this evaluation.
            // Prefer last OS-confirmed fence state so Wi‑Fi/screen events do not
            // flip the row to "exit" when location is missing or stale.
            val lastInside = DeviceTrackingPrefs.lastGeofenceInside(context)
            val lastFenceId = DeviceTrackingPrefs.lastGeofenceId(context)
            val isGeofenceEvent = eventType.uppercase().startsWith("GEOFENCE_")
            // Full evaluate only for dedicated geofence rows (avoids soft ENTER/EXIT).
            // For other events, still attach zone name from stored fence id / light evaluate.
            val evaluated = if (isGeofenceEvent && location != null) {
                locationHelper.evaluateGeofence(location.latitude, location.longitude)
            } else {
                null
            }
            val snapshotEval = if (
                !isGeofenceEvent &&
                location != null &&
                location.accuracy in 1f..120f
            ) {
                locationHelper.evaluateGeofence(location.latitude, location.longitude)
            } else {
                null
            }
            val insideFence = when {
                evaluated != null -> evaluated.insideFence
                lastInside != null -> lastInside
                else -> false
            }
            // Name only from this event's evaluate or last OS fence id — never invent
            // "first zone in storage" or nearest-outside when status is from lastInside.
            val fenceId = evaluated?.fenceId ?: lastFenceId
            val zoneName = evaluated?.zoneName
                ?: fenceId?.let { id ->
                    GeofenceStorage.list(context).firstOrNull { it.id == id }?.name
                }
            val distanceM = when {
                evaluated != null && evaluated.distanceToCenter.isFinite() ->
                    evaluated.distanceToCenter.toDouble()
                snapshotEval != null &&
                    fenceId != null &&
                    snapshotEval.fenceId == fenceId &&
                    snapshotEval.distanceToCenter.isFinite() ->
                    snapshotEval.distanceToCenter.toDouble()
                else -> null
            }

            val enrichedMeta = buildMap {
                putAll(metadata)
                if (resolved != null) {
                    put("location_tier", resolved.tier)
                    put("location_cache_hit", resolved.cacheHit)
                    put("location_duration_ms", resolved.durationMs)
                    put("location_accuracy_m", location?.accuracy?.toDouble() ?: 0.0)
                }
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
            Log.d(TAG, "Logged event: $eventType / $status")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to log event", e)
        }
    }

    companion object {
        private const val TAG = "TimelineEventLogger"
        private val lastEventTimes = java.util.concurrent.ConcurrentHashMap<String, Long>()
        private const val DEBOUNCE_MS = 1000L

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
