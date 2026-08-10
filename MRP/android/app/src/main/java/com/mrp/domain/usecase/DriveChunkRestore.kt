package com.mrp.domain.usecase

import android.content.Context
import android.util.Log
import com.mrp.data.local.TimelineStorage
import org.json.JSONArray
import org.json.JSONObject

/**
 * Restore / merge Drive chunks into local timeline (and optional legacy vault).
 * Downloads are allowed on the read path only.
 */
object DriveChunkRestore {

    private const val TAG = "DriveChunkRestore"

    data class Result(
        val restoredEvents: Int,
        val fromVault: Int,
        val fromEvtPacks: Int,
        val packFiles: Int,
        val hadVault: Boolean,
        val hadLive: Boolean,
    )

    fun restoreAll(context: Context, pin: String, client: DriveAppDataClient): Result {
        val storage = TimelineStorage(context)
        var fromVault = 0
        var fromEvt = 0
        var packFiles = 0
        var hadVault = false
        var hadLive = false

        // Legacy vault baseline (optional)
        val vaultFiles = client.listAppDataFiles(DriveAppDataClient.BACKUP_FILE_NAME)
        val latestVault = vaultFiles.maxByOrNull { it.modifiedTime ?: "" }
        if (latestVault != null) {
            hadVault = true
            try {
                val plain = VaultBackupCrypto.decryptUtf8(client.download(latestVault.id), pin)
                val json = JSONObject(plain)
                val timelineArr = json.optJSONArray("timeline") ?: JSONArray()
                fromVault = storage.importTimelineJsonArray(timelineArr)
            } catch (e: Exception) {
                Log.w(TAG, "legacy vault restore failed", e)
            }
        }

        // Event micro-packs (primary)
        val evtFiles = client.listAppDataFilesContaining(DriveChunkNames.EVT_PREFIX)
            .filter { DriveChunkNames.isEvtPack(it.name) }
            .sortedBy { it.modifiedTime ?: it.name }
        for (f in evtFiles) {
            try {
                val plain = VaultBackupCrypto.decryptUtf8(client.download(f.id), pin)
                val json = JSONObject(plain)
                val events = json.optJSONArray("events") ?: JSONArray()
                fromEvt += storage.importTimelineJsonArray(events)
                packFiles++
            } catch (e: Exception) {
                Log.w(TAG, "evt pack ${f.name}", e)
            }
        }

        // Live pack — best-effort into LiveLocationStore
        val liveFiles = client.listAppDataFiles(DriveChunkNames.LIVE_FILE)
        val live = liveFiles.maxByOrNull { it.modifiedTime ?: "" }
        if (live != null) {
            try {
                val plain = VaultBackupCrypto.decryptUtf8(client.download(live.id), pin)
                val json = JSONObject(plain)
                val loc = json.optJSONObject("liveLocation")
                if (loc != null && loc.length() > 0) {
                    com.mrp.data.local.LiveLocationStore.save(context, loc)
                    hadLive = true
                }
            } catch (e: Exception) {
                Log.w(TAG, "live pack", e)
            }
        }

        if (!hadVault && packFiles == 0) {
            throw IllegalStateException("No MRP chunk packs or backup found in Drive app data")
        }

        return Result(
            restoredEvents = fromVault + fromEvt,
            fromVault = fromVault,
            fromEvtPacks = fromEvt,
            packFiles = packFiles,
            hadVault = hadVault,
            hadLive = hadLive,
        )
    }
}
