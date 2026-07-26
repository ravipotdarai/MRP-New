package com.mrp.data.local

import android.content.Context
import org.json.JSONObject

/**
 * Latest live location + context — always on device.
 * Synced to Drive per device_config; never written to Firebase.
 */
object LiveLocationStore {

    private const val PREFS = "mrp_live_location"
    private const val KEY_JSON = "latest_json"

    fun save(context: Context, json: JSONObject) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_JSON, json.toString())
            .apply()
    }

    fun read(context: Context): JSONObject? {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_JSON, null) ?: return null
        return try {
            JSONObject(raw)
        } catch (_: Exception) {
            null
        }
    }

    fun readOrEmpty(context: Context): JSONObject = read(context) ?: JSONObject()
}
