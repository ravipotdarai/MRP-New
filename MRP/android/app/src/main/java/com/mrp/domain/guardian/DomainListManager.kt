package com.mrp.domain.guardian

import android.content.Context
import com.mrp.domain.risk.DomainListMatcher
import com.mrp.domain.risk.ThreatIntelProvider
import org.json.JSONArray
import java.security.MessageDigest

enum class DomainCategory {
    AD,
    TRACKER,
    MALWARE,
    PHISHING,
    CONTENT,
}

data class DomainMatch(
    val category: DomainCategory,
    val rule: String,
)

/**
 * Local curated domain lists with version metadata, category toggles, and user allowlist.
 */
class DomainListManager(context: Context) {

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val intel = ThreatIntelProvider(appContext)

    private var ads: Set<String> = emptySet()
    private var trackers: Set<String> = emptySet()
    private var malware: Set<String> = emptySet()
    private var phishing: Set<String> = emptySet()
    private var content: Set<String> = emptySet()

    init {
        loadOrSeed()
        migrateAppsFirstDefaults()
    }

    /**
     * One-shot: older builds defaulted trackers ON which broke YouTube/Flipkart/Amazon.
     * Force trackers off unless the user already opted into apps-first migration.
     */
    private fun migrateAppsFirstDefaults() {
        if (prefs.getBoolean(KEY_APPS_FIRST_V1, false)) return
        prefs.edit()
            .putBoolean(categoryPref(DomainCategory.TRACKER), false)
            .putBoolean(KEY_APPS_FIRST_V1, true)
            .apply()
    }

    fun listVersion(): String = prefs.getString(KEY_VERSION, "1") ?: "1"

    fun listUpdatedAtMs(): Long = prefs.getLong(KEY_UPDATED_AT, 0L)

    fun categoryEnabled(category: DomainCategory): Boolean {
        val key = categoryPref(category)
        if (!prefs.contains(key)) {
            // Apps-first defaults: ads + threat lists on; trackers/content opt-in.
            return when (category) {
                DomainCategory.AD,
                DomainCategory.MALWARE,
                DomainCategory.PHISHING,
                -> true
                DomainCategory.TRACKER,
                DomainCategory.CONTENT,
                -> false
            }
        }
        return prefs.getBoolean(key, true)
    }

    fun setCategoryEnabled(category: DomainCategory, enabled: Boolean) {
        prefs.edit().putBoolean(categoryPref(category), enabled).apply()
    }

