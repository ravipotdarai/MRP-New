package com.mrp.domain.usecase

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.common.api.Scope
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.data.local.LiveLocationStore
import com.mrp.data.local.SimRecoveryStorage
import com.mrp.data.local.TimelineStorage
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Privacy MVP: syncable device data → Drive (encrypted), never Firebase.
 *
 * Automatic path = append-only chunks (evt / selfie / live). Full vault only via
 * Hub manual [performFullVaultBackup] / reason=manual.
 */
object DriveVaultSync {

    private const val TAG = "DriveVaultSync"
    private const val PREFS = "mrp_drive_vault"
    private const val PIN_PREFS = "mrp_pin_prefs"
    private const val KEY_AUTO_PIN = "auto_sync_pin"
    private const val KEY_WIFI_ONLY = "wifi_only"
    private const val KEY_LAST_BACKUP_MS = "last_backup_ms"
    private const val KEY_LAST_FILE_ID = "last_file_id"
    private const val KEY_PAUSED_QUOTA = "paused_quota"
    private const val KEY_RECOVERY_ACK = "recovery_ack"
    private const val KEY_PIN_HASH = "pin_hash"
    private const val KEY_SALT = "pin_salt"
    private const val KEY_EVT_WATERMARK_MS = "evt_chunk_watermark_ms"

    /** Coalesce event + event_selfie into one chunk flush. */
    private const val COALESCE_MS = 45_000L

    private val executor = Executors.newSingleThreadExecutor()
    private val running = AtomicBoolean(false)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val coalescePending = AtomicBoolean(false)
    private var coalesceRunnable: Runnable? = null

    fun rememberPinForAutoSync(context: Context, pin: String) {
        try {
            vaultPrefs(context).edit().putString(KEY_AUTO_PIN, pin).apply()
        } catch (e: Exception) {
            Log.w(TAG, "rememberPin", e)
        }
    }

    fun clearAutoPin(context: Context) {
        try {
            vaultPrefs(context).edit().remove(KEY_AUTO_PIN).apply()
        } catch (_: Exception) {
        }
    }

    /**
     * Wi‑Fi / cellular / ethernet just became available — flush pending event chunks
     * (append-only packs). Does not upload a full vault.
     */
    fun onNetworkAvailable(context: Context, transport: String = "unknown") {
        if (!DeviceTrackingPrefs.isEventSyncEnabled(context) &&
            !DeviceTrackingPrefs.isEmergencyTracking(context)
        ) {
            return
        }
        Log.i(TAG, "network available transport=$transport — schedule chunk flush")
        requestSyncAsync(context.applicationContext, "event:network_$transport")
    }

    /**
     * Fire-and-forget Drive sync when policy + network + auto-PIN allow.
     * Events are coalesced; heartbeat → live only; manual → full vault snapshot.
     */
    fun requestSyncAsync(context: Context, reason: String) {
        if (!isPanicReason(reason) &&
            !DeviceTrackingPrefs.isEventSyncEnabled(context) &&
            !DeviceTrackingPrefs.isEmergencyTracking(context) &&
            reason != "manual"
        ) {
            return
        }
        val app = context.applicationContext
        when {
            reason == "manual" -> executor.execute {
                try {
                    trySync(app, reason, panic = false)
                } catch (t: Throwable) {
                    Log.e(TAG, "requestSync $reason", t)
                }
            }
            reason.startsWith("drive_heartbeat") || reason.startsWith("emergency") ->
                executor.execute {
                    try {
                        trySync(app, reason, panic = false)
                    } catch (t: Throwable) {
                        Log.e(TAG, "requestSync $reason", t)
                    }
                }
            reason.startsWith("event") || reason.startsWith("geofence") ->
                scheduleCoalescedEventFlush(app, reason)
            else -> executor.execute {
                try {
                    trySync(app, reason, panic = false)
                } catch (t: Throwable) {
                    Log.e(TAG, "requestSync $reason", t)
                }
            }
        }
    }

    fun requestPanicSync(context: Context, reason: String) {
        executor.execute {
            try {
                trySync(context.applicationContext, reason, panic = true)
            } catch (t: Throwable) {
                Log.e(TAG, "requestPanicSync $reason", t)
            } finally {
                EmergencySyncCoordinator.clearStatusLine()
            }
        }
    }

