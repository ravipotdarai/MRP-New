package com.mrp.domain.risk

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

/**
 * Local false-positive reports for Safe Link.
 * Stores domain hash + reason codes only — never full URL or query strings.
 */
class FalsePositiveStore(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun report(hostRaw: String, reasonCodes: List<String>, note: String?): Boolean {
        val host = UrlNormalizer.normalizeHost(hostRaw) ?: return false
        val entry = JSONObject()
            .put("t", System.currentTimeMillis())
            .put("domainHash", sha256Short(host))
            .put("hostSuffix", host.takeLast(24))
            .put("reasons", JSONArray(reasonCodes.take(8)))
            .put("note", (note ?: "").take(80))
        val arr = load()
        arr.put(entry)
        while (arr.length() > MAX) arr.remove(0)
        prefs.edit().putString(KEY, arr.toString()).apply()
        return true
    }

    fun count(): Int = load().length()

    fun recent(limit: Int = 10): List<Map<String, Any?>> {
        val arr = load()
        val out = mutableListOf<Map<String, Any?>>()
        val start = (arr.length() - limit).coerceAtLeast(0)
        for (i in start until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            out.add(
                mapOf(
                    "t" to o.optLong("t"),
                    "domainHash" to o.optString("domainHash"),
                    "hostSuffix" to o.optString("hostSuffix"),
                ),
            )
        }
        return out.asReversed()
    }

    private fun load(): JSONArray {
        return try {
            JSONArray(prefs.getString(KEY, "[]") ?: "[]")
        } catch (_: Exception) {
            JSONArray()
        }
    }

    private fun sha256Short(value: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
        return bytes.take(8).joinToString("") { "%02x".format(it) }
    }

    companion object {
        private const val PREFS = "mrp_safe_link_fp"
        private const val KEY = "reports_json"
        private const val MAX = 50
    }
}
