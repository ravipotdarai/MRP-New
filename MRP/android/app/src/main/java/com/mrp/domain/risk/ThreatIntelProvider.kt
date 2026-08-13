package com.mrp.domain.risk

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.security.MessageDigest

data class ThreatHit(
    val category: String,
    val rule: String,
    val source: String,
    val score: Int,
)

/**
 * Local reputation cache. Optional remote JSON may enrich it; lookup always fails open.
 * Does not block app usage when the network or signature check fails.
 */
class ThreatIntelProvider(context: Context) {

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private var malware: Set<String> = BUNDLED_MALWARE
    private var phishing: Set<String> = BUNDLED_PHISHING

    init {
        loadCache()
    }

    fun version(): String = prefs.getString(KEY_VERSION, BUNDLED_VERSION) ?: BUNDLED_VERSION

    fun updatedAtMs(): Long = prefs.getLong(KEY_UPDATED_AT, 0L)

    fun lastError(): String? = prefs.getString(KEY_LAST_ERROR, null)

    fun lookup(hostRaw: String): ThreatHit? {
        val host = hostRaw.trim().trimEnd('.').lowercase()
        if (host.isBlank()) return null
        findIn(host, malware)?.let {
            return ThreatHit("malware", it, "local_intel", 50)
        }
        findIn(host, phishing)?.let {
            return ThreatHit("phishing", it, "local_intel", 45)
        }
        return null
    }

    /**
     * Attempts a signed remote refresh. Returns false and keeps the cache on any failure.
     */
    fun refreshRemote(feedUrl: String? = null): Boolean {
        val url = (feedUrl ?: prefs.getString(KEY_FEED_URL, null)).orEmpty().trim()
        if (url.isBlank()) {
            loadBundled()
            prefs.edit().remove(KEY_LAST_ERROR).apply()
            return true
        }
        return try {
            val body = java.net.URL(url).openConnection().apply {
                connectTimeout = 4000
                readTimeout = 4000
            }.getInputStream().bufferedReader().use { it.readText() }
            val json = JSONObject(body)
            val expected = json.optString("sha256")
            val malwareArr = json.optJSONArray("malware")
            val phishArr = json.optJSONArray("phishing")
            val mal = jsonArrayToSet(malwareArr)
            val phi = jsonArrayToSet(phishArr)
            val actual = sha256Hex((mal + phi).sorted().joinToString("\n"))
            if (expected.isNotBlank() && !expected.equals(actual, ignoreCase = true)) {
                prefs.edit().putString(KEY_LAST_ERROR, "Threat intel signature mismatch — kept previous list").apply()
                return false
            }
            malware = BUNDLED_MALWARE + mal
            phishing = BUNDLED_PHISHING + phi
            val version = json.optString("version", "remote")
            val cache = JSONObject()
                .put("malware", toJsonArray(mal))
                .put("phishing", toJsonArray(phi))
            prefs.edit()
                .putString(KEY_VERSION, version)
                .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
                .putString(KEY_CACHE, cache.toString())
                .remove(KEY_LAST_ERROR)
                .apply()
            true
        } catch (e: Exception) {
            Log.w(TAG, "threat intel refresh failed open", e)
            prefs.edit().putString(KEY_LAST_ERROR, "Threat intel refresh failed — using local cache").apply()
            false
        }
    }

    fun setFeedUrl(url: String?) {
        val trimmed = url?.trim().orEmpty()
        if (trimmed.isBlank()) {
            prefs.edit().remove(KEY_FEED_URL).apply()
        } else {
            prefs.edit().putString(KEY_FEED_URL, trimmed).apply()
        }
    }

    fun feedUrlConfigured(): Boolean = !prefs.getString(KEY_FEED_URL, null).isNullOrBlank()

    fun snapshot(): Map<String, Any?> = mapOf(
        "intelVersion" to version(),
        "intelUpdatedAtMs" to updatedAtMs(),
        "intelLastError" to lastError(),
        "intelSource" to if (prefs.contains(KEY_CACHE)) "cache" else "bundled",
        "intelFeedConfigured" to feedUrlConfigured(),
    )

    private fun loadCache() {
        val raw = prefs.getString(KEY_CACHE, null)
        if (raw.isNullOrBlank()) {
            loadBundled()
            return
        }
        try {
            val json = JSONObject(raw)
            malware = BUNDLED_MALWARE + jsonArrayToSet(json.optJSONArray("malware"))
            phishing = BUNDLED_PHISHING + jsonArrayToSet(json.optJSONArray("phishing"))
        } catch (_: Exception) {
            loadBundled()
        }
    }

    private fun loadBundled() {
        malware = BUNDLED_MALWARE
        phishing = BUNDLED_PHISHING
        if (!prefs.contains(KEY_VERSION)) {
            prefs.edit()
                .putString(KEY_VERSION, BUNDLED_VERSION)
                .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
                .apply()
        }
    }

    private fun findIn(host: String, rules: Set<String>): String? {
        for (rule in rules) {
            if (host == rule || host.endsWith(".$rule")) return rule
        }
        return null
    }

    private fun jsonArrayToSet(arr: org.json.JSONArray?): Set<String> {
        if (arr == null) return emptySet()
        return (0 until arr.length()).mapNotNull { arr.optString(it).trim().lowercase().ifBlank { null } }.toSet()
    }

    private fun toJsonArray(values: Set<String>): org.json.JSONArray {
        val arr = org.json.JSONArray()
        values.forEach { arr.put(it) }
        return arr
    }

    private fun sha256Hex(value: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
        return bytes.joinToString("") { "%02x".format(it) }
    }

    companion object {
        private const val TAG = "ThreatIntel"
        private const val PREFS = "mrp_threat_intel"
        private const val KEY_VERSION = "version"
        private const val KEY_UPDATED_AT = "updated_at_ms"
        private const val KEY_CACHE = "cache_json"
        private const val KEY_FEED_URL = "feed_url"
        private const val KEY_LAST_ERROR = "last_error"
        private const val BUNDLED_VERSION = "bundled-1"

        private val BUNDLED_MALWARE = setOf(
            "malware-test.example",
            "evil-tracker.example",
        )
        private val BUNDLED_PHISHING = setOf(
            "phish-test.example",
            "login-secure-update.example",
        )
    }
}
