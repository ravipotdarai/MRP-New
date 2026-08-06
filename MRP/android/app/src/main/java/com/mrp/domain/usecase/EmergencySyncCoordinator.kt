package com.mrp.domain.usecase

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import com.mrp.data.local.DeviceConfigMirror
import com.mrp.data.local.DeviceTrackingPrefs

/**
 * Phase-1 emergency sync: lawful panic upload on USB attach, SIM loss, connectivity restore,
 * and factory-reset signals. Never attempts unauthorized Wi‑Fi access.
 */
object EmergencySyncCoordinator {

    private const val TAG = "EmergencySync"
    private const val PANIC_DEBOUNCE_MS = 15_000L
    private const val CONNECTIVITY_DEBOUNCE_MS = 60_000L

    /** Optional hook for foreground notification text (set by [MrpMonitorService]). */
    @Volatile
    var statusLineUpdater: ((String?) -> Unit)? = null

    private val lastPanicAtMs = java.util.concurrent.ConcurrentHashMap<String, Long>()

    fun onUsbAttached(context: Context) {
        if (!shouldRun(context)) return
        trigger(
            context = context,
            reason = "panic:usb_attach",
            userMessage = "USB connected — syncing vault to Drive…",
            debounceMs = PANIC_DEBOUNCE_MS
        )
    }

    fun onSimRemoved(context: Context) {
        val app = context.applicationContext
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val alreadyRemoved = prefs.getString(KEY_SIM_EMERGENCY_STATE, null) == "removed"
        if (!alreadyRemoved) {
            prefs.edit().putString(KEY_SIM_EMERGENCY_STATE, "removed").apply()
            DeviceTrackingPrefs.activateEmergencyForSimRemoval(app)
            DeviceConfigMirror.push(app)
            DevicePresenceTracker.restart(app)
            statusLineUpdater?.invoke("SIM removed — emergency tracking enabled, syncing…")
            Log.i(TAG, "emergency mode activated (SIM removed)")
        }
        trigger(
            context = context,
            reason = "panic:sim_removed",
            userMessage = "SIM removed — emergency tracking on, syncing vault…",
            debounceMs = PANIC_DEBOUNCE_MS
        )
    }

    fun onSimInserted(context: Context) {
        val app = context.applicationContext
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SIM_EMERGENCY_STATE, "inserted")
            .apply()
        if (DeviceTrackingPrefs.clearEmergencyIfSimAuto(app)) {
            DeviceConfigMirror.push(app)
            DevicePresenceTracker.restart(app)
            Log.i(TAG, "auto emergency disabled (SIM reinserted)")
        }
    }

    fun onConnectivityValidated(context: Context) {
        if (!shouldRun(context)) return
        val emergency = DeviceTrackingPrefs.isEmergencyTracking(context)
        if (!emergency && !hasRecentPanic(context)) return
        trigger(
            context = context,
            reason = "panic:connectivity",
            userMessage = "Network available — flushing emergency sync…",
            debounceMs = CONNECTIVITY_DEBOUNCE_MS
        )
    }

    fun onFactoryResetSignal(context: Context) {
        if (!shouldRun(context)) return
        trigger(
            context = context,
            reason = "panic:factory_reset",
            userMessage = "Factory reset detected — syncing vault now…",
            debounceMs = 0L
        )
    }

    fun hasValidatedInternet(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return false
        if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) return false
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    }

    private fun shouldRun(context: Context): Boolean {
        return DeviceTrackingPrefs.isEventSyncEnabled(context) ||
            DeviceTrackingPrefs.isEmergencyTracking(context)
    }

    private fun hasRecentPanic(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val last = prefs.getLong(KEY_LAST_PANIC_MS, 0L)
        return last > 0L && System.currentTimeMillis() - last < 30 * 60_000L
    }

    private fun markPanic(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_LAST_PANIC_MS, System.currentTimeMillis())
            .apply()
    }

    private fun trigger(
        context: Context,
        reason: String,
        userMessage: String,
        debounceMs: Long
    ) {
        if (debounceMs > 0 && isDebounced(reason, debounceMs)) {
            Log.d(TAG, "debounce $reason")
            return
        }
        if (debounceMs > 0) {
            lastPanicAtMs[reason] = System.currentTimeMillis()
        }
        markPanic(context)
        statusLineUpdater?.invoke(userMessage)
        Log.i(TAG, "panic sync requested: $reason validated=${hasValidatedInternet(context)}")
        DriveVaultSync.requestPanicSync(context.applicationContext, reason)
    }

    private fun isDebounced(reason: String, debounceMs: Long): Boolean {
        val now = System.currentTimeMillis()
        val last = lastPanicAtMs[reason] ?: 0L
        return last > 0L && now - last < debounceMs
    }

    fun clearStatusLine() {
        statusLineUpdater?.invoke(null)
    }

    private const val PREFS = "mrp_emergency_sync"
    private const val KEY_LAST_PANIC_MS = "last_panic_ms"
    private const val KEY_SIM_EMERGENCY_STATE = "sim_emergency_state"
}
