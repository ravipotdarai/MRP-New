package com.mrp.domain.usecase

import android.content.Context
import android.util.Log
import com.mrp.data.local.TimelineStorage
import com.mrp.domain.model.GeofenceStatus
import com.mrp.domain.model.LocationData
import com.mrp.domain.model.TimelineEntry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Timeline event logger. Location + geofence badges come from [LocationEngine]
 * (single trusted snapshot). Event rows are append-only — stamps are never rewritten.
 *
 * GEOFENCE_ENTER / EXIT rows are owned by [com.mrp.presentation.receiver.GeofenceTransitionReceiver]
 * via [GeofenceTimeline] (also engine-backed).
 */
class TimelineEventLogger(private val context: Context) {

    private val timelineStorage = TimelineStorage(context)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

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
            // Dedicated GEOFENCE_* rows come from GeofenceTimeline / OS receiver only.
            if (eventType.uppercase().startsWith("GEOFENCE_")) {
                Log.d(TAG, "skip GEOFENCE_* via TimelineEventLogger (use GeofenceTimeline)")
                return
            }

            Log.d(TAG, "Logging event: $eventType / $status")

            val engine = LocationEngine.obtain(
                context,
                LocationEngine.Demand.Event(eventType)
            )
            val stamp = engine.stamp

            // Optional address parts for Drive metadata when we have trusted coords
            val addressParts = if (stamp.hasCoords) {
                LocationHelper(context).reverseGeocodePartsSync(stamp.latitude, stamp.longitude)
            } else {
                null
            }

            val distanceM = when {
                stamp.insideFence -> stamp.distanceToCenterM
                else -> stamp.awayM
            }

            val enrichedMeta = buildMap {
                putAll(metadata)
                put("location_tier", stamp.tier)
                put("location_quality", stamp.quality.name)
                put("geo_strategy", stamp.strategy)
                put("geo_used_gps", stamp.usedGps)
                put("location_deferred", stamp.locationDeferred)
                put("location_accuracy_m", stamp.accuracyM.toDouble())
                if (addressParts != null) {
                    put("address_country", addressParts.country)
                    put("address_state", addressParts.state)
                    put("address_city", addressParts.city)
                    put("address_postal", addressParts.postalCode)
                }
                if (!stamp.zoneName.isNullOrBlank()) {
                    put("geofence_name", stamp.zoneName)
                }
                if (stamp.fenceId != null) {
                    put("geofence_id", stamp.fenceId)
                }
                if (distanceM != null && stamp.hasCoords) {
                    put("geofence_distance_m", distanceM)
                }
            }

            val entry = TimelineEntry(
                eventType = eventType,
                status = status,
                location = LocationData(
                    latitude = if (stamp.hasCoords) stamp.latitude else 0.0,
                    longitude = if (stamp.hasCoords) stamp.longitude else 0.0,
                    accuracyMeters = if (stamp.hasCoords) stamp.accuracyM else 0f,
                    detailedAddress = when {
                        stamp.hasCoords && !stamp.address.isNullOrBlank() -> stamp.address
                        stamp.locationDeferred -> "Location deferred (awaiting GPS)"
                        else -> "Address Unavailable (Offline)"
                    }
                ),
                geofenceStatus = GeofenceStatus(
                    insideFence = stamp.insideFence,
                    fenceId = stamp.fenceId
                ),
                metadata = enrichedMeta
            )

            // Append-only — never rewrite past events' location/geofence.
            timelineStorage.appendTimelineEntrySync(entry)
            // Path breadcrumb without GPS wake — fills gps_trail when events have/reuse coords.
            GpsTrailWriter.enqueueFromEventCoords(
                context = context,
                hasCoords = stamp.hasCoords,
                latitude = stamp.latitude,
                longitude = stamp.longitude,
                accuracyM = stamp.accuracyM,
                tier = stamp.tier,
                reason = GpsTrailWriter.StampReason.EVENT,
            )
            EventSyncPublisher.publishAsync(context, entry, addressParts)

            Log.d(
                TAG,
                "Logged $eventType strategy=${stamp.strategy} quality=${stamp.quality} " +
                    "inside=${stamp.insideFence} deferred=${stamp.locationDeferred} " +
                    "gps=${stamp.usedGps}"
            )
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
