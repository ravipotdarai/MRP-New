package com.mrp

import android.app.Activity
import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.mrp.data.local.EmergencyCardStorage
import com.mrp.data.local.SecureVaultStorage
import com.mrp.domain.model.EventTypes
import com.mrp.domain.risk.RedirectResolver
import com.mrp.domain.risk.RiskPolicyEngine
import com.mrp.domain.usecase.SecureVaultDriveSync
import com.mrp.domain.usecase.TimelineEventLogger
import java.security.MessageDigest
import java.util.concurrent.Executors

class DigitalSafetyModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var qrPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "DigitalSafety"

    private fun runAsync(promise: Promise, code: String, block: () -> Unit) {
        bg.execute {
            try {
                block()
            } catch (e: Exception) {
                Log.e(TAG, code, e)
                promise.reject(code, e.message, e)
            }
        }
    }

    @ReactMethod
    fun evaluateUrlRisk(raw: String, resolveRedirects: Boolean, promise: Promise) {
        runAsync(promise, "URL_RISK") {
            var toScore = raw
            var redirectHops = emptyList<String>()
            var redirectError: String? = null
            if (resolveRedirects) {
                val resolved = RedirectResolver.resolve(raw)
                if (resolved.resolved) {
                    toScore = resolved.finalUrl
                    redirectHops = resolved.hops
                }
                redirectError = resolved.error
            }
            val result = RiskPolicyEngine.evaluateUrl(toScore)
            val map = Arguments.createMap().apply {
                putString("input", result.input)
                result.normalized?.let { putString("normalized", it) }
                putInt("score", result.score.coerceAtLeast(0))
                putString("band", result.band.label)
                putString("eventType", RiskPolicyEngine.safeLinkEventType(result))
                val reasons = Arguments.createArray()
                result.reasons.forEach { reasons.pushString(it) }
                putArray("reasons", reasons)
                val codes = Arguments.createArray()
                result.reasonCodes.forEach { codes.pushString(it) }
                putArray("reasonCodes", codes)
                result.domainHash?.let { putString("domainHash", it) }
                result.host?.let { putString("host", it) }
                val hops = Arguments.createArray()
                redirectHops.forEach { hops.pushString(it.take(200)) }
                putArray("redirectHops", hops)
                redirectError?.let { putString("redirectError", it) }
            }
            promise.resolve(map)
        }
    }

    @ReactMethod
    fun startQrScan(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No foreground activity")
            return
        }
        if (qrPromise != null) {
            promise.reject("BUSY", "QR scan already in progress")
            return
        }
        qrPromise = promise
        try {
            activity.startActivityForResult(Intent(activity, QrScanActivity::class.java), REQ_QR)
        } catch (e: Exception) {
            qrPromise = null
            promise.reject("QR_START", e.message, e)
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQ_QR) return
        val p = qrPromise ?: return
        qrPromise = null
        if (resultCode == Activity.RESULT_OK) {
            val payload = data?.getStringExtra(QrScanActivity.EXTRA_PAYLOAD).orEmpty()
            p.resolve(payload)
        } else {
            p.resolve(null)
        }
    }

    override fun onNewIntent(intent: Intent) {}

    // —— Emergency Card ——

    @ReactMethod
    fun getEmergencyCard(promise: Promise) {
        runAsync(promise, "ICE_GET") {
            promise.resolve(mapToWritable(EmergencyCardStorage(reactContext).getCard()))
        }
    }

    @ReactMethod
    fun saveEmergencyCard(fields: ReadableMap, promise: Promise) {
        runAsync(promise, "ICE_SAVE") {
            val map = readableToMap(fields)
            val saved = EmergencyCardStorage(reactContext).saveCard(map)
            TimelineEventLogger(reactContext).logEvent(
                EventTypes.EMERGENCY_CARD_UPDATED,
                "completed",
                mapOf("source" to "emergency_card", "fields_touched" to map.keys.size),
            )
            promise.resolve(mapToWritable(saved))
        }
    }

    @ReactMethod
    fun clearEmergencyCard(promise: Promise) {
        runAsync(promise, "ICE_CLEAR") {
            promise.resolve(EmergencyCardStorage(reactContext).clear())
        }
    }

    // —— Secure Vault ——

    @ReactMethod
    fun listSecureVaultItems(promise: Promise) {
        runAsync(promise, "SV_LIST") {
            val arr = Arguments.createArray()
            SecureVaultStorage(reactContext).listItems().forEach { arr.pushMap(mapToWritable(it)) }
            promise.resolve(arr)
        }
    }

    @ReactMethod
    fun getSecureVaultItem(id: String, pin: String, promise: Promise) {
        runAsync(promise, "SV_GET") {
            if (!verifyPin(pin)) {
                TimelineEventLogger(reactContext).logEvent(
                    EventTypes.VAULT_AUTH_FAILED,
                    "failed",
                    mapOf("source" to "secure_vault"),
                )
                promise.reject("BAD_PIN", "Incorrect PIN")
                return@runAsync
            }
            val item = SecureVaultStorage(reactContext).getItem(id, pin)
            if (item == null) {
                promise.reject("NOT_FOUND", "Item not found or decrypt failed")
                return@runAsync
            }
            TimelineEventLogger(reactContext).logEvent(
                EventTypes.VAULT_ITEM_VIEWED,
                "completed",
                mapOf("source" to "secure_vault", "category" to (item["category"]?.toString() ?: "")),
            )
            promise.resolve(mapToWritable(item))
        }
    }

    @ReactMethod
    fun createSecureVaultItem(
        pin: String,
        category: String,
        title: String,
        body: String,
        expiryAtMs: Double,
        promise: Promise,
    ) {
        runAsync(promise, "SV_CREATE") {
            if (!verifyPin(pin)) {
                TimelineEventLogger(reactContext).logEvent(
                    EventTypes.VAULT_AUTH_FAILED,
                    "failed",
                    mapOf("source" to "secure_vault"),
                )
                promise.reject("BAD_PIN", "Incorrect PIN")
                return@runAsync
            }
            val exp = if (expiryAtMs > 0) expiryAtMs.toLong() else null
            val item = SecureVaultStorage(reactContext).createItem(pin, category, title, body, exp)
                ?: run {
                    promise.reject("CREATE_FAIL", "Could not create item")
                    return@runAsync
                }
            TimelineEventLogger(reactContext).logEvent(
                EventTypes.VAULT_ITEM_CREATED,
                "completed",
                mapOf("source" to "secure_vault", "category" to category.take(32)),
            )
            promise.resolve(mapToWritable(item))
        }
    }

    @ReactMethod
    fun updateSecureVaultItem(
        pin: String,
        id: String,
        category: String?,
        title: String?,
        body: String?,
        expiryAtMs: Double,
        promise: Promise,
    ) {
        runAsync(promise, "SV_UPDATE") {
            if (!verifyPin(pin)) {
                promise.reject("BAD_PIN", "Incorrect PIN")
                return@runAsync
            }
            val exp = when {
                expiryAtMs < 0 -> null
                expiryAtMs == 0.0 -> 0L
                else -> expiryAtMs.toLong()
            }
            val item = SecureVaultStorage(reactContext).updateItem(pin, id, category, title, body, exp)
                ?: run {
                    promise.reject("UPDATE_FAIL", "Update failed")
                    return@runAsync
                }
            TimelineEventLogger(reactContext).logEvent(
                EventTypes.VAULT_ITEM_UPDATED,
                "completed",
                mapOf("source" to "secure_vault"),
            )
            promise.resolve(mapToWritable(item))
        }
    }

    @ReactMethod
    fun deleteSecureVaultItem(id: String, promise: Promise) {
        runAsync(promise, "SV_DELETE") {
            val ok = SecureVaultStorage(reactContext).deleteItem(id)
            if (ok) {
                TimelineEventLogger(reactContext).logEvent(
                    EventTypes.VAULT_ITEM_DELETED,
                    "completed",
                    mapOf("source" to "secure_vault"),
                )
            }
            promise.resolve(ok)
        }
    }

    @ReactMethod
    fun backupSecureVault(pin: String, promise: Promise) {
        runAsync(promise, "SV_BACKUP") {
            if (!verifyPin(pin)) {
                promise.reject("BAD_PIN", "Incorrect PIN")
                return@runAsync
            }
            promise.resolve(mapToWritable(SecureVaultDriveSync.backup(reactContext, pin)))
        }
    }

    @ReactMethod
    fun restoreSecureVault(pin: String, promise: Promise) {
        runAsync(promise, "SV_RESTORE") {
            if (!verifyPin(pin)) {
                promise.reject("BAD_PIN", "Incorrect PIN")
                return@runAsync
            }
            promise.resolve(mapToWritable(SecureVaultDriveSync.restore(reactContext, pin)))
        }
    }

    @ReactMethod
    fun getSecureVaultCategories(promise: Promise) {
        val arr = Arguments.createArray()
        SecureVaultStorage.CATEGORIES.forEach { arr.pushString(it) }
        promise.resolve(arr)
    }

    private fun verifyPin(pin: String): Boolean {
        if (pin.length < 4) return false
        val prefs = reactContext.getSharedPreferences("mrp_pin_prefs", android.content.Context.MODE_PRIVATE)
        // Prefer encrypted path used by PinLock — try both
        val enc = try {
            val masterKey = androidx.security.crypto.MasterKey.Builder(reactContext)
                .setKeyScheme(androidx.security.crypto.MasterKey.KeyScheme.AES256_GCM)
                .build()
            androidx.security.crypto.EncryptedSharedPreferences.create(
                reactContext,
                "mrp_pin_prefs",
                masterKey,
                androidx.security.crypto.EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                androidx.security.crypto.EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        } catch (_: Exception) {
            prefs
        }
        val storedHash = enc.getString("pin_hash", null) ?: prefs.getString("pin_hash", null) ?: return false
        val salt = enc.getString("pin_salt", null) ?: prefs.getString("pin_salt", null) ?: return false
        return try {
            val digest = MessageDigest.getInstance("SHA-256")
            val hash = digest.digest((pin + salt).toByteArray(Charsets.UTF_8))
            val computed = android.util.Base64.encodeToString(hash, android.util.Base64.NO_WRAP)
            computed == storedHash
        } catch (_: Exception) {
            false
        }
    }

    private fun readableToMap(rm: ReadableMap): Map<String, Any?> {
        val out = mutableMapOf<String, Any?>()
        val it = rm.keySetIterator()
        while (it.hasNextKey()) {
            val k = it.nextKey()
            when (rm.getType(k)) {
                com.facebook.react.bridge.ReadableType.Null -> out[k] = null
                com.facebook.react.bridge.ReadableType.Boolean -> out[k] = rm.getBoolean(k)
                com.facebook.react.bridge.ReadableType.Number -> out[k] = rm.getDouble(k)
                com.facebook.react.bridge.ReadableType.String -> out[k] = rm.getString(k)
                com.facebook.react.bridge.ReadableType.Array -> {
                    val arr = rm.getArray(k)
                    out[k] = readableArrayToList(arr)
                }
                else -> {}
            }
        }
        return out
    }

    private fun readableArrayToList(arr: ReadableArray?): List<Any?> {
        if (arr == null) return emptyList()
        val list = mutableListOf<Any?>()
        for (i in 0 until arr.size()) {
            when (arr.getType(i)) {
                com.facebook.react.bridge.ReadableType.String -> list.add(arr.getString(i))
                com.facebook.react.bridge.ReadableType.Map -> {
                    val m = arr.getMap(i)
                    if (m != null) list.add(readableToMap(m))
                }
                else -> list.add(null)
            }
        }
        return list
    }

    private fun mapToWritable(map: Map<String, Any?>): com.facebook.react.bridge.WritableMap {
        val w = Arguments.createMap()
        for ((k, v) in map) {
            when (v) {
                null -> w.putNull(k)
                is Boolean -> w.putBoolean(k, v)
                is Int -> w.putInt(k, v)
                is Long -> w.putDouble(k, v.toDouble())
                is Double -> w.putDouble(k, v)
                is Float -> w.putDouble(k, v.toDouble())
                is Number -> w.putDouble(k, v.toDouble())
                is String -> w.putString(k, v)
                is List<*> -> {
                    val arr = Arguments.createArray()
                    for (item in v) {
                        when (item) {
                            is Map<*, *> -> {
                                @Suppress("UNCHECKED_CAST")
                                arr.pushMap(mapToWritable(item as Map<String, Any?>))
                            }
                            is String -> arr.pushString(item)
                            is Number -> arr.pushDouble(item.toDouble())
                            else -> arr.pushNull()
                        }
                    }
                    w.putArray(k, arr)
                }
                else -> w.putString(k, v.toString())
            }
        }
        return w
    }

    companion object {
        private const val TAG = "DigitalSafety"
        private const val REQ_QR = 9211
        private val bg = Executors.newFixedThreadPool(2) { r ->
            Thread(r, "DigitalSafetyBg").apply { isDaemon = true }
        }
    }
}
