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
            geocoder.getFromLocation(latitude, longitude, 1) { addresses ->
                result = addresses.firstOrNull()
                latch.countDown()
            }
            latch.await(1500, java.util.concurrent.TimeUnit.MILLISECONDS)
            return result
        }
        return geocoder.getFromLocation(latitude, longitude, 1)?.firstOrNull()
    }

    private fun addressToParts(address: Address): AddressParts {
        val formatted = address.getAddressLine(0)
            ?: listOfNotNull(
                address.thoroughfare,
                address.locality,
                address.adminArea,
                address.countryName
            ).joinToString(", ").ifBlank { "Unknown address" }
        return AddressParts(
            formatted = formatted,
            country = address.countryName,
            state = address.adminArea,
            city = address.locality ?: address.subAdminArea,
            postalCode = address.postalCode,
            street = address.thoroughfare ?: address.featureName
        )
    }

    /**
     * Evaluate if a location is inside any defined geofence zone
     */
    fun evaluateGeofence(latitude: Double, longitude: Double): GeofenceResult {
        reloadGeofencesFromStorage()
        if (geofenceZones.isEmpty()) {
            return GeofenceResult(
                insideFence = false,
                fenceId = null,
                distanceToCenter = Float.NaN,
                zoneName = null
            )
        }
        var nearest: GeofenceZone? = null
        var nearestDist = Float.MAX_VALUE
        for (zone in geofenceZones) {
            val results = FloatArray(1)
            Location.distanceBetween(
                latitude, longitude,
                zone.latitude, zone.longitude,
                results
            )
            val distance = results[0]
            if (distance <= zone.radiusMeters) {
                return GeofenceResult(
                    insideFence = true,
                    fenceId = zone.id,
                    distanceToCenter = distance,
                    zoneName = zone.name
                )
            }
            if (distance < nearestDist) {
                nearestDist = distance
                nearest = zone
            }
        }
        return GeofenceResult(
            insideFence = false,
            fenceId = nearest?.id,
            distanceToCenter = nearestDist,
            zoneName = nearest?.name
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
        val zoneName: String?
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