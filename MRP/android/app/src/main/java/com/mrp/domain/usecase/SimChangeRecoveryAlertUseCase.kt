package com.mrp.domain.usecase

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.mrp.data.local.SimRecoveryStorage
import com.mrp.util.SmsGuard
import com.mrp.domain.model.EventTypes
import com.mrp.domain.model.GpsCapture
import com.mrp.domain.model.GpsFixStatus
import com.mrp.domain.model.StatusValues
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/**
 * Orchestrates SIM change recovery:
 * detect → device info → offline GNSS → store → SMS → pending sync → timeline → notify
 */
class SimChangeRecoveryAlertUseCase(private val context: Context) {

    private val storage = SimRecoveryStorage(context)
    private val identityTracker = SimIdentityTracker(context)
    private val gnss = CaptureOfflineGnssUseCase(context)
    private val smsSender = SendSimChangeSmsUseCase(context)
    private val eventLogger = TimelineEventLogger(context)

    /**
     * Called on SIM state transitions. Handles enrollment, change detection, and alert.
     * @param simState ABSENT / READY / etc.
     * @param isInsertion true when SIM became ready
     */
    fun onSimStateChanged(simState: String, isInsertion: Boolean) {
        if (!storage.isEnabled() || !storage.hasConsent()) {
            Log.d(TAG, "SIM recovery disabled or no consent — skip")
            return
        }

        // On removal: still try to capture GPS + notify (SMS may fail without SIM)
        if (!isInsertion && (simState == "ABSENT" || simState == "NOT_READY")) {
            // Keep baseline; wait for next insert to confirm identity change
            Log.d(TAG, "SIM removed — awaiting insert for identity compare")
            notifyUser("SIM Change Detected", "SIM card removed. Waiting for new SIM…")
            return
        }

        if (!isInsertion) return

        val current = identityTracker.readCurrentIdentity()
        val baseline = identityTracker.getBaseline()

        if (baseline == null) {
            identityTracker.enrollBaseline(current)
            Log.d(TAG, "First baseline enrolled")
            return
        }

        if (!current.differsFrom(baseline)) {
            Log.d(TAG, "SIM identity unchanged")
            return
        }

        Log.d(TAG, "SIM identity CHANGE detected — starting recovery alert")
        executeAlert(previous = baseline, current = current)
        // Update baseline to new SIM so we don't re-alert until next change
        identityTracker.enrollBaseline(current)
    }

    /** Manual enroll from settings enable. */
    fun enrollNow() {
        identityTracker.enrollBaseline()
    }

