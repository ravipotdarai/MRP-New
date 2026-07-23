package com.mrp.billing

import android.app.Activity
import android.util.Log
import com.android.billingclient.api.*
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Play Billing Library wrapper. Products must exist in Play Console:
 * mrp_premium, mrp_premium_family, mrp_enterprise (base plans monthly/yearly).
 */
class PlayBillingClientHelper(
    private val activityProvider: () -> Activity?,
    private val appContext: android.content.Context,
) : PurchasesUpdatedListener {

    private var client: BillingClient? = null
    private var purchaseCallback: ((BillingResult, List<Purchase>?) -> Unit)? = null

    suspend fun ensureConnected(): Boolean {
        val existing = client
        if (existing != null && existing.isReady) return true
        return suspendCancellableCoroutine { cont ->
            val billing = BillingClient.newBuilder(appContext)
                .setListener(this)
                .enablePendingPurchases()
                .build()
            client = billing
            billing.startConnection(object : BillingClientStateListener {
                override fun onBillingSetupFinished(result: BillingResult) {
                    if (cont.isActive) {
                        cont.resume(result.responseCode == BillingClient.BillingResponseCode.OK)
                    }
                }

                override fun onBillingServiceDisconnected() {
                    Log.w(TAG, "Billing disconnected")
                }
            })
        }
    }

    suspend fun queryOffers(): WritableArray {
        val arr = Arguments.createArray()
        if (!ensureConnected()) return arr
        val productList = listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_PREMIUM)
                .setProductType(BillingClient.ProductType.SUBS)
                .build(),
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_FAMILY)
                .setProductType(BillingClient.ProductType.SUBS)
                .build(),
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_ENTERPRISE)
                .setProductType(BillingClient.ProductType.SUBS)
                .build(),
        )
        val params = QueryProductDetailsParams.newBuilder().setProductList(productList).build()
        val result = suspendCancellableCoroutine<ProductDetailsResult> { cont ->
            client!!.queryProductDetailsAsync(params) { billingResult, details ->
                cont.resume(ProductDetailsResult(billingResult, details))
            }
        }
        if (result.billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
            Log.w(TAG, "queryProductDetails ${result.billingResult.debugMessage}")
            return arr
        }
        for (details in result.productDetailsList.orEmpty()) {
            val offers = details.subscriptionOfferDetails.orEmpty()
            for (offer in offers) {
                val price = offer.pricingPhases.pricingPhaseList.firstOrNull()?.formattedPrice ?: ""
                val period = offer.pricingPhases.pricingPhaseList.firstOrNull()?.billingPeriod ?: ""
                arr.pushMap(Arguments.createMap().apply {
                    putString("productId", details.productId)
                    putString("basePlanId", offer.basePlanId ?: offer.offerId ?: "monthly")
                    putString("title", details.title)
                    putString("description", details.description)
                    putString("formattedPrice", price)
                    putString("billingPeriod", period)
                    putString("offerToken", offer.offerToken)
                })
            }
        }
        return arr
    }

    suspend fun launchPurchase(productId: String, basePlanId: String): PurchaseFlowResult {
        val activity = activityProvider()
            ?: return PurchaseFlowResult(false, "No activity", emptyList())
        if (!ensureConnected()) {
            return PurchaseFlowResult(false, "Billing service unavailable", emptyList())
        }
        val productList = listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        )
        val detailsResult = suspendCancellableCoroutine<ProductDetailsResult> { cont ->
            client!!.queryProductDetailsAsync(
                QueryProductDetailsParams.newBuilder().setProductList(productList).build()
            ) { br, list -> cont.resume(ProductDetailsResult(br, list)) }
        }
        if (detailsResult.billingResult.responseCode != BillingClient.BillingResponseCode.OK ||
            detailsResult.productDetailsList.isNullOrEmpty()
        ) {
            return PurchaseFlowResult(
                false,
                "Product not found in Play Console: $productId. ${detailsResult.billingResult.debugMessage}",
                emptyList()
            )
        }
        val details = detailsResult.productDetailsList!!.first()
        val offer = details.subscriptionOfferDetails?.firstOrNull {
            (it.basePlanId ?: "") == basePlanId || it.basePlanId.isNullOrBlank()
        } ?: details.subscriptionOfferDetails?.firstOrNull()
        if (offer == null) {
            return PurchaseFlowResult(false, "No offer for $productId / $basePlanId", emptyList())
        }
        val params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                listOf(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(details)
                        .setOfferToken(offer.offerToken)
                        .build()
                )
            )
            .build()

        return suspendCancellableCoroutine { cont ->
            purchaseCallback = { br, purchases ->
                purchaseCallback = null
                if (br.responseCode == BillingClient.BillingResponseCode.OK && !purchases.isNullOrEmpty()) {
                    cont.resume(PurchaseFlowResult(true, null, purchases))
                } else if (br.responseCode == BillingClient.BillingResponseCode.USER_CANCELED) {
                    cont.resume(PurchaseFlowResult(false, "Purchase cancelled", emptyList()))
                } else {
                    cont.resume(
                        PurchaseFlowResult(
                            false,
                            br.debugMessage.ifBlank { "Purchase failed (${br.responseCode})" },
                            emptyList()
                        )
                    )
                }
            }
            val launch = client!!.launchBillingFlow(activity, params)
            if (launch.responseCode != BillingClient.BillingResponseCode.OK) {
                purchaseCallback = null
                cont.resume(PurchaseFlowResult(false, launch.debugMessage, emptyList()))
            }
        }
    }

    suspend fun queryActivePurchases(): List<Purchase> {
        if (!ensureConnected()) return emptyList()
        return suspendCancellableCoroutine { cont ->
            client!!.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build()
            ) { br, purchases ->
                if (br.responseCode == BillingClient.BillingResponseCode.OK) {
                    cont.resume(purchases.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED })
                } else {
                    cont.resume(emptyList())
                }
            }
        }
    }

    suspend fun acknowledgeIfNeeded(purchase: Purchase) {
        if (purchase.isAcknowledged) return
        if (!ensureConnected()) return
        suspendCancellableCoroutine<Unit> { cont ->
            client!!.acknowledgePurchase(
                AcknowledgePurchaseParams.newBuilder()
                    .setPurchaseToken(purchase.purchaseToken)
                    .build()
            ) { cont.resume(Unit) }
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        purchaseCallback?.invoke(result, purchases)
    }

    data class PurchaseFlowResult(val ok: Boolean, val message: String?, val purchases: List<Purchase>)
    private data class ProductDetailsResult(
        val billingResult: BillingResult,
        val productDetailsList: List<ProductDetails>?
    )

    companion object {
        private const val TAG = "PlayBilling"
        const val PRODUCT_PREMIUM = "mrp_premium"
        const val PRODUCT_FAMILY = "mrp_premium_family"
        const val PRODUCT_ENTERPRISE = "mrp_enterprise"
    }
}
