package com.mrp

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: android.os.Bundle?) {
    super.onCreate(savedInstanceState)
    ensureMonitoringRunning()
  }

  override fun onResume() {
    super.onResume()
    ensureMonitoringRunning()
  }

  private fun ensureMonitoringRunning() {
    try {
        val settings = com.mrp.data.local.SettingsStorage(this).getSettings()
        if (settings.isMonitoringEnabled) {
            com.mrp.service.MrpMonitorService.startService(this)
        }
    } catch (e: Exception) {
        android.util.Log.e("MainActivity", "Failed to start monitoring service", e)
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "MRP"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
