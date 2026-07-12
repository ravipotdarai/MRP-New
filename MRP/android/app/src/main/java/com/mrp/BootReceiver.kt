package com.mrp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.mrp.service.MrpMonitorService

class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d(TAG, "Boot completed, restarting monitoring if was active")
            // Service will be started by the app when opened, not auto-started on boot
            // to respect user privacy
        }
    }

    companion object {
        private const val TAG = "BootReceiver"
    }
}