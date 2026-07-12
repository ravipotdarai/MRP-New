package com.mrp.presentation.admin

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.Toast
import com.mrp.data.local.SettingsStorage
import com.mrp.data.local.TimelineStorage
import com.mrp.domain.model.*
import com.mrp.domain.usecase.LocationHelper
import com.mrp.domain.usecase.TimelineEventLogger
import android.os.Handler
import android.os.Looper

/**
 * DeviceAdminReceiver that intercepts password failures and logs them
 * to the timeline with location and geofencing data.
 */
class MrpDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.d(TAG, "Device Admin enabled")
        Toast.makeText(context, "MRP Device Admin enabled", Toast.LENGTH_SHORT).show()
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.d(TAG, "Device Admin disabled")
        Toast.makeText(context, "MRP Device Admin disabled", Toast.LENGTH_SHORT).show()
    }

    override fun onPasswordFailed(context: Context, intent: Intent) {
        super.onPasswordFailed(context, intent)
        Log.d(TAG, "Password failed")

        val settings = SettingsStorage(context).getSettings()
        if (!settings.isMonitoringEnabled || !settings.captureOnWrongUnlock) return

        val eventLogger = TimelineEventLogger(context)
        eventLogger.logEventSync(
            eventType = EventTypes.WRONG_UNLOCK_ATTEMPT,
            status = StatusValues.FAILED,
            metadata = mapOf(
                "description" to "Wrong password/PIN/pattern attempted",
                "source" to "DeviceAdminReceiver"
            )
        )
        eventLogger.logEventSync(
            eventType = EventTypes.WRONG_PASSWORD,
            status = StatusValues.FAILED,
            metadata = mapOf(
                "description" to "Wrong password entered",
                "source" to "DeviceAdminReceiver"
            )
        )

        try {
            val photoIntent = Intent("com.mrp.ACTION_REQUEST_PHOTO").apply {
                setPackage(context.packageName)
            }
            context.sendBroadcast(photoIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Error requesting photo on password failure", e)
        }
    }

    override fun onPasswordSucceeded(context: Context, intent: Intent) {
        super.onPasswordSucceeded(context, intent)
        Log.d(TAG, "Password succeeded - device unlocked")
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        Log.d(TAG, "Disable requested")
        try {
            val eventLogger = TimelineEventLogger(context)
            eventLogger.logEventSync(
                eventType = EventTypes.FACTORY_RESET,
                status = "warning",
                metadata = mapOf(
                    "description" to "Device admin disable requested (possible factory reset prep)",
                    "source" to "DeviceAdminReceiver"
                )
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error logging disable request", e)
        }
        return "Removing MRP admin will disable monitoring"
    }

    companion object {
        private const val TAG = "MrpDeviceAdminReceiver"

        fun getComponentName(context: Context): ComponentName {
            return ComponentName(context, MrpDeviceAdminReceiver::class.java)
        }

        fun isAdminActive(context: Context): Boolean {
            return try {
                val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                dpm.isAdminActive(getComponentName(context))
            } catch (e: Exception) {
                Log.e(TAG, "Failed to check admin status", e)
                false
            }
        }

        fun removeAdmin(context: Context): Boolean {
            return try {
                val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                val comp = getComponentName(context)
                if (dpm.isAdminActive(comp)) {
                    dpm.removeActiveAdmin(comp)
                }
                true
            } catch (e: Exception) {
                Log.e(TAG, "Failed to remove admin", e)
                false
            }
        }
    }
}