    fun executeAlert(
        previous: com.mrp.domain.model.SimIdentity?,
        current: com.mrp.domain.model.SimIdentity
    ) {
        notifyUser("Waiting for GPS", "Acquiring location for SIM change alert…")

        // Cascade caps GPS at 15s; SMS always proceeds even on NoFix
        val gps = gnss.captureSync(15_000L)
        when (gps.fixStatus) {
            GpsFixStatus.FreshFix, GpsFixStatus.WarmFix ->
                eventLogger.logEvent("GPS_CAPTURED", StatusValues.ENABLED, mapOf(
                    "fix_status" to gps.fixStatus.name,
                    "provider" to gps.provider
                ))
            GpsFixStatus.LastKnown ->
                eventLogger.logEvent("GPS_LAST_KNOWN", StatusValues.ENABLED, emptyMap())
            GpsFixStatus.Cached ->
                eventLogger.logEvent("GPS_LAST_KNOWN", StatusValues.ENABLED, mapOf("source" to "cached"))
            GpsFixStatus.NoFix ->
                eventLogger.logEvent("GPS_NO_FIX", StatusValues.DISABLED, emptyMap())
        }
        if (gps.fixStatus == GpsFixStatus.NoFix) {
            // Also emit timeout-style event when fresh wait exhausted
            eventLogger.logEvent("GPS_TIMEOUT", StatusValues.DISABLED, emptyMap())
        }

        if (gps.fixStatus != GpsFixStatus.NoFix && (gps.latitude != 0.0 || gps.longitude != 0.0)) {
            GeoSnapshotWriter.enqueue(
                context = context,
                location = android.location.Location("sim_recovery").apply {
                    latitude = gps.latitude
                    longitude = gps.longitude
                    accuracy = gps.accuracy
                    altitude = gps.altitude
                    time = gps.timestampMs
                },
                locationTier = when (gps.fixStatus) {
                    GpsFixStatus.FreshFix, GpsFixStatus.WarmFix -> "gps"
                    GpsFixStatus.LastKnown -> "last_known"
                    GpsFixStatus.Cached -> "cached_db"
                    else -> "none"
                },
                provider = gps.provider,
                triggerSource = "SIM_RECOVERY",
                address = null,
                insideGeofence = false,
                geofenceId = null,
                extraMeta = mapOf("fix_status" to gps.fixStatus.name)
            )
        }

        val battery = readBattery()
        val net = readNetworkFlags()
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: ""
        val model = Build.MODEL ?: "Unknown"
        val now = System.currentTimeMillis()
        val tsFmt = SimpleDateFormat("yyyy-MM-dd HH:mm:ss z", Locale.US).apply {
            timeZone = TimeZone.getDefault()
        }.format(Date(now))

        val iccidMasked = SimRecoveryStorage.maskPhone(current.iccid.ifBlank { "0000" })
        val resolvedPhone = resolvePhoneNumber(current)
        val hasPhone = resolvedPhone.isNotBlank()
        val message = smsSender.buildMessage(
            model = model,
            phoneNumber = resolvedPhone.ifBlank { null },
            carrier = current.carrier,
            battery = battery.first,
            timestamp = tsFmt,
            lat = gps.latitude,
            lng = gps.longitude,
            deviceId = androidId,
            iccidMasked = iccidMasked,
            hasPhone = hasPhone
        )

        val contacts = storage.getContacts()
        val phones = contacts.map { it.phoneNumber }
        val (sent, failed) = if (phones.isNotEmpty()) {
            smsSender.sendToAll(message, phones, SmsGuard.Purpose.SIM_RECOVERY_ALERT)
        } else {
            0 to 0
        }

        if (sent > 0) {
            eventLogger.logEvent("SMS_SENT", StatusValues.ENABLED, mapOf("count" to sent))
            storage.setLastSmsMs(now)
            notifyUser("SMS Sent Successfully", "Recovery contacts notified of SIM change")
        }
        if (failed > 0 || (phones.isNotEmpty() && sent == 0)) {
            eventLogger.logEvent("SMS_FAILED", StatusValues.DISABLED, mapOf("failed" to failed))
            notifyUser("SMS Failed", "Could not send recovery SMS — evidence stored locally")
        }

        // Evidence summary (NO raw recovery phone numbers)
        val evidence = JSONObject().apply {
            put("id", UUID.randomUUID().toString())
            put("event", EventTypes.SIM_CHANGE)
            put("previousCarrier", previous?.carrier ?: "")
            put("currentCarrier", current.carrier)
            put("currentSlot", current.simSlot)
            put("subscriptionId", current.subscriptionId)
            put("iccidMasked", iccidMasked)
            put("phoneAvailable", hasPhone)
            put("lat", gps.latitude)
            put("lng", gps.longitude)
            put("accuracy", gps.accuracy.toDouble())
            put("fixStatus", gps.fixStatus.name)
            put("battery", battery.first)
            put("charging", battery.second)
            put("networkType", net["networkType"])
            put("internetAvailable", net["internetAvailable"])
            put("wifiEnabled", net["wifiEnabled"])
            put("mobileDataEnabled", net["mobileDataEnabled"])
            put("airplaneMode", net["airplaneMode"])
            put("gpsEnabled", net["gpsEnabled"])
            put("deviceModel", model)
            put("manufacturer", Build.MANUFACTURER ?: "")
            put("brand", Build.BRAND ?: "")
            put("androidVersion", Build.VERSION.RELEASE ?: "")
            put("androidId", androidId)
            put("timestampUtcMs", now)
            put("timezone", TimeZone.getDefault().id)
            put("locale", Locale.getDefault().toString())
            put("smsSent", sent)
            put("smsFailed", failed)
        }

        storage.appendHistory(evidence.toString())
        storage.enqueuePendingSync(evidence.toString())
        storage.setLastSimChangeMs(now)
        eventLogger.logEvent("SYNC_QUEUED", StatusValues.ENABLED, mapOf("type" to "SIM_CHANGE"))

        eventLogger.logEvent(
            eventType = EventTypes.SIM_CHANGE,
            status = StatusValues.ENABLED,
            metadata = mapOf(
                "description" to "SIM card changed — recovery alert triggered",
                "carrier" to current.carrier,
                "fix_status" to gps.fixStatus.name,
                "sms_sent" to sent,
                "iccid_masked" to iccidMasked,
                "source" to "SimChangeRecoveryAlertUseCase"
            )
        )

        notifyUser("SIM Change Detected", "New SIM: ${current.carrier}")
        if (gps.fixStatus != GpsFixStatus.NoFix) {
            notifyUser("GPS Acquired", "Fix: ${gps.fixStatus.name}")
        }
        if (!(net["internetAvailable"] as Boolean)) {
            notifyUser("Offline Mode", "Alert stored locally; SMS attempted without data")
        }
    }

