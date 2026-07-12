package com.mrp.presentation.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.mrp.data.local.SettingsStorage
import com.mrp.domain.model.*
import com.mrp.domain.usecase.TimelineEventLogger

/**
 * BroadcastReceiver that monitors network state changes:
 * - Airplane mode toggle
 * - WiFi toggle
 * - Mobile data toggle
 * - Hotspot toggle
 *
 * Logs all events to the timeline with location and geofencing data.
 */
class NetworkChangeReceiver : BroadcastReceiver() {

    private var lastAirplaneState: Boolean? = null
    private var lastWifiState: Int? = null
    private var lastMobileDataState: Boolean? = null
    private var lastHotspotState: Int? = null

    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent == null) return

        val settings = SettingsStorage(context).getSettings()
        if (!settings.isMonitoringEnabled) return

        when (intent.action) {
            Intent.ACTION_AIRPLANE_MODE_CHANGED -> {
                val isEnabled = intent.getBooleanExtra("state", false)
                if (settings.captureOnAirplaneMode) {
                    handleAirplaneModeChange(context, isEnabled)
                }
            }

            WifiManager.WIFI_STATE_CHANGED_ACTION -> {
                val wifiState = intent.getIntExtra(
                    WifiManager.EXTRA_WIFI_STATE,
                    WifiManager.WIFI_STATE_UNKNOWN
                )
                if (settings.captureOnWifiToggle) {
                    handleWifiChange(context, wifiState)
                }
            }

            "android.net.conn.CONNECTIVITY_CHANGE" -> {
                if (settings.captureOnMobileData) {
                    handleMobileDataChange(context)
                }
            }

            "android.net.wifi.WIFI_AP_STATE_CHANGED" -> {
                val apState = intent.getIntExtra("wifi_ap_state", -1)
                if (settings.captureOnHotspot) {
                    handleHotspotChange(context, apState)
                }
            }
        }
    }

    private fun handleAirplaneModeChange(context: Context, isEnabled: Boolean) {
        val previous = lastAirplaneState
        lastAirplaneState = isEnabled

        // Avoid duplicate events
        if (previous != null && previous == isEnabled) return

        Log.d(TAG, "Airplane mode changed: enabled=$isEnabled")

        val eventLogger = TimelineEventLogger(context)
        eventLogger.logEventSync(
            eventType = EventTypes.AIRPLANE_MODE_TOGGLE,
            status = if (isEnabled) StatusValues.ENABLED else StatusValues.DISABLED,
            metadata = mapOf(
                "previous_state" to (previous?.toString() ?: "unknown"),
                "source" to "NetworkChangeReceiver"
            )
        )
    }

    private fun handleWifiChange(context: Context, wifiState: Int) {
        val isEnabled = wifiState == WifiManager.WIFI_STATE_ENABLED
        val previous = lastWifiState
        lastWifiState = wifiState

        // Avoid duplicate events and unknown states
        if (wifiState == WifiManager.WIFI_STATE_UNKNOWN) return
        if (previous != null && previous == wifiState) return

        Log.d(TAG, "WiFi state changed: state=$wifiState, enabled=$isEnabled")

        val eventLogger = TimelineEventLogger(context)
        eventLogger.logEventSync(
            eventType = EventTypes.WIFI_TOGGLE,
            status = if (isEnabled) StatusValues.ENABLED else StatusValues.DISABLED,
            metadata = mapOf(
                "wifi_state" to getWifiStateName(wifiState),
                "source" to "NetworkChangeReceiver"
            )
        )
    }

    private fun handleMobileDataChange(context: Context) {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connectivityManager.activeNetwork
        val capabilities = connectivityManager.getNetworkCapabilities(network)

        val isMobileEnabled = capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true
        val previous = lastMobileDataState
        lastMobileDataState = isMobileEnabled

        // Avoid duplicate events
        if (previous != null && previous == isMobileEnabled) return

        Log.d(TAG, "Mobile data changed: enabled=$isMobileEnabled")

        val eventLogger = TimelineEventLogger(context)
        eventLogger.logEventSync(
            eventType = EventTypes.MOBILE_DATA_TOGGLE,
            status = if (isMobileEnabled) StatusValues.ENABLED else StatusValues.DISABLED,
            metadata = mapOf(
                "network_type" to (capabilities?.toString() ?: "unknown"),
                "source" to "NetworkChangeReceiver"
            )
        )
    }

    private fun handleHotspotChange(context: Context, apState: Int) {
        // WIFI_AP_STATE_ENABLED = 13, WIFI_AP_STATE_DISABLED = 11
        val isEnabled = apState == 13
        val previous = lastHotspotState
        lastHotspotState = apState

        // Avoid duplicate events
        if (previous != null && previous == apState) return

        Log.d(TAG, "Hotspot state changed: state=$apState, enabled=$isEnabled")

        val eventLogger = TimelineEventLogger(context)
        eventLogger.logEventSync(
            eventType = EventTypes.HOTSPOT_TOGGLE,
            status = if (isEnabled) StatusValues.ENABLED else StatusValues.DISABLED,
            metadata = mapOf(
                "ap_state" to apState,
                "source" to "NetworkChangeReceiver"
            )
        )
    }

    private fun getWifiStateName(state: Int): String {
        return when (state) {
            WifiManager.WIFI_STATE_DISABLED -> "DISABLED"
            WifiManager.WIFI_STATE_ENABLED -> "ENABLED"
            WifiManager.WIFI_STATE_DISABLING -> "DISABLING"
            WifiManager.WIFI_STATE_ENABLING -> "ENABLING"
            WifiManager.WIFI_STATE_UNKNOWN -> "UNKNOWN"
            else -> "STATE_$state"
        }
    }

    companion object {
        private const val TAG = "NetworkChangeReceiver"
    }
}