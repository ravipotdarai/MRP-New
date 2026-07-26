package com.mrp

import com.facebook.react.bridge.*
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.FirebaseDatabase
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.domain.usecase.DevicePresenceTracker

/**
 * Sync policy only → Firebase device_config/{uid}.
 * Live location / events stay on device + Drive.
 */
class DeviceTrackingModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DeviceTracking"

    @ReactMethod
    fun getConfig(promise: Promise) {
        val snap = DeviceTrackingPrefs.snapshot(reactContext)
        promise.resolve(mapToWritable(snap))
    }

    @ReactMethod
    fun setConfig(config: ReadableMap, promise: Promise) {
        try {
            val map = readableToMap(config)
            // Clamp emergency interval
            val emergMin = (map["emergencyIntervalMinutes"] as? Number)?.toInt()?.coerceAtLeast(1) ?: 1
            val freq = (map["syncFrequencyMinutes"] as? Number)?.toInt()?.coerceAtLeast(1) ?: 15
            val normalized = map.toMutableMap()
            normalized["emergencyIntervalMinutes"] = emergMin
            normalized["syncFrequencyMinutes"] = freq
            DeviceTrackingPrefs.applyRemote(reactContext, normalized)
            mirrorConfigToFirebase()
            DevicePresenceTracker.restart(reactContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CONFIG_SET", e.message, e)
        }
    }

    @ReactMethod
    fun pullRemoteConfig(promise: Promise) {
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (uid == null) {
            promise.resolve(false)
            return
        }
        try {
            FirebaseDatabase.getInstance(databaseUrl())
                .getReference("device_config")
                .child(uid)
                .get()
                .addOnSuccessListener { snap ->
                    if (!snap.exists()) {
                        promise.resolve(false)
                        return@addOnSuccessListener
                    }
                    val map = HashMap<String, Any?>()
                    snap.children.forEach { c ->
                        map[c.key ?: return@forEach] = c.value
                    }
                    // Strip non-config keys if any sneaked in
                    map.remove("lat")
                    map.remove("lng")
                    map.remove("address")
                    DeviceTrackingPrefs.applyRemote(reactContext, map)
                    DevicePresenceTracker.restart(reactContext)
                    promise.resolve(true)
                }
                .addOnFailureListener { e -> promise.reject("CONFIG_PULL", e.message, e) }
        } catch (e: Exception) {
            promise.reject("CONFIG_PULL", e.message, e)
        }
    }

    @ReactMethod
    fun startPresence(promise: Promise) {
        DevicePresenceTracker.start(reactContext)
        promise.resolve(true)
    }

    @ReactMethod
    fun stopPresence(promise: Promise) {
        DevicePresenceTracker.stop(reactContext)
        promise.resolve(true)
    }

    private fun mirrorConfigToFirebase() {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        try {
            FirebaseDatabase.getInstance(databaseUrl())
                .getReference("device_config")
                .child(uid)
                .updateChildren(DeviceTrackingPrefs.toFirebaseConfigMap(reactContext))
        } catch (_: Exception) {
        }
    }

    private fun databaseUrl(): String {
        return try {
            val fromRes = reactContext.getString(R.string.firebase_database_url)
            if (fromRes.isNotBlank()) fromRes else
                "https://mobileresilienceplatform-default-rtdb.firebaseio.com"
        } catch (_: Exception) {
            "https://mobileresilienceplatform-default-rtdb.firebaseio.com"
        }
    }

    private fun mapToWritable(snap: Map<String, Any>): WritableMap {
        return Arguments.createMap().apply {
            snap.forEach { (k, v) ->
                when (v) {
                    is Boolean -> putBoolean(k, v)
                    is Int -> putInt(k, v)
                    is Long -> putDouble(k, v.toDouble())
                    is Double -> putDouble(k, v)
                    is String -> putString(k, v)
                    else -> putString(k, v.toString())
                }
            }
        }
    }

    private fun readableToMap(rm: ReadableMap): Map<String, Any?> {
        val out = HashMap<String, Any?>()
        val it = rm.keySetIterator()
        while (it.hasNextKey()) {
            val key = it.nextKey()
            when (rm.getType(key)) {
                ReadableType.Boolean -> out[key] = rm.getBoolean(key)
                ReadableType.Number -> out[key] = rm.getDouble(key)
                ReadableType.String -> out[key] = rm.getString(key)
                else -> {}
            }
        }
        return out
    }
}
