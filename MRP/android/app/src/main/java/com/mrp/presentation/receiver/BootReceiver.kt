package com.mrp.presentation.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.mrp.data.local.SettingsStorage
import com.mrp.service.MrpMonitorService

/**
 * BroadcastReceiver that restarts the Foreground Service after device boot.
 * Also handles quick boot and Samsung-specific boot intents.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null) return

        val action = intent?.action
        Log.d(TAG, "Boot received: $action")

        // Check for various boot completion actions
        val isBootCompleted = action == Intent.ACTION_BOOT_COMPLETED ||
                             action == "android.intent.action.QUICKBOOT_POWERON" ||
                             action == "android.intent.action.ACTION_BOOT_COMPLETED"

        if (!isBootCompleted) return

        // Check if monitoring was enabled before reboot
        val settings = SettingsStorage(context)
        if (!settings.getSettings().isMonitoringEnabled) {
            Log.d(TAG, "Monitoring was disabled, not restarting service")
            return
        }

        // Restart the foreground service
        try {
            Log.d(TAG, "Restarting MrpMonitorService after boot")
            MrpMonitorService.startService(context)
            Log.d(TAG, "MrpMonitorService started successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to restart MrpMonitorService", e)
        }
    }

    companion object {
        private const val TAG = "BootReceiver"
    }
}