    fun allowlist(): List<String> {
        val raw = prefs.getString(KEY_ALLOWLIST, "[]") ?: "[]"
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { arr.optString(it).trim().lowercase().ifBlank { null } }
                .distinct()
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun addAllowlist(hostRaw: String): Boolean {
        // Store apex without www so www.site.com and site.com both match.
        val host = DomainListMatcher.apexHost(hostRaw) ?: return false
        // Require a dotted domain (blocks accidental "com" / "net" allow-all).
        if (!host.contains('.') || host.startsWith('.') || host.endsWith('.')) return false
        val next = (allowlist() + host).distinct().take(MAX_ALLOWLIST)
        val arr = JSONArray()
        next.forEach { arr.put(it) }
        prefs.edit().putString(KEY_ALLOWLIST, arr.toString()).apply()
        return true
    }

    fun removeAllowlist(hostRaw: String) {
        val host = DomainListMatcher.apexHost(hostRaw) ?: hostRaw.trim().lowercase()
        val next = allowlist().filter {
            val entry = DomainListMatcher.apexHost(it) ?: it
            entry != host && it != hostRaw.trim().lowercase()
        }
        val arr = JSONArray()
        next.forEach { arr.put(it) }
        prefs.edit().putString(KEY_ALLOWLIST, arr.toString()).apply()
    }

    fun match(hostname: String): DomainMatch? {
        val host = DomainListMatcher.apexHost(hostname) ?: normalizeHost(hostname) ?: return null
        if (isAppCompatibleHost(host)) return null
        if (DomainListMatcher.isAllowlisted(host, allowlist())) return null
        if (categoryEnabled(DomainCategory.MALWARE)) {
            findIn(host, malware)?.let { return DomainMatch(DomainCategory.MALWARE, it) }
            intel.lookup(host)?.takeIf { it.category == "malware" }?.let {
                return DomainMatch(DomainCategory.MALWARE, it.rule)
            }
        }
        if (categoryEnabled(DomainCategory.PHISHING)) {
            findIn(host, phishing)?.let { return DomainMatch(DomainCategory.PHISHING, it) }
            intel.lookup(host)?.takeIf { it.category == "phishing" }?.let {
                return DomainMatch(DomainCategory.PHISHING, it.rule)
            }
        }
        if (categoryEnabled(DomainCategory.AD)) {
            findIn(host, ads)?.let { return DomainMatch(DomainCategory.AD, it) }
        }
        if (categoryEnabled(DomainCategory.TRACKER)) {
            findIn(host, trackers)?.let { return DomainMatch(DomainCategory.TRACKER, it) }
        }
        if (categoryEnabled(DomainCategory.CONTENT)) {
            findIn(host, content)?.let { return DomainMatch(DomainCategory.CONTENT, it) }
        }
        return null
    }

    /** Hosts major apps need — never blocked even if they overlap ad/tracker rules. */
    private fun isAppCompatibleHost(host: String): Boolean {
        val h = host.removePrefix("www.")
        return APP_COMPAT_ALLOW.any { h == it || h.endsWith(".$it") }
    }

    fun refreshFromBundled(): Boolean {
        ads = SEED_ADS
        trackers = SEED_TRACKERS
        malware = SEED_MALWARE
        phishing = SEED_PHISHING
        content = SEED_CONTENT
        val now = System.currentTimeMillis()
        val version = "seed-${sha256Short(SEED_ADS + SEED_TRACKERS + SEED_MALWARE + SEED_PHISHING + SEED_CONTENT)}"
        prefs.edit()
            .putString(KEY_VERSION, version)
            .putLong(KEY_UPDATED_AT, now)
            .apply()
        return true
    }

    fun setManifestUrl(url: String?) {
        val trimmed = url?.trim().orEmpty()
        if (trimmed.isBlank()) {
            prefs.edit().remove(KEY_MANIFEST_URL).apply()
        } else {
            prefs.edit().putString(KEY_MANIFEST_URL, trimmed).apply()
        }
    }

    fun manifestUrl(): String? = prefs.getString(KEY_MANIFEST_URL, DEFAULT_MANIFEST_URL)

    /**
     * Signed remote manifest refresh. Keeps previous lists on signature mismatch or network failure.
     */
    fun refreshRemoteManifest(feedUrl: String? = null): Boolean {
        val url = (feedUrl ?: manifestUrl()).orEmpty().trim()
        if (url.isBlank()) return refreshFromBundled()
        return try {
            val body = java.net.URL(url).openConnection().apply {
                connectTimeout = 5000
                readTimeout = 5000
            }.getInputStream().bufferedReader().use { it.readText() }
            val json = org.json.JSONObject(body)
            val expected = json.optString("sha256")
            val remoteAds = jsonArrayToSet(json.optJSONArray("ads"))
            val remoteTrackers = jsonArrayToSet(json.optJSONArray("trackers"))
            val remoteMal = jsonArrayToSet(json.optJSONArray("malware"))
            val remotePhish = jsonArrayToSet(json.optJSONArray("phishing"))
            val remoteContent = jsonArrayToSet(json.optJSONArray("content"))
            val mergedAds = SEED_ADS + remoteAds
            val mergedTrackers = SEED_TRACKERS + remoteTrackers
            val mergedMal = SEED_MALWARE + remoteMal
            val mergedPhish = SEED_PHISHING + remotePhish
            val mergedContent = SEED_CONTENT + remoteContent
            val actual = sha256Hex(
                (mergedAds + mergedTrackers + mergedMal + mergedPhish + mergedContent)
                    .sorted()
                    .joinToString("\n"),
            )
            if (expected.isNotBlank() && !expected.equals(actual, ignoreCase = true)) {
                prefs.edit().putString(KEY_LAST_ERROR, "Guardian list signature mismatch — kept previous list").apply()
                return false
            }
            ads = mergedAds
            trackers = mergedTrackers
            malware = mergedMal
            phishing = mergedPhish
            content = mergedContent
            val version = json.optString("version", "remote")
            prefs.edit()
                .putString(KEY_VERSION, version)
                .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
                .remove(KEY_LAST_ERROR)
                .apply()
            true
        } catch (e: Exception) {
            android.util.Log.w("DomainListManager", "remote manifest refresh failed open", e)
            prefs.edit().putString(KEY_LAST_ERROR, "Guardian list refresh failed — using local cache").apply()
            false
        }
    }

    fun lastError(): String? = prefs.getString(KEY_LAST_ERROR, null)

    fun snapshot(): Map<String, Any?> = mapOf(
        "listVersion" to listVersion(),
        "listUpdatedAtMs" to listUpdatedAtMs(),
        "listLastError" to lastError(),
        "categoryAds" to categoryEnabled(DomainCategory.AD),
        "categoryTrackers" to categoryEnabled(DomainCategory.TRACKER),
        "categoryMalware" to categoryEnabled(DomainCategory.MALWARE),
        "categoryPhishing" to categoryEnabled(DomainCategory.PHISHING),
        "categoryContent" to categoryEnabled(DomainCategory.CONTENT),
        "allowlist" to allowlist(),
        "manifestUrlConfigured" to !manifestUrl().isNullOrBlank(),
        "manifestUrl" to (manifestUrl()?.take(80)),
    ) + intel.snapshot()

    private fun loadOrSeed() {
        refreshFromBundled()
    }

    private fun findIn(host: String, rules: Set<String>): String? {
        for (rule in rules) {
            if (host == rule || host.endsWith(".$rule")) return rule
        }
        return null
    }

    private fun normalizeHost(raw: String): String? = DomainListMatcher.apexHost(raw)

    private fun sha256Short(data: Set<String>): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val bytes = digest.digest(data.sorted().joinToString("\n").toByteArray())
        return bytes.take(6).joinToString("") { "%02x".format(it) }
    }

