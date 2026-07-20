package com.mrp.domain.usecase

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.core.app.ActivityCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Wi‑Fi → cellular → GPS location cascade with process-wide cache.
 *
 * Battery rule: never jump to HIGH_ACCURACY GPS until cheaper tiers fail
 * (except severity that explicitly allows GPS as last resort).
 *
 * Logs decisions under tag [TAG_BATTERY] for before/after drain comparison.
 */
object LocationResolver {

    const val TAG_BATTERY = "MrpBattery"
    private const val TAG = "LocationResolver"

    /** Fresh cache window — avoid re-awakening radios. */
    const val CACHE_MAX_AGE_MS = 90_000L

    /** Stale threshold for security events before allowing GPS. */
    const val SECURITY_STALE_MS = 120_000L

    private const val WIFI_TIMEOUT_MS = 3_500L
    private const val CELL_TIMEOUT_MS = 4_500L
    private const val GPS_TIMEOUT_UI_MS = 8_000L
    private const val GPS_TIMEOUT_SECURITY_MS = 12_000L
    private const val GPS_TIMEOUT_SIM_MS = 15_000L

    enum class Severity {
        /** Timeline toggles / screen lock — never force GPS. */
        INFORMATIONAL,
        /** Home current location. */
        UI,
        /** Wrong unlock, USB. */
        SECURITY,
        /** SIM change recovery SMS. */
        SIM_RECOVERY
    }

    data class ResolvedLocation(
        val location: Location,
        val tier: String,
        val cacheHit: Boolean,
        val durationMs: Long,
        val provider: String
    )

    @Volatile
    private var cached: Location? = null

    @Volatile
    private var cachedAtElapsed: Long = 0L

    @Volatile
    private var cachedTier: String = "none"

    fun peekCache(): Location? {
        val loc = cached ?: return null
        val age = SystemClock.elapsedRealtime() - cachedAtElapsed
        return if (age <= CACHE_MAX_AGE_MS) loc else null
    }

    fun updateCache(location: Location, tier: String) {
        cached = location
        cachedAtElapsed = SystemClock.elapsedRealtime()
        cachedTier = tier
    }

    /**
     * Blocking resolve for receivers / sync loggers.
     * Safe to call off the main thread; uses short latches for fused APIs.
     */
    @SuppressLint("MissingPermission")
    fun resolveSync(context: Context, severity: Severity): ResolvedLocation? {
        val start = SystemClock.elapsedRealtime()
        if (!hasPermission(context)) {
            logBattery(severity, "denied", cacheHit = false, durationMs = 0, provider = "none")
            return null
        }

        // 0) Process cache
        peekCache()?.let { loc ->
            val age = SystemClock.elapsedRealtime() - cachedAtElapsed
            val resolved = ResolvedLocation(
                location = loc,
                tier = "cache",
                cacheHit = true,
                durationMs = SystemClock.elapsedRealtime() - start,
                provider = loc.provider ?: cachedTier
            )
            logBattery(severity, "cache", cacheHit = true, durationMs = resolved.durationMs, provider = resolved.provider, extra = "ageMs=$age")
            return resolved
        }

        val wifi = isWifiConnected(context)
        val cellular = isCellularAvailable(context)

        // 1) Wi‑Fi tier
        if (wifi) {
            val wifiLoc = requestFused(context, Priority.PRIORITY_LOW_POWER, WIFI_TIMEOUT_MS)
            if (wifiLoc != null) {
                return finish(context, wifiLoc, "wifi", start, severity)
            }
        }

        // 2) Cellular / balanced network tier
        if (cellular || (!wifi && hasAnyNetwork(context))) {
            val cellLoc = requestFused(context, Priority.PRIORITY_BALANCED_POWER_ACCURACY, CELL_TIMEOUT_MS)
            if (cellLoc != null) {
                return finish(context, cellLoc, "cell", start, severity)
            }
        }

        // Soft last-known (any provider) before GPS
        val lastKnown = getLastKnownAny(context)
        if (lastKnown != null) {
            val age = System.currentTimeMillis() - lastKnown.time
            val allowAsFinal = severity == Severity.INFORMATIONAL ||
                (severity != Severity.SIM_RECOVERY && age < SECURITY_STALE_MS)
            if (allowAsFinal || !shouldAttemptGps(severity)) {
                return finish(context, lastKnown, "last_known", start, severity)
            }
        }

        // 3) GPS last — only when severity allows
        if (shouldAttemptGps(severity)) {
            val gpsTimeout = when (severity) {
                Severity.UI -> GPS_TIMEOUT_UI_MS
                Severity.SECURITY -> GPS_TIMEOUT_SECURITY_MS
                Severity.SIM_RECOVERY -> GPS_TIMEOUT_SIM_MS
                Severity.INFORMATIONAL -> 0L
            }
            if (gpsTimeout > 0) {
                val gpsLoc = requestFused(context, Priority.PRIORITY_HIGH_ACCURACY, gpsTimeout)
                    ?: requestGpsProvider(context, gpsTimeout.coerceAtMost(8_000L))
                if (gpsLoc != null) {
                    return finish(context, gpsLoc, "gps", start, severity)
                }
            }
        }

        // Absolute fallback
        if (lastKnown != null) {
            return finish(context, lastKnown, "last_known", start, severity)
        }

        val duration = SystemClock.elapsedRealtime() - start
        logBattery(severity, "none", cacheHit = false, durationMs = duration, provider = "none")
        return null
    }

