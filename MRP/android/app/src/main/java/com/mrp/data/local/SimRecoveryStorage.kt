package com.mrp.data.local

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.mrp.domain.model.RecoveryContact
import com.mrp.domain.model.SimIdentity
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Encrypted storage for recovery contacts + SIM baseline + feature flags.
 * Phone numbers are never written to plaintext prefs or logs.
 */
class SimRecoveryStorage(context: Context) {

    private val appContext = context.applicationContext

    private val prefs: SharedPreferences by lazy { createPrefs() }

    private fun createPrefs(): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(appContext)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                appContext,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.e(TAG, "Encrypted prefs unavailable — falling back to private prefs", e)
            appContext.getSharedPreferences(PREFS_NAME + "_fallback", Context.MODE_PRIVATE)
        }
    }

    fun isEnabled(): Boolean = prefs.getBoolean(KEY_ENABLED, false)

    fun setEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    fun hasConsent(): Boolean = prefs.getBoolean(KEY_CONSENT, false)

    fun setConsent(consent: Boolean) {
        prefs.edit().putBoolean(KEY_CONSENT, consent).apply()
    }

    fun getContacts(): List<RecoveryContact> {
        val raw = prefs.getString(KEY_CONTACTS, "[]") ?: "[]"
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { i ->
                val o = arr.optJSONObject(i) ?: return@mapNotNull null
                RecoveryContact(
                    id = o.optString("id"),
                    name = o.optString("name"),
                    phoneNumber = o.optString("phone"),
                    relationship = o.optString("relationship"),
                    priority = o.optInt("priority", i + 1),
                    verified = o.optBoolean("verified", false),
                    createdAtMs = o.optLong("createdAtMs", System.currentTimeMillis())
                )
            }.sortedBy { it.priority }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse contacts", e)
            emptyList()
        }
    }

    /** Returns contacts with phone numbers masked for UI/bridge. */
    fun getContactsMasked(): List<Map<String, Any?>> =
        getContacts().map { c ->
            mapOf(
                "id" to c.id,
                "name" to c.name,
                "phoneNumber" to maskPhone(c.phoneNumber),
                "relationship" to c.relationship,
                "priority" to c.priority,
                "verified" to c.verified,
                "createdAtMs" to c.createdAtMs
            )
        }

    fun saveContact(name: String, phone: String, relationship: String, priority: Int): RecoveryContact? {
        val cleaned = phone.filter { it.isDigit() || it == '+' }
        if (cleaned.length < 8) return null
        val contacts = getContacts().toMutableList()
        if (contacts.size >= MAX_CONTACTS) return null
        val contact = RecoveryContact(
            id = UUID.randomUUID().toString(),
            name = name.trim().ifBlank { "Contact" },
            phoneNumber = cleaned,
            relationship = relationship.trim(),
            priority = priority.coerceIn(1, MAX_CONTACTS),
            verified = false
        )
        contacts.add(contact)
        persistContacts(contacts.take(MAX_CONTACTS))
        return contact
    }

    fun deleteContact(id: String): Boolean {
        val next = getContacts().filter { it.id != id }
        if (next.size == getContacts().size) return false
        persistContacts(next)
        return true
    }

    fun hasRecoveryContacts(): Boolean = getContacts().isNotEmpty()

    fun getBaseline(): SimIdentity? {
        val raw = prefs.getString(KEY_BASELINE, null) ?: return null
        return try {
            val o = JSONObject(raw)
            SimIdentity(
                iccid = o.optString("iccid"),
                subscriptionId = o.optInt("subscriptionId", -1),
                carrier = o.optString("carrier"),
                simSlot = o.optInt("simSlot", -1),
                phoneNumber = o.optString("phoneNumber"),
                imsi = o.optString("imsi"),
                enrolledAtMs = o.optLong("enrolledAtMs", 0L)
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse baseline", e)
            null
        }
    }

    fun setBaseline(identity: SimIdentity) {
        val o = JSONObject().apply {
            put("iccid", identity.iccid)
            put("subscriptionId", identity.subscriptionId)
            put("carrier", identity.carrier)
            put("simSlot", identity.simSlot)
            // Store phone in encrypted prefs only; never log
            put("phoneNumber", identity.phoneNumber)
            put("imsi", identity.imsi)
            put("enrolledAtMs", identity.enrolledAtMs)
        }
        prefs.edit().putString(KEY_BASELINE, o.toString()).apply()
    }

    fun clearBaseline() {
        prefs.edit().remove(KEY_BASELINE).apply()
    }

    fun setLastSimChangeMs(ms: Long) {
        prefs.edit().putLong(KEY_LAST_CHANGE, ms).apply()
    }

    fun getLastSimChangeMs(): Long = prefs.getLong(KEY_LAST_CHANGE, 0L)

    fun setLastSmsMs(ms: Long) {
        prefs.edit().putLong(KEY_LAST_SMS, ms).apply()
    }

    fun getLastSmsMs(): Long = prefs.getLong(KEY_LAST_SMS, 0L)

    fun enqueuePendingSync(payloadJson: String) {
        val arr = JSONArray(prefs.getString(KEY_PENDING_SYNC, "[]") ?: "[]")
        arr.put(JSONObject().apply {
            put("id", UUID.randomUUID().toString())
            put("type", "SIM_CHANGE")
            put("createdAtMs", System.currentTimeMillis())
            put("payload", payloadJson)
            put("status", "PENDING")
        })
        prefs.edit().putString(KEY_PENDING_SYNC, arr.toString()).apply()
    }

    fun pendingSyncCount(): Int {
        return try {
            JSONArray(prefs.getString(KEY_PENDING_SYNC, "[]") ?: "[]").length()
        } catch (_: Exception) {
            0
        }
    }

    fun appendHistory(summaryJson: String) {
        val arr = JSONArray(prefs.getString(KEY_HISTORY, "[]") ?: "[]")
        arr.put(JSONObject(summaryJson))
        // Keep last 50
        while (arr.length() > 50) arr.remove(0)
        prefs.edit().putString(KEY_HISTORY, arr.toString()).apply()
    }

    fun getHistoryJson(): String = prefs.getString(KEY_HISTORY, "[]") ?: "[]"

    fun clearHistory() {
        prefs.edit().putString(KEY_HISTORY, "[]").apply()
    }

    private fun persistContacts(contacts: List<RecoveryContact>) {
        val arr = JSONArray()
        contacts.forEach { c ->
            arr.put(JSONObject().apply {
                put("id", c.id)
                put("name", c.name)
                put("phone", c.phoneNumber)
                put("relationship", c.relationship)
                put("priority", c.priority)
                put("verified", c.verified)
                put("createdAtMs", c.createdAtMs)
            })
        }
        prefs.edit().putString(KEY_CONTACTS, arr.toString()).apply()
    }

    companion object {
        private const val TAG = "SimRecoveryStorage"
        private const val PREFS_NAME = "mrp_sim_recovery_enc"
        private const val KEY_ENABLED = "enabled"
        private const val KEY_CONSENT = "consent"
        private const val KEY_CONTACTS = "contacts"
        private const val KEY_BASELINE = "sim_baseline"
        private const val KEY_LAST_CHANGE = "last_change_ms"
        private const val KEY_LAST_SMS = "last_sms_ms"
        private const val KEY_PENDING_SYNC = "pending_sync"
        private const val KEY_HISTORY = "history"
        const val MAX_CONTACTS = 3

        fun maskPhone(phone: String): String {
            val digits = phone.filter { it.isDigit() }
            if (digits.length <= 4) return "****"
            return "*".repeat(8) + digits.takeLast(4)
        }
    }
}