    private fun scheduleCoalescedEventFlush(app: Context, reason: String) {
        coalescePending.set(true)
        coalesceRunnable?.let { mainHandler.removeCallbacks(it) }
        val r = Runnable {
            coalesceRunnable = null
            if (!coalescePending.getAndSet(false)) return@Runnable
            executor.execute {
                try {
                    trySync(app, "event:coalesced:$reason", panic = false)
                } catch (t: Throwable) {
                    Log.e(TAG, "coalesced flush", t)
                }
            }
        }
        coalesceRunnable = r
        mainHandler.postDelayed(r, COALESCE_MS)
        Log.d(TAG, "coalesce scheduled (${COALESCE_MS}ms) for $reason")
    }

    private fun isPanicReason(reason: String): Boolean = reason.startsWith("panic:")

    fun trySync(context: Context, reason: String): Boolean =
        trySync(context, reason, panic = isPanicReason(reason))

    private fun trySync(context: Context, reason: String, panic: Boolean): Boolean {
        if (!running.compareAndSet(false, true)) {
            // Another sync in flight — re-queue events so they are not dropped.
            if (reason.startsWith("event") || reason.startsWith("geofence")) {
                scheduleCoalescedEventFlush(context, reason)
            }
            return false
        }
        try {
            val chunkPath = isChunkReason(reason) || panic
            if (!networkAllowed(context, panic, chunks = chunkPath && reason != "manual")) {
                Log.d(TAG, "skip sync — network policy ($reason panic=$panic)")
                return false
            }
            if (!intervalElapsed(context, reason, panic)) {
                Log.d(TAG, "skip sync — frequency ($reason)")
                return false
            }
            val pin = vaultPrefs(context).getString(KEY_AUTO_PIN, null)
            if (pin.isNullOrBlank()) {
                Log.d(TAG, "skip sync — no auto PIN (run Hub → Drive backup once)")
                return false
            }
            if (!pinPrefs(context).getBoolean(KEY_RECOVERY_ACK, false)) return false
            if (!verifyPin(context, pin)) {
                clearAutoPin(context)
                return false
            }
            val account = GoogleSignIn.getLastSignedInAccount(context) ?: return false
            if (!GoogleSignIn.hasPermissions(account, Scope(DriveAppDataClient.SCOPE_APPDATA))) {
                return false
            }
            val token = obtainAccessToken(context, account) ?: return false
            val email = account.email ?: ""
            return when {
                reason == "manual" ->
                    performFullVaultBackup(context, pin, token, email, reason)
                reason.startsWith("drive_heartbeat") ->
                    performLiveOnly(context, pin, token, reason)
                panic || reason.startsWith("panic:") ->
                    performChunkFlush(context, pin, token, reason, criticalOnly = true)
                reason.startsWith("emergency") -> {
                    performLiveOnly(context, pin, token, reason)
                    performChunkFlush(context, pin, token, reason, criticalOnly = false)
                }
                else ->
                    performChunkFlush(context, pin, token, reason, criticalOnly = false)
            }
        } finally {
            running.set(false)
        }
    }

    private fun isChunkReason(reason: String): Boolean =
        reason.startsWith("event") ||
            reason.startsWith("geofence") ||
            reason.startsWith("drive_heartbeat") ||
            reason.startsWith("emergency") ||
            reason.startsWith("panic:")

    /** Hub manual / Export snapshot — only automatic caller of full vault. */
    fun performBackup(
        context: Context,
        pin: String,
        accessToken: String,
        email: String,
        reason: String,
        criticalOnly: Boolean = isPanicReason(reason)
    ): Boolean {
        // Legacy signature: map non-manual automatic callers away from full vault.
        return if (reason == "manual" || reason.startsWith("manual")) {
            performFullVaultBackup(context, pin, accessToken, email, reason)
        } else if (criticalOnly || reason.startsWith("panic:")) {
            performChunkFlush(context, pin, accessToken, reason, criticalOnly = true)
        } else if (reason.startsWith("drive_heartbeat")) {
            performLiveOnly(context, pin, accessToken, reason)
        } else {
            performChunkFlush(context, pin, accessToken, reason, criticalOnly = false)
        }
    }

