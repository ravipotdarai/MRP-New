package com.mrp.data.local

import android.content.Context
import android.util.Log
import com.mrp.domain.model.Intruder
import org.json.JSONArray
import org.json.JSONObject
import java.util.Date

class IntruderStorage(private val context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun saveIntruder(intruder: Intruder) {
        val intruders = getIntruders().toMutableList()
        val existing = intruders.indexOfFirst { it.id == intruder.id }

        if (existing >= 0) {
            intruders[existing] = intruder
        } else {
            intruders.add(intruder)
        }

        val jsonArray = JSONArray()
        intruders.forEach { i -> jsonArray.put(intruderToJson(i)) }

        prefs.edit().putString(KEY_INTRUDERS, jsonArray.toString()).apply()
    }

    fun getIntruders(): List<Intruder> {
        val json = prefs.getString(KEY_INTRUDERS, "[]") ?: "[]"
        return try {
            val array = JSONArray(json)
            val list = mutableListOf<Intruder>()
            for (i in 0 until array.length()) {
                list.add(jsonToIntruder(array.getJSONObject(i)))
            }
            list
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse intruders", e)
            emptyList()
        }
    }

    fun getIntruderById(id: String): Intruder? {
        return getIntruders().find { it.id == id }
    }

    fun deleteIntruder(intruderId: String) {
        val intruders = getIntruders().filter { it.id != intruderId }
        val jsonArray = JSONArray()
        intruders.forEach { i -> jsonArray.put(intruderToJson(i)) }
        prefs.edit().putString(KEY_INTRUDERS, jsonArray.toString()).apply()
    }

    private fun intruderToJson(intruder: Intruder): JSONObject {
        return JSONObject().apply {
            put("id", intruder.id)
            put("name", intruder.name ?: "")
            put("photoPaths", JSONArray(intruder.photoPaths))
            put("eventIds", JSONArray(intruder.eventIds))
            put("firstSeen", intruder.firstSeen.time)
            put("lastSeen", intruder.lastSeen.time)
            put("threatLevel", intruder.threatLevel)
        }
    }

    private fun jsonToIntruder(json: JSONObject): Intruder {
        val photoPaths = mutableListOf<String>()
        val photoArray = json.getJSONArray("photoPaths")
        for (i in 0 until photoArray.length()) {
            photoPaths.add(photoArray.getString(i))
        }

        val eventIds = mutableListOf<String>()
        val eventArray = json.getJSONArray("eventIds")
        for (i in 0 until eventArray.length()) {
            eventIds.add(eventArray.getString(i))
        }

        return Intruder(
            id = json.getString("id"),
            name = json.optString("name", null),
            photoPaths = photoPaths,
            eventIds = eventIds,
            firstSeen = Date(json.getLong("firstSeen")),
            lastSeen = Date(json.getLong("lastSeen")),
            threatLevel = json.optInt("threatLevel", 0)
        )
    }

    companion object {
        private const val TAG = "IntruderStorage"
        private const val PREFS_NAME = "mrp_intruders"
        private const val KEY_INTRUDERS = "intruders"
    }
}