package com.mrp

import android.app.Activity
import android.content.Intent
import android.content.SharedPreferences
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.facebook.react.bridge.*
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.auth.api.signin.GoogleSignInStatusCodes
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import com.google.android.gms.tasks.Tasks
import com.mrp.data.local.SimRecoveryStorage
import com.mrp.data.local.TimelineStorage
import com.mrp.domain.usecase.DriveAppDataClient
import com.mrp.domain.usecase.DriveChunkRestore
import com.mrp.domain.usecase.VaultBackupCrypto
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * P5 — Encrypted vault backup to the user's Google Drive appDataFolder.
 * Scope: drive.appdata only (no broad Drive listing).
 */
class DriveVaultModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private val executor = Executors.newSingleThreadExecutor()
    private var connectPromise: Promise? = null

    private val masterKey: MasterKey by lazy {
        MasterKey.Builder(reactContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
    }

    private val prefs: SharedPreferences by lazy {
        EncryptedSharedPreferences.create(
            reactContext,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private val pinPrefs: SharedPreferences by lazy {
        EncryptedSharedPreferences.create(
            reactContext,
            PIN_PREFS,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "DriveVault"

    @ReactMethod
    fun getStatus(promise: Promise) {
        executor.execute {
            try {
                val account = GoogleSignIn.getLastSignedInAccount(reactContext)
                val driveConnected = account != null &&
                    GoogleSignIn.hasPermissions(account, Scope(DriveAppDataClient.SCOPE_APPDATA))
                val recoveryAck = pinPrefs.getBoolean(KEY_RECOVERY_ACK, false)
                val wifiOnly = prefs.getBoolean(KEY_WIFI_ONLY, true)
                val lastBackupMs = prefs.getLong(KEY_LAST_BACKUP_MS, 0L)
                val lastFileId = prefs.getString(KEY_LAST_FILE_ID, null)
                val pending = SimRecoveryStorage(reactContext).getPendingSyncCount()
                val timelineCount = TimelineStorage(reactContext).getTimeline().size
                val pausedQuota = prefs.getBoolean(KEY_PAUSED_QUOTA, false)

                var remoteModified: String? = null
                var remoteSize: Double? = null
                if (driveConnected && account != null) {
                    try {
                        val access = getAccessToken(account)
                        if (!access.isNullOrBlank()) {
                            val client = DriveAppDataClient(access)
                            val files = client.listAppDataFiles(DriveAppDataClient.BACKUP_FILE_NAME)
                            val latest = files.maxByOrNull { it.modifiedTime ?: "" }
                            remoteModified = latest?.modifiedTime
                            remoteSize = latest?.size?.toDouble()
                            if (latest != null) {
                                prefs.edit().putString(KEY_LAST_FILE_ID, latest.id).apply()
                            }
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "remote status", e)
                    }
                }

                promise.resolve(
                    Arguments.createMap().apply {
                        putBoolean("googleSignedIn", account != null)
                        putBoolean("driveConnected", driveConnected)
                        putBoolean("recoveryAcknowledged", recoveryAck)
                        putBoolean("wifiOnly", wifiOnly)
                        putBoolean("pausedQuota", pausedQuota)
                        putDouble("lastBackupMs", lastBackupMs.toDouble())
                        putString("lastFileId", lastFileId)
                        putInt("pendingSyncCount", pending)
                        putInt("timelineCount", timelineCount)
                        putString("remoteModifiedTime", remoteModified)
                        if (remoteSize != null) putDouble("remoteSizeBytes", remoteSize) else putNull("remoteSizeBytes")
                        putString("email", account?.email)
                    }
                )
            } catch (e: Exception) {
                promise.reject("STATUS", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getAllowedDriveScopes(promise: Promise) {
        val arr = Arguments.createArray()
        DriveAppDataClient.ALLOWED_SCOPES.forEach { arr.pushString(it) }
        promise.resolve(arr)
    }

    @ReactMethod
    fun setWifiOnly(enabled: Boolean, promise: Promise) {
        prefs.edit().putBoolean(KEY_WIFI_ONLY, enabled).apply()
        promise.resolve(true)
    }

    @ReactMethod
    fun connectDrive(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No foreground activity")
            return
        }
        if (!pinPrefs.getBoolean(KEY_RECOVERY_ACK, false)) {
            promise.reject(
                "RECOVERY_REQUIRED",
                "Save and acknowledge your recovery code before enabling Drive sync."
            )
            return
        }
        val account = GoogleSignIn.getLastSignedInAccount(reactContext)
        if (account != null && GoogleSignIn.hasPermissions(account, Scope(DriveAppDataClient.SCOPE_APPDATA))) {
            promise.resolve(true)
            return
        }
        if (connectPromise != null) {
            promise.reject("IN_PROGRESS", "Drive connect already in progress")
            return
        }
        connectPromise = promise
        try {
            val webClientId = try {
                reactContext.getString(R.string.google_web_client_id)
            } catch (_: Exception) {
                ""
            }
            val builder = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestEmail()
                .requestScopes(Scope(DriveAppDataClient.SCOPE_APPDATA))
            // P5-1: never request broader Drive scopes (drive / drive.readonly / drive.file unless product adds it here).
            require(DriveAppDataClient.ALLOWED_SCOPES.contains(DriveAppDataClient.SCOPE_APPDATA))
            if (webClientId.isNotBlank() && !webClientId.startsWith("YOUR_")) {
                builder.requestIdToken(webClientId)
            }
            val client = GoogleSignIn.getClient(activity, builder.build())
            activity.startActivityForResult(client.signInIntent, RC_DRIVE)
        } catch (e: Exception) {
            connectPromise = null
            promise.reject("DRIVE_CONNECT", e.message, e)
        }
    }

    @ReactMethod
    fun backupNow(pin: String, promise: Promise) {
        executor.execute {
            try {
                requireRecoveryAck()
                requirePin(pin)
                val account = GoogleSignIn.getLastSignedInAccount(reactContext)
                    ?: throw IllegalStateException("Sign in with Google first")
                if (!GoogleSignIn.hasPermissions(account, Scope(DriveAppDataClient.SCOPE_APPDATA))) {
                    throw IllegalStateException("Connect Drive (appdata) first")
                }
                val sim = SimRecoveryStorage(reactContext)
                val accountEmail = account.email ?: ""
                val token = getAccessToken(account)
                    ?: throw IllegalStateException("Missing Google access token — reconnect Drive")

                // Network: respect Drive wifi-only OR device_config mobile allowance
                val allowCell = com.mrp.data.local.DeviceTrackingPrefs.syncOnMobileData(reactContext)
                if (prefs.getBoolean(KEY_WIFI_ONLY, true) && !allowCell && !isOnWifi()) {
                    promise.reject("WIFI_ONLY", "Wi‑Fi only is on. Connect to Wi‑Fi or allow mobile sync in Geofence policy.")
                    return@execute
                }
                val pendingBefore = sim.getPendingSyncCount()
                try {
                    val ok = com.mrp.domain.usecase.DriveVaultSync.performFullVaultBackup(
                        reactContext,
                        pin,
                        token,
                        accountEmail,
                        "manual"
                    )
                    if (!ok) throw IllegalStateException("Backup failed")
                    com.mrp.domain.usecase.DriveVaultSync.rememberPinForAutoSync(reactContext, pin)
                    val payload = com.mrp.domain.usecase.DriveVaultSync.buildPayload(
                        reactContext,
                        accountEmail,
                        "manual"
                    )
                    promise.resolve(
                        Arguments.createMap().apply {
                            putBoolean("ok", true)
                            putString("fileId", prefs.getString(KEY_LAST_FILE_ID, null))
                            putInt("timelineCount", payload.optJSONArray("timeline")?.length() ?: 0)
                            putInt(
                                "selfieCount",
                                payload.optJSONArray("selfies")?.length() ?: 0
                            )
                            putBoolean(
                                "hasLiveLocation",
                                payload.has("liveLocation") && payload.getJSONObject("liveLocation").length() > 0
                            )
                            putInt("pendingSyncDrained", pendingBefore)
                            putString("privacy", "device+drive; firebase=config-only")
                            putString("mode", "manual_full_vault_plus_chunks")
                        }
                    )
                } catch (e: Exception) {
                    val msg = e.message ?: ""
                    if (msg.contains("403") || msg.contains("storageQuotaExceeded", true) ||
                        msg.contains("quota", true)
                    ) {
                        prefs.edit().putBoolean(KEY_PAUSED_QUOTA, true).apply()
                        promise.reject("PAUSED_QUOTA", "Google Drive storage is full. Local vault is intact.", e)
                    } else {
                        throw e
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "backupNow", e)
                promise.reject("BACKUP", e.message, e)
            }
        }
    }

    @ReactMethod
    fun restoreLatest(pin: String, promise: Promise) {
        executor.execute {
            try {
                requireRecoveryAck()
                requirePin(pin)
                val account = GoogleSignIn.getLastSignedInAccount(reactContext)
                    ?: throw IllegalStateException("Sign in with Google first")
                if (!GoogleSignIn.hasPermissions(account, Scope(DriveAppDataClient.SCOPE_APPDATA))) {
                    throw IllegalStateException("Connect Drive (appdata) first")
                }
                val token = getAccessToken(account)
                    ?: throw IllegalStateException("Missing Google access token — reconnect Drive")
                val client = DriveAppDataClient(token)
                val result = DriveChunkRestore.restoreAll(reactContext, pin, client)
                promise.resolve(
                    Arguments.createMap().apply {
                        putBoolean("ok", true)
                        putInt("restoredEvents", result.restoredEvents)
                        putInt("backupEvents", result.restoredEvents)
                        putInt("fromVault", result.fromVault)
                        putInt("fromEvtPacks", result.fromEvtPacks)
                        putInt("packFiles", result.packFiles)
                        putBoolean("hadVault", result.hadVault)
                        putBoolean("hadLive", result.hadLive)
                        putString("fileId", prefs.getString(KEY_LAST_FILE_ID, null))
                        putString("mode", "chunks_primary")
                    }
                )
            } catch (e: Exception) {
                Log.e(TAG, "restoreLatest", e)
                promise.reject("RESTORE", e.message, e)
            }
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != RC_DRIVE) return
        val promise = connectPromise ?: return
        connectPromise = null
        try {
            val task = GoogleSignIn.getSignedInAccountFromIntent(data)
            val account = task.getResult(ApiException::class.java)
            val ok = GoogleSignIn.hasPermissions(account, Scope(DriveAppDataClient.SCOPE_APPDATA))
            if (!ok) {
                promise.reject("DRIVE_SCOPE", "Drive appdata permission was not granted")
                return
            }
            promise.resolve(true)
        } catch (e: ApiException) {
            val msg = when (e.statusCode) {
                GoogleSignInStatusCodes.SIGN_IN_CANCELLED -> "Drive connect cancelled"
                else -> "Drive connect failed (${e.statusCode})"
            }
            promise.reject("DRIVE_CONNECT", msg, e)
        } catch (e: Exception) {
            promise.reject("DRIVE_CONNECT", e.message, e)
        }
    }

    override fun onNewIntent(intent: Intent) {}

    private fun requireRecoveryAck() {
        if (!pinPrefs.getBoolean(KEY_RECOVERY_ACK, false)) {
            throw IllegalStateException(
                "Acknowledge your recovery code before Drive sync (Hub → set up PIN recovery)."
            )
        }
    }

    private fun requirePin(pin: String) {
        if (pin.length < 4) throw IllegalStateException("Enter your MRP PIN")
        val storedHash = pinPrefs.getString(KEY_PIN_HASH, null)
        val salt = pinPrefs.getString(KEY_SALT, null)
        if (storedHash == null || salt == null) {
            throw IllegalStateException("Set an MRP PIN before Drive backup")
        }
        if (!verifyPinCompatible(pin, storedHash, salt)) {
            throw IllegalStateException("Incorrect PIN")
        }
    }

    private fun verifyPinCompatible(pin: String, storedHash: String, salt: String): Boolean {
        return try {
            // Must match PinLockModule.hashPin: SHA-256(pin + saltString)
            val digest = java.security.MessageDigest.getInstance("SHA-256")
            val hash = digest.digest((pin + salt).toByteArray(Charsets.UTF_8))
            val computed = android.util.Base64.encodeToString(hash, android.util.Base64.NO_WRAP)
            computed == storedHash
        } catch (_: Exception) {
            false
        }
    }

    private fun getAccessToken(account: GoogleSignInAccount): String? {
        return try {
            val activity = currentActivity
            val client = if (activity != null) {
                Identity.getAuthorizationClient(activity)
            } else {
                Identity.getAuthorizationClient(reactContext)
            }
            val request = AuthorizationRequest.builder()
                .setRequestedScopes(listOf(Scope(DriveAppDataClient.SCOPE_APPDATA)))
                .build()
            val result = Tasks.await(client.authorize(request), 45, TimeUnit.SECONDS)
            result.accessToken
        } catch (e: Exception) {
            Log.w(TAG, "getAccessToken via AuthorizationClient", e)
            // Fallback: GoogleAuthUtil when available
            try {
                val scopes = "oauth2:${DriveAppDataClient.SCOPE_APPDATA}"
                @Suppress("DEPRECATION")
                com.google.android.gms.auth.GoogleAuthUtil.getToken(
                    reactContext,
                    account.account!!,
                    scopes
                )
            } catch (e2: Exception) {
                Log.w(TAG, "getAccessToken fallback", e2)
                null
            }
        }
    }

    private fun isOnWifi(): Boolean {
        val cm = reactContext.getSystemService(ConnectivityManager::class.java) ?: return false
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
    }

    companion object {
        private const val TAG = "DriveVault"
        private const val RC_DRIVE = 4415
        private const val PREFS_NAME = "mrp_drive_vault"
        private const val PIN_PREFS = "mrp_pin_prefs"
        private const val KEY_WIFI_ONLY = "wifi_only"
        private const val KEY_LAST_BACKUP_MS = "last_backup_ms"
        private const val KEY_LAST_FILE_ID = "last_file_id"
        private const val KEY_PAUSED_QUOTA = "paused_quota"
        private const val KEY_RECOVERY_ACK = "recovery_ack"
        private const val KEY_PIN_HASH = "pin_hash"
        private const val KEY_SALT = "pin_salt"
    }
}