    private fun performLiveOnly(
        context: Context,
        pin: String,
        accessToken: String,
        reason: String,
    ): Boolean {
        val client = DriveAppDataClient(accessToken)
        val bytes = LivePackWriter.uploadLive(context, pin, client)
        DeviceTrackingPrefs.markDriveSynced(context)
        vaultPrefs(context).edit().putLong(KEY_LAST_BACKUP_MS, System.currentTimeMillis()).apply()
        Log.i(TAG, "Drive sync ok reason=$reason live_only bytes=$bytes")
        return true
    }

    private fun performChunkFlush(
        context: Context,
        pin: String,
        accessToken: String,
        reason: String,
        criticalOnly: Boolean,
    ): Boolean {
        val client = DriveAppDataClient(accessToken)
        val prefs = vaultPrefs(context)
        val evtWatermark = prefs.getLong(KEY_EVT_WATERMARK_MS, 0L)
        val (evtCount, newWatermark) = EventMicroPackWriter.uploadNewEvents(
            context = context,
            pin = pin,
            client = client,
            afterMs = evtWatermark,
            criticalOnly = criticalOnly,
            maxEvents = if (criticalOnly) 40 else 80,
        )
        if (newWatermark > evtWatermark) {
            prefs.edit().putLong(KEY_EVT_WATERMARK_MS, newWatermark).apply()
        }

        val selfieCount = SelfiePackWriter.uploadPendingSelfies(
            context, pin, client, afterMs = 0L, maxSelfies = if (criticalOnly) 2 else 6
        )
        // Panic / emergency also refresh live badge
        if (criticalOnly || DeviceTrackingPrefs.isEmergencyTracking(context)) {
            LivePackWriter.uploadLive(context, pin, client)
        }

        val sim = SimRecoveryStorage(context)
        if (sim.getPendingSyncCount() > 0) {
            // Pending SIM rows still travel via optional manual vault; mark drained after chunk path
            // when we at least pushed events.
            if (evtCount > 0) sim.clearPendingSync()
        }

        if (!criticalOnly) {
            try {
                GpsDayPackWriter.uploadDirtyDays(context, pin, accessToken)
            } catch (e: Exception) {
                Log.w(TAG, "GPS day pack upload", e)
            }
            try {
                DriveChunkRetention.purgeOldChunks(client)
            } catch (e: Exception) {
                Log.w(TAG, "retention", e)
            }
        }

        DeviceTrackingPrefs.markDriveSynced(context)
        prefs.edit()
            .putLong(KEY_LAST_BACKUP_MS, System.currentTimeMillis())
            .putBoolean(KEY_PAUSED_QUOTA, false)
            .apply()
        Log.i(
            TAG,
            "Drive sync ok reason=$reason chunks evtPacks=$evtCount selfies=$selfieCount critical=$criticalOnly"
        )
        return evtCount > 0 || selfieCount > 0 || criticalOnly
    }

    /**
     * Full vault snapshot from **local SQLite only** (no Drive download to rebuild).
     * Used by Hub Backup / Export only — never on automatic event path.
     */
    fun performFullVaultBackup(
        context: Context,
        pin: String,
        accessToken: String,
        email: String,
        reason: String = "manual",
    ): Boolean {
        val sim = SimRecoveryStorage(context)
        val cipherBytes = encryptPayloadSafely(context, pin, email, reason, criticalOnly = false)
        val client = DriveAppDataClient(accessToken)
        val existing = client.listAppDataFiles(DriveAppDataClient.BACKUP_FILE_NAME)
            .maxByOrNull { it.modifiedTime ?: "" }
        val pendingBefore = sim.getPendingSyncCount()
        try {
            val remote = client.uploadOrReplace(
                DriveAppDataClient.BACKUP_FILE_NAME,
                cipherBytes,
                existing?.id
            )
            try {
                client.deleteOldMrpBackups(remote.id)
            } catch (e: Exception) {
                Log.w(TAG, "purge", e)
            }
            if (pendingBefore > 0) sim.clearPendingSync()
            vaultPrefs(context).edit()
                .putLong(KEY_LAST_BACKUP_MS, System.currentTimeMillis())
                .putString(KEY_LAST_FILE_ID, remote.id)
                .putBoolean(KEY_PAUSED_QUOTA, false)
                .apply()
            DeviceTrackingPrefs.markDriveSynced(context)
            rememberPinForAutoSync(context, pin)
            // Also flush any pending chunks + GPS so Hub backup leaves Drive complete
            try {
                performChunkFlush(context, pin, accessToken, "manual:chunks", criticalOnly = false)
            } catch (e: Exception) {
                Log.w(TAG, "chunk flush after vault", e)
            }
            try {
                GpsDayPackWriter.uploadDirtyDays(context, pin, accessToken)
            } catch (e: Exception) {
                Log.w(TAG, "GPS day pack upload", e)
            }
            Log.i(TAG, "Drive sync ok reason=$reason bytes=${cipherBytes.size} (full vault manual)")
            return true
        } catch (e: Exception) {
            val msg = e.message ?: ""
            if (msg.contains("403") || msg.contains("quota", true)) {
                vaultPrefs(context).edit().putBoolean(KEY_PAUSED_QUOTA, true).apply()
            }
            throw e
        }
    }

