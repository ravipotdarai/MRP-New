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
        try {
            val dao = AppUsageDao(reactContext)
            val sessions = dao.getAllSessions()
            val list = Arguments.createArray()
            for (session in sessions) {
                val map = Arguments.createMap().apply {
                    putString("packageName", session.packageName)
                    putString("appName", session.appName ?: session.packageName)
                    putString("category", session.category ?: "Uncategorized")
                    putDouble("startTime", session.startTime.toDouble())
                    putDouble("endTime", session.endTime.toDouble())
                    putDouble("durationSeconds", session.durationSeconds.toDouble())
                    if (session.batteryLevel != null) {
                        putInt("batteryLevel", session.batteryLevel!!)
                    }
                    if (session.networkType != null) {
                        putString("networkType", session.networkType)
                    }
                    if (session.latitude != null) {
                        putDouble("latitude", session.latitude!!)
                    }
                    if (session.longitude != null) {
                        putDouble("longitude", session.longitude!!)
                    }
                }
                list.pushMap(map)
            }
            promise.resolve(list)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get app usage", e)
            promise.reject("GET_APP_USAGE_ERROR", "Failed to get app usage stats", e)
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

    companion object {
        private const val TAG = "MrpNative"
        const val EVENT_PHOTO_CAPTURED = "onPhotoCaptured"
        const val EVENT_PHOTO_DELETED = "onPhotoDeleted"
    }
}