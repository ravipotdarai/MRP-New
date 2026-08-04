package com.mrp.domain.usecase

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.location.Address
import android.location.Geocoder
import android.location.Location
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.core.app.ActivityCompat
import com.mrp.data.local.GeofenceStorage
import kotlinx.coroutines.*
import java.util.*

/**
 * Location + geofence + reverse-geocode helpers.
 * Fresh fixes go through [LocationResolver] (Wi‑Fi → cell → GPS).
 */
class LocationHelper(private val context: Context) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val geofenceZones = mutableListOf<GeofenceZone>()

    init {
        reloadGeofencesFromStorage()
    }

    fun reloadGeofencesFromStorage() {
        geofenceZones.clear()
        GeofenceStorage.list(context).filter { it.enabled }.forEach { z ->
            geofenceZones.add(
                GeofenceZone(z.id, z.latitude, z.longitude, z.radiusMeters, z.name)
            )
        }
    }

    fun addGeofenceZone(id: String, latitude: Double, longitude: Double, radiusMeters: Float, name: String = id) {
        geofenceZones.removeAll { it.id == id }
        geofenceZones.add(GeofenceZone(id, latitude, longitude, radiusMeters, name))
    }

    fun clearGeofenceZones() {
        geofenceZones.clear()
    }

    /**
     * Get current location via Wi‑Fi → cell → GPS cascade.
     * Default severity is [LocationResolver.Severity.UI] (Home / interactive).
     */
    @SuppressLint("MissingPermission")
    fun getCurrentLocation(
        callback: (LocationData?) -> Unit,
        severity: LocationResolver.Severity = LocationResolver.Severity.UI
    ) {
        if (!hasLocationPermission()) {
            Log.w(TAG, "Location permission not granted")
            callback(null)
            return
        }

        scope.launch {
            try {
                val resolved = LocationResolver.resolveSync(context, severity)
                Log.d(
                    TAG,
                    "getCurrentLocation: ${resolved?.location?.latitude}, ${resolved?.location?.longitude} tier=${resolved?.tier}"
                )
                val locationData = resolved?.location?.let {
                    LocationData(
                        latitude = it.latitude,
                        longitude = it.longitude,
                        accuracy = it.accuracy,
                        altitude = it.altitude,
                        provider = resolved.provider
                    )
                }
                callback(locationData)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get location", e)
                callback(null)
            }
        }
    }

    /** Blocking resolve for receivers / sync paths. */
    fun getCurrentLocationSync(
        severity: LocationResolver.Severity = LocationResolver.Severity.INFORMATIONAL
    ): LocationData? {
        val resolved = LocationResolver.resolveSync(context, severity) ?: return null
        val loc = resolved.location
        return LocationData(
            latitude = loc.latitude,
            longitude = loc.longitude,
            accuracy = loc.accuracy,
            altitude = loc.altitude,
            provider = resolved.provider
        )
    }

    /**
     * Reverse geocode coordinates to a human-readable address.
     * Prefer Wi‑Fi; rate-limit on cellular; skip when offline (coords label only).
     */
    @Suppress("DEPRECATION")
    fun reverseGeocode(latitude: Double, longitude: Double, callback: (String?) -> Unit) {
        scope.launch {
            callback(reverseGeocodeSyncOrNull(latitude, longitude))
        }
    }

    /**
     * Synchronous reverse geocode for use in broadcast receivers.
     * Returns lat/lng label when offline or rate-limited on cellular.
     */
    @Suppress("DEPRECATION")
    fun reverseGeocodeSync(latitude: Double, longitude: Double): String {
        return reverseGeocodeSyncOrNull(latitude, longitude)
            ?: String.format(Locale.US, "Lat: %.5f, Long: %.5f", latitude, longitude)
    }

    fun reverseGeocodePartsSync(latitude: Double, longitude: Double): AddressParts? {
        if (!LocationResolver.shouldGeocodeNow(context)) {
            Log.i(LocationResolver.TAG_BATTERY, "geocode skipped offline")
            return null
        }
        val now = SystemClock.elapsedRealtime()
        val roundedLat = (latitude * 1000).toInt() / 1000.0
        val roundedLng = (longitude * 1000).toInt() / 1000.0
        if (lastGeocodeLat == roundedLat && lastGeocodeLng == roundedLng &&
            now - lastGeocodeElapsed < DUPLICATE_GEOCODE_MS && lastGeocodeParts != null
        ) {
            return lastGeocodeParts
        }
        return try {
            val address = fetchFirstAddress(latitude, longitude) ?: return null
            val parts = addressToParts(address)
            lastGeocodeElapsed = now
            lastGeocodeLat = roundedLat
            lastGeocodeLng = roundedLng
            lastGeocodeAddress = parts.formatted
            lastGeocodeParts = parts
            parts
        } catch (e: Exception) {
            Log.e(TAG, "Reverse geocoding failed", e)
            null
        }
    }

    @Suppress("DEPRECATION")
    private fun reverseGeocodeSyncOrNull(latitude: Double, longitude: Double): String? {
        return reverseGeocodePartsSync(latitude, longitude)?.formatted
    }

    @Suppress("DEPRECATION")
    private fun fetchFirstAddress(latitude: Double, longitude: Double): Address? {
        val geocoder = Geocoder(context, Locale.getDefault())
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            var result: Address? = null
            val latch = java.util.concurrent.CountDownLatch(1)
            geocoder.getFromLocation(latitude, longitude, 3) { addresses ->
                result = addresses.firstOrNull { addr ->
                    val line = addr.getAddressLine(0).orEmpty()
                    !line.contains("near", ignoreCase = true) ||
                        !addr.thoroughfare.isNullOrBlank() ||
                        !addr.locality.isNullOrBlank()
                } ?: addresses.firstOrNull()
                latch.countDown()
            }
            latch.await(1500, java.util.concurrent.TimeUnit.MILLISECONDS)
            return result
        }
        return geocoder.getFromLocation(latitude, longitude, 3)?.firstOrNull { addr ->
            val line = addr.getAddressLine(0).orEmpty()
            !line.contains("near", ignoreCase = true) ||
                !addr.thoroughfare.isNullOrBlank() ||
                !addr.locality.isNullOrBlank()
        } ?: geocoder.getFromLocation(latitude, longitude, 1)?.firstOrNull()
    }

    private fun addressToParts(address: Address): AddressParts {
        val streetLine = listOfNotNull(address.subThoroughfare, address.thoroughfare)
            .joinToString(" ")
            .ifBlank { null }
        val structured = listOfNotNull(
            streetLine ?: address.featureName?.takeIf { !it.contains("near", ignoreCase = true) },
            address.subLocality,
            address.locality ?: address.subAdminArea,
            address.adminArea,
            address.postalCode,
            address.countryName
        ).joinToString(", ").ifBlank { null }
        val line0 = address.getAddressLine(0)?.trim()
        val formatted = when {
            !structured.isNullOrBlank() && structured.length >= 6 -> structured
            !line0.isNullOrBlank() && !line0.contains("near", ignoreCase = true) -> line0
            !structured.isNullOrBlank() -> structured
            !line0.isNullOrBlank() -> line0
            else -> "Unknown address"
        }
        return AddressParts(
            formatted = formatted,
            country = address.countryName,
            state = address.adminArea,
            city = address.locality ?: address.subAdminArea,
            postalCode = address.postalCode,
            street = streetLine ?: address.thoroughfare ?: address.featureName
        )
    }

    /**
     * First enabled zone that contains the point (optionally skipping [excludeId]).
     * When coords are missing/zero and [allowMissingCoords], falls back to process location cache.
     */
    fun findContainingZone(
        latitude: Double,
        longitude: Double,
        excludeId: String? = null,
        allowMissingCoords: Boolean = false,
        /** Extra meters beyond zone radius (use location accuracy on EXIT checks). */
        accuracyPad: Float = 0f
    ): GeofenceZone? {
        reloadGeofencesFromStorage()
        var lat = latitude
        var lng = longitude
        val missing = kotlin.math.abs(lat) < 1e-7 && kotlin.math.abs(lng) < 1e-7
        if (missing && allowMissingCoords) {
            val cached = LocationResolver.peekCache() ?: return null
            lat = cached.latitude
            lng = cached.longitude
        } else if (missing) {
            return null
        }
        // Prefer nearest containing zone (important when zones are close).
        var best: GeofenceZone? = null
        var bestDist = Float.MAX_VALUE
        for (zone in geofenceZones) {
            if (excludeId != null && zone.id == excludeId) continue
            val results = FloatArray(1)
            Location.distanceBetween(lat, lng, zone.latitude, zone.longitude, results)
            val limit = zone.radiusMeters + accuracyPad.coerceAtLeast(0f)
            if (results[0] <= limit && results[0] < bestDist) {
                bestDist = results[0]
                best = zone
            }
        }
        return best
    }

    /** Distance in meters from a point to a zone center, or NaN if unknown. */
    fun distanceToZone(zoneId: String, latitude: Double, longitude: Double): Float {
        reloadGeofencesFromStorage()
        val zone = geofenceZones.firstOrNull { it.id == zoneId } ?: return Float.NaN
        val results = FloatArray(1)
        Location.distanceBetween(latitude, longitude, zone.latitude, zone.longitude, results)
        return results[0]
    }

    /**
     * Resolve which geofence applies at a point.
     *
     * - If inside one or more zones (d ≤ radius): pick the **nearest center**
     *   among those overlaps (tie-break: smaller radius). Stamp that zone
     *   (geofence path).
     * - If outside all zones: no geofence path ([fenceId]/[zoneName] null —
     *   callers label "Away"). [awayMeters] = smallest distToEdge
     *   (`d - radius`) across zones (closest boundary).
     */
    fun evaluateGeofence(latitude: Double, longitude: Double): GeofenceResult {
        reloadGeofencesFromStorage()
        if (geofenceZones.isEmpty()) {
            return GeofenceResult(
                insideFence = false,
                fenceId = null,
                distanceToCenter = Float.NaN,
                zoneName = null,
                awayMeters = Float.NaN
            )
        }
        var bestInside: GeofenceZone? = null
        var bestInsideDist = Float.MAX_VALUE
        var bestAwayDistToEdge = Float.MAX_VALUE
        var bestAwayCenterDist = Float.NaN
        for (zone in geofenceZones) {
            val results = FloatArray(1)
            Location.distanceBetween(
                latitude, longitude,
                zone.latitude, zone.longitude,
                results
            )
            val distance = results[0]
            val distToEdge = distance - zone.radiusMeters
            if (distance <= zone.radiusMeters) {
                val closer = distance < bestInsideDist
                val sameDistSmallerRadius =
                    !closer &&
                        kotlin.math.abs(distance - bestInsideDist) < 0.01f &&
                        (bestInside == null || zone.radiusMeters < bestInside!!.radiusMeters)
                if (closer || sameDistSmallerRadius) {
                    bestInsideDist = distance
                    bestInside = zone
                }
            } else if (distToEdge < bestAwayDistToEdge) {
                bestAwayDistToEdge = distToEdge
                bestAwayCenterDist = distance
            }
        }
        val inside = bestInside
        if (inside != null) {
            return GeofenceResult(
                insideFence = true,
                fenceId = inside.id,
                distanceToCenter = bestInsideDist,
                zoneName = inside.name,
                awayMeters = Float.NaN
            )
        }
        // Outside every radius — Away only (no zone path); awayM = closest edge.
        return GeofenceResult(
            insideFence = false,
            fenceId = null,
            distanceToCenter = bestAwayCenterDist,
            zoneName = null,
            awayMeters = if (bestAwayDistToEdge < Float.MAX_VALUE) bestAwayDistToEdge else Float.NaN
        )
    }

    private fun hasLocationPermission(): Boolean {
        return ActivityCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED ||
        ActivityCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    data class LocationData(
        val latitude: Double,
        val longitude: Double,
        val accuracy: Float,
        val altitude: Double,
        val provider: String
    )

    data class GeofenceResult(
        val insideFence: Boolean,
        val fenceId: String?,
        val distanceToCenter: Float,
        val zoneName: String?,
        /** When outside all zones: meters past the closest zone edge (`d - radius`). */
        val awayMeters: Float = Float.NaN
    )

    data class GeofenceZone(
        val id: String,
        val latitude: Double,
        val longitude: Double,
        val radiusMeters: Float,
        val name: String = id
    )

    companion object {
        private const val TAG = "LocationHelper"
        private const val DUPLICATE_GEOCODE_MS = 30_000L

        @Volatile
        private var lastGeocodeElapsed: Long = 0L

        @Volatile
        private var lastGeocodeLat: Double = 0.0

        @Volatile
        private var lastGeocodeLng: Double = 0.0

        @Volatile
        private var lastGeocodeAddress: String? = null

        @Volatile
        private var lastGeocodeParts: AddressParts? = null
    }
}