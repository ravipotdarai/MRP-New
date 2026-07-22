package com.mrp.service

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.ImageFormat
import android.hardware.camera2.*
import android.media.ImageReader
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.bluetooth.BluetoothAdapter
import android.database.ContentObserver
import android.provider.Settings
import android.telephony.TelephonyManager
import android.os.*
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.mrp.MainActivity
import com.mrp.R
import com.mrp.data.local.SettingsStorage
import com.mrp.data.local.TimelineStorage
import com.mrp.domain.model.*
import com.mrp.domain.usecase.LocationHelper
import com.mrp.domain.usecase.TimelineEventLogger
import com.mrp.domain.usecase.AppUsageTracker
import com.mrp.domain.usecase.PackageChangeHandler
import com.mrp.domain.usecase.BreachPostureScanner
import java.util.Calendar
import com.mrp.presentation.admin.MrpDeviceAdminReceiver
import com.mrp.util.OemBatteryMitigation
import com.mrp.util.SelfieCaptureUtil
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

/**
 * Persistent Foreground Service that monitors all hardware state changes.
 * Bypasses OEM battery restrictions and maintains event listeners when screen is locked.
 */
class MrpMonitorService : Service() {

    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null
    private var backgroundHandler: Handler? = null
    private var backgroundThread: HandlerThread? = null
    private var isRunning = false
    private var wakeLock: PowerManager.WakeLock? = null

    private lateinit var timelineStorage: TimelineStorage
    private lateinit var settingsStorage: SettingsStorage
    private lateinit var eventLogger: TimelineEventLogger
    private lateinit var locationHelper: LocationHelper
    private lateinit var appUsageTracker: AppUsageTracker
    private lateinit var packageChangeHandler: PackageChangeHandler
    private var lastPostureScanDay: Int = -1

    // Track states for change detection
    private var lastScreenState: Boolean? = null
    private var lastAirplaneState: Boolean? = null
    private var lastWifiState: Int? = null
    private var lastMobileDataState: Boolean? = null
    private var lastHotspotState: Boolean? = null
    private var lastBluetoothState: Boolean? = null
    private var lastSimEventType: String? = null
    private var lastWifiBssid: String? = null
    private var lastAppUsageCheckTime: Long = 0

    // Handler for delayed tasks
    private val handler = Handler(Looper.getMainLooper())

