package com.mrp.domain.usecase

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.provider.Settings
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.ActivityCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.mrp.data.local.EventDao
import com.mrp.data.local.SimRecoveryStorage
import com.mrp.domain.model.GpsCapture
import com.mrp.domain.model.GpsFixStatus
import com.mrp.domain.model.SimIdentity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.coroutines.resume

/**
 * Reads current SIM identity and compares against encrypted baseline.
 */
class SimIdentityTracker(private val context: Context) {

    private val storage = SimRecoveryStorage(context)

    @SuppressLint("MissingPermission", "HardwareIds")
    fun readCurrentIdentity(): SimIdentity {
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
        var iccid = ""
        var subscriptionId = -1
        var carrier = tm?.simOperatorName?.ifEmpty { tm.networkOperatorName } ?: ""
        var simSlot = -1
        var phoneNumber = ""
        var imsi = ""

        try {
            if (hasPhonePermission()) {
                val sm = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
                val active = sm?.activeSubscriptionInfoList
                if (!active.isNullOrEmpty()) {
                    // Prefer default data / voice subscription; fall back to first
                    val defaultSubId = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        SubscriptionManager.getDefaultSubscriptionId()
                    } else {
                        -1
                    }
                    val info = active.firstOrNull { it.subscriptionId == defaultSubId } ?: active[0]
                    subscriptionId = info.subscriptionId
                    simSlot = info.simSlotIndex
                    carrier = info.carrierName?.toString()
                        ?: info.displayName?.toString()
                        ?: carrier
                    iccid = try {
                        info.iccId ?: ""
                    } catch (_: SecurityException) {
                        ""
                    }
                    phoneNumber = readPhoneForSubscription(sm, tm, info.subscriptionId, info)
                    // Scan all SIMs if still blank
                    if (phoneNumber.isBlank()) {
                        for (other in active) {
                            val n = readPhoneForSubscription(sm, tm, other.subscriptionId, other)
                            if (n.isNotBlank()) {
                                phoneNumber = n
                                break
                            }
                        }
                    }
                }
                if (phoneNumber.isBlank()) {
                    try {
                        @Suppress("DEPRECATION")
                        phoneNumber = tm?.line1Number?.trim().orEmpty()
                    } catch (_: Exception) { /* restricted */ }
                }
                try {
                    @Suppress("DEPRECATION")
                    if (tm?.simSerialNumber != null && iccid.isBlank()) {
                        iccid = tm.simSerialNumber ?: ""
                    }
                } catch (_: Exception) { /* restricted on newer APIs */ }
                try {
                    @Suppress("DEPRECATION")
                    imsi = tm?.subscriberId ?: ""
                } catch (_: Exception) { /* restricted */ }
            }
        } catch (e: Exception) {
            Log.w(TAG, "SIM identity read partially failed", e)
        }

