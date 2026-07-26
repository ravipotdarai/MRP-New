package com.mrp.domain.usecase

import android.content.Context
import android.util.Log
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.data.local.TimelineStorage
import com.mrp.domain.model.GeofenceStatus
import com.mrp.domain.model.LocationData
import com.mrp.domain.model.StatusValues
import com.mrp.domain.model.TimelineEntry

/**
 * Dedicated timeline rows for geofence enter/exit (in addition to badges on other events).
 */
object GeofenceTimeline {

    private const val TAG = "GeofenceTimeline"

    fun emitTransition(
        context: Context,
        entered: Boolean,
        zoneName: String?,
        fenceId: String?,
        distanceM: Float,
        lat: Double,
        lng: Double,
        accuracy: Float,
        addressParts: AddressParts?
    ) {
        val eventType = if (entered) "GEOFENCE_ENTER" else "GEOFENCE_EXIT"
        val status = if (entered) StatusValues.ENTER else StatusValues.EXIT
        val name = zoneName ?: fenceId ?: "zone"
        val meta = buildMap<String, Any?> {
            put("geofence_name", zoneName)
            put("geofence_id", fenceId)
            put("geofence_distance_m", if (distanceM.isFinite()) distanceM else null)
            put("transition", if (entered) "enter" else "exit")
            put("address_country", addressParts?.country)
            put("address_state", addressParts?.state)
            put("address_city", addressParts?.city)
            put("address_postal", addressParts?.postalCode)
        }
        val entry = TimelineEntry(
            eventType = eventType,
            status = status,
            location = LocationData(
                latitude = lat,
                longitude = lng,
                accuracyMeters = accuracy,
                detailedAddress = addressParts?.formatted
                    ?: "Address Unavailable (Offline)"
            ),
            geofenceStatus = GeofenceStatus(
                insideFence = entered,
                fenceId = fenceId
            ),
            metadata = meta
        )
        try {
            TimelineStorage(context).appendTimelineEntrySync(entry)
            EventSyncPublisher.publishAsync(context, entry, addressParts)
            DeviceTrackingPrefs.rememberGeofence(context, entered, fenceId)
            Log.i(TAG, "$eventType $name")
        } catch (e: Exception) {
            Log.w(TAG, "emit failed", e)
        }
    }
}
