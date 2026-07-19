package com.mrp

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.telephony.TelephonyManager
import android.util.Log
import androidx.annotation.NonNull
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.mrp.data.local.EventStorage
import com.mrp.data.local.SettingsStorage
import com.mrp.data.local.TimelineStorage
import com.mrp.presentation.admin.MrpDeviceAdminReceiver
import com.mrp.service.MrpMonitorService
import com.mrp.domain.usecase.AppUsageTracker
import com.mrp.domain.usecase.LocationHelper
import com.mrp.data.local.AppUsageDao
import java.io.File

class MrpNativeModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "MrpNative"

    @ReactMethod
    fun startMonitoring(promise: Promise) {
        try {
            Log.d(TAG, "startMonitoring called from JS")
            val context = reactContext
            Log.d(TAG, "Creating intent for MrpMonitorService")
            val intent = Intent(context, MrpMonitorService::class.java)
            Log.d(TAG, "Calling startForegroundService")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            Log.d(TAG, "Service start command sent")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start monitoring", e)
            promise.reject("START_ERROR", "Failed to start monitoring service", e)
        }
    }

    @ReactMethod
    fun stopMonitoring(promise: Promise) {
        try {
            Log.d(TAG, "stopMonitoring called from JS")
            MrpMonitorService.stopService(reactContext)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop monitoring", e)
            promise.reject("STOP_ERROR", "Failed to stop monitoring service", e)
        }
    }

    @ReactMethod
    fun requestAccessibilityEnable(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open accessibility settings", e)
            promise.reject("ACCESSIBILITY_ERROR", "Failed to open accessibility settings", e)
        }
    }

    @ReactMethod
    fun isAccessibilityEnabled(promise: Promise) {
        try {
            val enabledServices = Settings.Secure.getString(
                reactContext.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            )
            val isEnabled = enabledServices?.contains(reactContext.packageName) == true
            promise.resolve(isEnabled)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check accessibility", e)
            promise.reject("CHECK_ERROR", "Failed to check accessibility status", e)
        }
    }

    @ReactMethod
    fun getPhotos(promise: Promise) {
        try {
            val photosDir = File(reactContext.getExternalFilesDir(null), "MRP")
            if (!photosDir.exists()) {
                photosDir.mkdirs()
            }

            val files = photosDir.listFiles()?.filter {
                it.extension.lowercase() in listOf("jpg", "jpeg", "png")
            }?.sortedByDescending { it.lastModified() } ?: emptyList()

            val photoList = Arguments.createArray()
            for (file in files) {
                val photoData = Arguments.createMap().apply {
                    putString("path", file.absolutePath)
                    putDouble("timestamp", file.lastModified().toDouble())
                    putString("name", file.name)
                }
                photoList.pushMap(photoData)
            }

            promise.resolve(photoList)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get photos", e)
            promise.reject("GET_PHOTOS_ERROR", "Failed to get photos", e)
        }
    }

    @ReactMethod
    fun deletePhoto(path: String, promise: Promise) {
        try {
            val file = File(path)
            if (file.exists()) {
                val deleted = file.delete()
                promise.resolve(deleted)
            } else {
                promise.reject("FILE_NOT_FOUND", "Photo file not found")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to delete photo", e)
            promise.reject("DELETE_ERROR", "Failed to delete photo", e)
        }
    }

    @ReactMethod
    fun deleteAllPhotos(promise: Promise) {
        try {
            val storage = TimelineStorage(reactContext)
            val photosDir = storage.getPhotosDirectory()
            if (photosDir.exists() && photosDir.isDirectory) {
                photosDir.listFiles()?.forEach { it.delete() }
            }
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to delete all photos", e)
            promise.reject("DELETE_ALL_ERROR", "Failed to delete all photos", e)
        }
    }

    @ReactMethod
    fun takePhoto(promise: Promise) {
        try {
            MrpMonitorService.requestPhoto(reactContext, "TEST_CAPTURE")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to take photo", e)
            promise.reject("TAKE_PHOTO_ERROR", "Failed to take photo", e)
        }
    }

    @ReactMethod
    fun testPhotoCapture(eventName: String, promise: Promise) {
        try {
            Log.d(TAG, "Test photo capture requested with event: $eventName")
            MrpMonitorService.requestPhoto(reactContext, eventName)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to test photo capture", e)
            promise.reject("TEST_CAPTURE_ERROR", "Failed to launch camera for test", e)
        }
    }

    @ReactMethod
    fun getServiceRunning(promise: Promise) {
        try {
            // This is a simplified check - we can't directly check service running state
            // from here without more complex IPC. Return false as default.
            promise.resolve(false)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun openAppSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            intent.data = Uri.fromParts("package", reactContext.packageName, null)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open app settings", e)
            promise.reject("SETTINGS_ERROR", "Failed to open app settings", e)
        }
    }

    @ReactMethod
    fun requestDeviceAdminEnable(promise: Promise) {
        try {
            val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
            intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, MrpDeviceAdminReceiver.getComponentName(reactContext))
            intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "MRP needs device admin to monitor security events like wrong password attempts.")
            
            val activity = currentActivity
            if (activity != null) {
                activity.startActivity(intent)
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactContext.startActivity(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to enable device admin", e)
            promise.reject("ADMIN_ERROR", "Failed to open device admin settings", e)
        }
    }

    @ReactMethod
    fun isDeviceAdminEnabled(promise: Promise) {
        try {
            val isEnabled = MrpDeviceAdminReceiver.isAdminActive(reactContext)
            promise.resolve(isEnabled)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun disableDeviceAdmin(promise: Promise) {
        try {
            val success = MrpDeviceAdminReceiver.removeAdmin(reactContext)
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("ADMIN_ERROR", "Failed to disable device admin", e)
        }
    }

    @ReactMethod
    fun checkOverlayPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            promise.resolve(Settings.canDrawOverlays(reactContext))
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun checkCameraPermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val granted = ActivityCompat.checkSelfPermission(reactContext, android.Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                Log.d(TAG, "Camera permission check: $granted")
                Log.d(TAG, "Camera permission check result: $granted")
                promise.resolve(granted)
            } else {
                Log.d(TAG, "Camera permission check: SDK < M, returning true")
                promise.resolve(true)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check camera permission", e)
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun checkLocationPermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val granted = ActivityCompat.checkSelfPermission(reactContext, android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                Log.d(TAG, "Location permission check: $granted")
                Log.d(TAG, "Location permission check result: $granted")
                promise.resolve(granted)
            } else {
                Log.d(TAG, "Location permission check: SDK < M, returning true")
                promise.resolve(true)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check location permission", e)
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(reactContext)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + reactContext.packageName)
                )
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactContext.startActivity(intent)
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } else {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestCameraPermission(promise: Promise) {
        Log.d(TAG, "=== requestCameraPermission CALLED ===")
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Log.d(TAG, "Requesting camera permission (always show dialog)")

                val activity = currentActivity
                Log.d(TAG, "Current activity: $activity")

                if (activity != null) {
                    // Request permission - this will show the dialog
                    Log.d(TAG, "Calling ActivityCompat.requestPermissions on main thread")
                    androidx.core.app.ActivityCompat.requestPermissions(
                        activity,
                        arrayOf(android.Manifest.permission.CAMERA),
                        100
                    )

                    Log.d(TAG, "Camera permission request initiated - waiting for user response...")
                    promise.resolve(true)  // Return true to indicate dialog was shown
                } else {
                    Log.e(TAG, "Activity is null, cannot request permission")
                    promise.resolve(false)
                }
            } else {
                Log.d(TAG, "SDK version < M, returning true")
                promise.resolve(true)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to request camera permission", e)
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestLocationPermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Log.d(TAG, "Requesting location permission (always show dialog)")

                val activity = currentActivity
                if (activity != null) {
                    // Always call requestPermissions - this will show the dialog
                    androidx.core.app.ActivityCompat.requestPermissions(
                        activity,
                        arrayOf(android.Manifest.permission.ACCESS_FINE_LOCATION),
                        101
                    )

                    Log.d(TAG, "Location permission request initiated")
                    // Wait for system to process the dialog, then check actual result
                    Handler(Looper.getMainLooper()).postDelayed({
                        try {
                            val context = reactContext
                            val granted = ActivityCompat.checkSelfPermission(
                                context,
                                android.Manifest.permission.ACCESS_FINE_LOCATION
                            ) == PackageManager.PERMISSION_GRANTED
                            Log.d(TAG, "Location permission check after dialog: $granted")
                            promise.resolve(granted)
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to check location permission", e)
                            promise.resolve(false)
                        }
                    }, 300) // 300ms delay
                } else {
                    Log.e(TAG, "Activity is null, cannot request permission")
                    promise.resolve(false)
                }
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to request location permission", e)
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun getEvents(promise: Promise) {
        try {
            val rawEvents = EventStorage(reactContext).getEvents()
            val events = rawEvents.sortedByDescending { it.timestamp.time }
            val eventList = Arguments.createArray()
            for (event in events) {
                val eventMap = Arguments.createMap().apply {
                    putString("id", event.id)
                    putString("type", event.type.name)
                    putString("severity", event.severity.name)
                    putDouble("timestamp", event.timestamp.time.toDouble())
                    putString("intruderId", event.intruderId ?: "")
                    putString("photoPath", event.photoPath ?: "")
                    putMap("metadata", Arguments.createMap().apply {
                        putInt("attempts", event.metadata.attempts)
                        putBoolean("wifiEnabled", event.metadata.wifiEnabled ?: false)
                        putBoolean("mobileDataEnabled", event.metadata.mobileDataEnabled ?: false)
                        putBoolean("hotspotEnabled", event.metadata.hotspotEnabled ?: false)
                        putString("simState", event.metadata.simState ?: "")
                        putString("description", event.metadata.description ?: "")
                    })
                }
                eventList.pushMap(eventMap)
            }
            promise.resolve(eventList)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get events", e)
            promise.reject("GET_EVENTS_ERROR", "Failed to get events", e)
        }
    }

    @ReactMethod
    fun getSettings(promise: Promise) {
        try {
            val settings = SettingsStorage(reactContext).getSettings()
            val map = Arguments.createMap().apply {
                putBoolean("isMonitoringEnabled", settings.isMonitoringEnabled)
                putBoolean("captureOnWrongUnlock", settings.captureOnWrongUnlock)
                putBoolean("captureOnAirplaneMode", settings.captureOnAirplaneMode)
                putBoolean("captureOnWifiToggle", settings.captureOnWifiToggle)
                putBoolean("captureOnMobileData", settings.captureOnMobileData)
                putBoolean("captureOnHotspot", settings.captureOnHotspot)
                putBoolean("captureOnBluetooth", settings.captureOnBluetooth)
                putBoolean("captureOnSimChange", settings.captureOnSimChange)
                putBoolean("captureOnFactoryReset", settings.captureOnFactoryReset)
                putBoolean("captureOnUsb", settings.captureOnUsb)
                putInt("maxFailedAttempts", settings.maxFailedAttempts)
                putBoolean("lockAfterFailedAttempts", settings.lockAfterFailedAttempts)
                putInt("autoDeleteAfterDays", settings.autoDeleteAfterDays)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get settings", e)
            promise.reject("GET_SETTINGS_ERROR", "Failed to get settings", e)
        }
    }

    @ReactMethod
    fun saveSettings(settingsMap: ReadableMap, promise: Promise) {
        try {
            val settings = com.mrp.domain.model.MonitoringSettings(
                isMonitoringEnabled = settingsMap.getBoolean("isMonitoringEnabled"),
                captureOnWrongUnlock = settingsMap.getBoolean("captureOnWrongUnlock"),
                captureOnAirplaneMode = settingsMap.getBoolean("captureOnAirplaneMode"),
                captureOnWifiToggle = settingsMap.getBoolean("captureOnWifiToggle"),
                captureOnMobileData = settingsMap.getBoolean("captureOnMobileData"),
                captureOnHotspot = settingsMap.getBoolean("captureOnHotspot"),
                captureOnBluetooth = settingsMap.getBoolean("captureOnBluetooth"),
                captureOnSimChange = settingsMap.getBoolean("captureOnSimChange"),
                captureOnFactoryReset = settingsMap.getBoolean("captureOnFactoryReset"),
                captureOnUsb = settingsMap.getBoolean("captureOnUsb"),
                maxFailedAttempts = settingsMap.getInt("maxFailedAttempts"),
                lockAfterFailedAttempts = settingsMap.getBoolean("lockAfterFailedAttempts"),
                autoDeleteAfterDays = settingsMap.getInt("autoDeleteAfterDays")
            )
            SettingsStorage(reactContext).saveSettings(settings)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save settings", e)
            promise.reject("SAVE_SETTINGS_ERROR", "Failed to save settings", e)
        }
    }

    @ReactMethod
    fun getTimeline(promise: Promise) {
        try {
            val rawTimeline = TimelineStorage(reactContext).getTimeline()
            val timeline = rawTimeline.sortedByDescending { it.timestamp }
            val list = Arguments.createArray()
            for (entry in timeline) {
                val map = Arguments.createMap().apply {
                    // Use exact schema field names with snake_case
                    putString("id", entry.id)
                    putString("timestamp", entry.timestamp)
                    putString("event_type", entry.eventType)
                    putString("status", entry.status)
                    // Location object
                    putMap("location", Arguments.createMap().apply {
                        putDouble("latitude", entry.location.latitude)
                        putDouble("longitude", entry.location.longitude)
                        putDouble("accuracy_meters", entry.location.accuracyMeters.toDouble())
                        putString("detailed_address", entry.location.detailedAddress)
                    })
                    // Geofence status object
                    putMap("geofence_status", Arguments.createMap().apply {
                        putBoolean("inside_fence", entry.geofenceStatus.insideFence)
                        entry.geofenceStatus.fenceId?.let { putString("fence_id", it) } ?: putNull("fence_id")
                    })
                    // Metadata
                    putMap("metadata", Arguments.createMap().apply {
                        entry.metadata.forEach { (key, value) ->
                            when (value) {
                                is String -> putString(key, value)
                                is Boolean -> putBoolean(key, value)
                                is Int -> putInt(key, value)
                                is Double -> putDouble(key, value)
                                null -> putNull(key)
                            }
                        }
                    })
                }
                list.pushMap(map)
            }
            promise.resolve(list)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get timeline", e)
            promise.reject("GET_TIMELINE_ERROR", "Failed to get timeline", e)
        }
    }

    @ReactMethod
    fun deleteTimelineEntry(entryId: String, promise: Promise) {
        try {
            val storage = TimelineStorage(reactContext)
            val timeline = storage.getTimeline().filter { it.id != entryId }
            storage.clearAllTimeline()
            timeline.forEach { storage.appendTimelineEntry(it) }
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to delete timeline entry", e)
            promise.reject("DELETE_TIMELINE_ERROR", "Failed to delete timeline entry", e)
        }
    }

    @ReactMethod
    fun clearTimeline(promise: Promise) {
        try {
            TimelineStorage(reactContext).clearAllTimeline()
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to clear timeline", e)
            promise.reject("CLEAR_TIMELINE_ERROR", "Failed to clear timeline", e)
        }
    }

    @ReactMethod
    fun getPhotosDirectory(promise: Promise) {
        try {
            val dir = TimelineStorage(reactContext).getPhotosDirectory()
            promise.resolve(dir.absolutePath)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get photos directory", e)
            promise.reject("PHOTOS_DIR_ERROR", "Failed to get photos directory", e)
        }
    }

    @ReactMethod
    fun getTimelineFilePath(promise: Promise) {
        try {
            val timelineFile = File(reactContext.filesDir, "timeline.json")
            promise.resolve(timelineFile.absolutePath)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get timeline file path", e)
            promise.reject("TIMELINE_PATH_ERROR", "Failed to get timeline file path", e)
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun hasUsageStatsPermission(promise: Promise) {
        try {
            val tracker = AppUsageTracker(reactContext)
            promise.resolve(tracker.hasUsageStatsPermission())
        } catch (e: Exception) {
            promise.reject("CHECK_PERMISSION_ERROR", "Failed to check Usage Stats permission", e)
        }
    }

    @ReactMethod
    fun requestUsageStatsPermission(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("REQUEST_PERMISSION_ERROR", "Failed to open Usage Access settings", e)
        }
    }

    @ReactMethod
    fun getAppUsage(promise: Promise) {
        getAppUsageForRange(30.0, promise)
    }

    /**
     * On-demand UsageStatsManager.queryEvents for the last [days] days (1–30).
     * Handles both ACTIVITY_RESUMED/PAUSED (API 29+) and MOVE_TO_FOREGROUND/BACKGROUND.
     */
    @ReactMethod
    fun getAppUsageForRange(days: Double, promise: Promise) {
        try {
            val usageStatsManager = reactContext.getSystemService(Context.USAGE_STATS_SERVICE)
                as android.app.usage.UsageStatsManager
            val pm = reactContext.packageManager
            val now = System.currentTimeMillis()
            val clampedDays = days.coerceIn(1.0, 30.0)
            val since = now - (clampedDays * 24L * 60L * 60L * 1000L).toLong()

            val events = usageStatsManager.queryEvents(since, now)
            val openStart = LinkedHashMap<String, Long>()
            data class Sess(val pkg: String, val appName: String, val category: String,
                            val start: Long, val end: Long, val dur: Long)
            val sessions = mutableListOf<Sess>()

            val moveToFg = android.app.usage.UsageEvents.Event.MOVE_TO_FOREGROUND
            val moveToBg = android.app.usage.UsageEvents.Event.MOVE_TO_BACKGROUND
            val activityResumed = android.app.usage.UsageEvents.Event.ACTIVITY_RESUMED
            val activityPaused = android.app.usage.UsageEvents.Event.ACTIVITY_PAUSED

            val ev = android.app.usage.UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(ev)
                val pkg = ev.packageName ?: continue
                when (ev.eventType) {
                    moveToFg, activityResumed -> {
                        openStart[pkg] = ev.timeStamp
                    }
                    moveToBg, activityPaused -> {
                        val start = openStart.remove(pkg)
                        if (start != null && ev.timeStamp > start) {
                            sessions += Sess(pkg, appNameFor(pm, pkg), categoryFor(pm, pkg),
                                start, ev.timeStamp, (ev.timeStamp - start) / 1000L)
                        }
                    }
                }
            }
            for ((pkg, start) in openStart) {
                if (now > start) {
                    sessions += Sess(pkg, appNameFor(pm, pkg), categoryFor(pm, pkg),
                        start, now, (now - start) / 1000L)
                }
            }
            sessions.sortByDescending { it.start }

            val list = Arguments.createArray()
            for (s in sessions) {
                val map = Arguments.createMap().apply {
                    putString("packageName", s.pkg)
                    putString("appName", s.appName)
                    putString("category", s.category)
                    putDouble("startTime", s.start.toDouble())
                    putDouble("endTime", s.end.toDouble())
                    putDouble("durationSeconds", s.dur.toDouble())
                }
                list.pushMap(map)
            }
            promise.resolve(list)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get app usage", e)
            promise.reject("GET_APP_USAGE_ERROR", "Failed to get app usage stats", e)
        }
    }

    private fun appNameFor(pm: android.content.pm.PackageManager, pkg: String): String {
        return try {
            val info = pm.getApplicationInfo(pkg, 0)
            pm.getApplicationLabel(info).toString()
        } catch (e: Exception) {
            pkg
        }
    }

    private fun categoryFor(pm: android.content.pm.PackageManager, pkg: String): String {
        return try {
            val info = pm.getApplicationInfo(pkg, 0)
            when (info.category) {
                android.content.pm.ApplicationInfo.CATEGORY_GAME -> "Game"
                android.content.pm.ApplicationInfo.CATEGORY_SOCIAL -> "Social"
                android.content.pm.ApplicationInfo.CATEGORY_PRODUCTIVITY -> "Productivity"
                android.content.pm.ApplicationInfo.CATEGORY_VIDEO -> "Video"
                android.content.pm.ApplicationInfo.CATEGORY_AUDIO -> "Audio"
                android.content.pm.ApplicationInfo.CATEGORY_NEWS -> "News"
                android.content.pm.ApplicationInfo.CATEGORY_MAPS -> "Maps"
                android.content.pm.ApplicationInfo.CATEGORY_IMAGE -> "Image"
                else -> "Other"
            }
        } catch (e: Exception) {
            "Other"
        }
    }

    @ReactMethod
    fun getMrpBatteryUsage(promise: Promise) {
        Log.d(TAG, "=== getMrpBatteryUsage CALLED ===")
        try {
            val usageStatsManager = reactContext.getSystemService(Context.USAGE_STATS_SERVICE) as android.app.usage.UsageStatsManager
            val now = System.currentTimeMillis()
            val oneHourAgo = now - (60 * 60 * 1000) // Last hour
            val oneDayAgo = now - (24 * 60 * 60 * 1000) // Last 24 hours

            val todayUsage = usageStatsManager.queryUsageStats(
                android.app.usage.UsageStatsManager.INTERVAL_DAILY,
                oneDayAgo,
                now
            )

            val totalMs = todayUsage
                .filter { it.packageName == reactContext.packageName }
                .map { it.totalTimeInForeground }
                .sum()

            val hours = (totalMs / (60 * 60 * 1000)).toInt()
            val minutes = ((totalMs % (60 * 60 * 1000)) / (60 * 1000)).toInt()

            val map = Arguments.createMap().apply {
                putString("appName", "MRP Stay Sync")
                putInt("batteryUsageMinutes", hours * 60 + minutes)
                putString("batteryUsageText", if (hours > 0) "${hours}h ${minutes}m" else "${minutes}m")
                putDouble("batteryUsageMs", totalMs.toDouble())
            }

            Log.d(TAG, "MRP battery usage: ${hours}h ${minutes}m = $totalMs ms")
            promise.resolve(map)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get MRP battery usage", e)
            promise.reject("GET_MRP_BATTERY_ERROR", "Failed to get MRP battery usage", e)
        }
    }

    @ReactMethod
    fun clearPermissionCache(promise: Promise) {
        Log.d(TAG, "=== clearPermissionCache CALLED ===")
        try {
            val activity = currentActivity
            if (activity != null) {
                Log.d(TAG, "Clearing permission cache to force dialog to show again")
                promise.resolve(true)
            } else {
                Log.e(TAG, "Activity is null, cannot clear cache")
                promise.resolve(false)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to clear permission cache", e)
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun getDeviceBatteryLevel(promise: Promise) {
        try {
            val bm = reactContext.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
            val level = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
            promise.resolve(level)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get battery level", e)
            promise.resolve(-1)
        }
    }

    @ReactMethod
    fun getNetworkInfo(promise: Promise) {
        try {
            val map = Arguments.createMap().apply {
                putString("carrierName", "Unknown")
                putString("connectionType", "Offline")
                putBoolean("isWifi", false)
                putBoolean("isMobile", false)
            }
            try {
                val cm = reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                if (cm != null) {
                    val network = cm.activeNetwork
                    val caps = cm.getNetworkCapabilities(network)
                    if (caps != null) {
                        when {
                            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> {
                                map.putBoolean("isWifi", true)
                                map.putString("connectionType", "Wi-Fi")
                            }
                            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> {
                                map.putBoolean("isMobile", true)
                                var type = "Mobile Data"
                                // Refine using TelephonyManager (carrier + data network type)
                                try {
                                    val tm = reactContext.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
                                    if (tm != null) {
                                        val carrier = tm.networkOperatorName
                                        if (!carrier.isNullOrBlank()) map.putString("carrierName", carrier)
                                        type = when (tm.dataNetworkType) {
                                            13 -> "4G/LTE"
                                            20 -> "5G"
                                            0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 15 -> "3G"
                                            else -> "Mobile Data"
                                        }
                                    }
                                } catch (ignored: SecurityException) {
                                    // READ_PHONE_STATE not granted — keep "Mobile Data"
                                }
                                map.putString("connectionType", type)
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Connectivity check failed", e)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get network info", e)
            promise.resolve(Arguments.createMap().apply {
                putString("carrierName", "Unknown")
                putString("connectionType", "Offline")
                putBoolean("isWifi", false)
                putBoolean("isMobile", false)
            })
        }
    }

    @ReactMethod
    fun getGpsStatus(promise: Promise) {
        try {
            val lm = reactContext.getSystemService(Context.LOCATION_SERVICE) as? android.location.LocationManager
            val gps = lm?.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) == true
            val network = lm?.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER) == true
            val granted = ActivityCompat.checkSelfPermission(
                reactContext,
                android.Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
            val map = Arguments.createMap().apply {
                putBoolean("gpsActive", gps)
                putBoolean("networkLocationActive", network)
                putBoolean("permissionGranted", granted)
                putBoolean("isLocationAvailable", gps || network)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get GPS status", e)
            promise.resolve(Arguments.createMap().apply {
                putBoolean("gpsActive", false)
                putBoolean("networkLocationActive", false)
                putBoolean("permissionGranted", false)
                putBoolean("isLocationAvailable", false)
            })
        }
    }

    /**
     * Live location + reverse geocode for Home "Current Location".
     * Falls back to lat/long label when geocoder is offline.
     */
    @ReactMethod
    fun getCurrentLocationWithAddress(promise: Promise) {
        try {
            val helper = LocationHelper(reactContext)
            helper.getCurrentLocation { loc ->
                if (loc == null) {
                    promise.resolve(null)
                    return@getCurrentLocation
                }
                val address = helper.reverseGeocodeSync(loc.latitude, loc.longitude)
                val map = Arguments.createMap().apply {
                    putDouble("latitude", loc.latitude)
                    putDouble("longitude", loc.longitude)
                    putDouble("accuracy_meters", loc.accuracy.toDouble())
                    putString("detailed_address", address)
                    putString("provider", loc.provider)
                }
                promise.resolve(map)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get current location with address", e)
            promise.reject("LOCATION_ERROR", "Failed to get current location", e)
        }
    }

    // ─── SIM Change Recovery Alert ───────────────────────────────────────────

    @ReactMethod
    fun getSimRecoveryStatus(promise: Promise) {
        try {
            val storage = com.mrp.data.local.SimRecoveryStorage(reactContext)
            val tracker = com.mrp.domain.usecase.SimIdentityTracker(reactContext)
            val current = tracker.readCurrentIdentity()
            val map = Arguments.createMap().apply {
                putBoolean("enabled", storage.isEnabled())
                putBoolean("consent", storage.hasConsent())
                putBoolean("hasContacts", storage.hasRecoveryContacts())
                putInt("contactCount", storage.getContacts().size)
                putDouble("lastSimChangeMs", storage.getLastSimChangeMs().toDouble())
                putDouble("lastSmsMs", storage.getLastSmsMs().toDouble())
                putInt("pendingSync", storage.pendingSyncCount())
                putString("currentCarrier", current.carrier)
                putInt("currentSlot", current.simSlot)
                putString("currentIccidMasked", com.mrp.data.local.SimRecoveryStorage.maskPhone(
                    current.iccid.ifBlank { "0000" }
                ))
                putBoolean("baselineEnrolled", tracker.getBaseline() != null)
                val livePhone = current.phoneNumber
                putBoolean("hasSimPhoneNumber", livePhone.isNotBlank())
                putString(
                    "currentSimPhoneMasked",
                    if (livePhone.isNotBlank())
                        com.mrp.data.local.SimRecoveryStorage.maskPhone(livePhone)
                    else ""
                )
                val phonePerm = ActivityCompat.checkSelfPermission(
                    reactContext,
                    android.Manifest.permission.READ_PHONE_STATE
                ) == PackageManager.PERMISSION_GRANTED &&
                    (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                        ActivityCompat.checkSelfPermission(
                            reactContext,
                            android.Manifest.permission.READ_PHONE_NUMBERS
                        ) == PackageManager.PERMISSION_GRANTED)
                putBoolean("phonePermissionGranted", phonePerm)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            Log.e(TAG, "getSimRecoveryStatus failed", e)
            promise.reject("SIM_RECOVERY_STATUS", e.message, e)
        }
    }

    @ReactMethod
    fun setSimRecoveryEnabled(enabled: Boolean, consent: Boolean, promise: Promise) {
        try {
            val storage = com.mrp.data.local.SimRecoveryStorage(reactContext)
            if (enabled && !consent) {
                promise.reject("CONSENT_REQUIRED", "Explicit consent is required to enable SIM recovery")
                return
            }
            storage.setConsent(consent)
            storage.setEnabled(enabled)
            if (enabled) {
                com.mrp.domain.usecase.SimChangeRecoveryAlertUseCase(reactContext).enrollNow()
            }
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "setSimRecoveryEnabled failed", e)
            promise.reject("SIM_RECOVERY_ENABLE", e.message, e)
        }
    }

    @ReactMethod
    fun getRecoveryContacts(promise: Promise) {
        try {
            val storage = com.mrp.data.local.SimRecoveryStorage(reactContext)
            val list = Arguments.createArray()
            storage.getContactsMasked().forEach { c ->
                list.pushMap(Arguments.createMap().apply {
                    putString("id", c["id"]?.toString() ?: "")
                    putString("name", c["name"]?.toString() ?: "")
                    putString("phoneNumber", c["phoneNumber"]?.toString() ?: "")
                    putString("relationship", c["relationship"]?.toString() ?: "")
                    putInt("priority", (c["priority"] as? Number)?.toInt() ?: 1)
                    putBoolean("verified", c["verified"] as? Boolean ?: false)
                    putDouble("createdAtMs", (c["createdAtMs"] as? Number)?.toDouble() ?: 0.0)
                })
            }
            promise.resolve(list)
        } catch (e: Exception) {
            promise.reject("GET_CONTACTS", e.message, e)
        }
    }

    @ReactMethod
    fun saveRecoveryContact(name: String, phone: String, relationship: String, priority: Double, promise: Promise) {
        try {
            val storage = com.mrp.data.local.SimRecoveryStorage(reactContext)
            val contact = storage.saveContact(name, phone, relationship, priority.toInt())
            if (contact == null) {
                promise.reject("SAVE_CONTACT", "Invalid phone or max 3 contacts reached")
                return
            }
            promise.resolve(Arguments.createMap().apply {
                putString("id", contact.id)
                putString("name", contact.name)
                putString("phoneNumber", com.mrp.data.local.SimRecoveryStorage.maskPhone(contact.phoneNumber))
                putString("relationship", contact.relationship)
                putInt("priority", contact.priority)
            })
        } catch (e: Exception) {
            promise.reject("SAVE_CONTACT", e.message, e)
        }
    }

    @ReactMethod
    fun deleteRecoveryContact(id: String, promise: Promise) {
        try {
            val ok = com.mrp.data.local.SimRecoveryStorage(reactContext).deleteContact(id)
            promise.resolve(ok)
        } catch (e: Exception) {
            promise.reject("DELETE_CONTACT", e.message, e)
        }
    }

    @ReactMethod
    fun testRecoverySms(promise: Promise) {
        try {
            val (ok, message) = com.mrp.domain.usecase.SimChangeRecoveryAlertUseCase(reactContext)
                .sendTestSmsDetailed()
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", ok)
                putString("message", message)
            })
        } catch (e: Exception) {
            Log.e(TAG, "testRecoverySms failed", e)
            promise.reject("TEST_SMS", e.message, e)
        }
    }

    @ReactMethod
    fun getSimChangeHistory(promise: Promise) {
        try {
            val json = com.mrp.data.local.SimRecoveryStorage(reactContext).getHistoryJson()
            promise.resolve(json)
        } catch (e: Exception) {
            promise.reject("HISTORY", e.message, e)
        }
    }

    @ReactMethod
    fun deleteSimChangeHistory(promise: Promise) {
        try {
            com.mrp.data.local.SimRecoveryStorage(reactContext).clearHistory()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CLEAR_HISTORY", e.message, e)
        }
    }

    @ReactMethod
    fun checkSmsPermission(promise: Promise) {
        try {
            val granted = ActivityCompat.checkSelfPermission(
                reactContext,
                android.Manifest.permission.SEND_SMS
            ) == PackageManager.PERMISSION_GRANTED
            promise.resolve(granted)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * Request runtime permissions and ALWAYS resolve (never hang).
     * If Android will not show a dialog (USER_FIXED / permanent deny), resolves false quickly.
     */
    @ReactMethod
    fun requestRuntimePermissions(permissions: ReadableArray, promise: Promise) {
        try {
            val activity = currentActivity
            if (activity == null) {
                promise.resolve(false)
                return
            }
            val perms = ArrayList<String>()
            for (i in 0 until permissions.size()) {
                permissions.getString(i)?.takeIf { it.isNotBlank() }?.let { perms.add(it) }
            }
            if (perms.isEmpty()) {
                promise.resolve(true)
                return
            }
            val need = perms.filter {
                ActivityCompat.checkSelfPermission(reactContext, it) != PackageManager.PERMISSION_GRANTED
            }
            if (need.isEmpty()) {
                promise.resolve(true)
                return
            }

            // Permanent deny: OS will not show a dialog and may never invoke the callback.
            val anyCanShowRationale = need.any {
                ActivityCompat.shouldShowRequestPermissionRationale(activity, it)
            }
            // If we already asked before (none can show rationale) — skip requestPermissions to avoid hang.
            // Heuristic: check shared flag isn't available; use: if ALL need request and none show
            // rationale, still TRY once with a short timeout below.

            val aware = activity as? com.facebook.react.modules.core.PermissionAwareActivity
            if (aware == null) {
                promise.resolve(false)
                return
            }

            val settled = java.util.concurrent.atomic.AtomicBoolean(false)
            fun settle(value: Boolean) {
                if (settled.compareAndSet(false, true)) {
                    promise.resolve(value)
                }
            }

            // Failsafe: never leave JS waiting (fixes stuck toggles when USER_FIXED)
            Handler(Looper.getMainLooper()).postDelayed({
                settle(false)
            }, if (anyCanShowRationale) 60_000L else 1_200L)

            val listener = com.facebook.react.modules.core.PermissionListener { _, _, grantResults ->
                val ok = grantResults.isNotEmpty() &&
                    grantResults.all { it == PackageManager.PERMISSION_GRANTED }
                settle(ok)
                true
            }

            UiThreadUtil.runOnUiThread {
                try {
                    aware.requestPermissions(
                        need.toTypedArray(),
                        PERM_REQUEST_CODE_BASE + (System.currentTimeMillis() % 1000).toInt(),
                        listener
                    )
                } catch (e: Exception) {
                    Log.e(TAG, "requestRuntimePermissions failed", e)
                    settle(false)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "requestRuntimePermissions error", e)
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun checkPhonePermission(promise: Promise) {
        try {
            val state = ActivityCompat.checkSelfPermission(
                reactContext,
                android.Manifest.permission.READ_PHONE_STATE
            ) == PackageManager.PERMISSION_GRANTED
            val numbersOk = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                ActivityCompat.checkSelfPermission(
                    reactContext,
                    android.Manifest.permission.READ_PHONE_NUMBERS
                ) == PackageManager.PERMISSION_GRANTED
            promise.resolve(state && numbersOk)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /** Returns the live SIM MSISDN when readable (never log callers should mask in UI). */
    @ReactMethod
    fun getCurrentSimPhoneNumber(promise: Promise) {
        try {
            val identity = com.mrp.domain.usecase.SimIdentityTracker(reactContext).readCurrentIdentity()
            val map = Arguments.createMap().apply {
                putBoolean("available", identity.phoneNumber.isNotBlank())
                putString("phoneNumber", identity.phoneNumber)
                putString(
                    "phoneNumberMasked",
                    if (identity.phoneNumber.isNotBlank())
                        com.mrp.data.local.SimRecoveryStorage.maskPhone(identity.phoneNumber)
                    else ""
                )
                putString("carrier", identity.carrier)
                putInt("simSlot", identity.simSlot)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("SIM_PHONE", e.message, e)
        }
    }

    @ReactMethod
    fun getUiThemeId(promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences(UI_PREFS, Context.MODE_PRIVATE)
            promise.resolve(prefs.getString(KEY_THEME_ID, "slate") ?: "slate")
        } catch (e: Exception) {
            promise.resolve("slate")
        }
    }

    @ReactMethod
    fun setUiThemeId(themeId: String, promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences(UI_PREFS, Context.MODE_PRIVATE)
            prefs.edit().putString(KEY_THEME_ID, themeId).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    companion object {
        private const val TAG = "MrpNative"
        private const val PERM_REQUEST_CODE_BASE = 7100
        private const val UI_PREFS = "mrp_ui"
        private const val KEY_THEME_ID = "theme_id"
        const val EVENT_PHOTO_CAPTURED = "onPhotoCaptured"
        const val EVENT_PHOTO_DELETED = "onPhotoDeleted"
    }
}