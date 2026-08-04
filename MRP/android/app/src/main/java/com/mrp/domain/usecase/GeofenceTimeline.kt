package com.mrp.domain.usecase

import android.content.Context
import android.util.Log
import com.mrp.data.local.TimelineStorage
import com.mrp.domain.model.GeofenceStatus
import com.mrp.domain.model.LocationData
import com.mrp.domain.model.StatusValues
import com.mrp.domain.model.TimelineEntry

/**
 * Dedicated timeline rows for geofence enter/exit (in addition to badges on other events).
 *
 * Callers own [DeviceTrackingPrefs] — this must NOT overwrite global inside state
 * (e.g. EXIT Kunjir while still Inside Home).
 */
object GeofenceTimeline {

    private const val TAG = "GeofenceTimeline"

    /**
     * @param entered transition direction → GEOFENCE_ENTER / EXIT event type
     * @param badgeInside global "are we inside any fence?" for the timeline badge
     * @param badgeFenceId fence id for the badge (Home when still inside after EXIT of another zone)
     */
    fun emitTransition(
        context: Context,
        entered: Boolean,
        zoneName: String?,
        fenceId: String?,
        distanceM: Float,
        lat: Double,
        lng: Double,
        accuracy: Float,
        addressParts: AddressParts?,
        badgeInside: Boolean = entered,
        badgeFenceId: String? = fenceId,
        badgeZoneName: String? = zoneName,
        addressOverride: String? = null,
        locationDeferred: Boolean = false,
        geoStrategy: String? = null
    ) {
        val eventType = if (entered) "GEOFENCE_ENTER" else "GEOFENCE_EXIT"
        val status = if (entered) StatusValues.ENTER else StatusValues.EXIT
        val name = zoneName ?: fenceId ?: "zone"
        val hasCoords = kotlin.math.abs(lat) > 1e-7 || kotlin.math.abs(lng) > 1e-7
        val meta = buildMap<String, Any?> {
            put("geofence_name", badgeZoneName ?: zoneName)
            put("geofence_id", badgeFenceId ?: fenceId)
            put("transition_zone", zoneName)
            put("transition_fence_id", fenceId)
            put("geofence_distance_m", if (distanceM.isFinite() && hasCoords) distanceM else null)
            put("transition", if (entered) "enter" else "exit")
            put("location_deferred", locationDeferred)
            if (geoStrategy != null) put("geo_strategy", geoStrategy)
            put("address_country", addressParts?.country)
            put("address_state", addressParts?.state)
            put("address_city", addressParts?.city)
            put("address_postal", addressParts?.postalCode)
        }
        val entry = TimelineEntry(
            eventType = eventType,
            status = status,
            location = LocationData(
                latitude = if (hasCoords) lat else 0.0,
                longitude = if (hasCoords) lng else 0.0,
                accuracyMeters = if (hasCoords) accuracy else 0f,
                detailedAddress = when {
                    !addressOverride.isNullOrBlank() -> addressOverride
                    addressParts?.formatted != null -> addressParts.formatted
                    locationDeferred -> "Location deferred (awaiting GPS)"
                    else -> "Address Unavailable (Offline)"
                }
            ),
            geofenceStatus = GeofenceStatus(
                insideFence = badgeInside,
                fenceId = badgeFenceId ?: fenceId
            ),
            metadata = meta
        )
        try {
            TimelineStorage(context).appendTimelineEntrySync(entry)
            EventSyncPublisher.publishAsync(context, entry, addressParts)
            Log.i(TAG, "$eventType $name badgeInside=$badgeInside deferred=$locationDeferred")
        } catch (e: Exception) {
            Log.w(TAG, "emit failed", e)
        }
    }
}
