package com.mrp.domain.usecase

import android.app.ActivityManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.BatteryManager
import android.os.Build
import android.util.Log
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.data.local.GeofenceStorage
import com.mrp.data.local.SettingsStorage
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/**
 * Battery-safe vault extras: built **only** when assembling a Drive backup
 * (or on-demand Safety UI). No background polling loops.
 */
object VaultExtrasBuilder {

    private const val TAG = "VaultExtras"
    private const val MAX_DAILY_SESSIONS = 400

    fun buildAppUsageDaily(context: Context): JSONObject {
        val dayStart = startOfDayMs()
        val now = System.currentTimeMillis()
        val sessions = querySessions(context, dayStart, now)
            .filter { !isSystemPackage(context, it.packageName) }
            .take(MAX_DAILY_SESSIONS)
        val arr = JSONArray()
        for (s in sessions) {
            arr.put(
                JSONObject()
                    .put("packageName", s.packageName)
                    .put("appName", s.appName)
                    .put("startTime", s.startMs)
                    .put("endTime", s.endMs)
                    .put("durationSeconds", s.durationSeconds)
            )
        }
        return JSONObject()
            .put("dayStartMs", dayStart)
            .put("exportedAtMs", now)
            .put("sessionCount", sessions.size)
            .put("sessions", arr)
            .put("safety", buildSafetySections(context))
    }

    fun buildSafetySections(context: Context): JSONObject {
        val scanner = SensitivePermissionScanner(context)
        return JSONObject()
            .put("sms", toAppArray(scanner.appsWithSms()))
            .put("camera", toAppArray(scanner.appsWithCamera()))
            .put("microphone", toAppArray(scanner.appsWithMicrophone()))
            .put("scannedAtMs", System.currentTimeMillis())
    }

    fun buildDeviceHealth(context: Context): JSONObject {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        val pct = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        val monitoring = try {
            SettingsStorage(context).getSettings().isMonitoringEnabled
        } catch (_: Exception) {
            false
        }
        return JSONObject()
            .put("atMs", System.currentTimeMillis())
            .put("monitoringOn", monitoring)
            .put("batteryPct", pct)
            .put("driveLastSyncMs", DeviceTrackingPrefs.lastDriveSyncMs(context))
            .put("emergencyTracking", DeviceTrackingPrefs.isEmergencyTracking(context))
            .put(
                "emergencyIntervalMinutes",
                DeviceTrackingPrefs.emergencyIntervalMinutes(context)
            )
            .put("importance", processImportance(context))
    }

    fun buildGeofences(context: Context): JSONArray {
        val arr = JSONArray()
        for (z in GeofenceStorage.list(context)) {
            if (!z.enabled) continue
            arr.put(
                JSONObject()
                    .put("id", z.id)
                    .put("name", z.name)
                    .put("latitude", z.latitude)
                    .put("longitude", z.longitude)
                    .put("radiusMeters", z.radiusMeters.toDouble())
            )
        }
        return arr
    }

    private fun toAppArray(apps: List<SensitivePermissionScanner.AppPerm>): JSONArray {
        val arr = JSONArray()
        for (a in apps) {
            arr.put(
                JSONObject()
                    .put("packageName", a.packageName)
                    .put("appName", a.appName)
                    .put("permissions", JSONArray(a.permissions))
            )
        }
        return arr
    }

    private data class Sess(
        val packageName: String,
        val appName: String,
        val startMs: Long,
        val endMs: Long,
        val durationSeconds: Long,
    )

