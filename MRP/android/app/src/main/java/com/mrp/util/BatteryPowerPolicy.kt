package com.mrp.util

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.PowerManager

/**
 * Shared battery helpers for QR / camera power safety.
 * Does not gate security selfies or GPS.
 */
object BatteryPowerPolicy {

    /** Below this %, refuse optional QR camera (high current draw). */
    const val QR_MIN_PERCENT = 25

    fun batteryPercent(context: Context): Int {
        return try {
            val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
            val cap = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
            if (cap in 0..100) return cap
            val sticky = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val level = sticky?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = sticky?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
            if (level >= 0 && scale > 0) ((level * 100f) / scale).toInt().coerceIn(0, 100) else -1
        } catch (_: Exception) {
            -1
        }
    }

    fun isPowerSaveOn(context: Context): Boolean {
        return try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            pm?.isPowerSaveMode == true
        } catch (_: Exception) {
            false
        }
    }

    /** Optional QR / ML camera should not open. */
    fun shouldBlockOptionalCamera(context: Context): Boolean {
        val pct = batteryPercent(context)
        if (pct in 0 until QR_MIN_PERCENT) return true
        return isPowerSaveOn(context)
    }

    /** Soften selfie UI (no keep-screen-on) when pack is weak — capture still runs. */
    fun shouldSoftenSelfieWake(context: Context): Boolean {
        val pct = batteryPercent(context)
        return pct in 0 until QR_MIN_PERCENT || isPowerSaveOn(context)
    }
}
