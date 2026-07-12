package com.mrp.domain.usecase

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.mrp.data.local.TimelineStorage
import com.mrp.domain.model.*

/**
 * Centralized event logger that creates timeline entries with location and geofencing.
 * Thread-safe and handles all event types from the specification.
 */
class TimelineEventLogger(private val context: Context) {

    private val timelineStorage = TimelineStorage(context)
    private val locationHelper = LocationHelper(context)
    private val mainHandler = Handler(Looper.getMainLooper())

    /**
     * Log an event with optional location data
     */
    fun logEvent(
        eventType: String,
        status: String,
        metadata: Map<String, Any?> = emptyMap()
    ) {
        if (shouldDebounce(eventType, status)) {
            Log.d(TAG, "Debounced duplicate logEvent: $eventType:$status")
            return
        }
        mainHandler.post {
            locationHelper.getCurrentLocation { locationData ->
                if (locationData != null) {
                    logEventWithLocation(eventType, status, locationData, metadata)
                } else {
                    logEventWithoutLocation(eventType, status, metadata)
                }
            }
        }
    }

    /**
     * Log event synchronously (for use in BroadcastReceivers)
     */
    fun logEventSync(eventType: String, status: String, metadata: Map<String, Any?> = emptyMap()) {
        try {
            if (shouldDebounce(eventType, status)) {
                Log.d(TAG, "Debounced duplicate logEventSync: $eventType:$status")
                return
            }
            Log.d(TAG, "Logging event: $eventType / $status")

            val location = getLocationSync()
            val address = location?.let { locationHelper.reverseGeocodeSync(it.latitude, it.longitude) }
            val geofenceResult = location?.let { locationHelper.evaluateGeofence(it.latitude, it.longitude) }

            val entry = TimelineEntry(
                eventType = eventType,
                status = status,
                location = LocationData(
                    latitude = location?.latitude ?: 0.0,
                    longitude = location?.longitude ?: 0.0,
                    accuracyMeters = location?.accuracy ?: 0f,
                    detailedAddress = address ?: "Address Unavailable (Offline)"
                ),
                geofenceStatus = GeofenceStatus(
                    insideFence = geofenceResult?.insideFence ?: false,
                    fenceId = geofenceResult?.fenceId
                ),
                metadata = metadata
            )

            timelineStorage.appendTimelineEntrySync(entry)
            Log.d(TAG, "Logged event: $eventType / $status")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to log event", e)
        }
    }

    private fun logEventWithLocation(
        eventType: String,
        status: String,
        locationData: LocationHelper.LocationData,
        metadata: Map<String, Any?>
    ) {
        locationHelper.reverseGeocode(locationData.latitude, locationData.longitude) { address ->
            val geofenceResult = locationHelper.evaluateGeofence(locationData.latitude, locationData.longitude)

            val entry = TimelineEntry(
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

            timelineStorage.appendTimelineEntrySync(entry)
            Log.d(TAG, "Logged event with location: $eventType / $status at ${locationData.latitude},${locationData.longitude}")
        }
    }

    private fun logEventWithoutLocation(
        eventType: String,
        status: String,
        metadata: Map<String, Any?>
    ) {
        val entry = TimelineEntry(
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

        timelineStorage.appendTimelineEntrySync(entry)
        Log.d(TAG, "Logged event without location: $eventType / $status")
    }

    @SuppressLint("MissingPermission")
    private fun getLocationSync(): Location? {
        try {
            val hasPermission = android.content.pm.PackageManager.PERMISSION_GRANTED ==
                context.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) ||
                android.content.pm.PackageManager.PERMISSION_GRANTED ==
                context.checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)
            if (!hasPermission) {
                Log.w(TAG, "Location permission not granted")
                return null
            }

            // Try FusedLocationProviderClient first (async with timeout)
            var result: Location? = null
            val latch = java.util.concurrent.CountDownLatch(1)

            try {
                val fusedClient = com.google.android.gms.location.LocationServices.getFusedLocationProviderClient(context)
                fusedClient.lastLocation
                    .addOnSuccessListener { location ->
                        if (location != null) {
                            result = location
                            latch.countDown()
                        } else {
                            fusedClient.getCurrentLocation(com.google.android.gms.location.Priority.PRIORITY_BALANCED_POWER_ACCURACY, null)
                                .addOnSuccessListener { freshLoc ->
                                    result = freshLoc
                                    latch.countDown()
                                }
                                .addOnFailureListener {
                                    latch.countDown()
                                }
                        }
                    }
                    .addOnFailureListener { e ->
                        Log.w(TAG, "FusedLocation failed", e)
                        latch.countDown()
                    }

                // Wait max 2 seconds for FusedLocation
                latch.await(2, java.util.concurrent.TimeUnit.SECONDS)
            } catch (e: Exception) {
                Log.e(TAG, "FusedLocation error", e)
            }

            // Fallback to all LocationManager providers if FusedLocation returned null
            if (result == null) {
                Log.d(TAG, "Falling back to LocationManager")
                val lm = context.getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
                val providers = lm.getProviders(true)

                for (provider in providers) {
                    try {
                        val loc = lm.getLastKnownLocation(provider)
                        if (loc != null && (result == null || loc.time > result!!.time)) {
                            result = loc
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Provider $provider failed", e)
                    }
                }
            }

            if (result != null) {
                lastValidLocation = result
                Log.d(TAG, "Got location: ${result!!.latitude},${result!!.longitude}")
                return result
            }

            // Fallback to cached location if still null
            if (lastValidLocation != null) {
                Log.d(TAG, "Returning cached lastValidLocation")
                return lastValidLocation
            }

            return null
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get location sync", e)
            return lastValidLocation
        }
    }

    companion object {
        private const val TAG = "TimelineEventLogger"
        @Volatile
        private var lastValidLocation: Location? = null
        private val lastEventTimes = java.util.concurrent.ConcurrentHashMap<String, Long>()
        private const val DEBOUNCE_MS = 3500L

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