package com.mrp

import android.content.Intent
import android.net.Uri
import com.android.billingclient.api.Purchase
import com.facebook.react.bridge.*
import com.mrp.billing.EntitlementCache
import com.mrp.billing.PlayBillingClientHelper
import com.mrp.billing.PlayBillingClientHelper.Companion.PRODUCT_ENTERPRISE
import com.mrp.billing.PlayBillingClientHelper.Companion.PRODUCT_FAMILY
import com.mrp.billing.PlayBillingClientHelper.Companion.PRODUCT_PREMIUM
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class BillingModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val cache by lazy { EntitlementCache(reactContext) }
    private val billing by lazy {
        PlayBillingClientHelper(
            activityProvider = { currentActivity },
            appContext = reactContext.applicationContext
        )
    }

    override fun getName(): String = "MrpBilling"

    @ReactMethod
    fun getEntitlementSnapshot(promise: Promise) {
        try {
            promise.resolve(cache.readSnapshot(false))
        } catch (e: Exception) {
            promise.reject("ENTITLEMENT", e.message, e)
        }
    }

    @ReactMethod
    fun refreshEntitlements(promise: Promise) {
        scope.launch {
            try {
                val purchases = try {
                    billing.queryActivePurchases()
                } catch (e: Exception) {
                    promise.resolve(cache.readSnapshot(offline = true))
                    return@launch
                }
                applyPurchases(purchases)
                promise.resolve(cache.readSnapshot(false))
            } catch (e: Exception) {
                promise.reject("REFRESH", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getProductOffers(promise: Promise) {
        scope.launch {
            try {
                promise.resolve(billing.queryOffers())
            } catch (e: Exception) {
                promise.reject("OFFERS", e.message, e)
            }
        }
    }

    @ReactMethod
    fun purchase(productId: String, basePlanId: String, promise: Promise) {
        scope.launch {
            try {
                val result = billing.launchPurchase(productId, basePlanId)
                if (!result.ok) {
                    val map = Arguments.createMap().apply {
                        putBoolean("ok", false)
                        putMap("snapshot", cache.readSnapshot(false))
                        putString("message", result.message ?: "Purchase failed")
                    }
                    promise.resolve(map)
                    return@launch
                }
                for (p in result.purchases) {
                    billing.acknowledgeIfNeeded(p)
                }
                applyPurchases(result.purchases)
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("ok", true)
                    putMap("snapshot", cache.readSnapshot(false))
                })
            } catch (e: Exception) {
                promise.reject("PURCHASE", e.message, e)
            }
        }
    }

    @ReactMethod
    fun restorePurchases(promise: Promise) {
        scope.launch {
            try {
                val purchases = billing.queryActivePurchases()
                for (p in purchases) billing.acknowledgeIfNeeded(p)
                applyPurchases(purchases)
                promise.resolve(cache.readSnapshot(false))
            } catch (e: Exception) {
                promise.reject("RESTORE", e.message, e)
            }
        }
    }

    @ReactMethod
    fun activateEnterpriseKey(key: String, promise: Promise) {
        try {
            val normalized = key.trim().uppercase()
            if (!normalized.startsWith("MRP-ENT-") || normalized.length < 12) {
                promise.reject("INVALID_KEY", "Enterprise key must look like MRP-ENT-…")
                return
            }
            val expiry = System.currentTimeMillis() + 365L * 24 * 60 * 60 * 1000
            cache.writePaid("enterprise", "enterprise_key", "enterprise_key", expiry)
            promise.resolve(cache.readSnapshot(false))
        } catch (e: Exception) {
            promise.reject("ENTERPRISE_KEY", e.message, e)
        }
    }

    @ReactMethod
    fun openPlaySubscriptionManagement(promise: Promise) {
        try {
            val intent = Intent(
                Intent.ACTION_VIEW,
                Uri.parse("https://play.google.com/store/account/subscriptions?package=com.mrp")
            )
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("MANAGE", e.message, e)
        }
    }

    @ReactMethod
    fun setDebugTier(tier: String, promise: Promise) {
        try {
            if (!BuildConfig.DEBUG) {
                promise.reject("DENIED", "Debug tier only in debug builds")
                return
            }
            val t = tier.lowercase()
            if (t == "free") {
                cache.clearToFree()
            } else {
                val expiry = System.currentTimeMillis() + 30L * 24 * 60 * 60 * 1000
                cache.writePaid(t, "debug", "debug_$t", expiry)
            }
            promise.resolve(cache.readSnapshot(false))
        } catch (e: Exception) {
            promise.reject("DEBUG_TIER", e.message, e)
        }
    }

    /**
     * Hardcoded catalog selection (Subscriptions.json) until Play Console SKUs are live.
     * See PLAY_BILLING_INCOMPLETE.md — remove/gate for production when mode=play.
     */
    @ReactMethod
    fun activateCatalogProduct(productId: String, basePlanId: String, promise: Promise) {
        try {
            val id = productId.trim()
            if (id.isEmpty() || id == "free") {
                cache.clearToFree()
                promise.resolve(
                    Arguments.createMap().apply {
                        putBoolean("ok", true)
                        putMap("snapshot", cache.readSnapshot(false))
                        putString("message", "Free plan selected (hardcoded catalog)")
                    }
                )
                return
            }
            val tier = when (id) {
                PRODUCT_PREMIUM -> "premium"
                PRODUCT_FAMILY -> "family"
                PRODUCT_ENTERPRISE -> "enterprise"
                else -> {
                    promise.reject("UNKNOWN_PRODUCT", "Unknown catalog productId: $id")
                    return
                }
            }
            val months = if (basePlanId == "yearly") 12L else 1L
            val expiry = System.currentTimeMillis() + months * 30L * 24 * 60 * 60 * 1000
            cache.writePaid(tier, "hardcoded", "$id:$basePlanId", expiry)
            promise.resolve(
                Arguments.createMap().apply {
                    putBoolean("ok", true)
                    putMap("snapshot", cache.readSnapshot(false))
                    putString("message", "Activated $id ($basePlanId) via hardcoded catalog")
                }
            )
        } catch (e: Exception) {
            promise.reject("CATALOG", e.message, e)
        }
    }

    private fun applyPurchases(purchases: List<Purchase>) {
        if (purchases.isEmpty()) {
            // Keep enterprise_key / admin / debug sources if present
            val snap = cache.readSnapshot(false)
            val source = snap.getString("source")
            if (source == "enterprise_key" || source == "admin" || source == "debug" || source == "hardcoded") {
                return
            }
            cache.clearToFree()
            return
        }
        var bestTier = "free"
        var productId: String? = null
        var expiry = 0L
        for (p in purchases) {
            for (id in p.products) {
                val tier = when (id) {
                    PRODUCT_ENTERPRISE -> "enterprise"
                    PRODUCT_FAMILY -> "family"
                    PRODUCT_PREMIUM -> "premium"
                    else -> "free"
                }
                if (rank(tier) > rank(bestTier)) {
                    bestTier = tier
                    productId = id
                    expiry = p.purchaseTime + 30L * 24 * 60 * 60 * 1000
                }
            }
        }
        if (bestTier == "free") {
            cache.clearToFree()
        } else {
            cache.writePaid(bestTier, "play", productId, expiry)
        }
    }

    private fun rank(tier: String): Int = when (tier) {
        "enterprise" -> 3
        "family" -> 2
        "premium" -> 1
        else -> 0
    }
}
