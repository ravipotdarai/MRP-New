package com.mrp.util

import android.util.Log

/**
 * Ensures SMS is only sent from approved SIM recovery paths.
 */
object SmsGuard {

    private const val TAG = "SmsGuard"

    enum class Purpose {
        SIM_RECOVERY_ALERT,
        SIM_RECOVERY_TEST
    }

    @Volatile
    private var activePurpose: Purpose? = null

    fun beginSend(purpose: Purpose): Boolean {
        if (activePurpose != null) {
            Log.w(TAG, "SMS blocked — already sending for $activePurpose")
            return false
        }
        activePurpose = purpose
        return true
    }

    fun endSend() {
        activePurpose = null
    }

    fun assertAllowed(purpose: Purpose) {
        if (activePurpose != purpose) {
            throw IllegalStateException("SMS send not authorized for $purpose (active=$activePurpose)")
        }
    }
}
