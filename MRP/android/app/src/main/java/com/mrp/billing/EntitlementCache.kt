package com.mrp.billing

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

/**
 * Local entitlement cache (EncryptedSharedPreferences).
 * NestJS mirror lands in P6; Play is authoritative when online.
 */
class EntitlementCache(context: Context) {

    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            PREFS,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun readSnapshot(offline: Boolean = false): WritableMap {
        val tier = prefs.getString(KEY_TIER, "free") ?: "free"
        val source = prefs.getString(KEY_SOURCE, "none") ?: "none"
        val expiry = prefs.getLong(KEY_EXPIRY, 0L)
        val verified = prefs.getLong(KEY_VERIFIED, System.currentTimeMillis())
        val grace = prefs.getLong(KEY_GRACE, 0L)
        return Arguments.createMap().apply {
            putString("tier", effectiveTier(tier, expiry, grace))
            putString("source", source)
            putString("productId", prefs.getString(KEY_PRODUCT, null))
            putDouble("expiryEpochMs", expiry.toDouble())
            putDouble("lastVerifiedAt", verified.toDouble())
            putDouble("graceUntilEpochMs", grace.toDouble())
            putBoolean("offline", offline)
        }
    }

    fun writePaid(
        tier: String,
        source: String,
        productId: String?,
        expiryEpochMs: Long,
        graceMs: Long = GRACE_MS
    ) {
        val now = System.currentTimeMillis()
        prefs.edit()
            .putString(KEY_TIER, tier)
            .putString(KEY_SOURCE, source)
            .putString(KEY_PRODUCT, productId)
            .putLong(KEY_EXPIRY, expiryEpochMs)
            .putLong(KEY_VERIFIED, now)
            .putLong(KEY_GRACE, if (expiryEpochMs > 0) expiryEpochMs + graceMs else now + graceMs)
            .apply()
    }

    fun clearToFree() {
        val now = System.currentTimeMillis()
        prefs.edit()
            .putString(KEY_TIER, "free")
            .putString(KEY_SOURCE, "none")
            .remove(KEY_PRODUCT)
            .putLong(KEY_EXPIRY, 0L)
            .putLong(KEY_VERIFIED, now)
            .putLong(KEY_GRACE, 0L)
            .apply()
    }

    companion object {
        const val GRACE_MS = 7L * 24 * 60 * 60 * 1000
        private const val PREFS = "mrp_entitlement_prefs"
        private const val KEY_TIER = "tier"
        private const val KEY_SOURCE = "source"
        private const val KEY_PRODUCT = "product_id"
        private const val KEY_EXPIRY = "expiry"
        private const val KEY_VERIFIED = "verified"
        private const val KEY_GRACE = "grace"

        fun effectiveTier(tier: String, expiry: Long, grace: Long, now: Long = System.currentTimeMillis()): String {
            if (tier == "free") return "free"
            if (expiry > 0 && now <= expiry) return tier
            if (grace > 0 && now <= grace) return tier
            return "free"
        }
    }
}
