package com.mrp.domain.guardian

import android.content.Context
import android.content.SharedPreferences

/** Aggregate blocked counters only — no browsing history. */
class GuardianStatsStore(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun increment(category: DomainCategory) {
        val key = when (category) {
            DomainCategory.AD -> KEY_ADS
            DomainCategory.TRACKER -> KEY_TRACKERS
            DomainCategory.MALWARE -> KEY_MALWARE
            DomainCategory.PHISHING -> KEY_PHISHING
            DomainCategory.CONTENT -> KEY_CONTENT
        }
        prefs.edit().putLong(key, prefs.getLong(key, 0L) + 1L).commit()
    }

    fun incrementDnsQueries() {
        prefs.edit().putLong(KEY_DNS_QUERIES, prefs.getLong(KEY_DNS_QUERIES, 0L) + 1L).commit()
    }

    fun incrementDnsForwarded() {
        prefs.edit().putLong(KEY_DNS_FORWARDED, prefs.getLong(KEY_DNS_FORWARDED, 0L) + 1L).commit()
    }

    fun snapshot(): Map<String, Long> = mapOf(
        "blockedAds" to prefs.getLong(KEY_ADS, 0L),
        "blockedTrackers" to prefs.getLong(KEY_TRACKERS, 0L),
        "blockedMalware" to prefs.getLong(KEY_MALWARE, 0L),
        "blockedPhishing" to prefs.getLong(KEY_PHISHING, 0L),
        "blockedContent" to prefs.getLong(KEY_CONTENT, 0L),
        "blockedTotal" to prefs.getLong(KEY_ADS, 0L) +
            prefs.getLong(KEY_TRACKERS, 0L) +
            prefs.getLong(KEY_MALWARE, 0L) +
            prefs.getLong(KEY_PHISHING, 0L) +
            prefs.getLong(KEY_CONTENT, 0L),
        "dnsQueries" to prefs.getLong(KEY_DNS_QUERIES, 0L),
        "dnsForwarded" to prefs.getLong(KEY_DNS_FORWARDED, 0L),
    )

    fun reset() {
        prefs.edit()
            .remove(KEY_ADS)
            .remove(KEY_TRACKERS)
            .remove(KEY_MALWARE)
            .remove(KEY_PHISHING)
            .remove(KEY_CONTENT)
            .remove(KEY_DNS_QUERIES)
            .remove(KEY_DNS_FORWARDED)
            .commit()
    }

    companion object {
        private const val PREFS = "mrp_guardian_stats"
        private const val KEY_ADS = "ads"
        private const val KEY_TRACKERS = "trackers"
        private const val KEY_MALWARE = "malware"
        private const val KEY_PHISHING = "phishing"
        private const val KEY_CONTENT = "content"
        private const val KEY_DNS_QUERIES = "dns_queries"
        private const val KEY_DNS_FORWARDED = "dns_forwarded"
    }
}
