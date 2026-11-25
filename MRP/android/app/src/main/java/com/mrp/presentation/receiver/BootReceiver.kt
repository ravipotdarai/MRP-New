package com.mrp.presentation.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.mrp.data.local.SettingsStorage
import com.mrp.service.MrpMonitorService

/**
 * BroadcastReceiver that restarts the Foreground Service after device boot.
 * Also handles quick boot and Samsung-specific boot intents.
 *
 * Staggers FGS start slightly after boot to avoid a camera/GPS/sync storm
 * that can look like rapid battery drop after a hard power-off. Selfie and
 * location remain fully available once the service is up.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null) return

        val action = intent?.action
        Log.d(TAG, "Boot received: $action")

        val isBootCompleted = action == Intent.ACTION_BOOT_COMPLETED ||
                             action == "android.intent.action.QUICKBOOT_POWERON" ||
                             action == "android.intent.action.ACTION_BOOT_COMPLETED"

        if (!isBootCompleted) return

        val settings = SettingsStorage(context)
        if (!settings.getSettings().isMonitoringEnabled) {
            Log.d(TAG, "Monitoring was disabled, not restarting service")
            return
        }

        val appCtx = context.applicationContext
        val pending = goAsync()
        Handler(Looper.getMainLooper()).postDelayed({
            try {
                Log.d(TAG, "Restarting MrpMonitorService after boot stagger")
                MrpMonitorService.startService(appCtx)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to restart MrpMonitorService", e)
            } finally {
                pending.finish()
            }
        }, BOOT_STAGGER_MS)
    }

    companion object {
        private const val TAG = "BootReceiver"
        private const val BOOT_STAGGER_MS = 20_000L
    }
}