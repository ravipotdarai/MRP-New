package com.mrp.util

import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.annotation.RequiresApi

/**
 * OEM-specific battery optimization bypass utilities.
 * Handles Samsung, Xiaomi, OnePlus, Huawei, and other aggressive OEM battery savers.
 */
object OemBatteryMitigation {

    private const val TAG = "OemBatteryMitigation"

    /**
     * Check if the app is whitelisted from battery optimizations
     */
    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return powerManager.isIgnoringBatteryOptimizations(context.packageName)
    }

    /**
     * Request the user to disable battery optimization via system dialog
     */
    @RequiresApi(Build.VERSION_CODES.M)
    fun requestIgnoreBatteryOptimizations(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${context.packageName}")
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            Log.d(TAG, "Battery optimization request launched")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch battery optimization request", e)
            // Fallback to general battery settings
            openBatterySettings(context)
        }
    }

    /**
     * Open general battery settings
     */
    fun openBatterySettings(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open battery settings", e)
        }
    }

    /**
     * Open the system Battery Usage / power summary screen (per-app power stats).
     * Falls back through known intents; returns false if nothing could be launched.
     */
    fun openSystemBatteryUsage(context: Context): Boolean {
        val candidates = listOf(
            Intent(Intent.ACTION_POWER_USAGE_SUMMARY),
            Intent().setComponent(
                ComponentName(
                    "com.android.settings",
                    "com.android.settings.fuelgauge.PowerUsageSummary"
                )
            ),
            Intent().setComponent(
                ComponentName(
                    "com.android.settings",
                    "com.android.settings.Settings\$PowerUsageSummaryActivity"
                )
            ),
            Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS),
            Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
        )
        for (intent in candidates) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (intent.resolveActivity(context.packageManager) != null) {
                    context.startActivity(intent)
                    Log.d(TAG, "Opened system battery usage via $intent")
                    return true
                }
            } catch (e: Exception) {
                Log.w(TAG, "Battery usage intent failed: $intent", e)
            }
        }
        Log.e(TAG, "No system battery usage activity found")
        return false
    }

    /**
     * Open this app's Android "App battery usage" screen so the user can choose
     * Unrestricted / Optimized / Restricted. Does not change MRP monitoring logic.
     */
    fun openAppBatteryUsageSettings(context: Context): Boolean {
        val pkg = context.packageName
        val pkgUri = Uri.parse("package:$pkg")
        val candidates = mutableListOf<Intent>()

        // Pixel / AOSP: Settings → Apps → MRP → App battery usage
        candidates += Intent("android.settings.APP_BATTERY_SETTINGS").setData(pkgUri)
        // Some OEMs use this action with package extra
        candidates += Intent("android.settings.APP_BATTERY_SETTINGS").apply {
            putExtra("android.intent.extra.PACKAGE_NAME", pkg)
            putExtra("package", pkg)
        }
        // Samsung / generic power usage detail
        candidates += Intent().setComponent(
            ComponentName(
                "com.android.settings",
                "com.android.settings.fuelgauge.AdvancedPowerUsageDetail"
            )
        ).apply {
            putExtra("package", pkg)
            putExtra("extra_package_name", pkg)
        }
        // Fallback: app info (user taps Battery)
        candidates += Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(pkgUri)
        // Last resort: battery optimization allow-list
        candidates += Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)

        for (intent in candidates) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (intent.resolveActivity(context.packageManager) != null) {
                    context.startActivity(intent)
                    Log.d(TAG, "Opened app battery usage via $intent")
                    return true
                }
            } catch (e: Exception) {
                Log.w(TAG, "App battery usage intent failed: $intent", e)
            }
        }
        Log.e(TAG, "No app battery usage activity found")
        return false
    }

    /**
     * Detect the OEM and launch appropriate battery/autostart settings
     */
    fun launchOemBatterySettings(context: Context) {
        val manufacturer = Build.MANUFACTURER.lowercase()
        val brand = Build.BRAND.lowercase()

        Log.d(TAG, "Detected OEM: $manufacturer / $brand")

        when {
            isSamsung(manufacturer, brand) -> launchSamsungBatterySettings(context)
            isXiaomi(manufacturer, brand) -> launchXiaomiBatterySettings(context)
            isOnePlus(manufacturer, brand) -> launchOnePlusBatterySettings(context)
            isHuawei(manufacturer, brand) -> launchHuaweiBatterySettings(context)
            isOppo(manufacturer, brand) -> launchOppoBatterySettings(context)
            isVivo(manufacturer, brand) -> launchVivoBatterySettings(context)
            isAsus(manufacturer, brand) -> launchAsusBatterySettings(context)
            isSony(manufacturer, brand) -> launchSonyBatterySettings(context)
            else -> openBatterySettings(context)
        }
    }

    /**
     * Launch Samsung-specific battery and auto-start settings
     */
    private fun launchSamsungBatterySettings(context: Context) {
        try {
            // Try Device Care first (Samsung One UI 2.0+)
            val deviceCareIntent = Intent().apply {
                component = ComponentName(
                    "com.samsung.android.lool",
                    "com.samsung.android.sm.battery.ui.BatteryActivity"
                )
            }
            if (context.packageManager.resolveActivity(deviceCareIntent, 0) != null) {
                deviceCareIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(deviceCareIntent)
                Log.d(TAG, "Launched Samsung Device Care")
                return
            }
        } catch (e: Exception) {
            Log.w(TAG, "Device Care intent failed", e)
        }

        try {
            // Try Samsung Smart Manager (older versions)
            val smartManagerIntent = Intent().apply {
                component = ComponentName(
                    "com.samsung.android.sm",
                    "com.samsung.android.sm.battery.ui.BatteryActivity"
                )
            }
            if (context.packageManager.resolveActivity(smartManagerIntent, 0) != null) {
                smartManagerIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(smartManagerIntent)
                Log.d(TAG, "Launched Samsung Smart Manager")
                return
            }
        } catch (e: Exception) {
            Log.w(TAG, "Smart Manager intent failed", e)
        }

        // Fallback: Auto-start manager
        try {
            val autoStartIntent = Intent().apply {
                component = ComponentName(
                    "com.samsung.android.lool",
                    "com.samsung.android.sm.ui.battery.BatteryActivity"
                )
            }
            if (context.packageManager.resolveActivity(autoStartIntent, 0) != null) {
                autoStartIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(autoStartIntent)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Auto-start intent failed", e)
            openBatterySettings(context)
        }
    }

    /**
     * Launch Xiaomi/MIUI-specific battery and autostart settings
     */
    @SuppressLint("BatteryLife")
    private fun launchXiaomiBatterySettings(context: Context) {
        try {
            // Request to ignore battery optimizations (works on MIUI)
            val batteryIntent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${context.packageName}")
            }
            batteryIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(batteryIntent)
            Log.d(TAG, "Launched Xiaomi battery optimization request")
        } catch (e: Exception) {
            Log.w(TAG, "Xiaomi battery intent failed", e)
        }

        // Also try MIUI autostart manager
        try {
            val autoStartIntent = Intent().apply {
                component = ComponentName(
                    "com.miui.securitycenter",
                    "com.miui.permcenter.autostart.AutoStartManagementActivity"
                )
            }
            if (context.packageManager.resolveActivity(autoStartIntent, 0) != null) {
                autoStartIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(autoStartIntent)
                Log.d(TAG, "Launched Xiaomi AutoStart manager")
            }
        } catch (e: Exception) {
            Log.w(TAG, "AutoStart intent failed", e)
        }

        // Try MIUI battery saver
        try {
            val miuiBatteryIntent = Intent().apply {
                component = ComponentName(
                    "com.miui.powerkeeper",
                    "com.miui.powerkeeper.ui.HiddenAppsConfigActivity"
                )
            }
            if (context.packageManager.resolveActivity(miuiBatteryIntent, 0) != null) {
                miuiBatteryIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(miuiBatteryIntent)
                Log.d(TAG, "Launched MIUI battery saver")
            }
        } catch (e: Exception) {
            Log.w(TAG, "MIUI battery saver failed", e)
        }
    }

    /**
     * Launch OnePlus-specific battery and autostart settings
     */
    private fun launchOnePlusBatterySettings(context: Context) {
        try {
            // OnePlus Battery Settings
            val batteryIntent = Intent().apply {
                component = ComponentName(
                    "com.oneplus.security",
                    "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"
                )
            }
            if (context.packageManager.resolveActivity(batteryIntent, 0) != null) {
                batteryIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(batteryIntent)
                Log.d(TAG, "Launched OnePlus battery settings")
                return
            }
        } catch (e: Exception) {
            Log.w(TAG, "OnePlus battery intent failed", e)
        }

        // Try OxygenOS battery optimization
        try {
            val oxygenBatteryIntent = Intent().apply {
                component = ComponentName(
                    "com.oplus.battery",
                    "com.oplus.powermanager.fuelgaue.PowerUsageModelActivity"
                )
            }
            if (context.packageManager.resolveActivity(oxygenBatteryIntent, 0) != null) {
                oxygenBatteryIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(oxygenBatteryIntent)
                Log.d(TAG, "Launched OxygenOS battery settings")
                return
            }
        } catch (e: Exception) {
            Log.w(TAG, "OxygenOS battery intent failed", e)
        }

        openBatterySettings(context)
    }

    /**
     * Launch Huawei-specific battery settings
     */
    private fun launchHuaweiBatterySettings(context: Context) {
        try {
            val huaweiIntent = Intent().apply {
                component = ComponentName(
                    "com.huawei.systemmanager",
                    "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
                )
            }
            if (context.packageManager.resolveActivity(huaweiIntent, 0) != null) {
                huaweiIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(huaweiIntent)
                Log.d(TAG, "Launched Huawei startup manager")
                return
            }
        } catch (e: Exception) {
            Log.w(TAG, "Huawei intent failed", e)
        }

        try {
            val huaweiBatteryIntent = Intent().apply {
                component = ComponentName(
                    "com.huawei.systemmanager",
                    "com.huawei.systemmanager.power.ui.HwPowerManagerActivity"
                )
            }
            if (context.packageManager.resolveActivity(huaweiBatteryIntent, 0) != null) {
                huaweiBatteryIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(huaweiBatteryIntent)
                Log.d(TAG, "Launched Huawei power manager")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Huawei battery intent failed", e)
            openBatterySettings(context)
        }
    }

    /**
     * Launch OPPO-specific battery settings
     */
    private fun launchOppoBatterySettings(context: Context) {
        try {
            val oppoIntent = Intent().apply {
                component = ComponentName(
                    "com.coloros.safecenter",
                    "com.coloros.safecenter.permission.startup.StartupAppListActivity"
                )
            }
            if (context.packageManager.resolveActivity(oppoIntent, 0) != null) {
                oppoIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(oppoIntent)
                Log.d(TAG, "Launched OPPO startup manager")
                return
            }
        } catch (e: Exception) {
            Log.w(TAG, "OPPO intent failed", e)
        }

        try {
            val oppoBatteryIntent = Intent().apply {
                component = ComponentName(
                    "com.coloros.oppoguardelf",
                    "com.coloros.powermanager.fuelgaue.PowerUsageModelActivity"
                )
            }
            if (context.packageManager.resolveActivity(oppoBatteryIntent, 0) != null) {
                oppoBatteryIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(oppoBatteryIntent)
                Log.d(TAG, "Launched OPPO battery settings")
                return
            }
        } catch (e: Exception) {
            Log.w(TAG, "OPPO battery intent failed", e)
        }

        openBatterySettings(context)
    }

    /**
     * Launch Vivo-specific battery settings
     */
    private fun launchVivoBatterySettings(context: Context) {
        try {
            val vivoIntent = Intent().apply {
                component = ComponentName(
                    "com.vivo.abe",
                    "com.vivo.applicationbehaviorengine.ui.ExcessivePowerManagerActivity"
                )
            }
            if (context.packageManager.resolveActivity(vivoIntent, 0) != null) {
                vivoIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(vivoIntent)
                Log.d(TAG, "Launched Vivo battery manager")
                return
            }
        } catch (e: Exception) {
            Log.w(TAG, "Vivo intent failed", e)
        }

        openBatterySettings(context)
    }

    /**
     * Launch Asus-specific battery settings
     */
    private fun launchAsusBatterySettings(context: Context) {
        try {
            val asusIntent = Intent().apply {
                component = ComponentName(
                    "com.asus.mobilemanager",
                    "com.asus.mobilemanager.autostart.AutoStartActivity"
                )
            }
            if (context.packageManager.resolveActivity(asusIntent, 0) != null) {
                asusIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(asusIntent)
                Log.d(TAG, "Launched Asus autostart manager")
                return
            }
        } catch (e: Exception) {
            Log.w(TAG, "Asus intent failed", e)
        }

        openBatterySettings(context)
    }

    /**
     * Launch Sony-specific battery settings
     */
    private fun launchSonyBatterySettings(context: Context) {
        try {
            val sonyIntent = Intent().apply {
                component = ComponentName(
                    "com.sonymobile.cta",
                    "com.sonymobile.cta.SomcCTAMainActivity"
                )
            }
            if (context.packageManager.resolveActivity(sonyIntent, 0) != null) {
                sonyIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(sonyIntent)
                Log.d(TAG, "Launched Sony battery manager")
                return
            }
        } catch (e: Exception) {
            Log.w(TAG, "Sony intent failed", e)
        }

        openBatterySettings(context)
    }

    private fun isSamsung(manufacturer: String, brand: String): Boolean {
        return manufacturer.contains("samsung") || brand.contains("samsung")
    }

    private fun isXiaomi(manufacturer: String, brand: String): Boolean {
        return manufacturer.contains("xiaomi") || brand.contains("xiaomi") ||
               manufacturer.contains("redmi") || brand.contains("redmi") ||
               manufacturer.contains("poco") || brand.contains("poco")
    }

    private fun isOnePlus(manufacturer: String, brand: String): Boolean {
        return manufacturer.contains("oneplus") || brand.contains("oneplus")
    }

    private fun isHuawei(manufacturer: String, brand: String): Boolean {
        return manufacturer.contains("huawei") || brand.contains("huawei") ||
               manufacturer.contains("honor") || brand.contains("honor")
    }

    private fun isOppo(manufacturer: String, brand: String): Boolean {
        return manufacturer.contains("oppo") || brand.contains("oppo") ||
               manufacturer.contains("realme") || brand.contains("realme")
    }

    private fun isVivo(manufacturer: String, brand: String): Boolean {
        return manufacturer.contains("vivo") || brand.contains("vivo")
    }

    private fun isAsus(manufacturer: String, brand: String): Boolean {
        return manufacturer.contains("asus") || brand.contains("asus")
    }

    private fun isSony(manufacturer: String, brand: String): Boolean {
        return manufacturer.contains("sony") || brand.contains("sony")
    }
}