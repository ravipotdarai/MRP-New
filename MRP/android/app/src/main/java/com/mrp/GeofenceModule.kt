package com.mrp

import com.facebook.react.bridge.*
import com.mrp.data.local.GeofenceStorage
import com.mrp.domain.usecase.DistanceCalc
import com.mrp.domain.usecase.LocationHelper
import com.mrp.domain.usecase.LocationResolver
import java.util.UUID

class GeofenceModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "MrpGeofence"

    @ReactMethod
    fun listZones(promise: Promise) {
        try {
            val arr = Arguments.createArray()
            GeofenceStorage.list(reactContext).forEach { z ->
                arr.pushMap(
                    Arguments.createMap().apply {
                        putString("id", z.id)
                        putString("name", z.name)
                        putDouble("latitude", z.latitude)
                        putDouble("longitude", z.longitude)
                        putDouble("radiusMeters", z.radiusMeters.toDouble())
                        putBoolean("enabled", z.enabled)
                    }
                )
            }
            promise.resolve(arr)
        } catch (e: Exception) {
            promise.reject("GEOFENCE_LIST", e.message, e)
        }
    }

    @ReactMethod
    fun upsertZone(
        id: String?,
        name: String,
        latitude: Double,
        longitude: Double,
        radiusMeters: Double,
        enabled: Boolean,
        promise: Promise
    ) {
        try {
            val zoneId = if (id.isNullOrBlank()) "gf_${UUID.randomUUID().toString().take(8)}" else id
            GeofenceStorage.upsert(
                reactContext,
                GeofenceStorage.Zone(
                    id = zoneId,
                    name = name.ifBlank { "Zone" },
                    latitude = latitude,
                    longitude = longitude,
                    radiusMeters = radiusMeters.toFloat().coerceIn(30f, 5000f),
                    enabled = enabled
                )
            )
            com.mrp.domain.usecase.NativeGeofenceRegistrar.sync(reactContext)
            promise.resolve(zoneId)
        } catch (e: Exception) {
            promise.reject("GEOFENCE_UPSERT", e.message, e)
        }
    }

    @ReactMethod
    fun removeZone(id: String, promise: Promise) {
        try {
            GeofenceStorage.remove(reactContext, id)
            com.mrp.domain.usecase.NativeGeofenceRegistrar.sync(reactContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("GEOFENCE_REMOVE", e.message, e)
        }
    }

    @ReactMethod
    fun evaluateHere(promise: Promise) {
        Thread {
            try {
                // Geofence evaluation requires accurate GPS; Wi-Fi/cell centroids
                // can be 100-300 m off, causing false "Outside" for small radii.
                val resolved = LocationResolver.resolveSync(
                    reactContext,
                    LocationResolver.Severity.SECURITY
                )
                val helper = LocationHelper(reactContext)
                helper.reloadGeofencesFromStorage()
                if (resolved == null) {
                    promise.resolve(null)
                    return@Thread
                }
                val loc = resolved.location
                val parts = helper.reverseGeocodePartsSync(loc.latitude, loc.longitude)
                val geo = helper.evaluateGeofence(loc.latitude, loc.longitude)
                promise.resolve(
                    Arguments.createMap().apply {
                        putDouble("latitude", loc.latitude)
                        putDouble("longitude", loc.longitude)
                        putDouble("accuracyMeters", loc.accuracy.toDouble())
                        putString("locationTier", resolved.tier)
                        putString("address", parts?.formatted)
                        putString("country", parts?.country)
                        putString("state", parts?.state)
                        putString("city", parts?.city)
                        putString("postalCode", parts?.postalCode)
                        putBoolean("insideGeofence", geo.insideFence)
                        putString("geofenceId", geo.fenceId)
                        putString("geofenceName", geo.zoneName)
                        putDouble(
                            "distanceToFenceM",
                            if (geo.distanceToCenter.isFinite()) geo.distanceToCenter.toDouble()
                            else -1.0
                        )
                    }
                )
            } catch (e: Exception) {
                promise.reject("GEOFENCE_EVAL", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun getCurrentLocationForZone(promise: Promise) {
        Thread {
            try {
                // High-accuracy fix used when placing a zone — ensures zone center
                // matches where the user actually is, not a cell/Wi-Fi centroid.
                val resolved = LocationResolver.resolveSync(
                    reactContext,
                    LocationResolver.Severity.SECURITY
                )
                if (resolved == null) {
                    promise.resolve(null)
                    return@Thread
                }
                val loc = resolved.location
                val helper = LocationHelper(reactContext)
                val parts = helper.reverseGeocodePartsSync(loc.latitude, loc.longitude)
                promise.resolve(Arguments.createMap().apply {
                    putDouble("latitude", loc.latitude)
                    putDouble("longitude", loc.longitude)
                    putDouble("accuracyMeters", loc.accuracy.toDouble())
                    putString("locationTier", resolved.tier)
                    putString("address", parts?.formatted)
                })
            } catch (e: Exception) {
                promise.reject("GEOFENCE_LOC", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun distanceMeters(
        lat1: Double,
        lng1: Double,
        lat2: Double,
        lng2: Double,
        promise: Promise
    ) {
        promise.resolve(DistanceCalc.meters(lat1, lng1, lat2, lng2))
    }
}
