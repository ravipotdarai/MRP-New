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
            val db = FirebaseDatabase.getInstance(databaseUrl(context))
            val ref = db.getReference("device_config").child(uid)
            // Do not overwrite a newer PathSync Web / admin command with stale device prefs.
            ref.get().addOnSuccessListener { snap ->
                try {
                    val remoteAt = (snap.child("updatedAtMs").getValue(Long::class.java) ?: 0L)
                    val remoteSource = snap.child("source").getValue(String::class.java)?.lowercase().orEmpty()
                    val ageMs = System.currentTimeMillis() - remoteAt
                    // Protect PathSync Web / admin emergency start-stop from stale device push.
                    if (remoteAt > 0 && ageMs < 900_000L && (remoteSource == "web" || remoteSource == "admin")) {
                        return@addOnSuccessListener
                    }
                    ref.updateChildren(DeviceTrackingPrefs.toFirebaseConfigMap(context))
                } catch (_: Exception) {
                }
            }.addOnFailureListener {
                try {
                    ref.updateChildren(DeviceTrackingPrefs.toFirebaseConfigMap(context))
                } catch (_: Exception) {
                }
            }
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
