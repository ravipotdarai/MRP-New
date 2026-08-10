package com.mrp.domain.usecase

import android.content.Context
import android.util.Base64
import android.util.Log
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.data.local.TimelineStorage
import com.mrp.domain.model.TimelineEntry
import org.json.JSONObject
import java.io.File

/**
 * Create-once selfie packs: mrp_selfie_{eventId}.enc
 * Never embed selfies into a multi-MB vault on the automatic path.
 */
object SelfiePackWriter {

    private const val TAG = "SelfiePackWriter"
    /** Soft cap per selfie on cellular path (full file still on device). */
    private const val MAX_UPLOAD_BYTES = 1_800_000L

    fun uploadPendingSelfies(
        context: Context,
        pin: String,
        client: DriveAppDataClient,
        afterMs: Long,
        maxSelfies: Int = 6,
    ): Int {
        if (!DeviceTrackingPrefs.shouldIncludeSelfies(context)) return 0
        val entries = TimelineStorage(context).getTimeline()
        var uploaded = 0
        val listed = client.listAppDataFilesContaining(DriveChunkNames.SELFIE_PREFIX)
            .map { it.name }
            .toHashSet()

        for (entry in entries) {
            if (uploaded >= maxSelfies) break
            val atMs = SelfieVaultPackager.parseEventMs(entry.timestamp)
            if (atMs <= afterMs && afterMs > 0L) {
                // Still allow recent window: last 48h of unsent selfies regardless of watermark edge
            }
            if (SelfieVaultPackager.isNoSelfieEvent(entry.eventType)) continue
            val path = (entry.metadata["selfie_path"] ?: entry.metadata["photo_path"])?.toString()
                ?: continue
            val file = File(path)
            if (!file.exists() || file.length() <= 0 || file.length() > MAX_UPLOAD_BYTES) continue
            val name = DriveChunkNames.selfieFileName(entry.id)
            if (name in listed) continue
            try {
                val raw = file.readBytes()
                val payload = JSONObject()
                    .put("version", DriveChunkNames.PACK_VERSION)
                    .put("eventId", entry.id)
                    .put("eventType", entry.eventType)
                    .put("atMs", atMs)
                    .put("fileName", file.name)
                    .put("mime", "image/jpeg")
                    .put("dataBase64", Base64.encodeToString(raw, Base64.NO_WRAP))
                val bytes = VaultBackupCrypto.encryptUtf8(payload.toString(), pin)
                client.uploadOrReplace(name, bytes, existingId = null)
                listed.add(name)
                uploaded++
                Log.i(TAG, "Drive sync ok reason=selfie_pack name=$name bytes=${bytes.size}")
            } catch (e: Exception) {
                Log.w(TAG, "selfie upload ${entry.id}", e)
            }
        }
        return uploaded
    }

    /** Upload selfie for a specific timeline entry if present. */
    fun uploadForEntry(
        context: Context,
        pin: String,
        client: DriveAppDataClient,
        entry: TimelineEntry,
    ): Boolean {
        if (!DeviceTrackingPrefs.shouldIncludeSelfies(context)) return false
        if (SelfieVaultPackager.isNoSelfieEvent(entry.eventType)) return false
        val path = (entry.metadata["selfie_path"] ?: entry.metadata["photo_path"])?.toString()
            ?: return false
        val file = File(path)
        if (!file.exists() || file.length() <= 0 || file.length() > MAX_UPLOAD_BYTES) return false
        val name = DriveChunkNames.selfieFileName(entry.id)
        val existing = client.listAppDataFiles(name)
        if (existing.isNotEmpty()) return false
        val raw = file.readBytes()
        val atMs = SelfieVaultPackager.parseEventMs(entry.timestamp)
        val payload = JSONObject()
            .put("version", DriveChunkNames.PACK_VERSION)
            .put("eventId", entry.id)
            .put("eventType", entry.eventType)
            .put("atMs", atMs)
            .put("fileName", file.name)
            .put("mime", "image/jpeg")
            .put("dataBase64", Base64.encodeToString(raw, Base64.NO_WRAP))
        val bytes = VaultBackupCrypto.encryptUtf8(payload.toString(), pin)
        client.uploadOrReplace(name, bytes, existingId = null)
        Log.i(TAG, "Drive sync ok reason=selfie_pack name=$name bytes=${bytes.size}")
        return true
    }
}
