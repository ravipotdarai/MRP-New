package com.mrp.domain.usecase

import android.content.Context
import android.util.Log
import com.mrp.data.local.TimelineStorage
import com.mrp.domain.model.TimelineEntry
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.atomic.AtomicLong

/**
 * Create-only event micro-packs from local timeline (never download-append).
 * File: mrp_evt_{YYYY-MM-DD}_{HH}_{seq}.enc
 */
object EventMicroPackWriter {

    private const val TAG = "EventMicroPack"
    private val seq = AtomicLong(System.currentTimeMillis())
    private val DAY = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
        timeZone = TimeZone.getDefault()
    }

    /**
     * Upload events newer than [afterMs] (exclusive). Returns (uploadedCount, maxEventMs).
     */
    fun uploadNewEvents(
        context: Context,
        pin: String,
        client: DriveAppDataClient,
        afterMs: Long,
        criticalOnly: Boolean = false,
        maxEvents: Int = 80,
    ): Pair<Int, Long> {
        val entries = TimelineStorage(context).getTimeline()
            .mapNotNull { e ->
                val ms = SelfieVaultPackager.parseEventMs(e.timestamp)
                if (ms <= afterMs) null else e to ms
            }
            .sortedBy { it.second }
            .let { list ->
                if (criticalOnly) {
                    list.filter { isCritical(it.first.eventType) }
                } else {
                    list
                }
            }
            .takeLast(maxEvents)
        if (entries.isEmpty()) return 0 to afterMs

        val byHour = entries.groupBy { hourKey(it.second) }
        var uploaded = 0
        var maxMs = afterMs
        for ((key, group) in byHour) {
            val (date, hour) = key
            val events = JSONArray()
            for ((entry, ms) in group) {
                events.put(entry.toJsonObject())
                if (ms > maxMs) maxMs = ms
            }
            val payload = JSONObject()
                .put("version", DriveChunkNames.PACK_VERSION)
                .put("date", date)
                .put("hour", hour)
                .put("createdAtMs", System.currentTimeMillis())
                .put("events", events)
            val name = DriveChunkNames.evtFileName(date, hour, seq.incrementAndGet())
            val bytes = VaultBackupCrypto.encryptUtf8(payload.toString(), pin)
            // Create only — never download existing hour pack to merge.
            client.uploadOrReplace(name, bytes, existingId = null)
            uploaded++
            Log.i(TAG, "Drive sync ok reason=evt_pack name=$name bytes=${bytes.size} events=${events.length()}")
        }
        return uploaded to maxMs
    }

    private fun hourKey(epochMs: Long): Pair<String, Int> {
        val cal = java.util.Calendar.getInstance().apply { timeInMillis = epochMs }
        val date = DAY.format(Date(epochMs))
        return date to cal.get(java.util.Calendar.HOUR_OF_DAY)
    }

    private fun isCritical(eventType: String): Boolean {
        val t = eventType.uppercase(Locale.US)
        return t.contains("USB") || t.contains("SIM") || t.contains("FACTORY") ||
            t.contains("WRONG") || t.contains("PANIC") || t.contains("THEFT")
    }
}