    private fun sha256Hex(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
    }

    private fun jsonArrayToSet(arr: org.json.JSONArray?): Set<String> {
        if (arr == null) return emptySet()
        val out = mutableSetOf<String>()
        for (i in 0 until arr.length()) {
            arr.optString(i)?.trim()?.lowercase()?.takeIf { it.isNotBlank() }?.let { out.add(it) }
        }
        return out
    }

    companion object {
        private const val PREFS = "mrp_guardian_lists"
        private const val KEY_VERSION = "version"
        private const val KEY_UPDATED_AT = "updated_at_ms"
        private const val KEY_ALLOWLIST = "allowlist"
        private const val KEY_MANIFEST_URL = "manifest_url"
        private const val KEY_LAST_ERROR = "last_error"
        private const val KEY_APPS_FIRST_V1 = "apps_first_v1"
        private const val MAX_ALLOWLIST = 50
        /** Override via setManifestUrl / remote config. Blank = bundled seed only. */
        private const val DEFAULT_MANIFEST_URL = ""

        /**
         * Never block — keeps YouTube / Amazon / Flipkart / Play / WhatsApp usable while ads filter runs.
         * Prefer parent registrable domains; subdomain match uses endsWith(".$it").
         */
        private val APP_COMPAT_ALLOW = setOf(
            // Google / YouTube (do NOT add bare google.com — that would exempt adservice.google.com)
            "youtube.com",
            "youtu.be",
            "googlevideo.com",
            "ytimg.com",
            "ggpht.com",
            "googleapis.com",
            "gstatic.com",
            "googleusercontent.com",
            "gvt1.com",
            "gvt2.com",
            "youtube-nocookie.com",
            "withyoutube.com",
            "widevine.com",
            // Amazon storefront / media (not bare ad networks beyond what's required)
            "amazon.com",
            "amazon.in",
            "ssl-images-amazon.com",
            "images-amazon.com",
            "media-amazon.com",
            "amazonaws.com",
            // Flipkart
            "flipkart.com",
            "flipkart.net",
            "fkapi.net",
            "flixcart.com",
            "flipkartcdn.com",
            // Messaging / social core
            "whatsapp.com",
            "whatsapp.net",
            "wa.me",
            "facebook.com",
            "fbcdn.net",
            "instagram.com",
            "cdninstagram.com",
            // Play / device
            "play.google.com",
            "android.clients.google.com",
        )

        private fun categoryPref(category: DomainCategory): String = "cat_${category.name.lowercase()}"

        private val SEED_ADS = setOf(
            "doubleclick.net",
            "googlesyndication.com",
            "googleadservices.com",
            "adservice.google.com",
            "googleads.g.doubleclick.net",
            "pagead2.googlesyndication.com",
            "adnxs.com",
            "adsrvr.org",
            "taboola.com",
            "outbrain.com",
            "popads.net",
            "propellerads.com",
            "2mdn.net",
            "admob.com",
            "ads.pubmatic.com",
            "pubmatic.com",
            "rubiconproject.com",
            "openx.net",
            "criteo.com",
            "criteo.net",
            "moatads.com",
            "inmobi.com",
            "inmobi.cn",
            "adcolony.com",
            "applovin.com",
            "applvn.com",
            "chartboost.com",
            "unityads.unity3d.com",
            "ironsrc.com",
            "ironsource.mobi",
            "mintegral.com",
            "mintegral.net",
            "fyber.com",
            "inner-active.mobi",
            "vungle.com",
            "tapjoy.com",
            "startappservice.com",
            "adform.net",
            "smartadserver.com",
            "adsafeprotected.com",
            "amazon-adsystem.com",
            "media.net",
            "bidswitch.net",
            "casalemedia.com",
            "contextweb.com",
            "lijit.com",
            "spotxchange.com",
            "teads.tv",
            "yieldmo.com",
        )

        private val SEED_TRACKERS = setOf(
            "google-analytics.com",
            "analytics.google.com",
            "googletagmanager.com",
            "facebook.net",
            "connect.facebook.net",
            "scorecardresearch.com",
            "hotjar.com",
            "mixpanel.com",
            "segment.io",
            "segment.com",
            "adjust.com",
            "adjust.net.in",
            "appsflyer.com",
            "app-measurement.com",
            "crashlytics.com",
            "firebase-settings.crashlytics.com",
            "newrelic.com",
            "amplitude.com",
            "clevertap.com",
            "branch.io",
            "app.link",
            "kochava.com",
            "singular.net",
            "mparticle.com",
            "quantserve.com",
            "bluekai.com",
            "demdex.net",
            "omtrdc.net",
            "2o7.net",
            "exelator.com",
        )

        private val SEED_MALWARE = setOf(
            "malware-test.example",
            "evil-tracker.example",
        )

        private val SEED_PHISHING = setOf(
            "phish-test.example",
            "login-secure-update.example",
        )

        /** Adult / restricted content domains (DNS-level). Opt-in category. */
        private val SEED_CONTENT = setOf(
            "pornhub.com",
            "xvideos.com",
            "xnxx.com",
            "xhamster.com",
            "redtube.com",
            "youporn.com",
            "spankbang.com",
            "chaturbate.com",
            "onlyfans.com",
            "bongacams.com",
            "stripchat.com",
            "livejasmin.com",
            "adultfriendfinder.com",
            "porn.com",
            "sex.com",
        )
    }
}
