package com.mrp.domain.usecase

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import android.provider.Settings
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.ActivityCompat
import com.mrp.data.local.EventDao
import com.mrp.data.local.SimRecoveryStorage
import com.mrp.domain.model.GpsCapture
import com.mrp.domain.model.GpsFixStatus
import com.mrp.domain.model.SimIdentity
import com.mrp.util.SmsGuard
import java.util.Locale
import java.util.TimeZone

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
 * Offline-first location capture for SIM recovery SMS.
 * Uses [LocationResolver] cascade (cache → Wi‑Fi → cell → GPS last, capped 10–15s).
 * Always returns a [GpsCapture]; NoFix still allows SMS to send.
 */
class CaptureOfflineGnssUseCase(private val context: Context) {

    /** Cap ignored above 15s — cascade already bounds GPS wait. */
    fun captureSync(maxWaitMs: Long = 15_000L): GpsCapture {
        return capture(maxWaitMs)
    }

    fun capture(maxWaitMs: Long = 15_000L): GpsCapture {
        val resolved = try {
            LocationResolver.resolveSync(context, LocationResolver.Severity.SIM_RECOVERY)
        } catch (e: Exception) {
            Log.w(TAG, "LocationResolver failed", e)
            null
        }

        if (resolved != null) {
            val loc = resolved.location
            val status = when (resolved.tier) {
                "cache" -> GpsFixStatus.FreshFix
                "wifi", "cell" ->
                    if (isFresh(loc)) GpsFixStatus.FreshFix else GpsFixStatus.WarmFix
                "gps" -> GpsFixStatus.WarmFix
                "last_known" -> GpsFixStatus.LastKnown
                else -> GpsFixStatus.WarmFix
            }
            Log.i(
                LocationResolver.TAG_BATTERY,
                "sim_gnss tier=${resolved.tier} cacheHit=${resolved.cacheHit} " +
                    "durationMs=${resolved.durationMs} provider=${resolved.provider} " +
                    "maxWaitMs=$maxWaitMs fix=$status"
            )
            return GpsCapture(
                latitude = loc.latitude,
                longitude = loc.longitude,
                accuracy = loc.accuracy,
                altitude = loc.altitude,
                bearing = loc.bearing,
                speed = loc.speed,
                provider = resolved.provider,
                timestampMs = loc.time,
                fixStatus = status
            )
        }

        return cachedOrNoFix()
    }

    private fun cachedOrNoFix(): GpsCapture {
        return try {
            val cached = EventDao(context).getLastKnownLocation()
            if (cached != null) {
                Log.i(LocationResolver.TAG_BATTERY, "sim_gnss tier=cached_db fix=Cached")
                GpsCapture(
                    latitude = cached.first,
                    longitude = cached.second,
                    provider = "cached_db",
                    fixStatus = GpsFixStatus.Cached,
                    timestampMs = System.currentTimeMillis()
                )
            } else {
                Log.i(LocationResolver.TAG_BATTERY, "sim_gnss tier=none fix=NoFix")
                GpsCapture(fixStatus = GpsFixStatus.NoFix)
            }
        } catch (_: Exception) {
            GpsCapture(fixStatus = GpsFixStatus.NoFix)
        }
    }

    private fun isFresh(loc: Location): Boolean =
        System.currentTimeMillis() - loc.time < 60_000L

    companion object {
        private const val TAG = "CaptureOfflineGnss"
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

    fun sendToAll(message: String, phones: List<String>, purpose: SmsGuard.Purpose): Pair<Int, Int> {
        if (!SmsGuard.beginSend(purpose)) {
            return 0 to phones.size
        }
        try {
            var sent = 0
            var failed = 0
            if (ActivityCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                Log.w(TAG, "SEND_SMS not granted")
                return 0 to phones.size
            }
            SmsGuard.assertAllowed(purpose)
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
                    SmsGuard.assertAllowed(purpose)
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
        } finally {
            SmsGuard.endSend()
        }
    }

    companion object {
        private const val TAG = "SendSimChangeSms"
    }
}