    // Unified hardware receiver - handles all hardware events
    private val unifiedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent == null) return
            val action = intent.action ?: return
            Log.d(TAG, "Hardware event: $action")

            // Extract all intent extras synchronously on the main thread before the intent gets recycled!
            val wifiState = if (action == WifiManager.WIFI_STATE_CHANGED_ACTION) {
                intent.getIntExtra(WifiManager.EXTRA_WIFI_STATE, WifiManager.WIFI_STATE_UNKNOWN)
            } else WifiManager.WIFI_STATE_UNKNOWN

            val testWifiState = if (action == "com.mrp.TEST_WIFI_TOGGLE") {
                intent.getBooleanExtra("state", true)
            } else true

            val testMobileDataState = if (action == "com.mrp.TEST_MOBILE_DATA_TOGGLE") {
                intent.getBooleanExtra("state", true)
            } else true

            val bluetoothState = if (action == BluetoothAdapter.ACTION_STATE_CHANGED) {
                intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
            } else BluetoothAdapter.ERROR

            val airplaneState = if (action == Intent.ACTION_AIRPLANE_MODE_CHANGED) {
                intent.getBooleanExtra("state", false)
            } else false

            val hotspotState = if (action == "android.net.wifi.WIFI_AP_STATE_CHANGED") {
                intent.getIntExtra("wifi_ap_state", -1)
            } else -1

            val hotspotWifiState = if (action == "android.net.wifi.WIFI_AP_STATE_CHANGED") {
                intent.getIntExtra("wifi_state", -1)
            } else -1

            val tetherActive = if (action == "android.net.conn.TETHER_STATE_CHANGED") {
                intent.getStringArrayListExtra("activeArray")
            } else null

            val testHotspotState = if (action == "com.mrp.TEST_HOTSPOT_TOGGLE") {
                intent.getBooleanExtra("state", true)
            } else true

            val simState = if (action == "android.intent.action.SIM_STATE_CHANGED") {
                intent.getStringExtra("ss") ?: ""
            } else ""

            val testSettingKey = if (action == "com.mrp.TEST_SET_SETTING") {
                intent.getStringExtra("key")
            } else null

            val testSettingValue = if (action == "com.mrp.TEST_SET_SETTING") {
                intent.getBooleanExtra("value", true)
            } else true

            val usbConnected = if (action == "android.hardware.usb.action.USB_STATE") {
                intent.getBooleanExtra("connected", false)
            } else false

            val requestPhotoEventName = if (action == ACTION_REQUEST_PHOTO) {
                intent.getStringExtra("eventName") ?: "unknown"
            } else "unknown"

            val isSticky = isInitialStickyBroadcast

            backgroundHandler?.post {
                when (action) {
                    ACTION_REQUEST_PHOTO -> {
                        wakeUpDevice()
                        takePhoto(requestPhotoEventName)
                    }
                    Intent.ACTION_SCREEN_OFF -> {
                        handleScreenOff()
                    }
                    Intent.ACTION_USER_PRESENT -> {
                        handleUserUnlocked()
                    }
                    WifiManager.WIFI_STATE_CHANGED_ACTION -> {
                        if (wifiState == WifiManager.WIFI_STATE_ENABLED) {
                            handleWifiChangeExplicit(isWifiOn = true, forceLog = false)
                        } else if (wifiState == WifiManager.WIFI_STATE_DISABLED || wifiState == WifiManager.WIFI_STATE_DISABLING) {
                            handleWifiChangeExplicit(isWifiOn = false, forceLog = false)
                        }
                        scheduleToggleEvaluation()
                    }
                    "android.net.wifi.STATE_CHANGE" -> {
                        try {
                            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                            val st = wm.wifiState
                            if (st == WifiManager.WIFI_STATE_ENABLED) {
                                handleWifiChangeExplicit(isWifiOn = true, forceLog = false)
                            } else if (st == WifiManager.WIFI_STATE_DISABLED) {
                                handleWifiChangeExplicit(isWifiOn = false, forceLog = false)
                            }
                        } catch (e: Exception) { Log.w(TAG, "Error in STATE_CHANGE wifi check", e) }
                        scheduleToggleEvaluation()
                    }
                    "com.mrp.TEST_WIFI_TOGGLE" -> {
                        handleWifiChangeExplicit(testWifiState, forceLog = false)
                    }
                    BluetoothAdapter.ACTION_STATE_CHANGED -> {
                        if (bluetoothState == BluetoothAdapter.STATE_ON) {
                            handleBluetoothChangeExplicit(true)
                        } else if (bluetoothState == BluetoothAdapter.STATE_OFF) {
                            handleBluetoothChangeExplicit(false)
                        }
                    }
                    Intent.ACTION_AIRPLANE_MODE_CHANGED -> {
                        handleAirplaneChangeExplicit(airplaneState)
                    }
                    "android.net.wifi.WIFI_AP_STATE_CHANGED" -> {
                        val state = if (hotspotState != -1) hotspotState else hotspotWifiState
                        handleHotspotChange(state)
                    }
                    "android.net.conn.TETHER_STATE_CHANGED" -> {
                        if (tetherActive != null) {
                            handleHotspotChangeExplicit(tetherActive.isNotEmpty())
                        }
                    }
                    "com.mrp.TEST_HOTSPOT_TOGGLE" -> {
                        handleHotspotChangeExplicit(testHotspotState)
                    }
                    "android.intent.action.SIM_STATE_CHANGED" -> {
                        handleSimStateChangeExplicit(simState, isSticky)
                    }
                    Intent.ACTION_SHUTDOWN, Intent.ACTION_REBOOT,
                    "android.intent.action.MASTER_CLEAR_NOTIFICATION",
                    "android.intent.action.FACTORY_RESET" -> {
                        handleFactoryResetOrShutdown(action)
                    }
                    "com.mrp.TEST_WRONG_UNLOCK" -> {
                        handleWrongUnlockAttemptExplicit()
                    }
                    "com.mrp.TEST_SIM_REMOVED" -> {
                        handleSimStateChangeExplicit("ABSENT")
                    }
                    "com.mrp.TEST_SIM_INSERTED" -> {
                        handleSimStateChangeExplicit("READY")
                    }
                    "com.mrp.TEST_FACTORY_RESET" -> {
                        handleFactoryResetOrShutdown("FACTORY_RESET")
                    }
                    "com.mrp.TEST_SET_SETTING" -> {
                        if (testSettingKey != null) {
                            settingsStorage.updateSetting(testSettingKey, testSettingValue)
                            Log.d(TAG, "TEST_SET_SETTING: $testSettingKey = $testSettingValue")
                        }
                    }
                    "android.hardware.usb.action.USB_STATE" -> {
                        handleUsbChangeExplicit(usbConnected, isSticky)
                    }
                    Intent.ACTION_POWER_CONNECTED -> {
                        handleUsbChangeExplicit(true)
                    }
                    "com.mrp.TEST_USB_CONNECTED" -> {
                        handleUsbChangeExplicit(true)
                    }
                    "com.mrp.TEST_MOBILE_DATA_TOGGLE" -> {
                        handleMobileDataChange(testMobileDataState)
                    }
                }
            }
        }
    }

    private fun handleMobileDataChange(isDataOn: Boolean) {
        if (!isMonitoringEnabled()) return
        val settings = try { settingsStorage.getSettings() } catch (e: Exception) { return }
        if (!settings.captureOnMobileData) return

        val prev = lastMobileDataState
        lastMobileDataState = isDataOn

        if (prev == null || prev != isDataOn) {
            Log.d(TAG, "Logging Mobile Data change: isDataOn=$isDataOn")
            val eventName = if (isDataOn) "MOBILE_DATA_ENABLED" else "MOBILE_DATA_DISABLED"
            eventLogger.logEvent(
                eventName,
                if (isDataOn) StatusValues.ENABLED else StatusValues.DISABLED
            )
            requestPhoto(this, eventName)
        }
    }

    private fun scheduleToggleEvaluation() {
        backgroundHandler?.post { evaluateAllToggles() }
        backgroundHandler?.postDelayed({ evaluateAllToggles() }, 500)
        backgroundHandler?.postDelayed({ evaluateAllToggles() }, 1200)
        backgroundHandler?.postDelayed({ evaluateAllToggles() }, 2500)
    }

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            super.onAvailable(network)
            Log.d(TAG, "Network available")
            scheduleToggleEvaluation()
        }

        override fun onLost(network: Network) {
            super.onLost(network)
            Log.d(TAG, "Network lost")
            scheduleToggleEvaluation()
        }

        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
            super.onCapabilitiesChanged(network, capabilities)
            Log.d(TAG, "Network capabilities changed")
            scheduleToggleEvaluation()
        }
    }

    private val settingsObserver = object : ContentObserver(handler) {
        override fun onChange(selfChange: Boolean) {
            super.onChange(selfChange)
            Log.d(TAG, "Settings content observer fired")
            scheduleToggleEvaluation()
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service onCreate")
        isServiceRunning = true

        timelineStorage = TimelineStorage(this)
        settingsStorage = SettingsStorage(this)
        eventLogger = TimelineEventLogger(this)
        locationHelper = LocationHelper(this)
        appUsageTracker = AppUsageTracker(this)
        packageChangeHandler = PackageChangeHandler(this)

        startBackgroundThread()
        createNotificationChannel()

        backgroundHandler?.post {
            initializeInitialToggleStates()
            registerReceivers()
            checkBatteryOptimization()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Service onStartCommand: action=${intent?.action}")

        val notification = createNotification()
        startForegroundSafe(notification)
        isRunning = true

        if (intent != null) {
            when (intent.action) {
                ACTION_REQUEST_PHOTO -> {
                    val eventName = intent?.getStringExtra("eventName") ?: "unknown"
                    takePhoto(eventName)
                }
            }
        }

        // START_STICKY ensures the service is restarted if killed by the system
        return START_STICKY
    }

    private fun startForegroundSafe(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            val hasFineLocation = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            val hasCoarseLocation = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            if (hasFineLocation || hasCoarseLocation) {
                types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val hasCamera = ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                if (hasCamera) {
                    types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
                }
            }
            try {
                startForeground(NOTIFICATION_ID, notification, types)
                Log.d(TAG, "Started foreground service with types bitmask: $types")
            } catch (e: SecurityException) {
                Log.e(TAG, "SecurityException starting foreground with types $types, falling back to safe types", e)
                try {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
                } catch (e2: Exception) {
                    Log.e(TAG, "Fallback startForeground failed", e2)
                    startForeground(NOTIFICATION_ID, notification)
                }
            }
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    fun updateForegroundServiceTypes() {
        if (!isRunning) return
        try {
            val notification = createNotification()
            startForegroundSafe(notification)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update foreground service types", e)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        Log.d(TAG, "Service onDestroy")
        isServiceRunning = false
        isRunning = false

        releaseWakeLock()
        closeCamera()
        unregisterReceivers()
        stopBackgroundThread()

        super.onDestroy()
    }

    private fun startBackgroundThread() {
        backgroundThread = HandlerThread("MrpBackground").also { it.start() }
        backgroundHandler = Handler(backgroundThread!!.looper)
    }

    private fun stopBackgroundThread() {
        backgroundThread?.quitSafely()
        try {
            backgroundThread?.join()
            backgroundThread = null
            backgroundHandler = null
        } catch (e: InterruptedException) {
            Log.e(TAG, "Background thread interrupted", e)
        }
    }

    private fun registerReceivers() {
        try {
            val filter = IntentFilter().apply {
                addAction(ACTION_REQUEST_PHOTO)
                addAction(Intent.ACTION_SCREEN_OFF)
                addAction(Intent.ACTION_USER_PRESENT)
                addAction(Intent.ACTION_AIRPLANE_MODE_CHANGED)
                addAction(WifiManager.WIFI_STATE_CHANGED_ACTION)
                addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
                addAction("android.net.wifi.WIFI_AP_STATE_CHANGED")
                addAction("android.net.conn.TETHER_STATE_CHANGED")
                addAction("android.net.conn.CONNECTIVITY_CHANGE")
                addAction("android.intent.action.SIM_STATE_CHANGED")
                addAction(Intent.ACTION_SHUTDOWN)
                addAction(Intent.ACTION_REBOOT)
                addAction("android.intent.action.MASTER_CLEAR_NOTIFICATION")
                addAction("android.intent.action.FACTORY_RESET")
                addAction("com.mrp.TEST_WRONG_UNLOCK")
                addAction("com.mrp.TEST_SIM_REMOVED")
                addAction("com.mrp.TEST_SIM_INSERTED")
                addAction("com.mrp.TEST_FACTORY_RESET")
                addAction("android.net.wifi.STATE_CHANGE")
                addAction("com.mrp.TEST_WIFI_TOGGLE")
                addAction("com.mrp.TEST_HOTSPOT_TOGGLE")
                addAction("android.hardware.usb.action.USB_STATE")
                addAction(Intent.ACTION_POWER_CONNECTED)
                addAction("com.mrp.TEST_USB_CONNECTED")
                addAction("com.mrp.TEST_MOBILE_DATA_TOGGLE")
            }

            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                Context.RECEIVER_EXPORTED
            } else {
                0
            }
            registerReceiver(unifiedReceiver, filter, flags)

            val pkgFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                Context.RECEIVER_NOT_EXPORTED
            } else {
                0
            }
            registerReceiver(packageChangeHandler.receiver, packageChangeHandler.intentFilter(), pkgFlags)

            val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            connectivityManager.registerDefaultNetworkCallback(networkCallback)

            contentResolver.registerContentObserver(Settings.Global.CONTENT_URI, true, settingsObserver)
            contentResolver.registerContentObserver(Settings.Secure.CONTENT_URI, true, settingsObserver)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register receivers", e)
        }
    }

    private fun unregisterReceivers() {
        try {
            unregisterReceiver(unifiedReceiver)
        } catch (e: Exception) { Log.w(TAG, "unifiedReceiver not registered") }

        try {
            unregisterReceiver(packageChangeHandler.receiver)
        } catch (e: Exception) { Log.w(TAG, "packageChangeHandler not registered") }

        try {
            val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            connectivityManager.unregisterNetworkCallback(networkCallback)
        } catch (e: Exception) { Log.w(TAG, "networkCallback not registered") }

        try {
            contentResolver.unregisterContentObserver(settingsObserver)
        } catch (e: Exception) { Log.w(TAG, "settingsObserver not registered") }
    }

    private fun checkBatteryOptimization() {
        if (!OemBatteryMitigation.isIgnoringBatteryOptimizations(this)) {
            Log.d(TAG, "App is not ignoring battery optimizations")
            // Could prompt user here
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "MRP Monitoring Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Persistent monitoring for device events"
                setShowBadge(false)
            }
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Add a dismiss action that will only work if we have admin privileges
        val dismissIntent = Intent(this, MrpMonitorService::class.java).apply {
            action = ACTION_STOP_SERVICE
        }
        val dismissPendingIntent = PendingIntent.getService(
            this, 1, dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MRP Monitoring Active")
            .setContentText("Tracking device events and location")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", dismissPendingIntent)
            .build()
    }

    // Event handlers - MrpMonitorService handles ALL events
    // Screen lock/unlock via BroadcastReceivers (works 100% without accessibility)
    // Connectivity events via their respective receivers

    private fun handleScreenOff() {
        if (!isMonitoringEnabled()) return
        eventLogger.logEvent(EventTypes.SCREEN_LOCK, StatusValues.LOCKED)
    }

    private fun handleUserUnlocked() {
        if (!isMonitoringEnabled()) return
        eventLogger.logEvent(EventTypes.SCREEN_UNLOCK, StatusValues.UNLOCKED)
    }

    private fun isHotspotEnabled(wifiManager: WifiManager): Boolean {
        return try {
            val method = wifiManager.javaClass.getDeclaredMethod("isWifiApEnabled")
            method.invoke(wifiManager) as Boolean
        } catch (e: Exception) {
            try {
                val method = wifiManager.javaClass.getDeclaredMethod("getWifiApState")
                val state = method.invoke(wifiManager) as Int
                state == 13 || state == 3 // 13 is WIFI_AP_STATE_ENABLED
            } catch (e2: Exception) {
                false
            }
        }
    }

    private fun initializeInitialToggleStates() {
        try {
            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            lastWifiState = if (wifiManager.isWifiEnabled) 1 else 0
            lastHotspotState = isHotspotEnabled(wifiManager)
            lastWifiBssid = try {
                val info = wifiManager.connectionInfo
                info?.bssid ?: "N/A"
            } catch (e: Exception) {
                "N/A"
            }
        } catch (e: Exception) { Log.w(TAG, "Init wifi/hotspot state error", e) }

        try {
            val tm = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            lastMobileDataState = tm.isDataEnabled
        } catch (e: Exception) { Log.w(TAG, "Init mobile data state error", e) }

        try {
            lastAirplaneState = Settings.Global.getInt(contentResolver, Settings.Global.AIRPLANE_MODE_ON, 0) != 0
        } catch (e: Exception) { Log.w(TAG, "Init airplane state error", e) }

        try {
            val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()
            if (bluetoothAdapter != null) {
                lastBluetoothState = bluetoothAdapter.isEnabled
            }
        } catch (e: Exception) { Log.w(TAG, "Init bluetooth state error", e) }
    }

    private fun evaluateAllToggles() {
        if (!isMonitoringEnabled()) return
        val settings = try {
            settingsStorage.getSettings()
        } catch (e: Exception) { return }

        // 1. Wi-Fi
        if (settings.captureOnWifiToggle) {
            try {
                val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                val state = wifiManager.wifiState
                if (state == WifiManager.WIFI_STATE_ENABLED) {
                    handleWifiChangeExplicit(true, false)
                } else if (state == WifiManager.WIFI_STATE_DISABLED || state == WifiManager.WIFI_STATE_DISABLING) {
                    handleWifiChangeExplicit(false, false)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking Wi-Fi state", e)
            }
        }

        // 2. Mobile Data
        if (settings.captureOnMobileData) {
            try {
                val tm = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
                val isDataOn = tm.isDataEnabled
                val prevMobile = lastMobileDataState
                lastMobileDataState = isDataOn
                if (prevMobile != null && prevMobile != isDataOn) {
                    Log.d(TAG, "evaluateAllToggles: Mobile Data changed to $isDataOn")
                    if (settings.captureOnMobileData) {
                        val eventName = if (isDataOn) "MOBILE_DATA_ENABLED" else "MOBILE_DATA_DISABLED"
                        eventLogger.logEvent(
                            eventName,
                            if (isDataOn) StatusValues.ENABLED else StatusValues.DISABLED
                        )
                        requestPhoto(this, eventName)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking Mobile Data state", e)
            }
        }

        // 3. Airplane Mode
        if (settings.captureOnAirplaneMode) {
            try {
                val isAirplaneMode = Settings.Global.getInt(
                    contentResolver,
                    Settings.Global.AIRPLANE_MODE_ON,
                    0
                ) != 0
                val prevAirplane = lastAirplaneState
                lastAirplaneState = isAirplaneMode
                if (prevAirplane != null && prevAirplane != isAirplaneMode) {
                    Log.d(TAG, "evaluateAllToggles: Airplane Mode changed to $isAirplaneMode")
                    if (settings.captureOnAirplaneMode) {
                        val eventName = if (isAirplaneMode) "AIRPLANE_MODE_ENABLED" else "AIRPLANE_MODE_DISABLED"
                        eventLogger.logEvent(
                            eventName,
                            if (isAirplaneMode) StatusValues.ENABLED else StatusValues.DISABLED
                        )
                        requestPhoto(this, eventName)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking Airplane Mode state", e)
            }
        }

        // 4. Bluetooth
        if (settings.captureOnBluetooth) {
            try {
                val bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as? android.bluetooth.BluetoothManager
                val bluetoothAdapter = bluetoothManager?.adapter
                if (bluetoothAdapter != null) {
                    val isBluetoothOn = bluetoothAdapter.isEnabled
                    val prevBluetooth = lastBluetoothState
                    lastBluetoothState = isBluetoothOn
                    if (prevBluetooth != null && prevBluetooth != isBluetoothOn) {
                        Log.d(TAG, "evaluateAllToggles: Bluetooth changed to $isBluetoothOn")
                        if (settings.captureOnBluetooth) {
                            val eventName = if (isBluetoothOn) "BLUETOOTH_ENABLED" else "BLUETOOTH_DISABLED"
                            eventLogger.logEvent(
                                eventName,
                                if (isBluetoothOn) StatusValues.ENABLED else StatusValues.DISABLED
                            )
                            requestPhoto(this, eventName)
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking Bluetooth state", e)
            }
        }

        // Hotspot is handled exclusively by WIFI_AP_STATE_CHANGED and handleHotspotChange

        // App Usage Analytics (Throttle to every 5 minutes)
        val currentTime = System.currentTimeMillis()
        if (currentTime - lastAppUsageCheckTime >= 5 * 60 * 1000) {
            if (appUsageTracker.hasUsageStatsPermission()) {
                appUsageTracker.trackUsage()
                lastAppUsageCheckTime = currentTime
            }
        }

        // Daily posture scan (once per calendar day)
        val dayOfYear = Calendar.getInstance().get(Calendar.DAY_OF_YEAR)
        if (dayOfYear != lastPostureScanDay) {
            lastPostureScanDay = dayOfYear
            try {
                BreachPostureScanner(this).scan(emitAlerts = true)
            } catch (e: Exception) {
                Log.w(TAG, "Daily posture scan failed", e)
            }
        }
    }

    private fun handleHotspotChangeExplicit(isOn: Boolean) {
        if (!isMonitoringEnabled()) return
        val settings = try { settingsStorage.getSettings() } catch (e: Exception) { return }
        Log.d(TAG, "handleHotspotChangeExplicit: isOn=$isOn, captureOnHotspot=${settings.captureOnHotspot}, prev=$lastHotspotState")
        if (!settings.captureOnHotspot) return

        val prev = lastHotspotState
        lastHotspotState = isOn

        if (prev != null && prev == isOn) {
            Log.d(TAG, "Hotspot duplicate ignored: $isOn")
            return
        }

        Log.d(TAG, "Hotspot state changed explicit: $isOn")
        val eventName = if (isOn) "HOTSPOT_ENABLED" else "HOTSPOT_DISABLED"
        eventLogger.logEvent(
            eventName,
            if (isOn) StatusValues.ENABLED else StatusValues.DISABLED
        )
        requestPhoto(this, eventName)
    }

    private fun handleHotspotChange(state: Int) {
        if (!isMonitoringEnabled() || !settingsStorage.getSettings().captureOnHotspot) return
        val isEnabled = (state == 13 || state == 3 || state == 12 || state == 2)
        val isDisabled = (state == 11 || state == 1 || state == 10 || state == 0)
        if (!isEnabled && !isDisabled) return

        handleHotspotChangeExplicit(isEnabled)
    }

    private fun getWifiNetworkMetadata(isWifiOn: Boolean): Map<String, String> {
        val details = mutableMapOf<String, String>()
        if (!isWifiOn) {
            details["wifi_name"] = "Disconnected"
            details["wifi_id"] = "N/A"
            details["wifi_bssid"] = "N/A"
            details["wifi_ip"] = "0.0.0.0"
            details["description"] = "Wi-Fi turned OFF"
            return details
        }
        try {
            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val info = wifiManager?.connectionInfo
            val ssidRaw = info?.ssid ?: ""
            val ssid = if (ssidRaw.startsWith("\"") && ssidRaw.endsWith("\"") && ssidRaw.length > 2) {
                ssidRaw.substring(1, ssidRaw.length - 1)
            } else if (ssidRaw == "<unknown ssid>" || ssidRaw.isEmpty()) {
                "Connected (SSID scanning)"
            } else {
                ssidRaw
            }
            val bssid = info?.bssid ?: "Unavailable"
            val ipInt = info?.ipAddress ?: 0
            val ipAddress = if (ipInt != 0) {
                String.format(
                    java.util.Locale.US, "%d.%d.%d.%d",
                    ipInt and 0xff,
                    ipInt shr 8 and 0xff,
                    ipInt shr 16 and 0xff,
                    ipInt shr 24 and 0xff
                )
            } else "0.0.0.0"

            val linkSpeed = "${info?.linkSpeed ?: 0} Mbps"
            val frequency = "${info?.frequency ?: 0} MHz"

            details["wifi_name"] = ssid
            details["wifi_id"] = bssid
            details["wifi_bssid"] = bssid
            details["wifi_ip"] = ipAddress
            details["link_speed"] = linkSpeed
            details["frequency"] = frequency
            details["description"] = "Wi-Fi ON: $ssid ($ipAddress)"
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching Wi-Fi details", e)
            details["wifi_name"] = "Enabled"
            details["description"] = "Wi-Fi turned ON"
        }
        return details
    }

    private fun handleWifiChangeExplicit(isWifiOn: Boolean, forceLog: Boolean = false) {
        if (!isMonitoringEnabled()) return
        val settings = try { settingsStorage.getSettings() } catch (e: Exception) { return }
        if (!settings.captureOnWifiToggle) {
            Log.d(TAG, "handleWifiChangeExplicit skipped: captureOnWifiToggle is false")
            return
        }

        val prev = lastWifiState
        val current = if (isWifiOn) 1 else 0
        Log.d(TAG, "handleWifiChangeExplicit: isWifiOn=$isWifiOn, prev=$prev, current=$current, forceLog=$forceLog")

        val metadata = getWifiNetworkMetadata(isWifiOn)
        val currentBssid = metadata["wifi_bssid"]?.toString() ?: "N/A"
        val prevBssid = lastWifiBssid

        lastWifiState = current
        lastWifiBssid = currentBssid

        val isNetworkChange = isWifiOn && prev == 1 && current == 1 && prevBssid != currentBssid && currentBssid != "Unavailable" && currentBssid != "02:00:00:00:00:00"
        val isNetworkLost = isWifiOn && prev == 1 && current == 1 && prevBssid != currentBssid && (currentBssid == "Unavailable" || currentBssid == "02:00:00:00:00:00")

        // Log if the Wi-Fi adapter toggles ON/OFF, OR if forced, OR if a genuine network change occurred, OR if the network was disconnected
        if (forceLog || prev == null || prev != current || isNetworkChange || isNetworkLost) {
            Log.d(TAG, "Logging Wi-Fi toggle/network change: isWifiOn=$isWifiOn, isNetworkLost=$isNetworkLost, meta=$metadata")
            val eventName = if (isNetworkLost) "WIFI_DISCONNECTED" else if (isWifiOn) "WIFI_ENABLED" else "WIFI_DISABLED"
            eventLogger.logEvent(
                eventName,
                if (isNetworkLost) "DISCONNECTED" else if (isWifiOn) StatusValues.ENABLED else StatusValues.DISABLED,
                metadata
            )
            requestPhoto(this, eventName)
        }
    }

    private fun handleBluetoothChangeExplicit(isBluetoothOn: Boolean) {
        if (!isMonitoringEnabled()) return
        val settings = try { settingsStorage.getSettings() } catch (e: Exception) { return }
        if (!settings.captureOnBluetooth) return

        val prev = lastBluetoothState
        lastBluetoothState = isBluetoothOn

        if (prev == null || prev != isBluetoothOn) {
            Log.d(TAG, "Logging Bluetooth change: isBluetoothOn=$isBluetoothOn")
            val eventName = if (isBluetoothOn) "BLUETOOTH_ENABLED" else "BLUETOOTH_DISABLED"
            eventLogger.logEvent(
                eventName,
                if (isBluetoothOn) StatusValues.ENABLED else StatusValues.DISABLED
            )
            requestPhoto(this, eventName)
        }
    }

    private fun handleAirplaneChangeExplicit(isAirplaneModeOn: Boolean) {
        if (!isMonitoringEnabled()) return
        val settings = try { settingsStorage.getSettings() } catch (e: Exception) { return }
        if (!settings.captureOnAirplaneMode) return

        val prev = lastAirplaneState
        lastAirplaneState = isAirplaneModeOn

        if (prev == null || prev != isAirplaneModeOn) {
            val eventName = if (isAirplaneModeOn) "AIRPLANE_MODE_ENABLED" else "AIRPLANE_MODE_DISABLED"
            eventLogger.logEvent(
                eventName,
                if (isAirplaneModeOn) StatusValues.ENABLED else StatusValues.DISABLED
            )
            requestPhoto(this, eventName)
        }
    }

    private fun getSimMetadata(context: Context): Map<String, String> {
        val details = mutableMapOf<String, String>()
        try {
            val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            if (tm != null) {
                details["provider"] = tm.simOperatorName.ifEmpty { tm.networkOperatorName.ifEmpty { "Unknown" } }
            }

            if (ActivityCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED ||
                (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && ActivityCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_NUMBERS) == PackageManager.PERMISSION_GRANTED)) {
                val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? android.telephony.SubscriptionManager
                val activeList = subscriptionManager?.activeSubscriptionInfoList
                if (!activeList.isNullOrEmpty()) {
                    val numberList = mutableListOf<String>()
                    val providerList = mutableListOf<String>()
                    for (info in activeList) {
                        providerList.add(info.carrierName?.toString() ?: info.displayName?.toString() ?: "Unknown")
                        val num = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            subscriptionManager.getPhoneNumber(info.subscriptionId)
                        } else {
                            @Suppress("DEPRECATION")
                            info.number
                        }
                        if (!num.isNullOrEmpty()) {
                            numberList.add(num)
                        }
                    }
                    if (numberList.isNotEmpty()) {
                        details["mobile_number"] = numberList.joinToString(", ")
                    }
                    if (providerList.isNotEmpty()) {
                        details["provider"] = providerList.joinToString(", ")
                    }
                } else {
                    val line1Number = tm?.line1Number
                    if (!line1Number.isNullOrEmpty()) {
                        details["mobile_number"] = line1Number
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error reading SIM metadata", e)
        }
        return details
    }

    private fun handleSimStateChangeExplicit(simState: String, isSticky: Boolean = false) {
        if (!isMonitoringEnabled()) return
        val settings = try { settingsStorage.getSettings() } catch (e: Exception) { return }
        if (!settings.captureOnSimChange) return

        Log.d(TAG, "SIM state changed explicit: $simState")

        val eventType = when (simState) {
            "ABSENT", "NOT_READY" -> EventTypes.SIM_REMOVED
            "READY", "IMSI", "LOADED" -> EventTypes.SIM_INSERTED
            else -> return
        }

        val prevSimState = lastSimEventType
        lastSimEventType = eventType

        if (isSticky) return

        if (prevSimState == null || prevSimState != eventType) {
            Log.d(TAG, "Logging SIM event: $eventType")
            val simMeta = getSimMetadata(this)
            val finalMetadata = mutableMapOf<String, Any?>().apply {
                put("sim_state", simState)
                put("description", if (eventType == EventTypes.SIM_INSERTED) "SIM card inserted/ready" else "SIM card removed/absent")
                putAll(simMeta)
            }
            eventLogger.logEvent(
                eventType = eventType,
                status = if (eventType == EventTypes.SIM_INSERTED) StatusValues.ENABLED else StatusValues.DISABLED,
                metadata = finalMetadata
            )
            // Trigger photo capture on SIM insertion/removal
            wakeUpDevice()
            requestPhoto(this, eventType)

            // SIM Change Recovery Alert (identity compare + SMS + offline GNSS)
            try {
                com.mrp.domain.usecase.SimChangeRecoveryAlertUseCase(this).onSimStateChanged(
                    simState = simState,
                    isInsertion = eventType == EventTypes.SIM_INSERTED
                )
            } catch (e: Exception) {
                Log.e(TAG, "SIM recovery alert failed", e)
            }
        }
    }

    private fun handleFactoryResetOrShutdown(action: String) {
        if (!isMonitoringEnabled()) return
        val settings = try { settingsStorage.getSettings() } catch (e: Exception) { return }
        
        val eventType = when (action) {
            "android.intent.action.MASTER_CLEAR_NOTIFICATION",
            "android.intent.action.FACTORY_RESET" -> EventTypes.FACTORY_RESET
            Intent.ACTION_SHUTDOWN -> EventTypes.DEVICE_SHUTDOWN
            Intent.ACTION_REBOOT -> EventTypes.DEVICE_REBOOT
            else -> EventTypes.FACTORY_RESET
        }

        // Only log factory reset if setting is enabled
        if (eventType == EventTypes.FACTORY_RESET && !settings.captureOnFactoryReset) return

        Log.w(TAG, "Critical device reset/shutdown event: $action")
        eventLogger.logEvent(
            eventType = eventType,
            status = StatusValues.ENABLED,
            metadata = mapOf(
                "action" to action,
                "description" to "Device shutdown or factory reset initiated"
            )
        )
        // Trigger photo capture on Factory Reset
        if (eventType == EventTypes.FACTORY_RESET) {
            wakeUpDevice()
            requestPhoto(this, EventTypes.FACTORY_RESET)
        }
    }

    private var lastUsbState: Boolean? = null

    private fun handleUsbChangeExplicit(isConnected: Boolean, isSticky: Boolean = false) {
        if (!isMonitoringEnabled()) return
        val settings = try { settingsStorage.getSettings() } catch (e: Exception) { return }
        if (!settings.captureOnUsb) return

        val prev = lastUsbState
        lastUsbState = isConnected

        if (isSticky) return

        if (prev == null || prev != isConnected) {
            Log.d(TAG, "USB state changed: isConnected=$isConnected")
            val eventName = if (isConnected) "USB_CONNECTED" else "USB_DISCONNECTED"
            eventLogger.logEvent(
                eventName,
                if (isConnected) StatusValues.ENABLED else StatusValues.DISABLED,
                mapOf(
                    "description" to if (isConnected) "USB connection detected" else "USB disconnected",
                    "source" to "MrpMonitorService"
                )
            )
            requestPhoto(this, eventName)
        }
    }

    private fun handleWrongUnlockAttemptExplicit() {
        if (!isMonitoringEnabled()) return
        val settings = try { settingsStorage.getSettings() } catch (e: Exception) { return }
        if (!settings.captureOnWrongUnlock) return

        Log.w(TAG, "Explicit Wrong Unlock attempt detected")
        eventLogger.logEvent(
            eventType = EventTypes.WRONG_UNLOCK_ATTEMPT,
            status = StatusValues.FAILED,
            metadata = mapOf(
                "description" to "Wrong unlock attempt detected",
                "source" to "MrpMonitorService"
            )
        )
        requestPhoto(this, EventTypes.WRONG_UNLOCK_ATTEMPT)
    }

    private fun isMonitoringEnabled(): Boolean {
        return try {
            val enabled = settingsStorage.getSettings().isMonitoringEnabled
            Log.d(TAG, "isMonitoringEnabled check: $enabled")
            enabled
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check monitoring enabled", e)
            true // Default to enabled if settings fail
        }
    }

    @Volatile private var pendingPhotoCapture = false
    @Volatile private var currentPhotoEventName = "unknown"
    @Volatile private var selfieSensorOrientation: Int = 0
    @Volatile private var selfieCameraChars: CameraCharacteristics? = null

    @SuppressLint("MissingPermission")
    private fun openCamera() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Camera permission not granted, skipping camera open")
            pendingPhotoCapture = false
            return
        }

        updateForegroundServiceTypes()

        val cameraManager = getSystemService(Context.CAMERA_SERVICE) as CameraManager
        try {
            val cameraId = getFrontCameraId(cameraManager) ?: run {
                Log.e(TAG, "No front camera found")
                pendingPhotoCapture = false
                return
            }

            if (cameraDevice != null) {
                closeCamera()
            }

            val chars = cameraManager.getCameraCharacteristics(cameraId)
            selfieCameraChars = chars
            selfieSensorOrientation = SelfieCaptureUtil.sensorOrientation(chars)
            val chosen = SelfieCaptureUtil.chooseJpegSize(SelfieCaptureUtil.jpegOutputSizes(chars))
            Log.d(TAG, "Selfie size ${chosen.width}x${chosen.height} orient=$selfieSensorOrientation")

            imageReader = ImageReader.newInstance(chosen.width, chosen.height, ImageFormat.JPEG, 2).apply {
                setOnImageAvailableListener({ reader ->
                    val image = reader.acquireLatestImage()
                    if (image != null) {
                        savePhoto(image)
                        image.close()
                    }
                }, backgroundHandler)
            }

            cameraManager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    cameraDevice = camera
                    Log.d(TAG, "Camera opened successfully")
                    createCaptureSession()
                }

                override fun onDisconnected(camera: CameraDevice) {
                    Log.w(TAG, "Camera disconnected")
                    camera.close()
                    cameraDevice = null
                    pendingPhotoCapture = false
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    Log.e(TAG, "Camera error: $error")
                    camera.close()
                    cameraDevice = null
                    pendingPhotoCapture = false
                }
            }, backgroundHandler)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open camera", e)
            closeCamera()
            pendingPhotoCapture = false
        }
    }

    private fun getFrontCameraId(cameraManager: CameraManager): String? {
        for (cameraId in cameraManager.cameraIdList) {
            val characteristics = cameraManager.getCameraCharacteristics(cameraId)
            val facing = characteristics.get(CameraCharacteristics.LENS_FACING)
            if (facing == CameraCharacteristics.LENS_FACING_FRONT) {
                return cameraId
            }
        }
        return null
    }

    private fun createCaptureSession() {
        val camera = cameraDevice ?: return
        val reader = imageReader ?: return

        try {
            val surface = reader.surface
            val captureRequestBuilder = try {
                camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE)
            } catch (e: Exception) {
                camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW)
            }
            captureRequestBuilder.addTarget(surface)
            captureRequestBuilder.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
            SelfieCaptureUtil.applyStillCaptureSettings(
                captureRequestBuilder,
                selfieSensorOrientation,
                selfieCameraChars,
            )

            camera.createCaptureSession(
                listOf(surface),
                object : CameraCaptureSession.StateCallback() {
                    override fun onConfigured(session: CameraCaptureSession) {
                        captureSession = session
                        Log.d(TAG, "Capture session configured")
                        if (pendingPhotoCapture) {
                            pendingPhotoCapture = false
                            executePhotoCapture()
                        }
                    }

                    override fun onConfigureFailed(session: CameraCaptureSession) {
                        Log.e(TAG, "Capture session configuration failed")
                        pendingPhotoCapture = false
                    }
                },
                backgroundHandler
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create capture session", e)
            pendingPhotoCapture = false
        }
    }

    private fun closeCamera() {
        try {
            captureSession?.close()
            captureSession = null
            cameraDevice?.close()
            cameraDevice = null
            imageReader?.close()
            imageReader = null
        } catch (e: Exception) {
            Log.e(TAG, "Error closing camera", e)
        }
    }

    fun takePhoto(eventName: String = "unknown") {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Camera permission not granted, skipping photo capture")
            return
        }

        wakeUpDevice()
        Log.d(TAG, "Taking silent background photo for event: $eventName")
        currentPhotoEventName = eventName
        pendingPhotoCapture = true
        openCamera()
    }

    private fun executePhotoCapture() {
        val camera = cameraDevice ?: return
        val session = captureSession ?: return
        val reader = imageReader ?: return
        val handler = backgroundHandler ?: return

        try {
            val captureBuilder = try {
                camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE)
            } catch (e: Exception) {
                camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW)
            }
            captureBuilder.addTarget(reader.surface)
            captureBuilder.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
            captureBuilder.set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_OFF)
            SelfieCaptureUtil.applyStillCaptureSettings(
                captureBuilder,
                selfieSensorOrientation,
                selfieCameraChars,
            )

            session.capture(captureBuilder.build(), object : CameraCaptureSession.CaptureCallback() {
                override fun onCaptureCompleted(session: CameraCaptureSession, request: CaptureRequest, result: TotalCaptureResult) {
                    Log.d(TAG, "Photo capture completed")
                }

                override fun onCaptureFailed(session: CameraCaptureSession, request: CaptureRequest, failure: CaptureFailure) {
                    Log.e(TAG, "Photo capture failed: ${failure.reason}")
                }
            }, handler)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to capture photo", e)
        }
    }

    private fun savePhoto(image: android.media.Image) {
        val photosDir = timelineStorage.getPhotosDirectory()
        if (!photosDir.exists()) {
            photosDir.mkdirs()
        }

        val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val safeEventName = currentPhotoEventName.replace(Regex("[^a-zA-Z0-9]"), "_")
        val photoFile = File(photosDir, "${safeEventName}_$timestamp.jpg")

        try {
            SelfieCaptureUtil.saveUprightJpeg(
                image = image,
                destFile = photoFile,
                sensorOrientationDeg = selfieSensorOrientation,
                mirrorFront = false,
            )
            Log.d(TAG, "Photo saved: ${photoFile.path}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save photo", e)
        } finally {
            backgroundHandler?.postDelayed({
                closeCamera()
            }, 1000)
        }
    }

    fun isServiceRunning(): Boolean = isRunning

    private fun wakeUpDevice() {
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager

            releaseWakeLock()

            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK or
                PowerManager.ACQUIRE_CAUSES_WAKEUP or
                PowerManager.ON_AFTER_RELEASE,
                "MRP:EventWakeLock"
            )
            wakeLock?.acquire(15000)
            Log.d(TAG, "WakeLock acquired for event processing")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to wake device", e)
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
                Log.d(TAG, "WakeLock released")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to release wake lock", e)
        }
    }

    companion object {
        private const val TAG = "MrpMonitorService"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "mrp_monitoring_channel"
        const val ACTION_REQUEST_PHOTO = "com.mrp.ACTION_REQUEST_PHOTO"
        const val ACTION_STOP_SERVICE = "com.mrp.ACTION_STOP_SERVICE"

        @Volatile
        var isServiceRunning = false

        fun startService(context: Context) {
            val intent = Intent(context, MrpMonitorService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopService(context: Context) {
            val intent = Intent(context, MrpMonitorService::class.java)
            context.stopService(intent)
        }

        fun requestPhoto(context: Context, eventName: String = "unknown") {
            try {
                Log.d(TAG, "requestPhoto triggered for event: $eventName")
                // Launch CameraCaptureActivity transparent overlay over lockscreen
                val intent = Intent(context, CameraCaptureActivity::class.java).apply {
                    putExtra("eventName", eventName)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NO_ANIMATION or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                }
                val pendingIntent = android.app.PendingIntent.getActivity(
                    context,
                    System.currentTimeMillis().toInt(),
                    intent,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
                )
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    val options = android.app.ActivityOptions.makeBasic()
                    options.pendingIntentBackgroundActivityStartMode = android.app.ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
                    pendingIntent.send(context, 0, null, null, null, null, options.toBundle())
                } else {
                    pendingIntent.send()
                }
                Log.d(TAG, "Launched CameraCaptureActivity via PendingIntent for event: $eventName")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to launch CameraCaptureActivity via PendingIntent, fallback to startActivity", e)
                try {
                    val intent = Intent(context, CameraCaptureActivity::class.java).apply {
                        putExtra("eventName", eventName)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    }
                    context.startActivity(intent)
                } catch (e2: Exception) {
                    Log.e(TAG, "All camera launch attempts failed", e2)
                }
            }
        }
    }
}