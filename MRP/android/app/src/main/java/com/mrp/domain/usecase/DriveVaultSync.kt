package com.mrp.domain.usecase

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
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
 * Privacy MVP: all syncable device data goes to Drive (encrypted), never Firebase.
 * Firebase holds device_config only (what / when / frequency).
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

    private val executor = Executors.newSingleThreadExecutor()
    private val running = AtomicBoolean(false)

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
     * Fire-and-forget Drive sync when policy + network + auto-PIN allow.
     * Always updates are local; this only pushes to Drive.
     */
    fun requestSyncAsync(context: Context, reason: String) {
        if (!DeviceTrackingPrefs.isEventSyncEnabled(context) &&
            !DeviceTrackingPrefs.isEmergencyTracking(context) &&
            reason != "manual"
        ) {
            return
        }
        executor.execute {
            try {
                trySync(context.applicationContext, reason)
            } catch (e: Exception) {
                Log.w(TAG, "requestSync $reason", e)
            }
        }
    }

    fun trySync(context: Context, reason: String): Boolean {
        if (!running.compareAndSet(false, true)) return false
        try {
            if (!networkAllowed(context)) {
                Log.d(TAG, "skip sync — network policy ($reason)")
                return false
            }
            if (!intervalElapsed(context, reason)) {
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
            val result = performBackup(context, pin, token, account.email ?: "", reason)
            return result
        } finally {
            running.set(false)
        }
    }

    fun buildPayload(context: Context, email: String, reason: String): JSONObject {
        val timeline = TimelineStorage(context)
        val sim = SimRecoveryStorage(context)
        val payload = JSONObject()
            .put("version", 3)
            .put("createdAtMs", System.currentTimeMillis())
            .put("syncReason", reason)
            .put("email", email)
            .put("timeline", timeline.exportTimelineJsonArray())
            .put("pendingSync", JSONArray(sim.getPendingSyncJson()))
            .put("simHistory", JSONArray(sim.getHistoryJson()))

        if (DeviceTrackingPrefs.syncLocation(context)) {
            payload.put("liveLocation", LiveLocationStore.readOrEmpty(context))
        }

        if (DeviceTrackingPrefs.shouldIncludeSelfies(context)) {
            payload.put("selfies", SelfieVaultPackager.collectSelfieBlobs(context, timeline.getTimeline()))
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

        // v3 extras — built only at sync time (no background polling)
        try {
            payload.put("appUsage", VaultExtrasBuilder.buildAppUsageDaily(context))
            payload.put("deviceHealth", VaultExtrasBuilder.buildDeviceHealth(context))
            payload.put("geofences", VaultExtrasBuilder.buildGeofences(context))
            // Light data-risk evaluate (debounced internally 6h) — no selfie
            DataRiskRuleEngine(context).evaluateInstalled()
        } catch (e: Exception) {
            Log.w(TAG, "vault v3 extras failed", e)
        }
        return payload
    }

    fun performBackup(
        context: Context,
        pin: String,
        accessToken: String,
        email: String,
        reason: String
    ): Boolean {
        val sim = SimRecoveryStorage(context)
        val payload = buildPayload(context, email, reason)
        val cipherBytes = VaultBackupCrypto.encryptUtf8(payload.toString(), pin)
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
            Log.i(TAG, "Drive sync ok reason=$reason bytes=${cipherBytes.size}")
            return true
        } catch (e: Exception) {
            val msg = e.message ?: ""
            if (msg.contains("403") || msg.contains("quota", true)) {
                vaultPrefs(context).edit().putBoolean(KEY_PAUSED_QUOTA, true).apply()
            }
            throw e
        }
    }

    private fun networkAllowed(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        val wifi = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
        val cell = caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
        // Legacy Drive wifi-only still honored when set
        val legacyWifiOnly = vaultPrefs(context).getBoolean(KEY_WIFI_ONLY, true)
        if (legacyWifiOnly && !DeviceTrackingPrefs.syncOnMobileData(context)) {
            return wifi && DeviceTrackingPrefs.syncOnWifi(context)
        }
        if (wifi && DeviceTrackingPrefs.syncOnWifi(context)) return true
        if (cell && DeviceTrackingPrefs.syncOnMobileData(context)) return true
        return false
    }

    private fun intervalElapsed(context: Context, reason: String): Boolean {
        val last = DeviceTrackingPrefs.lastDriveSyncMs(context)
        if (last <= 0) return true
        val elapsed = System.currentTimeMillis() - last
        // Events + geofence transitions sync immediately so timeline hits Drive promptly.
        // Routine / manual cadence uses syncFrequency (≥10). Emergency uses its own interval.
        val needMs = when {
            reason.startsWith("event") -> 0L
            reason.startsWith("geofence") && DeviceTrackingPrefs.syncGeofenceChanges(context) -> 0L
            reason.startsWith("drive_heartbeat") -> DriveLocationHeartbeat.INTERVAL_MS
            reason.startsWith("emergency") || DeviceTrackingPrefs.isEmergencyTracking(context) ->
                DeviceTrackingPrefs.emergencyIntervalMinutes(context) * 60_000L
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
