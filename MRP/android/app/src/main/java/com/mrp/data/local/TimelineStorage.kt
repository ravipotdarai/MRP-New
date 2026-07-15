package com.mrp.data.local

import android.content.Context
import android.util.Log
import com.mrp.domain.model.*
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class TimelineStorage(private val context: Context) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val eventDao = EventDao(context)

    private val timelineFile: File
        get() = File(context.filesDir, TIMELINE_FILE)
    private val backupFile: File
        get() = File(context.filesDir, "$TIMELINE_FILE.bak")

    private val photosDir: File
        get() = File(context.getExternalFilesDir(null), "MRP").also {
            if (!it.exists()) it.mkdirs()
        }

    init {
        migrateOldTimelineData()
    }

    private fun migrateOldTimelineData() {
        if (timelineFile.exists() && !backupFile.exists()) {
            scope.launch {
                try {
                    val content = timelineFile.readText(StandardCharsets.UTF_8)
                    if (content.isNotBlank() && content != "[]") {
                        val array = JSONArray(content)
                        for (i in 0 until array.length()) {
                            val entry = jsonToEntry(array.getJSONObject(i))
                            eventDao.insertEvent(timelineEntryToUnifiedEvent(entry))
                        }
                    }
                    timelineFile.renameTo(backupFile)
                    Log.d(TAG, "Successfully migrated timeline.json to SQLite unified events")
                } catch (e: Exception) {
                    Log.e(TAG, "Error migrating timeline.json", e)
                }
            }
        }
    }

    fun getPhotosDirectory(): File = photosDir

    fun appendTimelineEntry(entry: TimelineEntry) {
        scope.launch {
            appendEntrySyncInternal(entry)
        }
    }

    fun appendTimelineEntrySync(entry: TimelineEntry) {
        appendEntrySyncInternal(entry)
    }

    private fun appendEntrySyncInternal(entry: TimelineEntry) {
        try {
            Log.d(TAG, "appendEntrySyncInternal called for ${entry.eventType} inserting to SQLite")
            eventDao.insertEvent(timelineEntryToUnifiedEvent(entry))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to insert unified event", e)
        }
    }

    fun saveTimelineEntry(entry: TimelineEntry) {
        appendTimelineEntry(entry)
    }

    fun getTimeline(): List<TimelineEntry> {
        val unifiedEvents = eventDao.getAllEvents()
        return unifiedEvents.map { unifiedEventToTimelineEntry(it) }
    }

    fun getTimelineByEventType(eventType: String): List<TimelineEntry> {
        return getTimeline().filter { it.eventType == eventType }
    }

    fun clearAllTimeline() {
        eventDao.clearAllEvents()
        if (backupFile.exists()) backupFile.delete()
        if (timelineFile.exists()) timelineFile.delete()
        val photosDir = getPhotosDirectory()
        if (photosDir.exists()) {
            photosDir.deleteRecursively()
        }
    }

    private fun timelineEntryToUnifiedEvent(entry: TimelineEntry): UnifiedEvent {
        val time = parseISO8601(entry.timestamp)
        return UnifiedEvent(
            eventType = entry.eventType,
            eventTime = time,
            latitude = entry.location.latitude,
            longitude = entry.location.longitude,
            accuracy = entry.location.accuracyMeters,
            address = entry.location.detailedAddress,
            insideGeofence = entry.geofenceStatus.insideFence,
            geofenceId = entry.geofenceStatus.fenceId,
            referenceId = entry.id,
            jsonData = JSONObject(entry.metadata).toString(),
            syncStatus = entry.status // Use actual event status instead of "PENDING"
        )
    }

    private fun unifiedEventToTimelineEntry(event: UnifiedEvent): TimelineEntry {
        return TimelineEntry.fromTimestamp(
            id = event.referenceId ?: event.id.toString(),
            timestamp = ISO8601_DATE_FORMAT.format(Date(event.eventTime)),
            eventType = event.eventType,
            status = event.syncStatus, // using status field for sync status or fallback
            latitude = event.latitude,
            longitude = event.longitude,
            accuracyMeters = event.accuracy,
            detailedAddress = event.address,
            insideFence = event.insideGeofence,
            fenceId = event.geofenceId,
            metadata = try {
                if (event.jsonData != null) jsonToMetadataMap(JSONObject(event.jsonData)) else emptyMap()
            } catch (e: Exception) { emptyMap() }
        )
    }

    private fun parseISO8601(dateStr: String): Long {
        return try {
            ISO8601_DATE_FORMAT.parse(dateStr)?.time ?: System.currentTimeMillis()
        } catch (e: Exception) {
            System.currentTimeMillis()
        }
    }

    private fun jsonToEntry(json: JSONObject): TimelineEntry {
        val locationJson = json.optJSONObject("location")
        val geofenceJson = json.optJSONObject("geofence_status")

        return TimelineEntry.fromTimestamp(
            id = json.optString("id", "").takeIf { it.isNotEmpty() && it != "null" },
            timestamp = json.optString("timestamp", "").takeIf { it.isNotEmpty() && it != "null" },
            eventType = json.optString("event_type", json.optString("eventType", "")),
            status = json.optString("status", ""),
            latitude = locationJson?.optDouble("latitude") ?: json.optDouble("latitude", 0.0).takeIf { it != 0.0 },
            longitude = locationJson?.optDouble("longitude") ?: json.optDouble("longitude", 0.0).takeIf { it != 0.0 },
            accuracyMeters = locationJson?.optDouble("accuracy_meters")?.toFloat() ?: json.optDouble("accuracy", 0.0).toFloat().takeIf { it != 0f },
            detailedAddress = locationJson?.optString("detailed_address") ?: json.optString("locationAddress", "Address Unavailable (Offline)"),
            insideFence = geofenceJson?.optBoolean("inside_fence") ?: json.optBoolean("inside_fence", false),
            fenceId = geofenceJson?.optString("fence_id")?.takeIf { it != "null" && it.isNotEmpty() } ?: json.optString("geofence", "").takeIf { it.isNotEmpty() },
            metadata = jsonToMetadataMap(json.optJSONObject("metadata"))
        )
    }

    private fun jsonToMetadataMap(json: JSONObject?): Map<String, Any?> {
        if (json == null) return emptyMap()
        val map = mutableMapOf<String, Any?>()
        json.keys().forEach { key ->
            map[key] = json.opt(key)
        }
        return map
    }

    companion object {
        private const val TAG = "TimelineStorage"
        private const val TIMELINE_FILE = "timeline.json"
        
        private val ISO8601_DATE_FORMAT = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC")
        }
    }
}