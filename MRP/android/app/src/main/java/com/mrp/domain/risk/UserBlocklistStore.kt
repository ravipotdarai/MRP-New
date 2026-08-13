package com.mrp.domain.risk

import android.content.Context
import org.json.JSONArray

/** User-managed blocklist for Safe Link / policy engine (beyond Guardian DNS allowlist). */
class UserBlocklistStore(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun list(): List<String> {
        val raw = prefs.getString(KEY, "[]") ?: "[]"
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { arr.optString(it).trim().lowercase().ifBlank { null } }
                .distinct()
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun add(hostRaw: String): Boolean {
        val host = UrlNormalizer.normalizeHost(hostRaw) ?: return false
        val next = (list() + host).distinct().take(MAX)
        write(next)
        return true
    }

    fun remove(hostRaw: String) {
        val host = UrlNormalizer.normalizeHost(hostRaw) ?: hostRaw.trim().lowercase()
        write(list().filter { it != host })
    }

    fun matches(hostRaw: String): Boolean {
        val host = UrlNormalizer.normalizeHost(hostRaw) ?: return false
        return list().any { host == it || host.endsWith(".$it") }
    }

    private fun write(values: List<String>) {
        val arr = JSONArray()
        values.forEach { arr.put(it) }
        prefs.edit().putString(KEY, arr.toString()).apply()
    }

    companion object {
        private const val PREFS = "mrp_user_blocklist"
        private const val KEY = "hosts"
        private const val MAX = 100
    }
}
