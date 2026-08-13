package com.mrp.domain.risk

/**
 * Conservative brand impersonation / typosquat checks.
 * Official domains are never flagged. Short brands (≤3) require an exact label match.
 * When [BrandListStore] is provided, brands/official hosts are configurable.
 */
object BrandImpersonationChecker {

    data class Hit(
        val brand: String,
        val reason: String,
        val code: String,
        val score: Int,
    )

    fun check(hostRaw: String, brandStore: BrandListStore? = null): Hit? {
        val host = UrlNormalizer.normalizeHost(hostRaw) ?: return null
        if (host.isBlank() || host.length > 253) return null
        val brands = brandStore?.brands() ?: BrandListStore.DEFAULT_BRANDS
        val official = brandStore?.official() ?: BrandListStore.DEFAULT_OFFICIAL
        if (isOfficial(host, official)) return null

        val sld = registrableLabel(host) ?: return null
        val tokens = host.split('.', '-').filter { it.length >= 3 }

        for (brand in brands) {
            if (sld == brand) {
                return Hit(
                    brand,
                    "Looks like $brand on an unofficial domain",
                    "BRAND_IMPERSONATION",
                    45,
                )
            }
            if (brand.length >= 4 && tokens.contains(brand)) {
                return Hit(
                    brand,
                    "Uses the name $brand on an unofficial domain",
                    "BRAND_IMPERSONATION",
                    40,
                )
            }
            val folded = foldHomoglyphs(sld)
            if (folded == brand && sld != brand) {
                return Hit(
                    brand,
                    "Homoglyph lookalike of $brand",
                    "HOMOGLYPH_BRAND",
                    50,
                )
            }
            if (brand.length >= 5 && sld.length >= 5) {
                val distance = levenshtein(sld, brand)
                if (distance == 1) {
                    return Hit(
                        brand,
                        "Possible typosquat of $brand",
                        "TYPOSQUAT",
                        40,
                    )
                }
                if (distance == 2 && brand.length >= 7 && sld.length >= 7) {
                    return Hit(
                        brand,
                        "Possible typosquat of $brand",
                        "TYPOSQUAT",
                        30,
                    )
                }
            }
        }
        return null
    }

    private fun isOfficial(host: String, official: Set<String>): Boolean {
        return official.any { host == it || host.endsWith(".$it") }
    }

    private fun registrableLabel(host: String): String? {
        val parts = host.split('.').filter { it.isNotBlank() }
        if (parts.size < 2) return parts.firstOrNull()
        val multi = setOf("co", "com", "gov", "org", "net", "ac")
        return if (parts.size >= 3 && parts[parts.size - 2] in multi) {
            parts[parts.size - 3]
        } else {
            parts[parts.size - 2]
        }
    }

    private fun foldHomoglyphs(value: String): String {
        return value
            .replace('0', 'o')
            .replace('1', 'l')
            .replace('3', 'e')
            .replace('5', 's')
            .replace("rn", "m")
    }

    private fun levenshtein(a: String, b: String): Int {
        val m = a.length
        val n = b.length
        if (m == 0) return n
        if (n == 0) return m
        val prev = IntArray(n + 1) { it }
        val cur = IntArray(n + 1)
        for (i in 1..m) {
            cur[0] = i
            for (j in 1..n) {
                val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                cur[j] = minOf(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
            }
            for (j in 0..n) prev[j] = cur[j]
        }
        return prev[n]
    }
}
