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
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.domain.model.*
import com.mrp.domain.usecase.LocationHelper
import com.mrp.domain.usecase.TimelineEventLogger
import com.mrp.domain.usecase.AppUsageTracker
import com.mrp.domain.usecase.PackageChangeHandler
import com.mrp.domain.usecase.BreachPostureScanner
import com.mrp.domain.usecase.DevicePowerMode
import com.mrp.domain.usecase.DevicePresenceTracker
import com.mrp.domain.usecase.DriveVaultSync
import com.mrp.domain.usecase.NativeGeofenceRegistrar
import com.mrp.domain.usecase.EmergencySyncCoordinator
import com.mrp.domain.usecase.SelfieVaultPackager
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
    private var lastWifiAssociated: Boolean? = null
    private var lastBtDeviceAddress: String? = null
    private var lastUsbFunctions: String? = null
    @Volatile private var emergencySyncStatusLine: String? = null
    private val connectedBtAddresses = mutableSetOf<String>()
    private var bluetoothConnectionMonitor: com.mrp.domain.usecase.BluetoothConnectionMonitor? = null
    private var lastSimEventType: String? = null
    private var lastWifiBssid: String? = null
    private var lastAppUsageCheckTime: Long = 0
    private var toggleEvalPending = false
    private val toggleEvalRunnable = Runnable {
        toggleEvalPending = false
        evaluateAllToggles()
    }

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

            @Suppress("DEPRECATION")
            val wifiNetworkInfo = if (action == WifiManager.NETWORK_STATE_CHANGED_ACTION ||
                action == "android.net.wifi.STATE_CHANGE"
            ) {
                intent.getParcelableExtra<android.net.NetworkInfo>(WifiManager.EXTRA_NETWORK_INFO)
            } else null

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
                            lastWifiAssociated = false
                        }
                        // Do not re-run evaluateAllToggles here — explicit handler already ran.
                        // QS / screen-on often rebroadcast Wi‑Fi state without a real toggle.
                    }
                    WifiManager.NETWORK_STATE_CHANGED_ACTION -> {
                        handleWifiAssociationChange(wifiNetworkInfo)
                    }
                    "com.mrp.TEST_WIFI_TOGGLE" -> {
                        handleWifiChangeExplicit(testWifiState, forceLog = false)
                    }
                    BluetoothAdapter.ACTION_STATE_CHANGED -> {
                        if (bluetoothState == BluetoothAdapter.STATE_ON) {
                            handleBluetoothChangeExplicit(true)
                            ensureBluetoothConnectionMonitor()
                        } else if (bluetoothState == BluetoothAdapter.STATE_OFF) {
                            handleBluetoothChangeExplicit(false)
                            lastBtDeviceAddress = null
                            connectedBtAddresses.clear()
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
                    "android.net.conn.CONNECTIVITY_CHANGE" -> {
                        if (EmergencySyncCoordinator.hasValidatedInternet(this@MrpMonitorService)) {
                            EmergencySyncCoordinator.onConnectivityValidated(this@MrpMonitorService)
                            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
                            val caps = cm?.activeNetwork?.let { cm.getNetworkCapabilities(it) }
                            val transport = when {
                                caps?.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) == true -> "wifi"
                                caps?.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR) == true -> "cellular"
                                else -> "network"
                            }
                            DriveVaultSync.onNetworkAvailable(this@MrpMonitorService, transport)
                        }
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
                        handleUsbChangeExplicit(intent.extras, isSticky)
                    }
                    Intent.ACTION_POWER_CONNECTED -> {
                        // Power alone is not proof of USB data; USB_STATE handles attach/detach.
                    }
                    "com.mrp.TEST_USB_CONNECTED" -> {
                        handleUsbChangeExplicit(Bundle().apply {
                            putBoolean("connected", true)
                            putBoolean("configured", false)
                        })
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
            if (isDataOn) {
                // Mobile radio / data path up — flush pending Drive chunks on cellular.
                DriveVaultSync.onNetworkAvailable(this, "cellular")
            }
        }
    }

    private fun scheduleToggleEvaluation() {
        val bg = backgroundHandler ?: return
        if (toggleEvalPending) {
            bg.removeCallbacks(toggleEvalRunnable)
        }
        toggleEvalPending = true
        bg.postDelayed(toggleEvalRunnable, TOGGLE_EVAL_DEBOUNCE_MS)
    }

    // NetworkCallback removed: default callback kept radio interested on screen-on.
    // Wi‑Fi / airplane / mobile / hotspot use explicit broadcast receivers instead.

    /**
     * Only watch settings that map to real toggle events.
     * Watching all of Settings.Global/Secure fires when the QS shade opens
     * and was causing redundant selfie + location work.
     */
    private val settingsObserver = object : ContentObserver(handler) {
        override fun onChange(selfChange: Boolean) {
            super.onChange(selfChange)
            Log.d(TAG, "Toggle settings observer fired")
            scheduleToggleEvaluation()
        }

        override fun onChange(selfChange: Boolean, uri: android.net.Uri?) {
            super.onChange(selfChange, uri)
            Log.d(TAG, "Toggle settings observer fired uri=$uri")
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
        EmergencySyncCoordinator.statusLineUpdater = { line ->
            emergencySyncStatusLine = line
            try {
                val nm = getSystemService(NotificationManager::class.java)
                nm.notify(NOTIFICATION_ID, createNotification())
            } catch (e: Exception) {
                Log.w(TAG, "emergency notification update", e)
            }
        }

        backgroundHandler?.post {
            initializeInitialToggleStates()
            registerReceivers()
            checkBatteryOptimization()
            // Battery-safe live presence for web (only when movement tracking is on)
            try {
                DevicePresenceTracker.startIfBackgroundAllowed(this@MrpMonitorService)
            } catch (e: Exception) {
                Log.w(TAG, "DevicePresenceTracker start skipped", e)
            }
            try {
                DevicePowerMode.start(this@MrpMonitorService)
            } catch (e: Exception) {
                Log.w(TAG, "DevicePowerMode start skipped", e)
            }
            try {
                NativeGeofenceRegistrar.sync(this@MrpMonitorService)
            } catch (e: Exception) {
                Log.w(TAG, "NativeGeofenceRegistrar sync skipped", e)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Service onStartCommand: action=${intent?.action}")

        val notification = createNotification()
        startForegroundSafe(notification)
        isRunning = true
        try {
            DevicePowerMode.start(this)
        } catch (e: Exception) {
            Log.w(TAG, "DevicePowerMode start skipped", e)
        }

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

    @Volatile private var cameraFgsActive = false

    private fun startForegroundSafe(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Only claim LOCATION/CAMERA FGS types while actively using them —
            // otherwise status-bar icons stay on for the whole monitoring session.
            var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            if (cameraFgsActive &&
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
                ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
            ) {
                types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
            }
            try {
                startForeground(NOTIFICATION_ID, notification, types)
                Log.d(TAG, "Started foreground service with types bitmask: $types")
            } catch (e: SecurityException) {
                Log.e(TAG, "SecurityException starting foreground with types $types, falling back", e)
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
        EmergencySyncCoordinator.statusLineUpdater = null
        emergencySyncStatusLine = null

        super.onDestroy()
    }

    private fun startBackgroundThread() {
        backgroundThread = HandlerThread("MrpBackground").also { it.start() }
        backgroundHandler = Handler(backgroundThread!!.looper)
    }

    private fun stopBackgroundThread() {
        backgroundHandler?.removeCallbacks(toggleEvalRunnable)
        toggleEvalPending = false
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
                addAction(WifiManager.NETWORK_STATE_CHANGED_ACTION)
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

            // Do not registerDefaultNetworkCallback — it wakes radio on screen-on / QS.

            // Narrow observers: full Global/Secure trees fire on QS shade / status bar UI.
            contentResolver.registerContentObserver(
                Settings.Global.getUriFor(Settings.Global.AIRPLANE_MODE_ON),
                false,
                settingsObserver,
            )
            contentResolver.registerContentObserver(
                Settings.Global.getUriFor("mobile_data"),
                false,
                settingsObserver,
            )
            contentResolver.registerContentObserver(
                Settings.Global.getUriFor("bluetooth_on"),
                false,
                settingsObserver,
            )
            contentResolver.registerContentObserver(
                Settings.Global.getUriFor("wifi_on"),
                false,
                settingsObserver,
            )

            ensureBluetoothConnectionMonitor()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register receivers", e)
        }
    }

    private fun ensureBluetoothConnectionMonitor() {
        try {
            val settings = try { settingsStorage.getSettings() } catch (_: Exception) { return }
            if (!settings.captureOnBluetooth) {
                bluetoothConnectionMonitor?.stop()
                return
            }
            if (bluetoothConnectionMonitor == null) {
                bluetoothConnectionMonitor = com.mrp.domain.usecase.BluetoothConnectionMonitor(this) { connected, name, address ->
                    handleBluetoothDeviceLink(connected, name, address)
                }
            }
            bluetoothConnectionMonitor?.ensureStarted()
        } catch (e: Exception) {
            Log.w(TAG, "BluetoothConnectionMonitor start failed", e)
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
            contentResolver.unregisterContentObserver(settingsObserver)
        } catch (e: Exception) { Log.w(TAG, "settingsObserver not registered") }

        try {
            bluetoothConnectionMonitor?.stop()
        } catch (e: Exception) {
            Log.w(TAG, "BluetoothConnectionMonitor stop failed", e)
        }
        bluetoothConnectionMonitor = null
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
            .setContentTitle(
                if (emergencySyncStatusLine != null) "MRP Emergency sync" else "MRP Monitoring Active"
            )
            .setContentText(
                emergencySyncStatusLine
                    ?: if (com.mrp.data.local.DeviceTrackingPrefs.isEmergencyTracking(this)) {
                        "Emergency tracking on — syncing when network is available"
                    } else {
                        "Tracking device events and location"
                    }
            )
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
        DevicePowerMode.onScreenChanged(this, false)
        if (!isMonitoringEnabled()) return
        eventLogger.logEvent(EventTypes.SCREEN_LOCK, StatusValues.LOCKED)
    }

    private fun handleUserUnlocked() {
        DevicePowerMode.onScreenChanged(this, true)
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

        // Retry BT monitor if Nearby devices permission was granted after service start
        if (settings.captureOnBluetooth) {
            ensureBluetoothConnectionMonitor()
        }

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

    private fun handleWifiAssociationChange(networkInfo: android.net.NetworkInfo?) {
        if (!isMonitoringEnabled()) return
        val settings = try { settingsStorage.getSettings() } catch (e: Exception) { return }
        if (!settings.captureOnWifiToggle) return
        if (networkInfo == null) return

        @Suppress("DEPRECATION")
        val detailed = networkInfo.detailedState
        val associated = when (detailed) {
            android.net.NetworkInfo.DetailedState.CONNECTED -> true
            android.net.NetworkInfo.DetailedState.DISCONNECTED,
            android.net.NetworkInfo.DetailedState.FAILED,
            android.net.NetworkInfo.DetailedState.IDLE -> false
            else -> return // ignore intermediate states
        }

        val prev = lastWifiAssociated
        if (prev != null && prev == associated) return
        lastWifiAssociated = associated

        val metadata = getWifiNetworkMetadata(associated)
        val eventName = if (associated) "WIFI_CONNECTED" else "WIFI_DISCONNECTED"
        Log.d(TAG, "Wi‑Fi association: $eventName detailed=$detailed")
        eventLogger.logEvent(
            eventName,
            if (associated) StatusValues.CONNECTED else StatusValues.DISCONNECTED,
            metadata
        )
        if (associated && EmergencySyncCoordinator.hasValidatedInternet(this)) {
            EmergencySyncCoordinator.onConnectivityValidated(this)
        }
        // Association changes are security events when Wi‑Fi capture is enabled
        requestPhoto(this, eventName)
    }

    private fun handleBluetoothDeviceLink(
        connected: Boolean,
        name: String,
        address: String
    ) {
        if (!isMonitoringEnabled()) return
        val settings = try { settingsStorage.getSettings() } catch (e: Exception) { return }
        if (!settings.captureOnBluetooth) return

        if (connected) {
            if (address != "unknown" && !connectedBtAddresses.add(address)) {
                Log.d(TAG, "BT already connected $address — skip duplicate")
                return
            }
            lastBtDeviceAddress = address
        } else {
            if (address != "unknown") {
                connectedBtAddresses.remove(address)
            }
            if (lastBtDeviceAddress == address) lastBtDeviceAddress = null
        }

        val eventName = if (connected) "BLUETOOTH_CONNECTED" else "BLUETOOTH_DISCONNECTED"
        Log.i(TAG, "Bluetooth device link: $eventName name=$name addr=$address")
        eventLogger.logEvent(
            eventName,
            if (connected) StatusValues.CONNECTED else StatusValues.DISCONNECTED,
            mapOf(
                "device_name" to name,
                "device_address" to address,
                "description" to if (connected) "Connected to $name" else "Disconnected from $name"
            )
        )
        requestPhoto(this, eventName)
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
        lastWifiState = current
        if (!isWifiOn) {
            lastWifiBssid = "N/A"
            lastWifiAssociated = false
        } else {
            lastWifiBssid = metadata["wifi_bssid"]?.toString() ?: lastWifiBssid
        }

        // Radio ON/OFF only — association is WIFI_CONNECTED / WIFI_DISCONNECTED
        if (forceLog || prev == null || prev != current) {
            Log.d(TAG, "Logging Wi-Fi radio toggle: isWifiOn=$isWifiOn meta=$metadata")
            val eventName = if (isWifiOn) "WIFI_ENABLED" else "WIFI_DISABLED"
            eventLogger.logEvent(
                eventName,
                if (isWifiOn) StatusValues.ENABLED else StatusValues.DISABLED,
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

        val eventType = when (simState) {
            "ABSENT", "NOT_READY" -> EventTypes.SIM_REMOVED
            "READY", "IMSI", "LOADED" -> EventTypes.SIM_INSERTED
            else -> return
        }

        val prevSimState = lastSimEventType
        lastSimEventType = eventType

        if (isSticky) return

        if (prevSimState == null || prevSimState != eventType) {
            when (eventType) {
                EventTypes.SIM_REMOVED -> EmergencySyncCoordinator.onSimRemoved(this)
                EventTypes.SIM_INSERTED -> EmergencySyncCoordinator.onSimInserted(this)
            }

            val settings = try { settingsStorage.getSettings() } catch (e: Exception) { return }
            if (!settings.captureOnSimChange) return

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

        if (eventType == EventTypes.FACTORY_RESET) {
            EmergencySyncCoordinator.onFactoryResetSignal(this)
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

    private data class UsbMonitorSnapshot(
        val connected: Boolean,
        val configured: Boolean,
        val unlocked: Boolean,
        val adb: Boolean,
        val mtp: Boolean,
        val ptp: Boolean,
        val midi: Boolean,
        val accessory: Boolean,
        val audioSource: Boolean,
        val ncm: Boolean,
        val tether: Boolean,
        val whileLocked: Boolean
    ) {
        fun functionsLabel(): String {
            val parts = buildList {
                if (adb) add("adb")
                if (mtp) add("mtp")
                if (ptp) add("ptp")
                if (midi) add("midi")
                if (accessory) add("accessory")
                if (audioSource) add("audio")
                if (ncm) add("ncm")
                if (tether) add("tether")
            }
            return if (parts.isEmpty()) {
                if (connected) "charging_only" else "disconnected"
            } else {
                parts.joinToString(",")
            }
        }

        fun dataActive(): Boolean =
            adb || mtp || ptp || midi || accessory || audioSource || ncm || tether
    }

    private fun usbSnapshotFromExtras(extras: Bundle?): UsbMonitorSnapshot {
        val km = getSystemService(KEYGUARD_SERVICE) as? android.app.KeyguardManager
        return UsbMonitorSnapshot(
            connected = extras?.getBoolean("connected", false) == true,
            configured = extras?.getBoolean("configured", false) == true,
            unlocked = extras?.getBoolean("unlocked", false) == true,
            adb = extras?.getBoolean("adb", false) == true,
            mtp = extras?.getBoolean("mtp", false) == true,
            ptp = extras?.getBoolean("ptp", false) == true,
            midi = extras?.getBoolean("midi", false) == true,
            accessory = extras?.getBoolean("accessory", false) == true,
            audioSource = extras?.getBoolean("audio_source", false) == true,
            ncm = extras?.getBoolean("ncm", false) == true,
            tether = extras?.getBoolean("rndis", false) == true ||
                extras?.getBoolean("tethering", false) == true,
            whileLocked = km?.isKeyguardLocked == true
        )
    }

    private fun handleUsbChangeExplicit(extras: Bundle?, isSticky: Boolean = false) {
        if (!isMonitoringEnabled()) return
        val settings = try { settingsStorage.getSettings() } catch (e: Exception) { return }
        val usb = usbSnapshotFromExtras(extras)
        val prev = lastUsbState
        val prevFunctions = lastUsbFunctions
        lastUsbState = usb.connected
        lastUsbFunctions = usb.functionsLabel()

        if (isSticky) return

        val stateChanged = prev == null || prev != usb.connected
        val functionChanged = prevFunctions != usb.functionsLabel()
        if (stateChanged || functionChanged) {
            Log.d(TAG, "USB state changed: connected=${usb.connected} functions=${usb.functionsLabel()}")
            val eventName = if (usb.connected) "USB_CONNECTED" else "USB_DISCONNECTED"
            eventLogger.logEvent(
                eventName,
                if (usb.connected) StatusValues.ENABLED else StatusValues.DISABLED,
                mapOf(
                    "description" to if (usb.connected) {
                        "USB attached (${usb.functionsLabel()})"
                    } else {
                        "USB disconnected"
                    },
                    "source" to "MrpMonitorService",
                    "usb_connected" to usb.connected,
                    "usb_configured" to usb.configured,
                    "usb_unlocked" to usb.unlocked,
                    "usb_functions" to usb.functionsLabel(),
                    "usb_data_active" to usb.dataActive(),
                    "usb_while_locked" to usb.whileLocked,
                    "usb_adb" to usb.adb
                )
            )
            if (settings.captureOnUsb) {
                requestPhoto(this, eventName)
            }
            if (usb.connected && (stateChanged || functionChanged)) {
                EmergencySyncCoordinator.onUsbAttached(this)
            }
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

        cameraFgsActive = true
        updateForegroundServiceTypes()

        val cameraManager = getSystemService(Context.CAMERA_SERVICE) as CameraManager
        try {
            val cameraId = SelfieCaptureUtil.chooseFrontCameraId(cameraManager) ?: run {
                Log.e(TAG, "No front camera found")
                pendingPhotoCapture = false
                cameraFgsActive = false
                updateForegroundServiceTypes()
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
        } finally {
            releaseWakeLock()
            cameraFgsActive = false
            updateForegroundServiceTypes()
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
            SelfieVaultPackager.attachSelfieToTimeline(
                applicationContext,
                currentPhotoEventName,
                photoFile,
            )
            DriveVaultSync.requestSyncAsync(applicationContext, "event_selfie")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save photo", e)
        } finally {
            // Release camera ASAP so the status-bar icon drops
            backgroundHandler?.postDelayed({
                closeCamera()
            }, 250)
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
            wakeLock?.acquire(EVENT_WAKE_LOCK_MS)
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
        private const val TOGGLE_EVAL_DEBOUNCE_MS = 1500L
        private const val EVENT_WAKE_LOCK_MS = 5000L
        /** Per-event gap for routine selfies (same event type only). */
        private const val PHOTO_DEBOUNCE_MS = 4_000L
        /** Still allow fast capture for SIM / wrong-unlock / USB / factory / panic / misuse. */
        private const val PHOTO_DEBOUNCE_CRITICAL_MS = 2_500L
        /** Global floor so the camera is not opened twice at once. */
        private const val PHOTO_GLOBAL_MIN_GAP_MS = 800L
        @Volatile private var lastPhotoRequestMs = 0L
        private val lastPhotoByEvent = java.util.concurrent.ConcurrentHashMap<String, Long>()
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
                val now = System.currentTimeMillis()
                val key = eventName.uppercase(java.util.Locale.US)
                if (SelfieVaultPackager.isNoSelfieEvent(key)) {
                    Log.d(TAG, "requestPhoto skipped for $eventName (no-selfie event)")
                    return
                }
                if (!DeviceTrackingPrefs.mayCaptureSelfies(context)) {
                    Log.d(TAG, "requestPhoto skipped for $eventName (Premium+ + selfie sync required)")
                    return
                }
                val critical = key.contains("SIM") || key.contains("WRONG") || key.contains("USB") ||
                    key.contains("FACTORY") || key.contains("PANIC")
                val minGapMs = if (critical) PHOTO_DEBOUNCE_CRITICAL_MS else PHOTO_DEBOUNCE_MS
                val lastForEvent = lastPhotoByEvent[key] ?: 0L
                if (now - lastForEvent < minGapMs) {
                    Log.d(TAG, "requestPhoto debounced for event: $eventName")
                    return
                }
                if (now - lastPhotoRequestMs < PHOTO_GLOBAL_MIN_GAP_MS) {
                    Log.d(TAG, "requestPhoto global camera gap for event: $eventName")
                    return
                }
                lastPhotoByEvent[key] = now
                lastPhotoRequestMs = now
                Log.d(TAG, "requestPhoto triggered for event: $eventName")

                // Prefer service-only capture to avoid minimizing the app the user is on.
                val svc = Intent(context, MrpMonitorService::class.java).apply {
                    action = ACTION_REQUEST_PHOTO
                    putExtra("eventName", eventName)
                }
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(svc)
                    } else {
                        @Suppress("DEPRECATION")
                        context.startService(svc)
                    }
                    Log.d(TAG, "requestPhoto via foreground service for $eventName")
                    return
                } catch (e: Exception) {
                    Log.w(TAG, "startForegroundService for photo failed", e)
                }

                // Last resort only on lock screen / OEM restrictions.
                val keyguardLocked = try {
                    val km = context.getSystemService(Context.KEYGUARD_SERVICE) as? android.app.KeyguardManager
                    km?.isKeyguardLocked == true
                } catch (_: Exception) {
                    false
                }
                if (!keyguardLocked) {
                    Log.w(TAG, "requestPhoto skipped activity fallback to avoid stealing foreground app")
                    return
                }

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
                Log.d(TAG, "Launched CameraCaptureActivity fallback for locked device event: $eventName")
            } catch (e: Exception) {
                Log.e(TAG, "All camera launch attempts failed", e)
            }
        }

        /** True when MRP's UI process is foreground (user is looking at the app). */
        private fun isMrpUiInForeground(context: Context): Boolean {
            return try {
                val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? android.app.ActivityManager
                    ?: return false
                @Suppress("DEPRECATION")
                val procs = am.runningAppProcesses ?: return false
                val pkg = context.packageName
                procs.any {
                    it.processName == pkg &&
                        it.importance == android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
                }
            } catch (_: Exception) {
                false
            }
        }
    }
}