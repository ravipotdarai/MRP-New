package com.mrp.data.local

import android.content.Context
import org.json.JSONArray

/** User-trusted URL domains for Safe Link — never flagged above SAFE band. */
class SafeLinkAllowlistStore(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun list(): List<String> {
        val raw = prefs.getString(KEY_LIST, "[]") ?: "[]"
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { arr.optString(it).trim().lowercase().ifBlank { null } }
                .distinct()
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun add(hostRaw: String): Boolean {
        val host = com.mrp.domain.risk.UrlNormalizer.normalizeHost(hostRaw) ?: return false
        val next = (list() + host).distinct().take(MAX)
        val arr = JSONArray()
        next.forEach { arr.put(it) }
        prefs.edit().putString(KEY_LIST, arr.toString()).apply()
        return true
    }

    fun remove(hostRaw: String) {
        val host = com.mrp.domain.risk.UrlNormalizer.normalizeHost(hostRaw) ?: hostRaw.trim().lowercase()
        val next = list().filter { it != host }
        val arr = JSONArray()
        next.forEach { arr.put(it) }
        prefs.edit().putString(KEY_LIST, arr.toString()).apply()
    }

    companion object {
        private const val PREFS = "mrp_safe_link_allowlist"
        private const val KEY_LIST = "hosts"
        private const val MAX = 50
    }
}
