package com.mrp.domain.usecase

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import com.mrp.data.local.AppUsageDao
import com.mrp.domain.model.AppUsageSession
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class AppUsageTracker(private val context: Context) {

    private val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    private val appUsageDao = AppUsageDao(context)
    private val eventDao = com.mrp.data.local.EventDao(context)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val packageManager = context.packageManager

    // Map to keep track of when an app was opened
    private val openApps = mutableMapOf<String, Long>()

    // Last time we queried UsageStatsManager
    private var lastQueryTime: Long = System.currentTimeMillis() - 60000 // default to 1 min ago

    fun trackUsage() {
        scope.launch {
            try {
                val currentTime = System.currentTimeMillis()
                val events = usageStatsManager.queryEvents(lastQueryTime, currentTime)
                val event = UsageEvents.Event()

                while (events.hasNextEvent()) {
                    events.getNextEvent(event)
                    
                    val packageName = event.packageName
                    if (packageName == null) continue

                    when (event.eventType) {
                        UsageEvents.Event.ACTIVITY_RESUMED -> {
                            // App brought to foreground
                            openApps[packageName] = event.timeStamp
                        }
                        UsageEvents.Event.ACTIVITY_PAUSED,
                        UsageEvents.Event.ACTIVITY_STOPPED -> {
                            // App sent to background
                            val startTime = openApps.remove(packageName)
                            if (startTime != null) {
                                val durationMs = event.timeStamp - startTime
                                if (durationMs > 1000) { // Only log if > 1 second
                                    val session = createAppUsageSession(packageName, startTime, event.timeStamp, durationMs)
                                    appUsageDao.insertSession(session)
                                    Log.d(TAG, "Recorded session for $packageName: \${durationMs / 1000}s")
                                }
                            }
                        }
                    }
                }
                lastQueryTime = currentTime
            } catch (e: Exception) {
                Log.e(TAG, "Failed to track app usage", e)
            }
        }
    }

    private fun createAppUsageSession(
        packageName: String,
        startTime: Long,
        endTime: Long,
        durationMs: Long
    ): AppUsageSession {
        var appName = packageName
        try {
            val appInfo = packageManager.getApplicationInfo(packageName, 0)
            appName = packageManager.getApplicationLabel(appInfo).toString()
        } catch (e: PackageManager.NameNotFoundException) {
            // keep package name
        }

        // Category Mapping
        val category = when {
            packageName.contains("whatsapp") || packageName.contains("telegram") || packageName.contains("messenger") || packageName.contains("snapchat") || packageName.contains("discord") || packageName.contains("skype") || packageName.contains("viber") || packageName.contains("wechat") || packageName.contains("signal") -> "Communication"
            packageName.contains("facebook") || packageName.contains("instagram") || packageName.contains("twitter") || packageName.contains("linkedin") || packageName.contains("tiktok") || packageName.contains("reddit") || packageName.contains("pinterest") -> "Social"
            packageName.contains("chrome") || packageName.contains("firefox") || packageName.contains("browser") || packageName.contains("docs") || packageName.contains("sheets") || packageName.contains("mail") || packageName.contains("calendar") || packageName.contains("notes") || packageName.contains("slack") || packageName.contains("teams") -> "Productivity"
            packageName.contains("maps") || packageName.contains("navigation") || packageName.contains("uber") || packageName.contains("lyft") || packageName.contains("waze") -> "Navigation"
            packageName.contains("youtube") || packageName.contains("netflix") || packageName.contains("spotify") || packageName.contains("music") || packageName.contains("video") || packageName.contains("games") || packageName.contains("twitch") || packageName.contains("hulu") || packageName.contains("disney") -> "Entertainment"
            packageName.contains("camera") || packageName.contains("gallery") || packageName.contains("photos") -> "Media"
            else -> "Other"
        }

        // System states (simplified for background)
        val batteryLevel = getBatteryLevel()
        val isWifi = isWifiConnected()
        val lastLoc = eventDao.getLastKnownLocation()

        return AppUsageSession(
            packageName = packageName,
            appName = appName,
            category = category,
            startTime = startTime,
            endTime = endTime,
            durationSeconds = durationMs / 1000,
            batteryLevel = batteryLevel,
            networkType = if (isWifi) "WIFI" else "UNKNOWN",
            latitude = lastLoc?.first,
            longitude = lastLoc?.second,
            createdAt = System.currentTimeMillis()
        )
    }

    private fun getBatteryLevel(): Int {
        return try {
            val batteryIntent = context.registerReceiver(null, android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED))
            val level = batteryIntent?.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryIntent?.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1) ?: -1
            if (level != -1 && scale != -1) (level * 100 / scale.toFloat()).toInt() else -1
        } catch (e: Exception) {
            -1
        }
    }

    private fun isWifiConnected(): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
            val network = cm.activeNetwork ?: return false
            val capabilities = cm.getNetworkCapabilities(network) ?: return false
            capabilities.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI)
        } catch (e: Exception) {
            false
        }
    }

    fun hasUsageStatsPermission(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as android.app.AppOpsManager
        val mode = appOps.checkOpNoThrow(
            android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
            android.os.Process.myUid(),
            context.packageName
        )
        return if (mode == android.app.AppOpsManager.MODE_DEFAULT) {
            context.checkCallingOrSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED
        } else {
            mode == android.app.AppOpsManager.MODE_ALLOWED
        }
    }

    companion object {
        private const val TAG = "AppUsageTracker"
    }
}
