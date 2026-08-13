package com.mrp.domain.cellular

import android.content.Context
import android.telephony.TelephonyManager

/**
 * Samples cellular / SIM state for anomaly scoring. Informational only — not fake-tower detection.
 */
class CellularMonitor(private val context: Context) {

    data class Sample(
        val simState: String,
        val networkType: String,
        val operatorName: String,
        val simOperatorName: String,
        val networkCountryIso: String,
        val simCountryIso: String,
        val roaming: Boolean,
    )

    fun sample(): Sample? {
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager ?: return null
        return try {
            Sample(
                simState = simStateName(tm.simState),
                networkType = networkTypeName(tm.dataNetworkType.takeIf { it != 0 } ?: tm.networkType),
                operatorName = tm.networkOperatorName?.takeIf { it.isNotBlank() } ?: "Unknown",
                simOperatorName = tm.simOperatorName?.takeIf { it.isNotBlank() } ?: "Unknown",
                networkCountryIso = tm.networkCountryIso?.uppercase().orEmpty(),
                simCountryIso = tm.simCountryIso?.uppercase().orEmpty(),
                roaming = try {
                    tm.isNetworkRoaming
                } catch (_: Exception) {
                    false
                },
            )
        } catch (_: SecurityException) {
            null
        }
    }

    private fun simStateName(state: Int): String = when (state) {
        TelephonyManager.SIM_STATE_ABSENT -> "ABSENT"
        TelephonyManager.SIM_STATE_NETWORK_LOCKED -> "NETWORK_LOCKED"
        TelephonyManager.SIM_STATE_PIN_REQUIRED -> "PIN_REQUIRED"
        TelephonyManager.SIM_STATE_PUK_REQUIRED -> "PUK_REQUIRED"
        TelephonyManager.SIM_STATE_READY -> "READY"
        TelephonyManager.SIM_STATE_NOT_READY -> "NOT_READY"
        TelephonyManager.SIM_STATE_PERM_DISABLED -> "PERM_DISABLED"
        TelephonyManager.SIM_STATE_CARD_IO_ERROR -> "CARD_IO_ERROR"
        TelephonyManager.SIM_STATE_CARD_RESTRICTED -> "CARD_RESTRICTED"
        else -> "UNKNOWN"
    }

    @Suppress("DEPRECATION")
    private fun networkTypeName(type: Int): String = when (type) {
        TelephonyManager.NETWORK_TYPE_LTE -> "LTE"
        TelephonyManager.NETWORK_TYPE_NR -> "5G"
        TelephonyManager.NETWORK_TYPE_HSPAP,
        TelephonyManager.NETWORK_TYPE_HSPA,
        TelephonyManager.NETWORK_TYPE_UMTS,
        TelephonyManager.NETWORK_TYPE_HSDPA,
        TelephonyManager.NETWORK_TYPE_HSUPA -> "3G"
        TelephonyManager.NETWORK_TYPE_EDGE,
        TelephonyManager.NETWORK_TYPE_GPRS -> "2G"
        TelephonyManager.NETWORK_TYPE_IWLAN -> "IWLAN"
        0 -> "NONE"
        else -> "UNKNOWN"
    }
}
