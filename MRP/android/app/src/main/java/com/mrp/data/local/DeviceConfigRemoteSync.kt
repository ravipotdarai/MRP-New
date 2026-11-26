package com.mrp.data.local

import android.content.Context
import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ValueEventListener
import com.mrp.R
import com.mrp.domain.usecase.DevicePowerMode
import com.mrp.domain.usecase.DevicePresenceTracker
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Listen for PathSync Web / admin writes to `device_config/{uid}` (Find my device /
 * emergency start-stop). Without this, the phone never applies remote toggles.
 */
object DeviceConfigRemoteSync {

    private const val TAG = "DeviceConfigRemote"
    private val listening = AtomicBoolean(false)
    private val lastAppliedUpdatedAt = AtomicLong(0L)
    private var listener: ValueEventListener? = null
    private var uidBound: String? = null
    private var dbUrlBound: String? = null

    fun start(context: Context) {
        val app = context.applicationContext
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (uid.isNullOrBlank()) {
            Log.d(TAG, "skip start — not signed in")
            return
        }
        if (listening.get() && uidBound == uid) return
        stop()
        uidBound = uid
        val url = databaseUrl(app)
        dbUrlBound = url
        try {
            val ref = FirebaseDatabase.getInstance(url)
                .getReference("device_config")
                .child(uid)
            val l = object : ValueEventListener {
                override fun onDataChange(snap: DataSnapshot) {
                    if (!snap.exists()) return
                    applySnapshot(app, snap)
                }

                override fun onCancelled(error: DatabaseError) {
                    Log.w(TAG, "listener cancelled: ${error.message}")
                    listening.set(false)
                }
            }
            ref.addValueEventListener(l)
            listener = l
            listening.set(true)
            Log.i(TAG, "listening device_config/$uid")
        } catch (e: Exception) {
            Log.w(TAG, "start failed", e)
            listening.set(false)
        }
    }

    fun stop() {
        val uid = uidBound
        val l = listener
        val url = dbUrlBound
        if (uid != null && l != null && url != null) {
            try {
                FirebaseDatabase.getInstance(url)
                    .getReference("device_config")
                    .child(uid)
                    .removeEventListener(l)
            } catch (_: Exception) {
            }
        }
        listener = null
        uidBound = null
        dbUrlBound = null
        listening.set(false)
    }

    private fun applySnapshot(context: Context, snap: DataSnapshot) {
        val map = HashMap<String, Any?>()
        for (c in snap.children) {
            val key = c.key ?: continue
            map[key] = c.value
        }
        map.remove("lat")
        map.remove("lng")
        map.remove("address")
        map.remove("timeline")
        map.remove("selfie")
        map.remove("selfies")

        val updatedAt = when (val v = map["updatedAtMs"]) {
            is Number -> v.toLong()
            is String -> v.toLongOrNull() ?: 0L
            else -> 0L
        }
        val source = (map["source"] as? String)?.lowercase().orEmpty()
        val prev = lastAppliedUpdatedAt.get()
        if (updatedAt > 0 && updatedAt <= prev && source != "web" && source != "admin") {
            return
        }

        val beforeEmergency = DeviceTrackingPrefs.isEmergencyTracking(context)
        DeviceTrackingPrefs.applyRemote(context, map)
        if (updatedAt > 0) lastAppliedUpdatedAt.set(updatedAt)

        val afterEmergency = DeviceTrackingPrefs.isEmergencyTracking(context)
        try {
            DevicePowerMode.applyLoops(context)
        } catch (e: Exception) {
            Log.w(TAG, "applyLoops", e)
        }
        try {
            DevicePresenceTracker.restart(context)
        } catch (e: Exception) {
            Log.w(TAG, "presence restart", e)
        }

        if (beforeEmergency != afterEmergency) {
            Log.i(TAG, "emergencyTracking -> $afterEmergency (source=$source)")
        }
    }

    private fun databaseUrl(context: Context): String {
        return try {
            val fromRes = context.getString(R.string.firebase_database_url)
            if (fromRes.isNotBlank()) fromRes else DEFAULT_URL
        } catch (_: Exception) {
            DEFAULT_URL
        }
    }

    private const val DEFAULT_URL =
        "https://mobileresilienceplatform-default-rtdb.firebaseio.com"
}
