package com.mrp.domain.usecase

import android.content.Context
import android.util.Log
import com.mrp.data.local.TimelineStorage
import com.mrp.domain.model.*
import java.text.SimpleDateFormat
import java.util.*

class CreateTimelineEntryUseCase(private val context: Context) {

    private val timelineStorage = TimelineStorage(context)
    private val locationHelper = LocationHelper(context)

    fun execute(
        eventType: String,
        status: String,
        metadata: Map<String, Any?> = emptyMap(),
        onComplete: (TimelineEntry) -> Unit
    ) {
        val id = UUID.randomUUID().toString()
        val timestamp = ISO8601_DATE_FORMAT.format(Date())

        // Get current location
        locationHelper.getCurrentLocation { locationData ->
            if (locationData != null) {
                locationHelper.reverseGeocode(
                    locationData.latitude,
                    locationData.longitude
                ) { address ->
                    val geofenceResult = locationHelper.evaluateGeofence(
                        locationData.latitude,
                        locationData.longitude
                    )

                    val entry = TimelineEntry(
                        id = id,
                        timestamp = timestamp,
                        eventType = eventType,
                        status = status,
                        location = LocationData(
                            latitude = locationData.latitude,
                            longitude = locationData.longitude,
                            accuracyMeters = locationData.accuracy,
                            detailedAddress = address ?: "Address Unavailable (Offline)"
                        ),
                        geofenceStatus = GeofenceStatus(
                            insideFence = geofenceResult.insideFence,
                            fenceId = geofenceResult.fenceId
                        ),
                        metadata = metadata
                    )

                    timelineStorage.appendTimelineEntry(entry)
                    Log.d(TAG, "Timeline entry created: ${entry.eventType} at ${entry.location.detailedAddress}")

                    onComplete(entry)
                }
            } else {
                // No location - create entry without location data
                val entry = TimelineEntry(
                    id = id,
                    timestamp = timestamp,
                    eventType = eventType,
                    status = status,
                    location = LocationData(
                        latitude = 0.0,
                        longitude = 0.0,
                        accuracyMeters = 0f,
                        detailedAddress = "Address Unavailable (Offline)"
                    ),
                    geofenceStatus = GeofenceStatus(
                        insideFence = false,
                        fenceId = null
                    ),
                    metadata = metadata
                )

                timelineStorage.appendTimelineEntry(entry)
                Log.d(TAG, "Timeline entry created without location: ${entry.eventType}")

                onComplete(entry)
            }
        }
    }

    companion object {
        private const val TAG = "CreateTimelineEntryUseCase"
        private val ISO8601_DATE_FORMAT = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
    }
}