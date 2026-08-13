package com.mrp.domain.cellular

import android.content.Context

/** Debounces cellular anomaly timeline events — at most one alert per window. */
class CellularEventDebouncer(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun shouldEmit(nowMs: Long = System.currentTimeMillis()): Boolean {
        val last = prefs.getLong(KEY_LAST, 0L)
        if (nowMs - last < DEBOUNCE_MS) return false
        prefs.edit().putLong(KEY_LAST, nowMs).apply()
        return true
    }

    companion object {
        private const val PREFS = "mrp_cellular_debounce"
        private const val KEY_LAST = "last_emit_ms"
        private const val DEBOUNCE_MS = 6 * 60 * 60 * 1000L // 6 hours
    }
}
