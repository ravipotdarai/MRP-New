package com.mrp.domain.usecase

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.location.Geocoder
import android.location.Location
import android.os.Build
import android.os.Looper
import android.util.Log
import androidx.core.app.ActivityCompat
import com.google.android.gms.location.*
import kotlinx.coroutines.*
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.*
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Enhanced LocationHelper using FusedLocationProviderClient for high-accuracy location
 * with geofencing support and reverse geocoding.
 */
class LocationHelper(private val context: Context) {

    private val fusedLocationClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /**
     * Hardcoded geofence zones - can be expanded with database-driven zones
     * These will only trigger when location is actually available
     * IMPORTANT: Replace with actual coordinates for your use case!
     */
    private val geofenceZones = mutableListOf<GeofenceZone>()

    fun addGeofenceZone(id: String, latitude: Double, longitude: Double, radiusMeters: Float) {
        geofenceZones.add(GeofenceZone(id, latitude, longitude, radiusMeters))
    }

    fun clearGeofenceZones() {
        geofenceZones.clear()
    }

    /**
     * Get current location using FusedLocationProviderClient
     * Falls back to last known location if fresh location is unavailable
     */
    @SuppressLint("MissingPermission")
    fun getCurrentLocation(callback: (LocationData?) -> Unit) {
        if (!hasLocationPermission()) {
            Log.w(TAG, "Location permission not granted")
            callback(null)
            return
        }

        scope.launch {
            try {
                // Give GPS up to 8 seconds to get a fresh lock (crucial when screen is off)
                val location = kotlinx.coroutines.withTimeoutOrNull(8000L) {
                    getLocationAsync()
                }
                Log.d(TAG, "getCurrentLocation: ${location?.latitude}, ${location?.longitude}")
                val locationData = location?.let {
                    LocationData(
                        latitude = it.latitude,
                        longitude = it.longitude,
                        accuracy = it.accuracy,
                        altitude = it.altitude,
                        provider = it.provider ?: "fused"
                    )
                }
                callback(locationData)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get location", e)
                callback(null)
            }
        }
    }

    @SuppressLint("MissingPermission")
    private suspend fun getLocationAsync(): Location? = suspendCancellableCoroutine { cont ->

        // Try last known location first
        fusedLocationClient.lastLocation
            .addOnSuccessListener { location ->
                if (location != null && isLocationFresh(location)) {
                    if (cont.isActive) cont.resume(location)
                } else {
                    // Request fresh location
                    requestFreshLocation { freshLocation ->
                        if (freshLocation != null) {
                            if (cont.isActive) cont.resume(freshLocation)
                        } else {
                            // Fall back to last known even if old
                            fusedLocationClient.lastLocation.addOnSuccessListener { loc ->
                                if (cont.isActive) cont.resume(loc)
                            }.addOnFailureListener {
                                if (cont.isActive) cont.resume(null)
                            }
                        }
                    }
                }
            }
            .addOnFailureListener {
                Log.e(TAG, "Last location failed", it)
                if (cont.isActive) cont.resume(null)
            }
    }

    @SuppressLint("MissingPermission")
    private fun requestFreshLocation(callback: (Location?) -> Unit) {
        val locationRequest = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            1000L
        ).apply {
            setMinUpdateIntervalMillis(500L)
            setMaxUpdates(1)
            setWaitForAccurateLocation(true)
        }.build()

        val isInvoked = java.util.concurrent.atomic.AtomicBoolean(false)

        val locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                fusedLocationClient.removeLocationUpdates(this)
                if (isInvoked.compareAndSet(false, true)) {
                    callback(result.lastLocation)
                }
            }
        }

        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                Looper.getMainLooper()
            )

            // Timeout after 10 seconds
            scope.launch {
                delay(10000)
                fusedLocationClient.removeLocationUpdates(locationCallback)
                if (isInvoked.compareAndSet(false, true)) {
                    callback(null)
                }
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "Security exception requesting location", e)
            if (isInvoked.compareAndSet(false, true)) {
                callback(null)
            }
        }
    }

    private fun isLocationFresh(location: Location): Boolean {
        val age = System.currentTimeMillis() - location.time
        return age < LOCATION_MAX_AGE_MS
    }

    /**
     * Reverse geocode coordinates to a human-readable address
     */
    @Suppress("DEPRECATION")
    fun reverseGeocode(latitude: Double, longitude: Double, callback: (String?) -> Unit) {
        scope.launch {
            try {
                val address = withContext(Dispatchers.IO) {
                    val geocoder = Geocoder(context, Locale.getDefault())

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        val latch = java.util.concurrent.CountDownLatch(1)
                        var result: String? = null
                        geocoder.getFromLocation(latitude, longitude, 1) { addresses ->
                            result = addresses.firstOrNull()?.getAddressLine(0)
                            latch.countDown()
                        }
                        latch.await(2500, java.util.concurrent.TimeUnit.MILLISECONDS)
                        result
                    } else {
                        val addresses = geocoder.getFromLocation(latitude, longitude, 1)
                        addresses?.firstOrNull()?.getAddressLine(0)
                    }
                }
                callback(address)
            } catch (e: Exception) {
                Log.e(TAG, "Reverse geocoding failed", e)
                callback(null)
            }
        }
    }

    /**
     * Synchronous reverse geocode for use in broadcast receivers
     */
    @Suppress("DEPRECATION")
    fun reverseGeocodeSync(latitude: Double, longitude: Double): String {
        return try {
            val geocoder = Geocoder(context, Locale.getDefault())
            var result: String? = null
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val latch = java.util.concurrent.CountDownLatch(1)
                geocoder.getFromLocation(latitude, longitude, 1) { addresses ->
                    result = addresses.firstOrNull()?.getAddressLine(0)
                    latch.countDown()
                }
                latch.await(1500, java.util.concurrent.TimeUnit.MILLISECONDS)
            } else {
                @Suppress("DEPRECATION")
                val addresses = geocoder.getFromLocation(latitude, longitude, 1)
                result = addresses?.firstOrNull()?.getAddressLine(0)
            }
            result ?: String.format(Locale.US, "Lat: %.5f, Long: %.5f", latitude, longitude)
        } catch (e: Exception) {
            Log.e(TAG, "Reverse geocoding failed", e)
            String.format(Locale.US, "Lat: %.5f, Long: %.5f", latitude, longitude)
        }
    }

    /**
     * Evaluate if a location is inside any defined geofence zone
     */
    fun evaluateGeofence(latitude: Double, longitude: Double): GeofenceResult {
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
        }
        return GeofenceResult(insideFence = false, fenceId = null, distanceToCenter = Float.MAX_VALUE, zoneName = null)
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
        private const val LOCATION_MAX_AGE_MS = 60000 // 1 minute
    }
}