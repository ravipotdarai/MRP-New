package com.mrp.domain.usecase

/**
 * Structured reverse-geocode parts (P5 address resolution).
 * Full line remains for UI; parts enable web filters / geofence labels.
 */
data class AddressParts(
    val formatted: String,
    val country: String? = null,
    val state: String? = null,
    val city: String? = null,
    val postalCode: String? = null,
    val street: String? = null
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "formatted" to formatted,
        "country" to country,
        "state" to state,
        "city" to city,
        "postalCode" to postalCode,
        "street" to street
    )
}

object DistanceCalc {
    /** Haversine distance in meters. */
    fun meters(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6371000.0
        val p1 = Math.toRadians(lat1)
        val p2 = Math.toRadians(lat2)
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
        return 2 * r * Math.asin(Math.sqrt(a))
    }
}