        // Fall back to user-registered device number removed — use live SIM MSISDN only
        return SimIdentity(
            iccid = iccid,
            subscriptionId = subscriptionId,
            carrier = carrier.ifBlank { "Unknown" },
            simSlot = simSlot,
            phoneNumber = phoneNumber,
            imsi = imsi
        )
    }

    @SuppressLint("MissingPermission")
    private fun readPhoneForSubscription(
        sm: SubscriptionManager?,
        tm: TelephonyManager?,
        subId: Int,
        info: android.telephony.SubscriptionInfo
    ): String {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && sm != null) {
                val n = sm.getPhoneNumber(subId)?.trim().orEmpty()
                if (n.isNotBlank()) return n
            }
        } catch (_: Exception) { /* ignore */ }
        try {
            @Suppress("DEPRECATION")
            val n = info.number?.trim().orEmpty()
            if (n.isNotBlank()) return n
        } catch (_: Exception) { /* ignore */ }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && tm != null && subId >= 0) {
                val subTm = tm.createForSubscriptionId(subId)
                @Suppress("DEPRECATION")
                val n = subTm.line1Number?.trim().orEmpty()
                if (n.isNotBlank()) return n
            }
        } catch (_: Exception) { /* ignore */ }
        return ""
    }

    fun enrollBaseline(identity: SimIdentity = readCurrentIdentity()) {
        storage.setBaseline(identity)
        Log.d(TAG, "SIM baseline enrolled (carrier=${identity.carrier}, slot=${identity.simSlot})")
    }

    fun getBaseline(): SimIdentity? = storage.getBaseline()

    /** Returns true when current SIM differs from enrolled baseline. */
    fun hasChanged(): Boolean {
        val baseline = storage.getBaseline() ?: return false
        val current = readCurrentIdentity()
        // No SIM present — treat as change only if we had a real baseline ICCID/sub
        if (current.subscriptionId < 0 && current.iccid.isBlank() &&
            baseline.subscriptionId < 0 && baseline.iccid.isBlank()
        ) {
            return false
        }
        return current.differsFrom(baseline)
    }

    private fun hasPhonePermission(): Boolean {
        val stateOk = ActivityCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) ==
            PackageManager.PERMISSION_GRANTED
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val numbersOk = ActivityCompat.checkSelfPermission(
                context,
                Manifest.permission.READ_PHONE_NUMBERS
            ) == PackageManager.PERMISSION_GRANTED
            // Either grants access to subscription phone APIs on modern Android
            return stateOk || numbersOk
        }
        return stateOk
    }

    companion object {
        private const val TAG = "SimIdentityTracker"
    }
}

/**
 * Offline-first GNSS capture with FixStatus.
 * Fresh (≤30s) → LocationManager GPS → last known → DB cached → NoFix
 */
class CaptureOfflineGnssUseCase(private val context: Context) {

    private val fused = LocationServices.getFusedLocationProviderClient(context)
    private val locationManager =
        context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    fun captureSync(maxWaitMs: Long = 30_000L): GpsCapture {
        return runBlocking(Dispatchers.IO) {
            capture(maxWaitMs)
        }
    }

    suspend fun capture(maxWaitMs: Long = 30_000L): GpsCapture {
        if (!hasPermission()) {
            return cachedOrNoFix()
        }

        // 1) Fresh fused high-accuracy
        val fresh = withTimeoutOrNull(maxWaitMs) { requestFreshFused() }
        if (fresh != null) {
            return toCapture(fresh, if (isFresh(fresh)) GpsFixStatus.FreshFix else GpsFixStatus.WarmFix)
        }

        // 2) GPS provider via LocationManager
        val gpsLoc = withTimeoutOrNull(8_000L) { requestGpsProvider() }
        if (gpsLoc != null) {
            return toCapture(gpsLoc, GpsFixStatus.WarmFix)
        }

        // 3) Last known fused / LM
        val lastKnown = getLastKnown()
        if (lastKnown != null) {
            return toCapture(lastKnown, GpsFixStatus.LastKnown)
        }

        return cachedOrNoFix()
    }

    private fun cachedOrNoFix(): GpsCapture {
        return try {
            val cached = EventDao(context).getLastKnownLocation()
            if (cached != null) {
                GpsCapture(
                    latitude = cached.first,
                    longitude = cached.second,
                    provider = "cached_db",
                    fixStatus = GpsFixStatus.Cached,
                    timestampMs = System.currentTimeMillis()
                )
            } else {
                GpsCapture(fixStatus = GpsFixStatus.NoFix)
            }
        } catch (_: Exception) {
            GpsCapture(fixStatus = GpsFixStatus.NoFix)
        }
    }

