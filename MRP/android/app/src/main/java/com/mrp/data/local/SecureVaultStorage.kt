package com.mrp.data.local

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.mrp.domain.usecase.VaultBackupCrypto
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/**
 * Secrets Secure Vault — separate from evidence timeline vault.
 * Metadata in EncryptedSharedPreferences; note bodies encrypted with PIN via VaultBackupCrypto.
 */
class SecureVaultStorage(context: Context) {

    private val appContext = context.applicationContext
    private val prefs: SharedPreferences by lazy { createPrefs() }
    private val filesDir: File by lazy {
        File(appContext.filesDir, "secure_vault").also { if (!it.exists()) it.mkdirs() }
    }

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

    fun listItems(): List<Map<String, Any?>> {
        return loadAll().map { toPublicMeta(it) }.sortedByDescending {
            (it["updatedAtMs"] as? Number)?.toLong() ?: 0L
        }
    }

    fun getItem(id: String, pin: String): Map<String, Any?>? {
        val item = loadAll().find { it.optString("id") == id } ?: return null
        val encBody = item.optString("bodyEnc", "")
        val body = if (encBody.isNotBlank()) {
            try {
                VaultBackupCrypto.decryptUtf8(VaultBackupCrypto.fromBase64(encBody), pin)
            } catch (e: Exception) {
                Log.e(TAG, "decrypt body failed", e)
                return null
            }
        } else ""
        return toPublicMeta(item) + mapOf("body" to body)
    }

    fun createItem(
        pin: String,
        category: String,
        title: String,
        body: String,
        expiryAtMs: Long?,
    ): Map<String, Any?>? {
        val id = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        val bodyEnc = if (body.isNotEmpty()) {
            VaultBackupCrypto.toBase64(VaultBackupCrypto.encryptUtf8(body, pin))
        } else ""
        val o = JSONObject().apply {
            put("id", id)
            put("category", category.ifBlank { "notes" })
            put("title", title.trim().ifBlank { "Untitled" })
            put("bodyEnc", bodyEnc)
            put("createdAtMs", now)
            put("updatedAtMs", now)
            if (expiryAtMs != null && expiryAtMs > 0) put("expiryAtMs", expiryAtMs)
        }
        val all = loadAll().toMutableList()
        all.add(o)
        persist(all)
        return toPublicMeta(o)
    }

    fun updateItem(
        pin: String,
        id: String,
        category: String?,
        title: String?,
        body: String?,
        expiryAtMs: Long?,
    ): Map<String, Any?>? {
        val all = loadAll().toMutableList()
        val idx = all.indexOfFirst { it.optString("id") == id }
        if (idx < 0) return null
        val o = all[idx]
        // Verify PIN can decrypt existing body if present
        val existingEnc = o.optString("bodyEnc", "")
        if (existingEnc.isNotBlank()) {
            try {
                VaultBackupCrypto.decryptUtf8(VaultBackupCrypto.fromBase64(existingEnc), pin)
            } catch (_: Exception) {
                return null
            }
        }
        if (category != null) o.put("category", category)
        if (title != null) o.put("title", title.trim().ifBlank { "Untitled" })
        if (body != null) {
            o.put(
                "bodyEnc",
                if (body.isEmpty()) ""
                else VaultBackupCrypto.toBase64(VaultBackupCrypto.encryptUtf8(body, pin)),
            )
        }
        if (expiryAtMs != null) {
            if (expiryAtMs > 0) o.put("expiryAtMs", expiryAtMs) else o.remove("expiryAtMs")
        }
        o.put("updatedAtMs", System.currentTimeMillis())
        all[idx] = o
        persist(all)
        return toPublicMeta(o)
    }

    fun deleteItem(id: String): Boolean {
        val all = loadAll()
        val next = all.filter { it.optString("id") != id }
        if (next.size == all.size) return false
        // Remove any attachment files for this id
        File(filesDir, "$id.bin").delete()
        persist(next)
        return true
    }

    /** Export all items as encrypted blob for Drive (PIN-wrapped JSON). */
    fun exportEncryptedBackup(pin: String): ByteArray {
        val arr = JSONArray()
        loadAll().forEach { arr.put(it) }
        return VaultBackupCrypto.encryptUtf8(arr.toString(), pin)
    }

    fun importEncryptedBackup(pin: String, blob: ByteArray, merge: Boolean = true): Int {
        val json = VaultBackupCrypto.decryptUtf8(blob, pin)
        val arr = JSONArray(json)
        val incoming = (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }
        if (!merge) {
            persist(incoming)
            return incoming.size
        }
        val byId = loadAll().associateBy { it.optString("id") }.toMutableMap()
        for (o in incoming) {
            val id = o.optString("id")
            if (id.isNotBlank()) byId[id] = o
        }
        persist(byId.values.toList())
        return incoming.size
    }

    fun itemsExpiringWithin(ms: Long): List<Map<String, Any?>> {
        val now = System.currentTimeMillis()
        val until = now + ms
        return loadAll().mapNotNull { o ->
            val exp = o.optLong("expiryAtMs", 0L)
            if (exp in 1..until) toPublicMeta(o) else null
        }
    }

    private fun loadAll(): List<JSONObject> {
        val raw = prefs.getString(KEY_ITEMS, "[]") ?: "[]"
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }
        } catch (e: Exception) {
            Log.e(TAG, "loadAll", e)
            emptyList()
        }
    }

    private fun persist(items: List<JSONObject>) {
        val arr = JSONArray()
        items.forEach { arr.put(it) }
        prefs.edit().putString(KEY_ITEMS, arr.toString()).apply()
    }

    private fun toPublicMeta(o: JSONObject): Map<String, Any?> = mapOf(
        "id" to o.optString("id"),
        "category" to o.optString("category"),
        "title" to o.optString("title"),
        "createdAtMs" to o.optLong("createdAtMs"),
        "updatedAtMs" to o.optLong("updatedAtMs"),
        "expiryAtMs" to o.optLong("expiryAtMs", 0L).takeIf { it > 0 },
        "hasBody" to o.optString("bodyEnc").isNotBlank(),
    )

    companion object {
        private const val TAG = "SecureVaultStorage"
        private const val PREFS_NAME = "mrp_secure_vault"
        private const val KEY_ITEMS = "items_json"
        const val DRIVE_FILE_NAME = "mrp_secrets_vault.v1.enc"
        /** Crypto payload version for future migration of VaultBackupCrypto formats. */
        const val CRYPTO_VERSION = 1

        val CATEGORIES = listOf(
            "passport", "aadhaar", "pan", "insurance", "certificates",
            "invoices", "warranty", "photos", "recovery_codes", "notes", "custom",
        )
    }
}
