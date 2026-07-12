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

    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent == null) return

        if (intent.action == "com.mrp.TEST_SET_SETTING") {
            val key = intent.getStringExtra("key")
            val value = intent.getBooleanExtra("value", true)
            if (key != null) {
                SettingsStorage(context).updateSetting(key, value)
                Log.d(TAG, "TEST_SET_SETTING: $key = $value")
            }
            return
        }

        val settings = SettingsStorage(context).getSettings()
        if (!settings.isMonitoringEnabled) return

        when (intent.action) {
            Intent.ACTION_AIRPLANE_MODE_CHANGED -> {
                val isEnabled = intent.getBooleanExtra("state", false)
                if (settings.captureOnAirplaneMode) {
                    handleAirplaneModeChange(context, isEnabled)
                }
            }

            WifiManager.WIFI_STATE_CHANGED_ACTION, "com.mrp.TEST_WIFI_TOGGLE" -> {
                val wifiState = if (intent.action == "com.mrp.TEST_WIFI_TOGGLE") {
                    WifiManager.WIFI_STATE_ENABLED
                } else {
                    intent.getIntExtra(WifiManager.EXTRA_WIFI_STATE, WifiManager.WIFI_STATE_UNKNOWN)
                }
                if (settings.captureOnWifiToggle) {
                    handleWifiChange(context, wifiState)
                }
            }

            "android.net.conn.CONNECTIVITY_CHANGE" -> {
                if (settings.captureOnMobileData) {
                    handleMobileDataChange(context)
                }
            }

            "android.net.wifi.WIFI_AP_STATE_CHANGED", "android.net.conn.TETHER_STATE_CHANGED", "com.mrp.TEST_HOTSPOT_TOGGLE" -> {
                if (settings.captureOnHotspot) {
                    val isEnabled = when (intent.action) {
                        "com.mrp.TEST_HOTSPOT_TOGGLE" -> intent.getBooleanExtra("state", true)
                        "android.net.conn.TETHER_STATE_CHANGED" -> {
                            val active = intent.getStringArrayListExtra("activeArray")
                            active != null && active.isNotEmpty()
                        }
                        else -> {
                            val apState = intent.getIntExtra("wifi_ap_state", -1)
                            apState == 13 || apState == 3 || apState == 12 || apState == 2
                        }
                    }
                    handleHotspotChangeExplicit(context, isEnabled)
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
        if (wifiState != WifiManager.WIFI_STATE_ENABLED && wifiState != WifiManager.WIFI_STATE_DISABLED) {
            return
        }

        val isEnabled = wifiState == WifiManager.WIFI_STATE_ENABLED
        val previous = lastWifiState
        lastWifiState = wifiState

        val metadata = getWifiNetworkMetadata(context, isEnabled)
        val currentBssid = metadata["wifi_bssid"] ?: ""

        val bssidChanged = isEnabled && currentBssid != "N/A" && currentBssid != "Unavailable" && currentBssid != lastWifiBssid
        if (isEnabled && currentBssid != "N/A" && currentBssid != "Unavailable") {
            lastWifiBssid = currentBssid
        }

        if (previous == null || previous != wifiState || bssidChanged) {
            Log.d(TAG, "WiFi state changed: state=$wifiState, enabled=$isEnabled, bssidChanged=$bssidChanged")
            val eventLogger = TimelineEventLogger(context)
            eventLogger.logEventSync(
                eventType = EventTypes.WIFI_TOGGLE,
                status = if (isEnabled) StatusValues.ENABLED else StatusValues.DISABLED,
                metadata = metadata
            )
        }
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

    private fun handleHotspotChangeExplicit(context: Context, isEnabled: Boolean) {
        val previous = lastHotspotState
        lastHotspotState = isEnabled

        // Avoid duplicate events
        if (previous != null && previous == isEnabled) return

        Log.d(TAG, "Hotspot state changed explicit: enabled=$isEnabled")

        val eventLogger = TimelineEventLogger(context)
        eventLogger.logEventSync(
            eventType = EventTypes.HOTSPOT_TOGGLE,
            status = if (isEnabled) StatusValues.ENABLED else StatusValues.DISABLED,
            metadata = mapOf(
                "source" to "NetworkChangeReceiver"
            )
        )
    }

    private fun getWifiNetworkMetadata(context: Context, isWifiOn: Boolean): Map<String, String> {
        val details = mutableMapOf<String, String>()
        if (!isWifiOn) {
            details["wifi_name"] = "Disconnected"
            details["wifi_id"] = "N/A"
            details["wifi_bssid"] = "N/A"
            details["wifi_ip"] = "0.0.0.0"
            details["description"] = "Wi-Fi turned OFF"
            return details
        }
        try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val info = wifiManager?.connectionInfo
            val ssidRaw = info?.ssid ?: ""
            val ssid = if (ssidRaw.startsWith("\"") && ssidRaw.endsWith("\"") && ssidRaw.length > 2) {
                ssidRaw.substring(1, ssidRaw.length - 1)
            } else if (ssidRaw == "<unknown ssid>" || ssidRaw.isEmpty()) {
                "Connected (SSID scanning)"
            } else {
                ssidRaw
            }
            val bssid = info?.bssid ?: "Unavailable"
            val ipInt = info?.ipAddress ?: 0
            val ipAddress = if (ipInt != 0) {
                String.format(
                    java.util.Locale.US, "%d.%d.%d.%d",
                    ipInt and 0xff,
                    ipInt shr 8 and 0xff,
                    ipInt shr 16 and 0xff,
                    ipInt shr 24 and 0xff
                )
            } else "0.0.0.0"

            val linkSpeed = "${info?.linkSpeed ?: 0} Mbps"
            val frequency = "${info?.frequency ?: 0} MHz"

            details["wifi_name"] = ssid
            details["wifi_id"] = bssid
            details["wifi_bssid"] = bssid
            details["wifi_ip"] = ipAddress
            details["link_speed"] = linkSpeed
            details["frequency"] = frequency
            details["description"] = "Wi-Fi ON: $ssid ($ipAddress)"
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching Wi-Fi details", e)
            details["wifi_name"] = "Enabled"
            details["description"] = "Wi-Fi turned ON"
        }
        return details
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
        @Volatile private var lastAirplaneState: Boolean? = null
        @Volatile private var lastWifiState: Int? = null
        @Volatile private var lastMobileDataState: Boolean? = null
        @Volatile private var lastHotspotState: Boolean? = null
        @Volatile private var lastWifiBssid: String? = null
    }
}