package com.mrp.ops

import android.annotation.SuppressLint
import android.content.Context
import android.net.wifi.WifiManager
import android.provider.Settings
import android.telephony.TelephonyManager
import com.google.firebase.auth.FirebaseAuth
import java.net.NetworkInterface

/** Best-effort identity hints for admin user list (email, name, phone, MAC). */
object DeviceIdentity {

    fun hints(context: Context): Map<String, Any> {
        val user = FirebaseAuth.getInstance().currentUser
        return mapOf(
            "accountEmail" to (user?.email ?: ""),
            "displayName" to (user?.displayName ?: ""),
            "phoneNumber" to phone(context, user?.phoneNumber),
            "deviceMac" to deviceMac(context),
        )
    }

    @SuppressLint("HardwareIds", "MissingPermission")
    private fun phone(context: Context, firebasePhone: String?): String {
        if (!firebasePhone.isNullOrBlank()) return firebasePhone
        return try {
            val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            tm.line1Number?.trim().orEmpty()
        } catch (_: Exception) {
            ""
        }
    }

    @SuppressLint("HardwareIds")
    fun deviceMac(context: Context): String {
        try {
            val nif = NetworkInterface.getByName("wlan0")
            val hw = nif?.hardwareAddress
            if (hw != null && hw.isNotEmpty()) {
                return hw.joinToString(":") { String.format("%02X", it) }
            }
        } catch (_: Exception) {
        }
        try {
            @Suppress("DEPRECATION")
            val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val m = wm.connectionInfo.macAddress
            if (!m.isNullOrBlank() && !m.equals("02:00:00:00:00:00", ignoreCase = true)) {
                return m.uppercase()
            }
        } catch (_: Exception) {
        }
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        return if (!androidId.isNullOrBlank()) "android:$androidId" else ""
    }
}
