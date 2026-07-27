package com.mrp

import android.content.Intent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: android.os.Bundle?) {
    super.onCreate(savedInstanceState)
    ensureMonitoringRunning()
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    if (intent != null) {
      setIntent(intent)
    }
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

  override fun getMainComponentName(): String = "MRP"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
