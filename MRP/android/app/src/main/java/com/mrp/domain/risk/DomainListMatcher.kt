package com.mrp.domain.risk

/**
 * Domain list matching with allowlist precedence — used by Safe Link allowlist and Guardian lists.
 */
object DomainListMatcher {

    fun matches(host: String, rules: Set<String>): String? {
        val normalized = UrlNormalizer.normalizeHost(host) ?: return null
        for (rule in rules) {
            if (normalized == rule || normalized.endsWith(".$rule")) return rule
        }
        return null
    }

    fun isAllowlisted(host: String, allowlist: List<String>): Boolean {
        val normalized = apexHost(host) ?: return false
        if (allowlist.isEmpty()) return false
        for (entry in allowlist) {
            val allowed = apexHost(entry) ?: continue
            if (normalized == allowed || normalized.endsWith(".$allowed")) return true
        }
        return false
    }

    /** Host without scheme/path/port/www — for allowlist and blocklist checks. */
    fun apexHost(raw: String): String? {
        val host = UrlNormalizer.normalizeHost(raw) ?: return null
        val noPort = if (host.startsWith("[")) {
            host
        } else {
            host.substringBefore(':')
        }
        if (noPort.isBlank()) return null
        return noPort.removePrefix("www.")
    }
}
