package com.mrp.domain.model

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * Timeline entry matching the exact JSON schema required by the specification.
 * All event types are mapped to the standardized event_type strings.
 */
data class TimelineEntry(
    val id: String = UUID.randomUUID().toString(),
    val timestamp: String = ISO8601_DATE_FORMAT.format(Date()),
    val eventType: String,
    val status: String,
    val location: LocationData,
    val geofenceStatus: GeofenceStatus,
    val metadata: Map<String, Any?> = emptyMap()
) {
    companion object {
        private val ISO8601_DATE_FORMAT = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC")
        }

        fun fromTimestamp(
            id: String? = null,
            timestamp: String? = null,
            eventType: String,
            status: String,
            latitude: Double? = null,
            longitude: Double? = null,
            accuracyMeters: Float? = null,
            detailedAddress: String? = null,
            insideFence: Boolean = false,
            fenceId: String? = null,
            metadata: Map<String, Any?> = emptyMap()
        ): TimelineEntry {
            return TimelineEntry(
                id = id ?: UUID.randomUUID().toString(),
                timestamp = timestamp ?: ISO8601_DATE_FORMAT.format(Date()),
                eventType = eventType,
                status = status,
                location = LocationData(
                    latitude = latitude ?: 0.0,
                    longitude = longitude ?: 0.0,
                    accuracyMeters = accuracyMeters ?: 0f,
                    detailedAddress = detailedAddress ?: "Address Unavailable (Offline)"
                ),
                geofenceStatus = GeofenceStatus(
                    insideFence = insideFence,
                    fenceId = fenceId
                ),
                metadata = metadata
            )
        }

        fun fromLocation(
            id: String? = null,
            timestamp: String? = null,
            eventType: String,
            status: String,
            location: android.location.Location?,
            detailedAddress: String? = null,
            insideFence: Boolean = false,
            fenceId: String? = null,
            metadata: Map<String, Any?> = emptyMap()
        ): TimelineEntry {
            return TimelineEntry(
                id = id ?: UUID.randomUUID().toString(),
                timestamp = timestamp ?: ISO8601_DATE_FORMAT.format(Date()),
                eventType = eventType,
                status = status,
                location = LocationData(
                    latitude = location?.latitude ?: 0.0,
                    longitude = location?.longitude ?: 0.0,
                    accuracyMeters = location?.accuracy ?: 0f,
                    detailedAddress = detailedAddress ?: "Address Unavailable (Offline)"
                ),
                geofenceStatus = GeofenceStatus(
                    insideFence = insideFence,
                    fenceId = fenceId
                ),
                metadata = metadata
            )
        }
    }

    fun toJsonObject(): org.json.JSONObject {
        return org.json.JSONObject().apply {
            put("id", id)
            put("timestamp", timestamp)
            put("event_type", eventType)
            put("status", status)
            put("location", org.json.JSONObject().apply {
                put("latitude", location.latitude)
                put("longitude", location.longitude)
                put("accuracy_meters", location.accuracyMeters)
                put("detailed_address", location.detailedAddress)
            })
            put("geofence_status", org.json.JSONObject().apply {
                put("inside_fence", geofenceStatus.insideFence)
                put("fence_id", geofenceStatus.fenceId ?: org.json.JSONObject.NULL)
            })
            put("metadata", org.json.JSONObject(metadata.mapValues { it.value ?: org.json.JSONObject.NULL }))
        }
    }
}

data class LocationData(
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float,
    val detailedAddress: String
)

data class GeofenceStatus(
    val insideFence: Boolean,
    val fenceId: String?
)

object EventTypes {
    const val SCREEN_LOCK = "SCREEN_LOCK"
    const val SCREEN_UNLOCK = "SCREEN_UNLOCK"
    const val UNLOCK_FAILED = "UNLOCK_FAILED"
    const val WRONG_UNLOCK_ATTEMPT = "WRONG_UNLOCK_ATTEMPT"
    const val WRONG_PASSWORD = "WRONG_PASSWORD"
    const val WRONG_BIOMETRIC = "WRONG_BIOMETRIC"
    const val SIM_REMOVED = "SIM_REMOVED"
    const val SIM_INSERTED = "SIM_INSERTED"
    const val SIM_CHANGE = "SIM_CHANGE"
    const val FACTORY_RESET = "FACTORY_RESET"
    const val DEVICE_SHUTDOWN = "DEVICE_SHUTDOWN"
    const val DEVICE_REBOOT = "DEVICE_REBOOT"
    const val AIRPLANE_MODE_TOGGLE = "AIRPLANE_MODE_TOGGLE"
    const val WIFI_TOGGLE = "WIFI_TOGGLE"
    const val MOBILE_DATA_TOGGLE = "MOBILE_DATA_TOGGLE"
    const val HOTSPOT_TOGGLE = "HOTSPOT_TOGGLE"
    const val BLUETOOTH_TOGGLE = "BLUETOOTH_TOGGLE"
    const val USB_CONNECTED = "USB_CONNECTED"
    const val APP_INSTALLED = "APP_INSTALLED"
    const val APP_UPDATED = "APP_UPDATED"
    const val APP_MISUSE = "APP_MISUSE"
    const val POSTURE_ALERT = "POSTURE_ALERT"
    const val PANIC_ALERT = "PANIC_ALERT"
}

object StatusValues {
    const val ENABLED = "enabled"
    const val DISABLED = "disabled"
    const val LOCKED = "locked"
    const val UNLOCKED = "unlocked"
    const val FAILED = "failed"
}