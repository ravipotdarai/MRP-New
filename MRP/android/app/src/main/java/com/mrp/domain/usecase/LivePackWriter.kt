package com.mrp.domain.usecase

import android.content.Context
import android.util.Log
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.data.local.LiveLocationStore
import org.json.JSONObject

/**
 * Tiny replace-only live location pack: mrp_live.enc (&lt;5 KB typical).
 */
object LivePackWriter {

    private const val TAG = "LivePackWriter"

    fun uploadLive(
        context: Context,
        pin: String,
        client: DriveAppDataClient,
    ): Int {
        if (!DeviceTrackingPrefs.syncLocation(context)) {
            Log.d(TAG, "skip live — syncLocation off")
            return 0
        }
        val live = LiveLocationStore.read(context) ?: JSONObject()
        if (live.length() == 0) {
            Log.d(TAG, "skip live — empty")
            return 0
        }
        val payload = JSONObject()
            .put("version", DriveChunkNames.PACK_VERSION)
            .put("createdAtMs", System.currentTimeMillis())
            .put("liveLocation", live)
        val bytes = VaultBackupCrypto.encryptUtf8(payload.toString(), pin)
        val existing = client.listAppDataFiles(DriveChunkNames.LIVE_FILE)
            .maxByOrNull { it.modifiedTime ?: "" }
        client.uploadOrReplace(DriveChunkNames.LIVE_FILE, bytes, existing?.id)
        Log.i(TAG, "Drive sync ok reason=live_pack bytes=${bytes.size}")
        return bytes.size
    }
}
