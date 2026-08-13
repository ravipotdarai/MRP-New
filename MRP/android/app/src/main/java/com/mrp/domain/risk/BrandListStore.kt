package com.mrp.domain.risk

import android.content.Context
import org.json.JSONArray

/**
 * Configurable brand / official-domain lists for impersonation checks.
 * Defaults match BrandImpersonationChecker; users can add brands and official hosts.
 */
class BrandListStore(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun brands(): List<String> {
        val custom = readArray(KEY_BRANDS)
        return (DEFAULT_BRANDS + custom).map { it.lowercase() }.distinct()
    }

    fun official(): Set<String> {
        val custom = readArray(KEY_OFFICIAL)
        return (DEFAULT_OFFICIAL + custom).map { it.lowercase() }.toSet()
    }

    fun addBrand(raw: String): Boolean {
        val brand = raw.trim().lowercase().filter { it.isLetterOrDigit() }
        if (brand.length < 3 || brand.length > 32) return false
        val next = (readArray(KEY_BRANDS) + brand).distinct().take(MAX)
        writeArray(KEY_BRANDS, next)
        return true
    }

    fun removeBrand(raw: String) {
        val brand = raw.trim().lowercase()
        writeArray(KEY_BRANDS, readArray(KEY_BRANDS).filter { it != brand })
    }

    fun addOfficial(hostRaw: String): Boolean {
        val host = UrlNormalizer.normalizeHost(hostRaw) ?: return false
        val next = (readArray(KEY_OFFICIAL) + host).distinct().take(MAX)
        writeArray(KEY_OFFICIAL, next)
        return true
    }

    fun removeOfficial(hostRaw: String) {
        val host = UrlNormalizer.normalizeHost(hostRaw) ?: hostRaw.trim().lowercase()
        writeArray(KEY_OFFICIAL, readArray(KEY_OFFICIAL).filter { it != host })
    }

    fun snapshot(): Map<String, Any?> = mapOf(
        "customBrands" to readArray(KEY_BRANDS),
        "customOfficial" to readArray(KEY_OFFICIAL),
        "brandCount" to brands().size,
        "officialCount" to official().size,
    )

    private fun readArray(key: String): List<String> {
        val raw = prefs.getString(key, "[]") ?: "[]"
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { arr.optString(it).trim().lowercase().ifBlank { null } }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun writeArray(key: String, values: List<String>) {
        val arr = JSONArray()
        values.forEach { arr.put(it) }
        prefs.edit().putString(key, arr.toString()).apply()
    }

    companion object {
        private const val PREFS = "mrp_brand_lists"
        private const val KEY_BRANDS = "brands"
        private const val KEY_OFFICIAL = "official"
        private const val MAX = 80

        val DEFAULT_BRANDS = listOf(
            "paytm", "phonepe", "googlepay", "whatsapp", "instagram", "facebook",
            "flipkart", "amazon", "hdfc", "icici", "kotak", "axisbank", "irctc",
            "uidai", "aadhaar", "npci", "sbi",
        )

        val DEFAULT_OFFICIAL = setOf(
            "paytm.com", "phonepe.com", "google.com", "google.co.in", "whatsapp.com",
            "instagram.com", "facebook.com", "flipkart.com", "amazon.com", "amazon.in",
            "hdfcbank.com", "icicibank.com", "kotak.com", "axisbank.com", "irctc.co.in",
            "uidai.gov.in", "npci.org.in", "sbi.co.in", "onlinesbi.sbi", "sbi.com",
        )
    }
}
