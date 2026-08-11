package com.mrp.data.local

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject

/**
 * ICE / Emergency Card — encrypted prefs. Never mixed with Secure Vault secrets.
 */
class EmergencyCardStorage(context: Context) {

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
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        } catch (e: Exception) {
            Log.e(TAG, "Encrypted prefs unavailable — fallback", e)
            appContext.getSharedPreferences(PREFS_NAME + "_fallback", Context.MODE_PRIVATE)
        }
    }

    fun getCard(): Map<String, Any?> {
        val raw = prefs.getString(KEY_CARD, null) ?: return emptyDefaults()
        return try {
            jsonToMap(JSONObject(raw))
        } catch (e: Exception) {
            Log.e(TAG, "parse card", e)
            emptyDefaults()
        }
    }

    fun saveCard(fields: Map<String, Any?>): Map<String, Any?> {
        val merged = emptyDefaults().toMutableMap()
        merged.putAll(getCard())
        for ((k, v) in fields) {
            if (k in ALLOWED_KEYS) merged[k] = v
        }
        merged["updatedAtMs"] = System.currentTimeMillis()
        prefs.edit().putString(KEY_CARD, mapToJson(merged).toString()).apply()
        return merged
    }

    fun clear(): Boolean {
        prefs.edit().remove(KEY_CARD).apply()
        return true
    }

    /** Public summary for lock-screen / system — only fields marked visible. */
    fun lockScreenSummary(): Map<String, Any?> {
        val card = getCard()
        val out = mutableMapOf<String, Any?>()
        val vis = (card["visibleFields"] as? List<*>)?.map { it.toString() } ?: emptyList()
        for (key in LOCK_SAFE_KEYS) {
            if (key in vis) out[key] = card[key]
        }
        out["enabled"] = card["lockScreenEnabled"] == true
        return out
    }

    private fun emptyDefaults(): MutableMap<String, Any?> = mutableMapOf(
        "name" to "",
        "bloodGroup" to "",
        "allergies" to "",
        "contacts" to emptyList<Map<String, String>>(),
        "insurance" to "",
        "medicalNotes" to "",
        "instructions" to "",
        "visibleFields" to listOf("name", "bloodGroup"),
        "lockScreenEnabled" to false,
        "updatedAtMs" to 0L,
    )

    private fun mapToJson(map: Map<String, Any?>): JSONObject {
        val o = JSONObject()
        for ((k, v) in map) {
            when (v) {
                null -> o.put(k, JSONObject.NULL)
                is List<*> -> {
                    val arr = JSONArray()
                    for (item in v) {
                        when (item) {
                            is Map<*, *> -> {
                                val child = JSONObject()
                                for ((ck, cv) in item) {
                                    child.put(ck.toString(), cv ?: JSONObject.NULL)
                                }
                                arr.put(child)
                            }
                            else -> arr.put(item)
                        }
                    }
                    o.put(k, arr)
                }
                else -> o.put(k, v)
            }
        }
        return o
    }

    private fun jsonToMap(o: JSONObject): MutableMap<String, Any?> {
        val map = mutableMapOf<String, Any?>()
        val keys = o.keys()
        while (keys.hasNext()) {
            val k = keys.next()
            val v = o.opt(k)
            map[k] = when (v) {
                JSONObject.NULL, null -> null
                is JSONArray -> {
                    if (k == "contacts") {
                        (0 until v.length()).mapNotNull { i ->
                            val c = v.optJSONObject(i) ?: return@mapNotNull null
                            mapOf(
                                "name" to c.optString("name"),
                                "phone" to c.optString("phone"),
                            )
                        }
                    } else {
                        (0 until v.length()).map { v.optString(it) }
                    }
                }
                else -> v
            }
        }
        return map
    }

    companion object {
        private const val TAG = "EmergencyCardStorage"
        private const val PREFS_NAME = "mrp_emergency_card"
        private const val KEY_CARD = "card_json"
        private val ALLOWED_KEYS = setOf(
            "name", "bloodGroup", "allergies", "contacts", "insurance",
            "medicalNotes", "instructions", "visibleFields", "lockScreenEnabled",
        )
        private val LOCK_SAFE_KEYS = setOf("name", "bloodGroup", "allergies", "contacts", "instructions")
    }
}