    private fun finish(
        context: Context,
        location: Location,
        tier: String,
        startElapsed: Long,
        severity: Severity
    ): ResolvedLocation {
        updateCache(location, tier)
        val duration = SystemClock.elapsedRealtime() - startElapsed
        val resolved = ResolvedLocation(
            location = location,
            tier = tier,
            cacheHit = false,
            durationMs = duration,
            provider = location.provider ?: tier
        )
        logBattery(
            severity,
            tier,
            cacheHit = false,
            durationMs = duration,
            provider = resolved.provider,
            extra = "acc=${location.accuracy}"
        )
        return resolved
    }

    private fun shouldAttemptGps(severity: Severity): Boolean =
        severity == Severity.UI || severity == Severity.SECURITY || severity == Severity.SIM_RECOVERY

    private fun logBattery(
        severity: Severity,
        tier: String,
        cacheHit: Boolean,
        durationMs: Long,
        provider: String,
        extra: String = ""
    ) {
        val suffix = if (extra.isNotBlank()) " $extra" else ""
        Log.i(
            TAG_BATTERY,
            "location severity=$severity tier=$tier cacheHit=$cacheHit durationMs=$durationMs provider=$provider$suffix"
        )
    }

    fun isWifiConnected(context: Context): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val network = cm.activeNetwork ?: return false
            val caps = cm.getNetworkCapabilities(network) ?: return false
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
        } catch (_: Exception) {
            false
        }
    }

    fun isCellularAvailable(context: Context): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val network = cm.activeNetwork ?: return false
            val caps = cm.getNetworkCapabilities(network) ?: return false
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
        } catch (_: Exception) {
            false
        }
    }

    fun hasAnyNetwork(context: Context): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val network = cm.activeNetwork ?: return false
            val caps = cm.getNetworkCapabilities(network) ?: return false
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } catch (_: Exception) {
            false
        }
    }

    /** Prefer Wi‑Fi for geocode; callers can skip when offline. */
    fun shouldGeocodeNow(context: Context): Boolean {
        return isWifiConnected(context) || isCellularAvailable(context)
    }

    @SuppressLint("MissingPermission")
    private fun requestFused(context: Context, priority: Int, timeoutMs: Long): Location? {
        return try {
            val fused = LocationServices.getFusedLocationProviderClient(context)
            val latch = CountDownLatch(1)
            val ref = AtomicReference<Location?>(null)
            val cts = CancellationTokenSource()
            fused.getCurrentLocation(priority, cts.token)
                .addOnSuccessListener { loc ->
                    ref.set(loc)
                    latch.countDown()
                }
                .addOnFailureListener {
                    latch.countDown()
                }
            val ok = latch.await(timeoutMs, TimeUnit.MILLISECONDS)
            if (!ok) {
                try { cts.cancel() } catch (_: Exception) {}
            }
            ref.get()
        } catch (e: Exception) {
            Log.w(TAG, "requestFused priority=$priority failed", e)
            null
        }
    }

    @SuppressLint("MissingPermission")
    private fun requestGpsProvider(context: Context, timeoutMs: Long): Location? {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        if (!lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) return null
        return try {
            val latch = CountDownLatch(1)
            val ref = AtomicReference<Location?>(null)
            val listener = object : android.location.LocationListener {
                override fun onLocationChanged(location: Location) {
                    ref.set(location)
                    try { lm.removeUpdates(this) } catch (_: Exception) {}
                    latch.countDown()
                }
                @Deprecated("Deprecated in Java")
                override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) {}
                override fun onProviderEnabled(provider: String) {}
                override fun onProviderDisabled(provider: String) {}
            }
            lm.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                0L,
                0f,
                listener,
                Looper.getMainLooper()
            )
            latch.await(timeoutMs, TimeUnit.MILLISECONDS)
            try { lm.removeUpdates(listener) } catch (_: Exception) {}
            ref.get()
        } catch (e: Exception) {
            Log.w(TAG, "requestGpsProvider failed", e)
            null
        }
    }

    @SuppressLint("MissingPermission")
    private fun getLastKnownAny(context: Context): Location? {
        return try {
            val fused = LocationServices.getFusedLocationProviderClient(context)
            val latch = CountDownLatch(1)
            val ref = AtomicReference<Location?>(null)
            fused.lastLocation
                .addOnSuccessListener { loc ->
                    ref.set(loc)
                    latch.countDown()
                }
                .addOnFailureListener { latch.countDown() }
            latch.await(2, TimeUnit.SECONDS)
            var best = ref.get()
            val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            for (provider in listOf(
                LocationManager.NETWORK_PROVIDER,
                LocationManager.GPS_PROVIDER,
                LocationManager.PASSIVE_PROVIDER
            )) {
                try {
                    if (!lm.isProviderEnabled(provider) && provider != LocationManager.PASSIVE_PROVIDER) continue
                    val loc = lm.getLastKnownLocation(provider) ?: continue
                    if (best == null || loc.time > best.time) best = loc
                } catch (_: Exception) {
                }
            }
            best
        } catch (_: Exception) {
            null
        }
    }

    private fun hasPermission(context: Context): Boolean {
        return ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
    }

    /** Map timeline event types to cascade severity. */
    fun severityForEvent(eventType: String): Severity {
        return when (eventType.uppercase()) {
            "WRONG_PASSWORD", "WRONG_BIOMETRIC", "WRONG_UNLOCK_ATTEMPT", "UNLOCK_FAILED",
            "USB_CONNECTED", "USB_DISCONNECTED", "FACTORY_RESET" -> Severity.SECURITY
            "SIM_REMOVED", "SIM_INSERTED", "SIM_CHANGE" -> Severity.SIM_RECOVERY
            else -> Severity.INFORMATIONAL
        }
    }
}
