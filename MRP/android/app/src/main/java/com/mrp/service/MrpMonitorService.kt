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
import com.mrp.presentation.admin.MrpDeviceAdminReceiver
import com.mrp.util.OemBatteryMitigation
import java.io.File
import java.io.FileOutputStream
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

    // Track states for change detection
    private var lastScreenState: Boolean? = null
    private var lastAirplaneState: Boolean? = null
    private var lastWifiState: Int? = null
    private var lastMobileDataState: Boolean? = null
    private var lastHotspotState: Boolean? = null
    private var lastBluetoothState: Boolean? = null

    // Handler for delayed tasks
    private val handler = Handler(Looper.getMainLooper())

    // Unified hardware receiver - handles all hardware events
    private val unifiedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val action = intent?.action ?: return
            Log.d(TAG, "Hardware event: $action")

            evaluateAllToggles()

            when (action) {
                ACTION_REQUEST_PHOTO -> {
                    wakeUpDevice()
                    takePhoto()
                }
                Intent.ACTION_SCREEN_OFF -> {
                    handleScreenOff()
                }
                Intent.ACTION_USER_PRESENT -> {
                    handleUserUnlocked()
                    wakeUpDevice()
                    takePhoto()
                }
                WifiManager.WIFI_STATE_CHANGED_ACTION -> {
                    val state = intent.getIntExtra(WifiManager.EXTRA_WIFI_STATE, WifiManager.WIFI_STATE_UNKNOWN)
                    if (state == WifiManager.WIFI_STATE_ENABLED) {
                        handleWifiChangeExplicit(true)
                    } else if (state == WifiManager.WIFI_STATE_DISABLED) {
                        handleWifiChangeExplicit(false)
                    }
                }
                BluetoothAdapter.ACTION_STATE_CHANGED -> {
                    val state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                    if (state == BluetoothAdapter.STATE_ON) {
                        handleBluetoothChangeExplicit(true)
                    } else if (state == BluetoothAdapter.STATE_OFF) {
                        handleBluetoothChangeExplicit(false)
                    }
                }
                Intent.ACTION_AIRPLANE_MODE_CHANGED -> {
                    val isAirplaneOn = intent.getBooleanExtra("state", false)
                    handleAirplaneChangeExplicit(isAirplaneOn)
                }
                "android.net.wifi.WIFI_AP_STATE_CHANGED" -> {
                    val state = intent.getIntExtra("wifi_ap_state", -1)
                    handleHotspotChange(state)
                }
            }
        }
    }

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            super.onAvailable(network)
            Log.d(TAG, "Network available")
            evaluateAllToggles()
        }

        override fun onLost(network: Network) {
            super.onLost(network)
            Log.d(TAG, "Network lost")
            evaluateAllToggles()
        }

        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
            super.onCapabilitiesChanged(network, capabilities)
            Log.d(TAG, "Network capabilities changed")
            evaluateAllToggles()
        }
    }

    private val settingsObserver = object : ContentObserver(handler) {
        override fun onChange(selfChange: Boolean) {
            super.onChange(selfChange)
            Log.d(TAG, "Settings content observer fired")
            evaluateAllToggles()
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service onCreate")

        timelineStorage = TimelineStorage(this)
        settingsStorage = SettingsStorage(this)
        eventLogger = TimelineEventLogger(this)
        locationHelper = LocationHelper(this)

        initializeInitialToggleStates()

        startBackgroundThread()
        createNotificationChannel()
        registerReceivers()
        checkBatteryOptimization()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Service onStartCommand")

        val notification = createNotification()
        startForegroundSafe(notification)
        isRunning = true

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
                addAction("android.net.conn.CONNECTIVITY_CHANGE")
            }

            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                Context.RECEIVER_EXPORTED
            } else {
                0
            }
            registerReceiver(unifiedReceiver, filter, flags)

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
        eventLogger.logEventSync(EventTypes.SCREEN_LOCK, StatusValues.LOCKED)
    }

    private fun handleUserUnlocked() {
        if (!isMonitoringEnabled()) return
        eventLogger.logEventSync(EventTypes.SCREEN_UNLOCK, StatusValues.UNLOCKED)
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
                val isWifiOn = wifiManager.isWifiEnabled
                val prevWifi = lastWifiState
                lastWifiState = if (isWifiOn) 1 else 0
                if (prevWifi != null && prevWifi != (if (isWifiOn) 1 else 0)) {
                    Log.d(TAG, "evaluateAllToggles: Wi-Fi changed to $isWifiOn")
                    eventLogger.logEventSync(
                        EventTypes.WIFI_TOGGLE,
                        if (isWifiOn) StatusValues.ENABLED else StatusValues.DISABLED
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking Wi-Fi state", e)
            }
        }

        // 2. Mobile Data
        if (settings.captureOnMobileData) {
            try {
                val tm = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
                val isMobileOn = tm.isDataEnabled
                val prevMobile = lastMobileDataState
                lastMobileDataState = isMobileOn
                if (prevMobile != null && prevMobile != isMobileOn) {
                    Log.d(TAG, "evaluateAllToggles: Mobile Data changed to $isMobileOn")
                    eventLogger.logEventSync(
                        EventTypes.MOBILE_DATA_TOGGLE,
                        if (isMobileOn) StatusValues.ENABLED else StatusValues.DISABLED
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking Mobile Data state", e)
            }
        }

        // 3. Airplane Mode
        if (settings.captureOnAirplaneMode) {
            try {
                val isAirplaneOn = Settings.Global.getInt(
                    contentResolver,
                    Settings.Global.AIRPLANE_MODE_ON,
                    0
                ) != 0
                val prevAirplane = lastAirplaneState
                lastAirplaneState = isAirplaneOn
                if (prevAirplane != null && prevAirplane != isAirplaneOn) {
                    Log.d(TAG, "evaluateAllToggles: Airplane Mode changed to $isAirplaneOn")
                    eventLogger.logEventSync(
                        EventTypes.AIRPLANE_MODE_TOGGLE,
                        if (isAirplaneOn) StatusValues.ENABLED else StatusValues.DISABLED
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking Airplane Mode state", e)
            }
        }

        // 4. Bluetooth
        // 4. Bluetooth
        if (settings.captureOnBluetooth) {
            try {
                val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()
                if (bluetoothAdapter != null) {
                    val isBluetoothOn = bluetoothAdapter.isEnabled
                    val prevBluetooth = lastBluetoothState
                    lastBluetoothState = isBluetoothOn
                    if (prevBluetooth != null && prevBluetooth != isBluetoothOn) {
                        Log.d(TAG, "evaluateAllToggles: Bluetooth changed to $isBluetoothOn")
                        eventLogger.logEventSync(
                            EventTypes.BLUETOOTH_TOGGLE,
                            if (isBluetoothOn) StatusValues.ENABLED else StatusValues.DISABLED
                        )
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking Bluetooth state", e)
            }
        }

        // 5. Hotspot
        if (settings.captureOnHotspot) {
            try {
                val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                val isHotspotOn = isHotspotEnabled(wifiManager)
                val prevHotspot = lastHotspotState
                lastHotspotState = isHotspotOn
                if (prevHotspot != null && prevHotspot != isHotspotOn) {
                    Log.d(TAG, "evaluateAllToggles: Hotspot changed to $isHotspotOn")
                    eventLogger.logEventSync(
                        EventTypes.HOTSPOT_TOGGLE,
                        if (isHotspotOn) StatusValues.ENABLED else StatusValues.DISABLED
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking Hotspot state", e)
            }
        }
    }

    private fun handleHotspotChange(state: Int) {
        if (!isMonitoringEnabled() || !settingsStorage.getSettings().captureOnHotspot) return
        // 13 or 3 = ENABLED, 11 or 1 = DISABLED
        val isEnabled = (state == 13 || state == 3)
        val isDisabled = (state == 11 || state == 1)
        if (!isEnabled && !isDisabled) return

        val previous = lastHotspotState
        lastHotspotState = isEnabled

        if (previous != null && previous == isEnabled) return

        Log.d(TAG, "Hotspot state changed: $state, isEnabled: $isEnabled")
        eventLogger.logEventSync(
            EventTypes.HOTSPOT_TOGGLE,
            if (isEnabled) StatusValues.ENABLED else StatusValues.DISABLED
        )
    }

    private fun handleWifiChangeExplicit(isWifiOn: Boolean) {
        if (!isMonitoringEnabled()) return
        val settings = try { settingsStorage.getSettings() } catch (e: Exception) { return }
        if (!settings.captureOnWifiToggle) return

        val prev = lastWifiState
        val current = if (isWifiOn) 1 else 0
        lastWifiState = current

        if (prev == null || prev != current) {
            Log.d(TAG, "Explicit Wi-Fi changed to $isWifiOn")
            eventLogger.logEventSync(
                EventTypes.WIFI_TOGGLE,
                if (isWifiOn) StatusValues.ENABLED else StatusValues.DISABLED
            )
        }
    }

    private fun handleBluetoothChangeExplicit(isBluetoothOn: Boolean) {
        if (!isMonitoringEnabled()) return
        val settings = try { settingsStorage.getSettings() } catch (e: Exception) { return }
        if (!settings.captureOnBluetooth) return

        val prev = lastBluetoothState
        lastBluetoothState = isBluetoothOn

        if (prev == null || prev != isBluetoothOn) {
            Log.d(TAG, "Explicit Bluetooth changed to $isBluetoothOn")
            eventLogger.logEventSync(
                EventTypes.BLUETOOTH_TOGGLE,
                if (isBluetoothOn) StatusValues.ENABLED else StatusValues.DISABLED
            )
        }
    }

    private fun handleAirplaneChangeExplicit(isAirplaneOn: Boolean) {
        if (!isMonitoringEnabled()) return
        val settings = try { settingsStorage.getSettings() } catch (e: Exception) { return }
        if (!settings.captureOnAirplaneMode) return

        val prev = lastAirplaneState
        lastAirplaneState = isAirplaneOn

        if (prev == null || prev != isAirplaneOn) {
            Log.d(TAG, "Explicit Airplane Mode changed to $isAirplaneOn")
            eventLogger.logEventSync(
                EventTypes.AIRPLANE_MODE_TOGGLE,
                if (isAirplaneOn) StatusValues.ENABLED else StatusValues.DISABLED
            )
        }
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

    @SuppressLint("MissingPermission")
    private fun openCamera() {
        // Check permission first before doing any camera operations
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Camera permission not granted, skipping camera open")
            return
        }

        updateForegroundServiceTypes()

        val cameraManager = getSystemService(Context.CAMERA_SERVICE) as CameraManager
        try {
            val cameraId = getFrontCameraId(cameraManager) ?: run {
                Log.e(TAG, "No front camera found")
                return
            }

            // Clean up any existing camera resources first
            closeCamera()

            imageReader = ImageReader.newInstance(640, 480, ImageFormat.JPEG, 2).apply {
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
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    Log.e(TAG, "Camera error: $error")
                    camera.close()
                    cameraDevice = null
                }
            }, backgroundHandler)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open camera", e)
            closeCamera()
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
            val captureRequestBuilder = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE)
            captureRequestBuilder.addTarget(surface)
            captureRequestBuilder.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)

            camera.createCaptureSession(
                listOf(surface),
                object : CameraCaptureSession.StateCallback() {
                    override fun onConfigured(session: CameraCaptureSession) {
                        captureSession = session
                        Log.d(TAG, "Capture session configured")
                    }

                    override fun onConfigureFailed(session: CameraCaptureSession) {
                        Log.e(TAG, "Capture session configuration failed")
                    }
                },
                backgroundHandler
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create capture session", e)
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

    fun takePhoto() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Camera permission not granted, skipping photo capture")
            return
        }

        val camera = cameraDevice
        val session = captureSession
        val reader = imageReader
        val handler = backgroundHandler

        if (camera == null || session == null || reader == null || handler == null) {
            Log.w(TAG, "Camera not ready, reopening...")
            closeCamera()
            backgroundHandler?.postDelayed({
                openCamera()
            }, 500)
            return
        }

        try {
            val captureBuilder = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE)
            captureBuilder.addTarget(reader.surface)
            captureBuilder.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
            captureBuilder.set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_OFF)

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
        val photoFile = File(photosDir, "intruder_$timestamp.jpg")

        try {
            val buffer = image.planes[0].buffer
            val bytes = ByteArray(buffer.remaining())
            buffer.get(bytes)
            FileOutputStream(photoFile).use { fos ->
                fos.write(bytes)
            }
            Log.d(TAG, "Photo saved: ${photoFile.path}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save photo", e)
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

        fun requestPhoto(context: Context) {
            val intent = Intent(ACTION_REQUEST_PHOTO)
            intent.setPackage(context.packageName)
            context.sendBroadcast(intent)
        }
    }
}