    @SuppressLint("MissingPermission")
    private suspend fun requestFreshFused(): Location? = suspendCancellableCoroutine { cont ->
        val cts = CancellationTokenSource()
        cont.invokeOnCancellation { cts.cancel() }
        try {
            fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token)
                .addOnSuccessListener { loc -> if (cont.isActive) cont.resume(loc) }
                .addOnFailureListener { if (cont.isActive) cont.resume(null) }
        } catch (e: Exception) {
            if (cont.isActive) cont.resume(null)
        }
    }

    @SuppressLint("MissingPermission")
    private suspend fun requestGpsProvider(): Location? = suspendCancellableCoroutine { cont ->
        if (!locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            cont.resume(null)
            return@suspendCancellableCoroutine
        }
        val holder = AtomicReference<Location?>(null)
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                holder.set(location)
                try { locationManager.removeUpdates(this) } catch (_: Exception) {}
                if (cont.isActive) cont.resume(location)
            }
            @Deprecated("Deprecated in Java")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
        }
        cont.invokeOnCancellation {
            try { locationManager.removeUpdates(listener) } catch (_: Exception) {}
        }
        try {
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                0L,
                0f,
                listener,
                Looper.getMainLooper()
            )
        } catch (e: Exception) {
            if (cont.isActive) cont.resume(null)
        }
    }

    @SuppressLint("MissingPermission")
    private fun getLastKnown(): Location? {
        return try {
            val latch = CountDownLatch(1)
            val ref = AtomicReference<Location?>(null)
            fused.lastLocation
                .addOnSuccessListener { loc ->
                    ref.set(loc)
                    latch.countDown()
                }
                .addOnFailureListener { latch.countDown() }
            latch.await(2, TimeUnit.SECONDS)
            ref.get()
                ?: locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                ?: locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
        } catch (_: Exception) {
            null
        }
    }

    private fun isFresh(loc: Location): Boolean =
        System.currentTimeMillis() - loc.time < 60_000L

    private fun toCapture(loc: Location, status: GpsFixStatus) = GpsCapture(
        latitude = loc.latitude,
        longitude = loc.longitude,
        accuracy = loc.accuracy,
        altitude = loc.altitude,
        bearing = loc.bearing,
        speed = loc.speed,
        provider = loc.provider ?: "unknown",
        timestampMs = loc.time,
        fixStatus = status
    )

    private fun hasPermission(): Boolean {
        return ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
    }
}

/**
 * Builds and sends SIM-change SMS to recovery contacts.
 */
class SendSimChangeSmsUseCase(private val context: Context) {

    fun buildMessage(
        model: String,
        phoneNumber: String?,
        carrier: String,
        battery: Int,
        timestamp: String,
        lat: Double,
        lng: Double,
        deviceId: String,
        iccidMasked: String,
        hasPhone: Boolean
    ): String {
        // Phone number is mandatory in every alert. Prefer live MSISDN; caller must
        // resolve registered device number before invoking when OS returns blank.
        val numberLine = when {
            !phoneNumber.isNullOrBlank() -> phoneNumber
            else -> "Unavailable (carrier did not expose SIM number)"
        }
        return """
            ⚠ Mobile Resilience Platform
            SIM Change Detected
            Device:
            $model
            New Number:
            $numberLine
            Carrier:
            $carrier
            Battery:
            $battery%
            Time:
            $timestamp
            Latitude:
            $lat
            Longitude:
            $lng
            Google Maps
            https://maps.google.com/?q=$lat,$lng
            Device ID
            $deviceId
            ICCID:
            $iccidMasked
            """.trimIndent()
    }

    fun sendToAll(message: String, phones: List<String>): Pair<Int, Int> {
        var sent = 0
        var failed = 0
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            Log.w(TAG, "SEND_SMS not granted")
            return 0 to phones.size
        }
        val sms = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            context.getSystemService(SmsManager::class.java) ?: SmsManager.getDefault()
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getDefault()
        }
        for (raw in phones) {
            val phone = raw.trim()
            if (phone.length < 8) {
                failed++
                continue
            }
            try {
                val parts = sms.divideMessage(message)
                if (parts.size == 1) {
                    sms.sendTextMessage(phone, null, message, null, null)
                } else {
                    sms.sendMultipartTextMessage(phone, null, parts, null, null)
                }
                sent++
            } catch (e: Exception) {
                Log.e(TAG, "SMS failed (number masked)", e)
                failed++
            }
        }
        return sent to failed
    }

    companion object {
        private const val TAG = "SendSimChangeSms"
    }
}
