package com.mrp.data.local

import android.content.Context
import android.content.SharedPreferences
import com.mrp.domain.model.MonitoringSettings

class SettingsStorage(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getSettings(): MonitoringSettings {
        return MonitoringSettings(
            isMonitoringEnabled = prefs.getBoolean(KEY_MONITORING_ENABLED, true),
            captureOnWrongUnlock = prefs.getBoolean(KEY_WRONG_UNLOCK, true),
            captureOnAirplaneMode = prefs.getBoolean(KEY_AIRPLANE_MODE, true),
            captureOnWifiToggle = prefs.getBoolean(KEY_WIFI_TOGGLE, true),
            captureOnMobileData = prefs.getBoolean(KEY_MOBILE_DATA, true),
            captureOnHotspot = prefs.getBoolean(KEY_HOTSPOT, true),
            captureOnBluetooth = prefs.getBoolean(KEY_BLUETOOTH, true),
            captureOnSimChange = prefs.getBoolean(KEY_SIM_CHANGE, true),
            captureOnFactoryReset = prefs.getBoolean(KEY_FACTORY_RESET, true),
            captureOnUsb = prefs.getBoolean(KEY_USB, true),
            maxFailedAttempts = prefs.getInt(KEY_MAX_FAILED, 3),
            lockAfterFailedAttempts = prefs.getBoolean(KEY_LOCK_AFTER_FAIL, true),
            autoDeleteAfterDays = prefs.getInt(KEY_AUTO_DELETE, 30)
        )
    }

    fun saveSettings(settings: MonitoringSettings) {
        prefs.edit().apply {
            putBoolean(KEY_MONITORING_ENABLED, settings.isMonitoringEnabled)
            putBoolean(KEY_WRONG_UNLOCK, settings.captureOnWrongUnlock)
            putBoolean(KEY_AIRPLANE_MODE, settings.captureOnAirplaneMode)
            putBoolean(KEY_WIFI_TOGGLE, settings.captureOnWifiToggle)
            putBoolean(KEY_MOBILE_DATA, settings.captureOnMobileData)
            putBoolean(KEY_HOTSPOT, settings.captureOnHotspot)
            putBoolean(KEY_BLUETOOTH, settings.captureOnBluetooth)
            putBoolean(KEY_SIM_CHANGE, settings.captureOnSimChange)
            putBoolean(KEY_FACTORY_RESET, settings.captureOnFactoryReset)
            putBoolean(KEY_USB, settings.captureOnUsb)
            putInt(KEY_MAX_FAILED, settings.maxFailedAttempts)
            putBoolean(KEY_LOCK_AFTER_FAIL, settings.lockAfterFailedAttempts)
            putInt(KEY_AUTO_DELETE, settings.autoDeleteAfterDays)
            apply()
        }
    }

    fun updateSetting(key: String, value: Boolean) {
        prefs.edit().putBoolean(key, value).apply()
    }

    companion object {
        private const val PREFS_NAME = "mrp_settings"
        private const val KEY_MONITORING_ENABLED = "monitoring_enabled"
        private const val KEY_WRONG_UNLOCK = "capture_wrong_unlock"
        private const val KEY_AIRPLANE_MODE = "capture_airplane_mode"
        private const val KEY_WIFI_TOGGLE = "capture_wifi_toggle"
        private const val KEY_MOBILE_DATA = "capture_mobile_data"
        private const val KEY_HOTSPOT = "capture_hotspot"
        private const val KEY_BLUETOOTH = "capture_bluetooth"
        private const val KEY_SIM_CHANGE = "capture_sim_change"
        private const val KEY_FACTORY_RESET = "capture_factory_reset"
        private const val KEY_USB = "capture_usb"
        private const val KEY_MAX_FAILED = "max_failed_attempts"
        private const val KEY_LOCK_AFTER_FAIL = "lock_after_failed"
        private const val KEY_AUTO_DELETE = "auto_delete_days"
    }
}