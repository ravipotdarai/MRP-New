package com.mrp.domain.model

data class UnifiedEvent(
    val id: Long = 0,
    val userId: String? = null,
    val deviceId: String? = null,
    val eventType: String,
    val eventTime: Long,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val accuracy: Float? = null,
    val address: String? = null,
    val insideGeofence: Boolean = false,
    val geofenceId: String? = null,
    val referenceId: String? = null,
    val jsonData: String? = null,
    val syncStatus: String = "PENDING"
)