    private fun querySessions(context: Context, since: Long, now: Long): List<Sess> {
        if (!hasUsagePermission(context)) {
            Log.w(TAG, "usage permission missing — empty daily appUsage")
            return emptyList()
        }
        return try {
            val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val pm = context.packageManager
            val events = usm.queryEvents(since, now)
            val useActivity = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            val moveToFg = UsageEvents.Event.MOVE_TO_FOREGROUND
            val moveToBg = UsageEvents.Event.MOVE_TO_BACKGROUND
            val activityResumed = UsageEvents.Event.ACTIVITY_RESUMED
            val activityPaused = UsageEvents.Event.ACTIVITY_PAUSED
            val selfPkg = context.packageName
            val openStart = LinkedHashMap<String, Long>()
            val openDepth = HashMap<String, Int>()
            val out = mutableListOf<Sess>()
            val ev = UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(ev)
                val pkg = ev.packageName ?: continue
                if (pkg == selfPkg) continue
                val isStart = if (useActivity) ev.eventType == activityResumed else ev.eventType == moveToFg
                val isEnd = if (useActivity) {
                    ev.eventType == activityPaused ||
                        ev.eventType == UsageEvents.Event.ACTIVITY_STOPPED
                } else {
                    ev.eventType == moveToBg
                }
                when {
                    isStart -> {
                        val depth = (openDepth[pkg] ?: 0) + 1
                        openDepth[pkg] = depth
                        if (depth == 1) openStart[pkg] = ev.timeStamp
                    }
                    isEnd -> {
                        val depth = (openDepth[pkg] ?: 0) - 1
                        if (depth <= 0) {
                            openDepth.remove(pkg)
                            val start = openStart.remove(pkg)
                            if (start != null && ev.timeStamp > start) {
                                val dur = (ev.timeStamp - start) / 1000L
                                if (dur in 2L..(6L * 60L * 60L)) {
                                    out += Sess(
                                        pkg,
                                        appLabel(pm, pkg),
                                        start,
                                        ev.timeStamp,
                                        dur,
                                    )
                                }
                            }
                        } else {
                            openDepth[pkg] = depth
                        }
                    }
                }
            }
            out.sortedByDescending { it.startMs }
        } catch (e: Exception) {
            Log.w(TAG, "querySessions failed", e)
            emptyList()
        }
    }

    private fun hasUsagePermission(context: Context): Boolean {
        return try {
            val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as android.app.AppOpsManager
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(
                    "android:get_usage_stats",
                    android.os.Process.myUid(),
                    context.packageName,
                )
            } else {
                @Suppress("DEPRECATION")
                appOps.checkOpNoThrow(
                    "android:get_usage_stats",
                    android.os.Process.myUid(),
                    context.packageName,
                )
            }
            mode == android.app.AppOpsManager.MODE_ALLOWED
        } catch (_: Exception) {
            false
        }
    }

    private fun isSystemPackage(context: Context, packageName: String): Boolean {
        return try {
            val ai = context.packageManager.getApplicationInfo(packageName, 0)
            (ai.flags and ApplicationInfo.FLAG_SYSTEM) != 0 ||
                (ai.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
        } catch (_: Exception) {
            false
        }
    }

    private fun appLabel(pm: PackageManager, pkg: String): String {
        return try {
            val ai = pm.getApplicationInfo(pkg, 0)
            pm.getApplicationLabel(ai).toString()
        } catch (_: Exception) {
            pkg
        }
    }

    private fun startOfDayMs(): Long {
        val cal = Calendar.getInstance()
        cal.set(Calendar.HOUR_OF_DAY, 0)
        cal.set(Calendar.MINUTE, 0)
        cal.set(Calendar.SECOND, 0)
        cal.set(Calendar.MILLISECOND, 0)
        return cal.timeInMillis
    }

    private fun processImportance(context: Context): String {
        return try {
            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            @Suppress("DEPRECATION")
            val procs = am.runningAppProcesses ?: return "unknown"
            val me = procs.firstOrNull { it.processName == context.packageName }
            when (me?.importance) {
                ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND -> "foreground"
                ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE -> "visible"
                ActivityManager.RunningAppProcessInfo.IMPORTANCE_SERVICE -> "service"
                else -> "background"
            }
        } catch (_: Exception) {
            "unknown"
        }
    }
}