    fun buildPayload(
        context: Context,
        email: String,
        reason: String,
        criticalOnly: Boolean = false,
        omitSelfies: Boolean = false,
    ): JSONObject {
        val timeline = TimelineStorage(context)
        val sim = SimRecoveryStorage(context)
        val entries = timeline.getTimeline()
        val timelineJson = if (criticalOnly) {
            timeline.exportCriticalTimelineJsonArray()
        } else {
            val arr = JSONArray()
            entries.take(400).forEach { arr.put(it.toJsonObject()) }
            arr
        }
        val payload = JSONObject()
            .put("version", 3)
            .put("createdAtMs", System.currentTimeMillis())
            .put("syncReason", reason)
            .put("email", email)
            .put("emergencyPayload", criticalOnly)
            .put("timeline", timelineJson)
            .put("pendingSync", JSONArray(sim.getPendingSyncJson()))
            .put("simHistory", JSONArray(sim.getHistoryJson()))

        if (DeviceTrackingPrefs.syncLocation(context)) {
            payload.put("liveLocation", LiveLocationStore.readOrEmpty(context))
        }

        if (!criticalOnly && !omitSelfies && DeviceTrackingPrefs.shouldIncludeSelfies(context)) {
            payload.put("selfies", SelfieVaultPackager.collectSelfieBlobs(context, entries))
            payload.put("selfiesOmitted", false)
        } else {
            payload.put("selfies", JSONArray())
            payload.put("selfiesOmitted", true)
        }

        payload.put(
            "trackingConfigSnapshot",
            JSONObject().also { o ->
                DeviceTrackingPrefs.snapshot(context).forEach { (k, v) -> o.put(k, v) }
            }
        )

        if (!criticalOnly) {
            try {
                payload.put("appUsage", VaultExtrasBuilder.buildAppUsageDaily(context))
                payload.put("deviceHealth", VaultExtrasBuilder.buildDeviceHealth(context))
                payload.put("geofences", VaultExtrasBuilder.buildGeofences(context))
                DataRiskRuleEngine(context).evaluateInstalled()
            } catch (e: Exception) {
                Log.w(TAG, "vault v3 extras failed", e)
            }
        } else {
            try {
                payload.put("deviceHealth", VaultExtrasBuilder.buildDeviceHealth(context))
            } catch (e: Exception) {
                Log.w(TAG, "vault critical health failed", e)
            }
        }
        return payload
    }

    private fun encryptPayloadSafely(
        context: Context,
        pin: String,
        email: String,
        reason: String,
        criticalOnly: Boolean,
    ): ByteArray {
        fun encrypt(omitSelfies: Boolean, critical: Boolean): ByteArray {
            val payload = buildPayload(context, email, reason, critical, omitSelfies)
            return VaultBackupCrypto.encryptUtf8(payload.toString(), pin)
        }
        return try {
            encrypt(omitSelfies = false, critical = criticalOnly)
        } catch (oom: OutOfMemoryError) {
            Log.e(TAG, "OOM building vault — retry without selfies", oom)
            System.gc()
            try {
                encrypt(omitSelfies = true, critical = criticalOnly)
            } catch (oom2: OutOfMemoryError) {
                Log.e(TAG, "OOM again — critical-only vault", oom2)
                System.gc()
                encrypt(omitSelfies = true, critical = true)
            }
        }
    }

