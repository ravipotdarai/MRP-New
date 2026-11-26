package com.mrp.domain.usecase

import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.data.local.SimRecoveryStorage
import org.json.JSONArray
import org.json.JSONObject

/**
 * Replace-only extras pack (`mrp_extras.enc`) so automatic chunk sync can publish
 * appUsage / geofences / deviceHealth without a full Hub vault snapshot.
 */
object ExtrasSnapshotWriter {

    private const val TAG = "ExtrasSnapshot"
    private const val PREFS = "mrp_drive_vault"
    private const val KEY_LAST_EXTRAS_MS = "last_extras_ms"
    /** Throttle automatic extras uploads (zones / enable always force). */
    private const val MIN_INTERVAL_MS = 6L * 60L * 60L * 1000L

    fun uploadIfNeeded(
        context: Context,
        pin: String,
        client: DriveAppDataClient,
        email: String = "",
        force: Boolean = false,
    ): Int {
        val prefs = vaultPrefs(context)
        val last = prefs.getLong(KEY_LAST_EXTRAS_MS, 0L)
        val now = System.currentTimeMillis()
        if (!force && last > 0 && now - last < MIN_INTERVAL_MS) {
            Log.d(TAG, "skip extras — throttle")
            return 0
        }
        return try {
            val payload = JSONObject()
                .put("version", DriveChunkNames.PACK_VERSION)
                .put("kind", "extras")
                .put("createdAtMs", now)
                .put("email", email)
                .put("appUsage", VaultExtrasBuilder.buildAppUsageDaily(context))
                .put("deviceHealth", VaultExtrasBuilder.buildDeviceHealth(context))
                .put("geofences", VaultExtrasBuilder.buildGeofences(context))
                .put("pendingSync", JSONArray(SimRecoveryStorage(context).getPendingSyncJson()))
                .put("simHistory", JSONArray(SimRecoveryStorage(context).getHistoryJson()))
                .put(
                    "trackingConfigSnapshot",
                    JSONObject().also { o ->
                        DeviceTrackingPrefs.snapshot(context).forEach { (k, v) -> o.put(k, v) }
                    },
                )
            val bytes = VaultBackupCrypto.encryptUtf8(payload.toString(), pin)
            val existing = client.listAppDataFiles(DriveChunkNames.EXTRAS_FILE)
                .maxByOrNull { it.modifiedTime ?: "" }
            client.uploadOrReplace(DriveChunkNames.EXTRAS_FILE, bytes, existing?.id)
            prefs.edit().putLong(KEY_LAST_EXTRAS_MS, now).apply()
            Log.i(TAG, "Drive sync ok reason=extras_pack bytes=${bytes.size}")
            bytes.size
        } catch (e: Exception) {
            Log.w(TAG, "extras upload failed", e)
            0
        }
    }

    private fun vaultPrefs(context: Context) =
        EncryptedSharedPreferences.create(
            context,
            PREFS,
            MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
}
