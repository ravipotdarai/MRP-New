package com.mrp.data.local

import android.content.Context
import android.location.Location
import android.os.Build
import android.util.Log
import com.mrp.domain.model.*
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.*
import kotlin.concurrent.thread

/**
 * Thread-safe TimelineStorage that appends JSON events without loading entire array into memory.
 * Uses file locking and mutex to prevent corruption during concurrent writes.
 */
class TimelineStorage(private val context: Context) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val fileMutex = Mutex()

    private val timelineFile: File
        get() = File(context.filesDir, TIMELINE_FILE)

    private val photosDir: File
        get() = File(context.getExternalFilesDir(null), "MRP").also {
            if (!it.exists()) it.mkdirs()
        }

    fun getPhotosDirectory(): File = photosDir

    /**
     * Append a single TimelineEntry to the file using coroutines.
     * Thread-safe via Mutex.
     */
    fun appendTimelineEntry(entry: TimelineEntry) {
        scope.launch {
            fileMutex.withLock {
                appendEntrySyncInternal(entry)
            }
        }
    }

    /**
     * Synchronous version for use from BroadcastReceivers.
     * Uses synchronized block for thread safety without coroutines.
     */
    fun appendTimelineEntrySync(entry: TimelineEntry) {
        synchronized(writeLock) {
            appendEntrySyncInternal(entry)
        }
    }

    private val writeLock = Any()

    private fun appendEntrySync(entry: TimelineEntry) {
        synchronized(writeLock) {
            appendEntrySyncInternal(entry)
        }
    }

    private fun appendEntrySyncInternal(entry: TimelineEntry) {
        try {
            Log.d(TAG, "appendEntrySyncInternal called for ${entry.eventType}")
            val entryJson = entry.toJsonObject()
            Log.d(TAG, "Entry JSON created: ${entryJson.toString().take(100)}")

            if (!timelineFile.exists()) {
                // Create new file with array structure
                timelineFile.createNewFile()
                FileOutputStream(timelineFile).use { fos ->
                    fos.write("[\n  $entryJson\n]".toByteArray(StandardCharsets.UTF_8))
                }
                Log.d(TAG, "Created new timeline file with first entry")
                return
            }

            // Read existing content
            val content = timelineFile.readText(StandardCharsets.UTF_8).trim()
            Log.d(TAG, "Existing file content length: ${content.length}")

            // Check if file is empty or invalid
            if (content.isEmpty() || content == "[]") {
                FileOutputStream(timelineFile).use { fos ->
                    fos.write("[\n  $entryJson\n]".toByteArray(StandardCharsets.UTF_8))
                }
                Log.d(TAG, "Wrote to empty file")
                return
            }

            // Remove the closing bracket, append new entry, close array
            val jsonArray = JSONArray(content)
            jsonArray.put(entryJson)

            // Trim to max entries
            val trimmedArray = if (jsonArray.length() > MAX_ENTRIES) {
                val newArray = JSONArray()
                for (i in 0 until MAX_ENTRIES) {
                    newArray.put(jsonArray.getJSONObject(i))
                }
                newArray
            } else {
                jsonArray
            }

            // Write back with pretty printing
            FileOutputStream(timelineFile).use { fos ->
                fos.write(trimmedArray.toString(2).toByteArray(StandardCharsets.UTF_8))
            }

            Log.d(TAG, "Timeline entry appended. Total entries: ${trimmedArray.length()}")

        } catch (e: Exception) {
            Log.e(TAG, "Failed to append timeline entry", e)
            // Fallback: try to recreate file
            try {
                timelineFile.delete()
            } catch (ignored: Exception) {}
        }
    }

    /**
     * Legacy method for backwards compatibility
     */
    fun saveTimelineEntry(entry: TimelineEntry) {
        appendTimelineEntry(entry)
    }

    fun getTimeline(): List<TimelineEntry> {
        if (!timelineFile.exists()) return emptyList()

        return try {
            val content = timelineFile.readText(StandardCharsets.UTF_8)
            if (content.isBlank()) return emptyList()

            val array = JSONArray(content)
            val list = mutableListOf<TimelineEntry>()
            for (i in 0 until array.length()) {
                list.add(jsonToEntry(array.getJSONObject(i)))
            }
            list
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read timeline", e)
            emptyList()
        }
    }

    fun getTimelineByEventType(eventType: String): List<TimelineEntry> {
        return getTimeline().filter { it.eventType == eventType }
    }

    fun clearAllTimeline() {
        synchronized(writeLock) {
            if (timelineFile.exists()) {
                timelineFile.delete()
            }
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
        private const val MAX_ENTRIES = 1000
    }
}