    /**
     * @param chunks when true, allow cellular (mobile radio) if event sync or mobile sync is on.
     * Wi‑Fi / ethernet / cellular are all valid transports for append-only packs.
     */
    private fun networkAllowed(context: Context, panic: Boolean, chunks: Boolean): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return false
        val validated = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        val wifi = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
        val cell = caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
        val ethernet = caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)

        if (panic || DeviceTrackingPrefs.isEmergencyTracking(context)) {
            val ok = validated && (wifi || cell || ethernet)
            if (ok) Log.d(TAG, "network OK panic/emergency wifi=$wifi cell=$cell eth=$ethernet")
            return ok
        }
        if (!validated) {
            Log.d(TAG, "network skip — not validated yet")
            return false
        }

        if (wifi && DeviceTrackingPrefs.syncOnWifi(context)) {
            Log.d(TAG, "network OK wifi chunks=$chunks")
            return true
        }
        if (ethernet) {
            Log.d(TAG, "network OK ethernet")
            return true
        }

        // Cellular / mobile radio — chunks are cellular-first when event sync is on.
        if (cell) {
            val mobilePref = DeviceTrackingPrefs.syncOnMobileData(context)
            val eventSync = DeviceTrackingPrefs.isEventSyncEnabled(context)
            if (mobilePref || (chunks && eventSync)) {
                Log.d(TAG, "network OK cellular mobilePref=$mobilePref eventSync=$eventSync chunks=$chunks")
                return true
            }
            Log.d(TAG, "network skip cellular — enable Sync on mobile data or event sync")
            return false
        }

        // Legacy Hub “Wi‑Fi only” applies to full-vault manual path, not chunk flush.
        val legacyWifiOnly = vaultPrefs(context).getBoolean(KEY_WIFI_ONLY, true)
        if (legacyWifiOnly && !DeviceTrackingPrefs.syncOnMobileData(context) && !chunks) {
            return false
        }
        return false
    }

    private fun intervalElapsed(context: Context, reason: String, panic: Boolean): Boolean {
        if (panic || reason.startsWith("panic:")) return true
        // Coalesced event flush already waited COALESCE_MS — allow through.
        if (reason.startsWith("event:coalesced")) return true
        val last = DeviceTrackingPrefs.lastDriveSyncMs(context)
        if (last <= 0) return true
        val elapsed = System.currentTimeMillis() - last
        val needMs = when {
            reason.startsWith("event") -> COALESCE_MS
            reason.startsWith("geofence") && DeviceTrackingPrefs.syncGeofenceChanges(context) -> COALESCE_MS
            reason.startsWith("drive_heartbeat") -> DriveLocationHeartbeat.INTERVAL_MS
            reason.startsWith("emergency") || DeviceTrackingPrefs.isEmergencyTracking(context) ->
                DeviceTrackingPrefs.emergencyIntervalMinutes(context) * 60_000L
            reason == "manual" -> 0L
            else -> DeviceTrackingPrefs.syncFrequencyMinutes(context) * 60_000L
        }
        return elapsed >= needMs
    }

    private fun verifyPin(context: Context, pin: String): Boolean {
        val storedHash = pinPrefs(context).getString(KEY_PIN_HASH, null) ?: return false
        val salt = pinPrefs(context).getString(KEY_SALT, null) ?: return false
        return try {
            val digest = java.security.MessageDigest.getInstance("SHA-256")
            val hash = digest.digest((pin + salt).toByteArray(Charsets.UTF_8))
            val computed = Base64.encodeToString(hash, Base64.NO_WRAP)
            computed == storedHash
        } catch (_: Exception) {
            false
        }
    }

    private fun obtainAccessToken(
        context: Context,
        account: com.google.android.gms.auth.api.signin.GoogleSignInAccount
    ): String? {
        return try {
            val scopes = "oauth2:${DriveAppDataClient.SCOPE_APPDATA}"
            @Suppress("DEPRECATION")
            com.google.android.gms.auth.GoogleAuthUtil.getToken(
                context,
                account.account!!,
                scopes
            )
        } catch (e: Exception) {
            Log.w(TAG, "token", e)
            null
        }
    }

    private fun vaultPrefs(context: Context) =
        EncryptedSharedPreferences.create(
            context,
            PREFS,
            MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )

    private fun pinPrefs(context: Context) =
        EncryptedSharedPreferences.create(
            context,
            PIN_PREFS,
            MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
}
