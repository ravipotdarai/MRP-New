package com.mrp.data.local

import android.content.Context
import android.util.Log
import com.mrp.domain.model.EventMetadata
import com.mrp.domain.model.EventType
import com.mrp.domain.model.MonitoringEvent
import org.json.JSONArray
import org.json.JSONObject
import java.util.Date

class EventStorage(private val context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun saveEvent(event: MonitoringEvent) {
        val events = getEvents().toMutableList()
        events.add(0, event) // Add to beginning (newest first)

        // Keep max 1000 events
        val trimmed = events.take(1000)

        val jsonArray = JSONArray()
        trimmed.forEach { e ->
            jsonArray.put(eventToJson(e))
        }

        prefs.edit().putString(KEY_EVENTS, jsonArray.toString()).apply()
        Log.d(TAG, "Event saved: ${event.type}, total: ${trimmed.size}")
    }

    fun getEvents(): List<MonitoringEvent> {
        val json = prefs.getString(KEY_EVENTS, "[]") ?: "[]"
        return try {
            val array = JSONArray(json)
            val events = mutableListOf<MonitoringEvent>()
            for (i in 0 until array.length()) {
                events.add(jsonToEvent(array.getJSONObject(i)))
            }
            events
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse events", e)
            emptyList()
        }
    }

    fun getEventsByType(type: String): List<MonitoringEvent> {
        return getEvents().filter { it.type.name == type }
    }

    fun getEventsByDateRange(start: Long, end: Long): List<MonitoringEvent> {
        return getEvents().filter { it.timestamp.time in start..end }
    }

    fun deleteEvent(eventId: String) {
        val events = getEvents().filter { it.id != eventId }
        saveAllEvents(events)
    }

    fun clearAllEvents() {
        prefs.edit().remove(KEY_EVENTS).apply()
    }

    private fun saveAllEvents(events: List<MonitoringEvent>) {
        val jsonArray = JSONArray()
        events.forEach { e ->
            jsonArray.put(eventToJson(e))
        }
        prefs.edit().putString(KEY_EVENTS, jsonArray.toString()).apply()
    }

    private fun eventToJson(event: MonitoringEvent): JSONObject {
        return JSONObject().apply {
            put("id", event.id)
            put("type", event.type.name)
            put("severity", event.severity.name)
            put("timestamp", event.timestamp.time)
            put("intruderId", event.intruderId ?: "")
            put("photoPath", event.photoPath ?: "")
            put("attempts", event.metadata.attempts)
            put("wifiEnabled", event.metadata.wifiEnabled)
            put("mobileDataEnabled", event.metadata.mobileDataEnabled)
            put("hotspotEnabled", event.metadata.hotspotEnabled)
            put("simState", event.metadata.simState ?: "")
            put("packageName", event.metadata.packageName ?: "")
            put("description", event.metadata.description ?: "")
        }
    }

    private fun jsonToEvent(json: JSONObject): MonitoringEvent {
        val metadata = EventMetadata(
            attempts = json.optInt("attempts", 0),
            wifiEnabled = if (json.has("wifiEnabled")) json.getBoolean("wifiEnabled") else null,
            mobileDataEnabled = if (json.has("mobileDataEnabled")) json.getBoolean("mobileDataEnabled") else null,
            hotspotEnabled = if (json.has("hotspotEnabled")) json.getBoolean("hotspotEnabled") else null,
            simState = json.optString("simState", null),
            packageName = json.optString("packageName", null),
            description = json.optString("description", null)
        )

        return MonitoringEvent(
            id = json.getString("id"),
            type = EventType.valueOf(json.getString("type")),
            severity = com.mrp.domain.model.Severity.valueOf(json.getString("severity")),
            timestamp = Date(json.getLong("timestamp")),
            intruderId = json.optString("intruderId").ifEmpty { null },
            photoPath = json.optString("photoPath").ifEmpty { null },
            metadata = metadata
        )
    }

    companion object {
        private const val TAG = "EventStorage"
        private const val PREFS_NAME = "mrp_events"
        private const val KEY_EVENTS = "events"
    }
}