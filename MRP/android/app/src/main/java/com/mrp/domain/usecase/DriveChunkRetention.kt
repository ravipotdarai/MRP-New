package com.mrp.domain.usecase

import android.content.Context
import android.util.Log
import java.util.Calendar
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Purge old evt/selfie chunk files by age — does not require full-vault catch-up.
 */
object DriveChunkRetention {

    private const val TAG = "DriveChunkRetention"

    fun purgeOldChunks(
        client: DriveAppDataClient,
        retentionDays: Int = DriveChunkNames.RETENTION_DAYS,
    ): Int {
        val cutoff = System.currentTimeMillis() - TimeUnit.DAYS.toMillis(retentionDays.toLong())
        var deleted = 0
        val candidates = client.listAppDataFilesContaining("mrp_evt_") +
            client.listAppDataFilesContaining("mrp_selfie_")
        for (f in candidates) {
            if (!DriveChunkNames.isEvtPack(f.name) && !DriveChunkNames.isSelfiePack(f.name)) continue
            val modified = parseDriveTime(f.modifiedTime) ?: continue
            if (modified >= cutoff) continue
            // Prefer date from evt filename when present
            val nameDay = parseEvtDateMs(f.name)
            if (nameDay != null && nameDay >= cutoff) continue
            try {
                client.delete(f.id)
                deleted++
            } catch (e: Exception) {
                Log.w(TAG, "purge ${f.name}", e)
            }
        }
        if (deleted > 0) Log.i(TAG, "purged $deleted old chunk files")
        return deleted
    }

    private fun parseDriveTime(iso: String?): Long? {
        if (iso.isNullOrBlank()) return null
        return try {
            java.time.Instant.parse(iso).toEpochMilli()
        } catch (_: Exception) {
            try {
                // Some responses omit millis
                java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli()
            } catch (_: Exception) {
                null
            }
        }
    }

    private fun parseEvtDateMs(name: String): Long? {
        // mrp_evt_YYYY-MM-DD_HH_seq.enc
        val m = Regex("""mrp_evt_(\d{4}-\d{2}-\d{2})_""").find(name) ?: return null
        val parts = m.groupValues[1].split("-")
        if (parts.size != 3) return null
        return try {
            val cal = Calendar.getInstance()
            cal.set(parts[0].toInt(), parts[1].toInt() - 1, parts[2].toInt(), 0, 0, 0)
            cal.set(Calendar.MILLISECOND, 0)
            cal.timeInMillis
        } catch (_: Exception) {
            null
        }
    }
}
