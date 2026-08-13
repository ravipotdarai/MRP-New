package com.mrp

import android.app.Activity
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telephony.TelephonyManager
import android.util.Log
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.mrp.billing.EntitlementCache
import com.mrp.billing.DigitalSafetyCapabilities.Cap
import com.mrp.data.local.DigitalSafetyAutomationStore
import com.mrp.data.local.EmergencyCardStorage
import com.mrp.data.local.SafeLinkAllowlistStore
import com.mrp.data.local.SecureVaultStorage
import com.mrp.domain.cellular.CellularAnomalyScorer
import com.mrp.domain.cellular.CellularBaselineStore
import com.mrp.domain.cellular.CellularEventDebouncer
import com.mrp.domain.cellular.CellularMonitor
import com.mrp.domain.guardian.DigitalSafetyFlags
import com.mrp.domain.guardian.DomainCategory
import com.mrp.domain.guardian.DomainListManager
import com.mrp.domain.guardian.GuardianListRefreshWorker
import com.mrp.domain.model.EventTypes
import com.mrp.domain.risk.RedirectResolver
import com.mrp.domain.risk.RiskPolicyEngine
import com.mrp.domain.risk.ScamSignalAggregator
import com.mrp.domain.usecase.SecureVaultDriveSync
import com.mrp.domain.usecase.TimelineEventLogger
import com.mrp.domain.usecase.VaultExpiryReminderWorker
import java.security.MessageDigest
import java.util.concurrent.Executors

class DigitalSafetyModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var qrPromise: Promise? = null
    private var vpnPromise: Promise? = null

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
            val allowlist = SafeLinkAllowlistStore(reactContext).list()
            val blocklist = com.mrp.domain.risk.UserBlocklistStore(reactContext).list()
            val brands = com.mrp.domain.risk.BrandListStore(reactContext)
            val result0 = RiskPolicyEngine.evaluateUrl(toScore, allowlist, brands, blocklist)
            val result = result0.host?.let { host ->
                val intel = com.mrp.domain.risk.ThreatIntelProvider(reactContext).lookup(host)
                if (intel != null) {
                    RiskPolicyEngine.enrich(result0, intel.score, "Listed in local threat intel (${intel.category})", "THREAT_INTEL_${intel.category.uppercase()}")
                } else {
                    result0
                }
            } ?: result0
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
                putBoolean(
                    "intelDegraded",
                    com.mrp.domain.risk.ThreatIntelProvider(reactContext).lastError() != null,
                )
            }
            promise.resolve(map)
        }
    }

    @ReactMethod
    fun reportSafeLinkFalsePositive(host: String, reasonCodes: ReadableArray, note: String?, promise: Promise) {
        runAsync(promise, "SL_FP") {
            val codes = (0 until reasonCodes.size()).mapNotNull { reasonCodes.getString(it) }
            val ok = com.mrp.domain.risk.FalsePositiveStore(reactContext).report(host, codes, note)
            if (!ok) {
                promise.reject("INVALID_HOST", "Enter a domain such as example.com")
                return@runAsync
            }
            TimelineEventLogger(reactContext).logEvent(
                EventTypes.SAFE_LINK_FALSE_POSITIVE,
                "reported",
                mapOf(
                    "source" to "safe_link",
                    "domain_hash" to com.mrp.domain.risk.DomainHashUtil.hashHost(
                        com.mrp.domain.risk.UrlNormalizer.normalizeHost(host) ?: host,
                    ),
                    "reason_codes" to codes.take(6).joinToString(","),
                ),
            )
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun getUserBlocklist(promise: Promise) {
        runAsync(promise, "BLOCK_LIST") {
            val arr = Arguments.createArray()
            com.mrp.domain.risk.UserBlocklistStore(reactContext).list().forEach { arr.pushString(it) }
            promise.resolve(arr)
        }
    }

    @ReactMethod
    fun addUserBlocklist(host: String, promise: Promise) {
        runAsync(promise, "BLOCK_ADD") {
            if (!com.mrp.domain.risk.UserBlocklistStore(reactContext).add(host)) {
                promise.reject("INVALID_HOST", "Enter a domain such as example.com")
                return@runAsync
            }
            val arr = Arguments.createArray()
            com.mrp.domain.risk.UserBlocklistStore(reactContext).list().forEach { arr.pushString(it) }
            promise.resolve(arr)
        }
    }

    @ReactMethod
    fun removeUserBlocklist(host: String, promise: Promise) {
        runAsync(promise, "BLOCK_RM") {
            com.mrp.domain.risk.UserBlocklistStore(reactContext).remove(host)
            val arr = Arguments.createArray()
            com.mrp.domain.risk.UserBlocklistStore(reactContext).list().forEach { arr.pushString(it) }
            promise.resolve(arr)
        }
    }

    @ReactMethod
    fun getBrandListState(promise: Promise) {
        runAsync(promise, "BRAND_STATE") {
            promise.resolve(mapToWritable(com.mrp.domain.risk.BrandListStore(reactContext).snapshot()))
        }
    }

    @ReactMethod
    fun addBrand(brand: String, promise: Promise) {
        runAsync(promise, "BRAND_ADD") {
            if (!com.mrp.domain.risk.BrandListStore(reactContext).addBrand(brand)) {
                promise.reject("INVALID_BRAND", "Brand must be 3–32 letters/digits")
                return@runAsync
            }
            promise.resolve(mapToWritable(com.mrp.domain.risk.BrandListStore(reactContext).snapshot()))
        }
    }

    @ReactMethod
    fun removeBrand(brand: String, promise: Promise) {
        runAsync(promise, "BRAND_RM") {
            com.mrp.domain.risk.BrandListStore(reactContext).removeBrand(brand)
            promise.resolve(mapToWritable(com.mrp.domain.risk.BrandListStore(reactContext).snapshot()))
        }
    }

    @ReactMethod
    fun addOfficialBrandDomain(host: String, promise: Promise) {
        runAsync(promise, "BRAND_OFF_ADD") {
            if (!com.mrp.domain.risk.BrandListStore(reactContext).addOfficial(host)) {
                promise.reject("INVALID_HOST", "Enter a domain such as example.com")
                return@runAsync
            }
            promise.resolve(mapToWritable(com.mrp.domain.risk.BrandListStore(reactContext).snapshot()))
        }
    }

    @ReactMethod
    fun getSafeLinkAllowlist(promise: Promise) {
        runAsync(promise, "SL_ALLOW_LIST") {
            val arr = Arguments.createArray()
            SafeLinkAllowlistStore(reactContext).list().forEach { arr.pushString(it) }
            promise.resolve(arr)
        }
    }

    @ReactMethod
    fun addSafeLinkAllowlist(host: String, promise: Promise) {
        runAsync(promise, "SL_ALLOW_ADD") {
            if (!SafeLinkAllowlistStore(reactContext).add(host)) {
                promise.reject("INVALID_HOST", "Enter a domain such as example.com")
                return@runAsync
            }
            val arr = Arguments.createArray()
            SafeLinkAllowlistStore(reactContext).list().forEach { arr.pushString(it) }
            promise.resolve(arr)
        }
    }

    @ReactMethod
    fun removeSafeLinkAllowlist(host: String, promise: Promise) {
        runAsync(promise, "SL_ALLOW_RM") {
            SafeLinkAllowlistStore(reactContext).remove(host)
            val arr = Arguments.createArray()
            SafeLinkAllowlistStore(reactContext).list().forEach { arr.pushString(it) }
            promise.resolve(arr)
        }
    }

    @ReactMethod
    fun aggregateScamText(text: String, promise: Promise) {
        runAsync(promise, "SCAM_AGG") {
            val trimmed = text.trim()
            if (trimmed.isBlank()) {
                promise.resolve(scamResultMap(ScamSignalAggregator.ScamSignalResult(
                    0, com.mrp.domain.risk.RiskBand.INVALID, emptyList(), emptyList(),
                    ScamSignalAggregator.Source.MANUAL, "empty",
                )))
                return@runAsync
            }
            val url = com.mrp.domain.risk.UrlNormalizer.extractUrl(trimmed)
            val result = if (url != null) {
                val urlResult = RiskPolicyEngine.evaluateUrl(url, SafeLinkAllowlistStore(reactContext).list())
                ScamSignalAggregator.aggregateUrl(urlResult, ScamSignalAggregator.Source.MANUAL)
            } else {
                val otp = com.mrp.domain.guardian.SmsScamHeuristics.scan(trimmed)
                val reasons = otp.reasonCodes.map { it.replace('_', ' ').lowercase() }
                ScamSignalAggregator.aggregateOtpPaste(trimmed, otp.score, reasons, otp.reasonCodes)
            }
            promise.resolve(scamResultMap(result))
        }
    }

    private fun scamResultMap(result: ScamSignalAggregator.ScamSignalResult): com.facebook.react.bridge.WritableMap {
        val map = Arguments.createMap()
        map.putInt("score", result.score.coerceAtLeast(0))
        map.putString("band", result.band.label)
        map.putString("verdict", result.verdict)
        map.putString("source", result.source.tag)
        val reasons = Arguments.createArray()
        result.reasons.forEach { reasons.pushString(it) }
        map.putArray("reasons", reasons)
        val codes = Arguments.createArray()
        result.reasonCodes.forEach { codes.pushString(it) }
        map.putArray("reasonCodes", codes)
        return map
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
        when (requestCode) {
            REQ_QR -> {
                val p = qrPromise ?: return
                qrPromise = null
                if (resultCode == Activity.RESULT_OK) {
                    val payload = data?.getStringExtra(QrScanActivity.EXTRA_PAYLOAD).orEmpty()
                    p.resolve(payload)
                } else {
                    p.resolve(null)
                }
            }
            REQ_VPN -> {
                val p = vpnPromise ?: return
                vpnPromise = null
                if (resultCode == Activity.RESULT_OK) {
                    NetworkGuardianVpnService.start(reactContext)
                    GuardianListRefreshWorker.schedule(reactContext)
                    promiseGuardianState(p, expectEnabled = true)
                } else {
                    p.reject("VPN_DENIED", "VPN consent not granted")
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {}

    @ReactMethod
    fun getNetworkGuardianState(promise: Promise) {
        runAsync(promise, "NG_STATE") {
            promiseGuardianState(promise)
        }
    }

    @ReactMethod
    fun requestNetworkGuardianConsent(promise: Promise) {
        if (!EntitlementCache(reactContext).hasCapability(Cap.NETWORK_GUARDIAN)) {
            promise.reject("PREMIUM_REQUIRED", "Network Guardian requires Premium or higher")
            return
        }
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No foreground activity")
            return
        }
        if (vpnPromise != null) {
            promise.reject("BUSY", "Network Guardian request already in progress")
            return
        }
        val prepIntent = android.net.VpnService.prepare(reactContext)
        if (prepIntent == null) {
            NetworkGuardianVpnService.start(reactContext)
            GuardianListRefreshWorker.schedule(reactContext)
            runAsync(promise, "NG_CONSENT_READY") {
                promiseGuardianState(promise, expectEnabled = true)
            }
            return
        }
        vpnPromise = promise
        activity.startActivityForResult(prepIntent, REQ_VPN)
    }

    @ReactMethod
    fun setNetworkGuardianEnabled(enabled: Boolean, promise: Promise) {
        runAsync(promise, "NG_SET_ENABLED") {
            if (enabled && !EntitlementCache(reactContext).hasCapability(Cap.NETWORK_GUARDIAN)) {
                promise.reject("PREMIUM_REQUIRED", "Network Guardian requires Premium or higher")
                return@runAsync
            }
            if (enabled && android.net.VpnService.prepare(reactContext) != null) {
                promise.reject("CONSENT_REQUIRED", "VPN consent required")
                return@runAsync
            }
            if (enabled) {
                NetworkGuardianVpnService.start(reactContext)
                GuardianListRefreshWorker.schedule(reactContext)
            } else {
                NetworkGuardianVpnService.stop(reactContext)
                GuardianListRefreshWorker.cancel(reactContext)
            }
            promiseGuardianState(promise, expectEnabled = enabled)
        }
    }

    @ReactMethod
    fun setGuardianCategoryEnabled(category: String, enabled: Boolean, promise: Promise) {
        runAsync(promise, "NG_CATEGORY") {
            if (!EntitlementCache(reactContext).hasCapability(Cap.GUARDIAN_CUSTOM_RULES)) {
                promise.reject("PREMIUM_REQUIRED", "Guardian category controls require Premium or higher")
                return@runAsync
            }
            val cat = when (category.lowercase()) {
                "ad", "ads" -> DomainCategory.AD
                "tracker", "trackers" -> DomainCategory.TRACKER
                "malware" -> DomainCategory.MALWARE
                "phishing" -> DomainCategory.PHISHING
                "content", "adult" -> DomainCategory.CONTENT
                else -> {
                    promise.reject("INVALID_CATEGORY", "Unknown category")
                    return@runAsync
                }
            }
            DomainListManager(reactContext).setCategoryEnabled(cat, enabled)
            promiseGuardianState(promise)
        }
    }

    @ReactMethod
    fun addGuardianAllowlist(host: String, promise: Promise) {
        runAsync(promise, "NG_ALLOW_ADD") {
            if (!EntitlementCache(reactContext).hasCapability(Cap.GUARDIAN_CUSTOM_RULES)) {
                promise.reject("PREMIUM_REQUIRED", "Guardian allowlist requires Premium or higher")
                return@runAsync
            }
            if (!DomainListManager(reactContext).addAllowlist(host)) {
                promise.reject("INVALID_HOST", "Enter a domain such as example.com")
                return@runAsync
            }
            promiseGuardianState(promise)
        }
    }

    @ReactMethod
    fun removeGuardianAllowlist(host: String, promise: Promise) {
        runAsync(promise, "NG_ALLOW_REMOVE") {
            DomainListManager(reactContext).removeAllowlist(host)
            promiseGuardianState(promise)
        }
    }

    @ReactMethod
    fun refreshGuardianLists(promise: Promise) {
        runAsync(promise, "NG_LIST_REFRESH") {
            DomainListManager(reactContext).refreshRemoteManifest()
            com.mrp.domain.risk.ThreatIntelProvider(reactContext).refreshRemote()
            promiseGuardianState(promise)
        }
    }

    @ReactMethod
    fun refreshThreatIntel(promise: Promise) {
        runAsync(promise, "NG_INTEL_REFRESH") {
            com.mrp.domain.risk.ThreatIntelProvider(reactContext).refreshRemote()
            promiseGuardianState(promise)
        }
    }

    @ReactMethod
    fun getAutomationState(promise: Promise) {
        runAsync(promise, "DS_AUTO_STATE") {
            promise.resolve(mapToWritable(DigitalSafetyAutomationStore(reactContext).snapshot()))
        }
    }

    @ReactMethod
    fun setClipboardScanEnabled(enabled: Boolean, promise: Promise) {
        runAsync(promise, "DS_CLIPBOARD") {
            if (enabled && !EntitlementCache(reactContext).hasCapability(Cap.CLIPBOARD_URL_SCAN)) {
                promise.reject("BASIC_REQUIRED", "Clipboard URL scan requires Basic or higher")
                return@runAsync
            }
            DigitalSafetyAutomationStore(reactContext).setClipboardScanEnabled(enabled)
            promise.resolve(mapToWritable(DigitalSafetyAutomationStore(reactContext).snapshot()))
        }
    }

    @ReactMethod
    fun setSmsAutoScanEnabled(enabled: Boolean, promise: Promise) {
        runAsync(promise, "DS_SMS_AUTO") {
            if (enabled && !DigitalSafetyFlags.SMS_AUTO_SCAN_ENABLED) {
                promise.reject("FLAG_OFF", "SMS auto-scan is feature-flagged pending policy review")
                return@runAsync
            }
            if (enabled && !EntitlementCache(reactContext).hasCapability(Cap.SMS_SCAM_AUTO_SCAN)) {
                promise.reject("PREMIUM_REQUIRED", "SMS auto-scan requires Premium or higher")
                return@runAsync
            }
            DigitalSafetyAutomationStore(reactContext).setSmsAutoScanEnabled(enabled)
            promise.resolve(mapToWritable(DigitalSafetyAutomationStore(reactContext).snapshot()))
        }
    }

    @ReactMethod
    fun peekClipboardUrl(promise: Promise) {
        val store = DigitalSafetyAutomationStore(reactContext)
        if (!store.clipboardScanEnabled()) {
            promise.resolve(null)
            return
        }
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            try {
                val url = peekForegroundClipboardUrl()
                if (url == null) {
                    promise.resolve(null)
                    return@post
                }
                val map = Arguments.createMap()
                map.putString("url", url)
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("DS_CLIPBOARD_PEEK", e.message, e)
            }
        }
    }

    @ReactMethod
    fun enrollBreachEmail(email: String, promise: Promise) {
        runAsync(promise, "DS_BREACH_ENROLL") {
            if (!EntitlementCache(reactContext).hasCapability(Cap.BREACH_EMAIL_MONITORING)) {
                promise.reject("BASIC_REQUIRED", "Scheduled breach monitoring requires Basic or higher")
                return@runAsync
            }
            val store = DigitalSafetyAutomationStore(reactContext)
            if (!store.enrollEmail(email)) {
                promise.reject("INVALID_EMAIL", "Enter a valid email address")
                return@runAsync
            }
            promise.resolve(mapToWritable(store.snapshot()))
        }
    }

    @ReactMethod
    fun unenrollBreachEmail(email: String, promise: Promise) {
        runAsync(promise, "DS_BREACH_UNENROLL") {
            val store = DigitalSafetyAutomationStore(reactContext)
            store.unenrollEmail(email)
            promise.resolve(mapToWritable(store.snapshot()))
        }
    }

    @ReactMethod
    fun recordBreachCheck(email: String, status: String, breachCount: Int, promise: Promise) {
        runAsync(promise, "DS_BREACH_RECORD") {
            val store = DigitalSafetyAutomationStore(reactContext)
            store.recordCheck(email, status, breachCount)
            promise.resolve(mapToWritable(store.snapshot()))
        }
    }

    private fun peekForegroundClipboardUrl(): String? {
        return try {
            val cm = reactContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                ?: return null
            if (!cm.hasPrimaryClip()) return null
            val item = cm.primaryClip?.getItemAt(0) ?: return null
            val text = item.coerceToText(reactContext).toString()
            extractFirstUrl(text)
        } catch (_: Exception) {
            null
        }
    }

    private fun extractFirstUrl(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isBlank() || trimmed.length > 4096) return null
        val match = URL_IN_TEXT.find(trimmed) ?: return null
        var url = match.value.trimEnd('.', ',', ')', ';')
        if (url.startsWith("www.", ignoreCase = true)) {
            url = "https://$url"
        }
        if (url.length > 2048) return null
        return url
    }

    @ReactMethod
    fun getCellularSecuritySummary(promise: Promise) {
        runAsync(promise, "CELLULAR_SUMMARY") {
            val cache = EntitlementCache(reactContext)
            if (!cache.hasCapability(Cap.CELLULAR_MONITOR)) {
                val map = Arguments.createMap()
                map.putString("status", "permission_required")
                map.putString("detail", "Cellular monitoring requires Basic or higher")
                promise.resolve(map)
                return@runAsync
            }
            val monitor = CellularMonitor(reactContext)
            val sample = monitor.sample()
            val map = Arguments.createMap()
            if (sample == null) {
                map.putString("status", "unavailable")
                map.putString("detail", "Telephony service unavailable or permission denied")
                promise.resolve(map)
                return@runAsync
            }
            val baselineStore = CellularBaselineStore(reactContext)
            val baseline = baselineStore.read()
            val anomaly = CellularAnomalyScorer.score(sample, baseline)
            baselineStore.updateFromSample(sample)
            map.putString("status", anomaly.status)
            map.putString("detail", anomaly.detail)
            map.putInt("score", anomaly.score)
            map.putString("simState", sample.simState)
            map.putString("networkType", sample.networkType)
            map.putString("operatorName", sample.operatorName)
            map.putString("simOperatorName", sample.simOperatorName)
            map.putString("networkCountryIso", sample.networkCountryIso)
            map.putString("simCountryIso", sample.simCountryIso)
            map.putBoolean("roaming", sample.roaming)
            map.putBoolean("policyLimited", !cache.hasFullCapability(Cap.CELLULAR_MONITOR))
            val reasons = Arguments.createArray()
            anomaly.reasons.forEach { reasons.pushString(it) }
            map.putArray("reasons", reasons)
            if (anomaly.shouldAlert && CellularEventDebouncer(reactContext).shouldEmit()) {
                TimelineEventLogger(reactContext).logEvent(
                    EventTypes.CELLULAR_ANOMALY_DETECTED,
                    "attention",
                    mapOf(
                        "source" to "cellular_monitor",
                        "score" to anomaly.score,
                        "sim_state" to sample.simState,
                        "network_type" to sample.networkType,
                        "operator" to sample.operatorName.take(48),
                    ),
                )
            }
            promise.resolve(map)
        }
    }

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
            val ent = EntitlementCache(reactContext)
            if (!ent.hasCapability(Cap.SECURE_VAULT)) {
                promise.reject("BASIC_REQUIRED", "Secure Vault requires Basic or higher")
                return@runAsync
            }
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
    fun deleteSecureVaultItem(id: String, pin: String, promise: Promise) {
        runAsync(promise, "SV_DELETE") {
            val ok = SecureVaultStorage(reactContext).deleteItem(id)
            if (ok) {
                TimelineEventLogger(reactContext).logEvent(
                    EventTypes.VAULT_ITEM_DELETED,
                    "completed",
                    mapOf("source" to "secure_vault"),
                )
                // Re-upload encrypted backup so deleted items leave Drive too (when signed in + PIN).
                if (pin.length >= 4 && verifyPin(pin) &&
                    EntitlementCache(reactContext).hasCapability(Cap.SECURE_VAULT_BACKUP)
                ) {
                    SecureVaultDriveSync.backup(reactContext, pin)
                }
            }
            promise.resolve(ok)
        }
    }

    @ReactMethod
    fun scheduleVaultExpiryReminders(leadDays: Double, promise: Promise) {
        runAsync(promise, "SV_EXPIRY") {
            val days = leadDays.toInt().coerceIn(1, 90)
            VaultExpiryReminderWorker.schedule(reactContext, days)
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun getVaultExpiryLeadDays(promise: Promise) {
        runAsync(promise, "SV_EXPIRY_LEAD") {
            promise.resolve(VaultExpiryReminderWorker.leadDays(reactContext).toDouble())
        }
    }

    @ReactMethod
    fun authenticateVaultBiometric(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No foreground activity")
            return
        }
        activity.runOnUiThread {
            try {
                val executor = androidx.core.content.ContextCompat.getMainExecutor(activity)
                val prompt = androidx.biometric.BiometricPrompt(
                    activity as androidx.fragment.app.FragmentActivity,
                    executor,
                    object : androidx.biometric.BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(
                            result: androidx.biometric.BiometricPrompt.AuthenticationResult,
                        ) {
                            promise.resolve(true)
                        }

                        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                            promise.reject("BIOMETRIC_ERROR", errString.toString())
                        }

                        override fun onAuthenticationFailed() {
                            // Keep waiting for another attempt / cancel
                        }
                    },
                )
                val info = androidx.biometric.BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Unlock Secure Vault")
                    .setSubtitle("Confirm it is you")
                    .setAllowedAuthenticators(
                        androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG or
                            androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL,
                    )
                    .build()
                prompt.authenticate(info)
            } catch (e: Exception) {
                promise.reject("BIOMETRIC_UNAVAILABLE", e.message, e)
            }
        }
    }

    @ReactMethod
    fun openSystemEmergencyInfo(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No foreground activity")
            return
        }
        try {
            val intent = Intent(android.provider.Settings.ACTION_SETTINGS)
            // Prefer emergency info editor when available
            val emergency = Intent("android.settings.EDIT_EMERGENCY_INFO")
            if (emergency.resolveActivity(activity.packageManager) != null) {
                activity.startActivity(emergency)
            } else {
                activity.startActivity(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("EMERGENCY_INFO", e.message, e)
        }
    }

    @ReactMethod
    fun getEmergencyLockScreenSummary(promise: Promise) {
        runAsync(promise, "ICE_LOCK") {
            promise.resolve(mapToWritable(EmergencyCardStorage(reactContext).lockScreenSummary()))
        }
    }

    @ReactMethod
    fun backupSecureVault(pin: String, promise: Promise) {
        runAsync(promise, "SV_BACKUP") {
            if (!EntitlementCache(reactContext).hasCapability(Cap.SECURE_VAULT_BACKUP)) {
                promise.reject("PREMIUM_REQUIRED", "Vault backup requires Premium or higher")
                return@runAsync
            }
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

    private fun promiseGuardianState(promise: Promise, expectEnabled: Boolean? = null) {
        val state = if (expectEnabled != null) {
            NetworkGuardianVpnService.awaitReady(reactContext, expectEnabled)
        } else {
            NetworkGuardianVpnService.state(reactContext)
        }
        promise.resolve(mapToWritable(state))
    }

    companion object {
        private const val TAG = "DigitalSafety"
        private const val REQ_QR = 9211
        private const val REQ_VPN = 9212
        private val URL_IN_TEXT = Regex("""(?:https?://|www\.)[^\s<>"'`]+""", RegexOption.IGNORE_CASE)
        private val bg = Executors.newFixedThreadPool(2) { r ->
            Thread(r, "DigitalSafetyBg").apply { isDaemon = true }
        }

        private fun cellularNetworkTypeName(networkType: Int): String = when (networkType) {
            TelephonyManager.NETWORK_TYPE_GPRS -> "GPRS"
            TelephonyManager.NETWORK_TYPE_EDGE -> "EDGE"
            TelephonyManager.NETWORK_TYPE_UMTS -> "UMTS"
            TelephonyManager.NETWORK_TYPE_CDMA -> "CDMA"
            TelephonyManager.NETWORK_TYPE_EVDO_0 -> "EVDO_0"
            TelephonyManager.NETWORK_TYPE_EVDO_A -> "EVDO_A"
            TelephonyManager.NETWORK_TYPE_1xRTT -> "1xRTT"
            TelephonyManager.NETWORK_TYPE_HSDPA -> "HSDPA"
            TelephonyManager.NETWORK_TYPE_HSUPA -> "HSUPA"
            TelephonyManager.NETWORK_TYPE_HSPA -> "HSPA"
            TelephonyManager.NETWORK_TYPE_IDEN -> "IDEN"
            TelephonyManager.NETWORK_TYPE_EVDO_B -> "EVDO_B"
            TelephonyManager.NETWORK_TYPE_LTE -> "LTE"
            TelephonyManager.NETWORK_TYPE_EHRPD -> "EHRPD"
            TelephonyManager.NETWORK_TYPE_HSPAP -> "HSPAP"
            TelephonyManager.NETWORK_TYPE_GSM -> "GSM"
            TelephonyManager.NETWORK_TYPE_TD_SCDMA -> "TD_SCDMA"
            TelephonyManager.NETWORK_TYPE_IWLAN -> "IWLAN"
            TelephonyManager.NETWORK_TYPE_NR -> "5G"
            else -> if (Build.VERSION.SDK_INT >= 34 && networkType == TelephonyManager.NETWORK_TYPE_UNKNOWN) "UNKNOWN" else "UNKNOWN"
        }
    }
}
