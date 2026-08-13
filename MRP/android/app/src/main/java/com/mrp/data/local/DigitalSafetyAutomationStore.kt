package com.mrp.data.local

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Opt-in automation prefs. Stores enrolled emails and toggles only — never clipboard
 * contents, SMS bodies, or browsing history.
 */
class DigitalSafetyAutomationStore(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun clipboardScanEnabled(): Boolean = prefs.getBoolean(KEY_CLIPBOARD, false)

    fun setClipboardScanEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_CLIPBOARD, enabled).apply()
    }

    fun smsAutoScanEnabled(): Boolean = prefs.getBoolean(KEY_SMS_AUTO, false)

    fun setSmsAutoScanEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_SMS_AUTO, enabled).apply()
    }

    fun enrolledEmails(): List<String> {
        val raw = prefs.getString(KEY_EMAILS, "[]") ?: "[]"
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { arr.optString(it).trim().lowercase().ifBlank { null } }
                .distinct()
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun enrollEmail(email: String): Boolean {
        val normalized = email.trim().lowercase()
        if (normalized.isBlank() || !EMAIL_RE.matches(normalized)) return false
        val next = (enrolledEmails() + normalized).distinct().take(MAX_EMAILS)
        prefs.edit().putString(KEY_EMAILS, JSONArray(next).toString()).apply()
        return true
    }

    fun unenrollEmail(email: String) {
        val normalized = email.trim().lowercase()
        val next = enrolledEmails().filter { it != normalized }
        val results = lastResultsObject()
        results.remove(normalized)
        prefs.edit()
            .putString(KEY_EMAILS, JSONArray(next).toString())
            .putString(KEY_RESULTS, results.toString())
            .apply()
    }

    fun lastCheckAtMs(): Long = prefs.getLong(KEY_LAST_CHECK, 0L)

    fun recordCheck(email: String, status: String, breachCount: Int) {
        val normalized = email.trim().lowercase()
        val results = lastResultsObject()
        results.put(
            normalized,
            JSONObject()
                .put("status", status)
                .put("count", breachCount)
                .put("atMs", System.currentTimeMillis()),
        )
        prefs.edit()
            .putLong(KEY_LAST_CHECK, System.currentTimeMillis())
            .putString(KEY_RESULTS, results.toString())
            .apply()
    }

    fun lastResult(email: String): Map<String, Any?>? {
        val obj = lastResultsObject().optJSONObject(email.trim().lowercase()) ?: return null
        return mapOf(
            "status" to obj.optString("status"),
            "count" to obj.optInt("count"),
            "atMs" to obj.optLong("atMs"),
        )
    }

    fun snapshot(): Map<String, Any?> {
        val emails = enrolledEmails()
        val enrolled = emails.map { email ->
            val last = lastResult(email)
            mapOf(
                "email" to email,
                "lastStatus" to (last?.get("status") ?: "unknown"),
                "lastCount" to (last?.get("count") ?: 0),
                "lastCheckedAtMs" to (last?.get("atMs") ?: 0L),
            )
        }
        return mapOf(
            "clipboardScanEnabled" to clipboardScanEnabled(),
            "smsAutoScanEnabled" to smsAutoScanEnabled(),
            "smsAutoScanAvailable" to com.mrp.domain.guardian.DigitalSafetyFlags.SMS_AUTO_SCAN_ENABLED,
            "enrolledEmails" to enrolled,
            "lastCheckAtMs" to lastCheckAtMs(),
        )
    }

    private fun lastResultsObject(): JSONObject {
        return try {
            JSONObject(prefs.getString(KEY_RESULTS, "{}") ?: "{}")
        } catch (_: Exception) {
            JSONObject()
        }
    }

    companion object {
        private const val PREFS = "mrp_ds_automation"
        private const val KEY_CLIPBOARD = "clipboard_scan"
        private const val KEY_SMS_AUTO = "sms_auto"
        private const val KEY_EMAILS = "enrolled_emails"
        private const val KEY_RESULTS = "last_results"
        private const val KEY_LAST_CHECK = "last_check_at_ms"
        private const val MAX_EMAILS = 5
        private val EMAIL_RE = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
    }
}
