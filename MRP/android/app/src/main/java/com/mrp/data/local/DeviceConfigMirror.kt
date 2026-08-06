package com.mrp.data.local

import android.content.Context
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.FirebaseDatabase
import com.mrp.R

/** Push device_config toggles to Firebase RTDB (no location/event payloads). */
object DeviceConfigMirror {

    fun push(context: Context) {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        try {
            FirebaseDatabase.getInstance(databaseUrl(context))
                .getReference("device_config")
                .child(uid)
                .updateChildren(DeviceTrackingPrefs.toFirebaseConfigMap(context))
        } catch (_: Exception) {
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