    /** Test SMS to all contacts using current device state. Returns success + reason. */
    fun sendTestSmsDetailed(): Pair<Boolean, String> {
        val contacts = storage.getContacts()
        if (contacts.isEmpty()) {
            return false to "Add at least one recovery contact first."
        }
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return false to "SMS permission is not granted. Enable SMS for MRP in App Settings."
        }
        val current = identityTracker.readCurrentIdentity()
        val resolvedPhone = resolvePhoneNumber(current)
        val gps = try {
            gnss.captureSync(12_000L)
        } catch (e: Exception) {
            Log.w(TAG, "GPS for test SMS failed", e)
            GpsCapture(fixStatus = GpsFixStatus.NoFix)
        }
        val battery = readBattery()
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: ""
        val msg = smsSender.buildMessage(
            model = Build.MODEL ?: "Unknown",
            phoneNumber = resolvedPhone.ifBlank { null },
            carrier = current.carrier.ifBlank { "Unknown" },
            battery = battery.first,
            timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date()),
            lat = gps.latitude,
            lng = gps.longitude,
            deviceId = androidId,
            iccidMasked = SimRecoveryStorage.maskPhone(current.iccid.ifBlank { "0000" }),
            hasPhone = resolvedPhone.isNotBlank()
        )
        val (sent, failed) = smsSender.sendToAll(
            "[TEST]\n$msg",
            contacts.map { it.phoneNumber },
            SmsGuard.Purpose.SIM_RECOVERY_TEST
        )
        Log.i(TAG, "Test SMS result sent=$sent failed=$failed")
        if (sent > 0) {
            storage.setLastSmsMs(System.currentTimeMillis())
            val numberNote = if (resolvedPhone.isNotBlank()) "New Number included." else "New Number unavailable from carrier."
            return true to "Sent to $sent contact(s). $numberNote"
        }
        return false to if (failed > 0) {
            "SMS send failed for $failed contact(s). Check the numbers are valid."
        } else {
            "SMS send failed. Check SMS permission and contact numbers."
        }
    }

    /** @deprecated use sendTestSmsDetailed */
    fun sendTestSms(): Boolean = sendTestSmsDetailed().first

    /** Panic SMS — same pipeline as test SMS with panic prefix and timeline log. */
    fun sendPanicSmsDetailed(): Pair<Boolean, String> {
        val contacts = storage.getContacts()
        if (contacts.isEmpty()) {
            return false to "Add at least one recovery contact in Hub → SIM Recovery first."
        }
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return false to "SMS permission is not granted. Enable SMS for MRP in App Settings."
        }
        val current = identityTracker.readCurrentIdentity()
        val resolvedPhone = resolvePhoneNumber(current)
        val gps = try {
            gnss.captureSync(12_000L)
        } catch (e: Exception) {
            Log.w(TAG, "GPS for panic SMS failed", e)
            GpsCapture(fixStatus = GpsFixStatus.NoFix)
        }
        val battery = readBattery()
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: ""
        val msg = smsSender.buildMessage(
            model = Build.MODEL ?: "Unknown",
            phoneNumber = resolvedPhone.ifBlank { null },
            carrier = current.carrier.ifBlank { "Unknown" },
            battery = battery.first,
            timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date()),
            lat = gps.latitude,
            lng = gps.longitude,
            deviceId = androidId,
            iccidMasked = SimRecoveryStorage.maskPhone(current.iccid.ifBlank { "0000" }),
            hasPhone = resolvedPhone.isNotBlank()
        )
        val (sent, failed) = smsSender.sendToAll(
            "[PANIC — NEED HELP NOW]\n$msg",
            contacts.map { it.phoneNumber },
            SmsGuard.Purpose.PANIC_ALERT
        )
        Log.i(TAG, "Panic SMS result sent=$sent failed=$failed")
        try {
            TimelineEventLogger(context).logEvent(
                EventTypes.PANIC_ALERT,
                if (sent > 0) StatusValues.ENABLED else StatusValues.FAILED
            )
        } catch (e: Exception) {
            Log.w(TAG, "Panic timeline log failed", e)
        }
        if (sent > 0) {
            storage.setLastSmsMs(System.currentTimeMillis())
            return true to "Panic alert sent to $sent contact(s). Help is on the way."
        }
        return false to if (failed > 0) {
            "Panic SMS failed for $failed contact(s). Check numbers and SMS permission."
        } else {
            "Panic SMS failed. Check SMS permission and recovery contacts."
        }
    }

    /**
     * Live MSISDN from the current SIM only (requires READ_PHONE_STATE / READ_PHONE_NUMBERS).
     */
    private fun resolvePhoneNumber(current: com.mrp.domain.model.SimIdentity): String {
        return current.phoneNumber.trim()
    }

    private fun readBattery(): Pair<Int, Boolean> {
        return try {
            val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
            val pct = if (level >= 0 && scale > 0) (level * 100 / scale) else -1
            val status = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL
            pct to charging
        } catch (_: Exception) {
            -1 to false
        }
    }

    private fun readNetworkFlags(): Map<String, Any> {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val caps = cm?.getNetworkCapabilities(cm.activeNetwork)
        val internet = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        val wifi = caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
        val mobile = caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true
        val wifiEnabled = try {
            (context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager)?.isWifiEnabled == true
        } catch (_: Exception) { false }
        val airplane = Settings.Global.getInt(context.contentResolver, Settings.Global.AIRPLANE_MODE_ON, 0) == 1
        val gpsEnabled = try {
            val lm = context.getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
            lm.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER)
        } catch (_: Exception) { false }
        val type = when {
            wifi -> "WiFi"
            mobile -> "Mobile"
            else -> "None"
        }
        return mapOf(
            "networkType" to type,
            "internetAvailable" to internet,
            "wifiEnabled" to wifiEnabled,
            "mobileDataEnabled" to mobile,
            "airplaneMode" to airplane,
            "gpsEnabled" to gpsEnabled
        )
    }

    private fun notifyUser(title: String, body: String) {
        try {
            ensureChannel()
            if (Build.VERSION.SDK_INT >= 33 &&
                ActivityCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                return
            }
            val n = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .build()
            NotificationManagerCompat.from(context).notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), n)
        } catch (e: Exception) {
            Log.w(TAG, "Notification failed", e)
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = context.getSystemService(NotificationManager::class.java)
            mgr?.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "SIM Recovery Alerts", NotificationManager.IMPORTANCE_HIGH)
            )
        }
    }

    companion object {
        private const val TAG = "SimChangeRecovery"
        private const val CHANNEL_ID = "mrp_sim_recovery"
    }
}
