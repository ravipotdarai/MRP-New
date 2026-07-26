package com.mrp.data.local

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Persisted geofence zones (Hub → Geofence). Loaded by [com.mrp.domain.usecase.LocationHelper].
 */
object GeofenceStorage {

    data class Zone(
        val id: String,
        val name: String,
        val latitude: Double,
        val longitude: Double,
        val radiusMeters: Float,
        val enabled: Boolean = true
    )

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun list(context: Context): List<Zone> {
        val raw = prefs(context).getString(KEY_ZONES, "[]") ?: "[]"
        return try {
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    add(
                        Zone(
                            id = o.getString("id"),
                            name = o.optString("name", "Zone"),
                            latitude = o.getDouble("latitude"),
                            longitude = o.getDouble("longitude"),
                            radiusMeters = o.optDouble("radiusMeters", 150.0).toFloat(),
                            enabled = o.optBoolean("enabled", true)
                        )
                    )
                }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun saveAll(context: Context, zones: List<Zone>) {
        val arr = JSONArray()
        zones.forEach { z ->
            arr.put(
                JSONObject()
                    .put("id", z.id)
                    .put("name", z.name)
                    .put("latitude", z.latitude)
                    .put("longitude", z.longitude)
                    .put("radiusMeters", z.radiusMeters.toDouble())
                    .put("enabled", z.enabled)
            )
        }
        prefs(context).edit().putString(KEY_ZONES, arr.toString()).apply()
    }

    fun upsert(context: Context, zone: Zone) {
        val next = list(context).filter { it.id != zone.id } + zone
        saveAll(context, next)
    }

    fun remove(context: Context, id: String) {
        saveAll(context, list(context).filter { it.id != id })
    }

    private const val PREFS = "mrp_geofence_prefs"
    private const val KEY_ZONES = "zones"
}
