package com.mrp.util

import android.Manifest
import android.app.AppOpsManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import com.mrp.presentation.admin.MrpDeviceAdminReceiver

/**
 * Snapshot of core permission setup for Grant All Access wizard.
 */
object PermissionSetupStatus {

    data class Status(
        val camera: Boolean,
        val location: Boolean,
        val notifications: Boolean,
        val overlay: Boolean,
        val deviceAdmin: Boolean,
        val batteryExempt: Boolean,
        val accessibility: Boolean,
        val usageStats: Boolean,
        val manufacturer: String
    ) {
        val coreComplete: Boolean
            get() = camera && location && notifications && overlay && deviceAdmin

        val missingCore: List<String>
            get() = buildList {
                if (!camera) add("camera")
                if (!location) add("location")
                if (!notifications) add("notifications")
                if (!overlay) add("overlay")
                if (!deviceAdmin) add("device_admin")
            }
    }

    fun get(context: Context): Status {
        val pm = context.packageManager
        val camera = ActivityCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        val location = ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val notifications = if (Build.VERSION.SDK_INT >= 33) {
            ActivityCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        } else true
        val overlay = Settings.canDrawOverlays(context)
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = dpm.isAdminActive(ComponentName(context, MrpDeviceAdminReceiver::class.java))
        val battery = OemBatteryMitigation.isIgnoringBatteryOptimizations(context)
        val accessibility = isAccessibilityEnabled(context)
        val usageStats = hasUsageStats(context)
        return Status(
            camera = camera,
            location = location,
            notifications = notifications,
            overlay = overlay,
            deviceAdmin = admin,
            batteryExempt = battery,
            accessibility = accessibility,
            usageStats = usageStats,
            manufacturer = Build.MANUFACTURER ?: "unknown"
        )
    }

    private fun isAccessibilityEnabled(context: Context): Boolean {
        return try {
            val enabled = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            )
            enabled?.contains(context.packageName) == true
        } catch (_: Exception) {
            false
        }
    }

    private fun hasUsageStats(context: Context): Boolean {
        return try {
            val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    android.os.Process.myUid(),
                    context.packageName
                )
            } else {
                @Suppress("DEPRECATION")
                appOps.checkOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    android.os.Process.myUid(),
                    context.packageName
                )
            }
            mode == AppOpsManager.MODE_ALLOWED
        } catch (_: Exception) {
            false
        }
    }
}
