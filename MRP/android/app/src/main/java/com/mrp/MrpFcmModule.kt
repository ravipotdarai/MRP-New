package com.mrp

import android.os.Build
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.messaging.FirebaseMessaging

/**
 * P8-4 — obtain FCM token and mirror to RTDB devices/{uid}/{deviceId}.
 */
class MrpFcmModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "MrpFcm"

    @ReactMethod
    fun registerForCircleInvites(promise: Promise) {
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (uid == null) {
            promise.resolve(
                Arguments.createMap().apply {
                    putBoolean("ok", false)
                    putString("reason", "not_signed_in")
                },
            )
            return
        }
        try {
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token ->
                    if (token.isNullOrBlank()) {
                        promise.resolve(
                            Arguments.createMap().apply {
                                putBoolean("ok", false)
                                putString("reason", "empty_token")
                            },
                        )
                        return@addOnSuccessListener
                    }
                    val deviceId = deviceId()
                    FirebaseDatabase.getInstance(databaseUrl())
                        .getReference("devices")
                        .child(uid)
                        .child(deviceId)
                        .updateChildren(
                            mapOf(
                                "fcmToken" to token,
                                "updatedAtMs" to System.currentTimeMillis(),
                                "platform" to "android",
                                "sdk" to Build.VERSION.SDK_INT,
                            ),
                        )
                        .addOnSuccessListener {
                            promise.resolve(
                                Arguments.createMap().apply {
                                    putBoolean("ok", true)
                                    putString("token", token)
                                    putString("deviceId", deviceId)
                                    putString("uid", uid)
                                },
                            )
                        }
                        .addOnFailureListener { e ->
                            Log.w(TAG, "FCM RTDB write failed", e)
                            promise.resolve(
                                Arguments.createMap().apply {
                                    putBoolean("ok", false)
                                    putString("reason", e.message ?: "rtdb_write_failed")
                                    putString("token", token)
                                },
                            )
                        }
                }
                .addOnFailureListener { e ->
                    promise.reject("FCM_TOKEN", e.message, e)
                }
        } catch (e: Exception) {
            promise.reject("FCM_TOKEN", e.message, e)
        }
    }

    private fun deviceId(): String {
        val androidId = Settings.Secure.getString(
            reactContext.contentResolver,
            Settings.Secure.ANDROID_ID,
        ) ?: "unknown"
        return "mrp_$androidId"
    }

    private fun databaseUrl(): String {
        return try {
            val fromRes = reactContext.getString(R.string.firebase_database_url)
            if (fromRes.isNotBlank()) fromRes
            else "https://mobileresilienceplatform-default-rtdb.firebaseio.com"
        } catch (_: Exception) {
            "https://mobileresilienceplatform-default-rtdb.firebaseio.com"
        }
    }

    companion object {
        private const val TAG = "MrpFcm"
    }
}
