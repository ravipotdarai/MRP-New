package com.mrp.domain.guardian

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Recent blocked-domain activity ring (host hashed/truncated — no full browsing history). */
class GuardianActivityStore(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun record(category: DomainCategory, host: String) {
        val entry = JSONObject()
            .put("t", System.currentTimeMillis())
            .put("category", category.name.lowercase())
            .put("host", host.take(64))
        val arr = load()
        arr.put(entry)
        while (arr.length() > MAX) {
            arr.remove(0)
        }
        prefs.edit().putString(KEY, arr.toString()).commit()
    }

    fun recent(limit: Int = 20): List<Map<String, Any?>> {
        val arr = load()
        val out = mutableListOf<Map<String, Any?>>()
        val start = (arr.length() - limit).coerceAtLeast(0)
        for (i in start until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            out.add(
                mapOf(
                    "t" to o.optLong("t"),
                    "category" to o.optString("category"),
                    "host" to o.optString("host"),
                ),
            )
        }
        return out.asReversed()
    }

    private fun load(): JSONArray {
        val raw = prefs.getString(KEY, "[]") ?: "[]"
        return try {
            JSONArray(raw)
        } catch (_: Exception) {
            JSONArray()
        }
    }

    companion object {
        private const val PREFS = "mrp_guardian_activity"
        private const val KEY = "recent_json"
        private const val MAX = 40
    }
}
