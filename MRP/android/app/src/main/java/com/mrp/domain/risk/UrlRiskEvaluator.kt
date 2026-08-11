package com.mrp.domain.risk

import android.net.Uri
import java.util.Locale

/**
 * On-device URL heuristics — mirrors TS urlScan.ts with 0–100 scoring.
 */
object UrlRiskEvaluator {

    private val BLOCK_HOST_FRAGMENTS = listOf(
        "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "cutt.ly",
    )
    private val RISKY_TLDS = listOf(".tk", ".ml", ".ga", ".cf", ".gq", ".zip", ".mov", ".top", ".xyz")
    private val PHISH_WORDS = listOf(
        "verify-account", "secure-login", "update-kyc", "unlock-account", "claim-prize",
        "free-recharge", "otp-verify", "bank-secure", "upi-refund", "digital-arrest",
    )

    fun evaluate(raw: String): UrlRiskResult {
        val input = raw.trim()
        if (input.isEmpty()) {
            return invalid(input, listOf("Empty input"), listOf("EMPTY_INPUT"))
        }

        if (input.uppercase(Locale.US).startsWith("WIFI:")) {
            return evaluateWifiQr(input)
        }

        val url = extractUrl(input)
        if (url == null) {
            return invalid(
                input,
                listOf("No http(s) URL found. Paste a full link or domain."),
                listOf("NO_URL"),
            )
        }

        val uri = try {
            Uri.parse(url)
        } catch (_: Exception) {
            return invalid(input, listOf("Malformed URL"), listOf("MALFORMED_URL"))
        }

        val host = uri.host?.lowercase(Locale.US) ?: ""
        if (host.isEmpty()) {
            return invalid(input, listOf("Malformed URL"), listOf("MALFORMED_URL"))
        }

        val path = "${uri.path ?: ""}${uri.query?.let { "?$it" } ?: ""}".lowercase(Locale.US)
        val reasons = mutableListOf<String>()
        val codes = mutableListOf<String>()
        var score = 0

        if (uri.scheme.equals("http", ignoreCase = true)) {
            score += 25
            reasons += "Uses HTTP (not HTTPS)"
            codes += "HTTP_INSECURE"
        }
        if (!uri.userInfo.isNullOrEmpty()) {
            score += 40
            reasons += "URL embeds credentials"
            codes += "EMBEDDED_CREDENTIALS"
        }
        if (IP_HOST.matches(host)) {
            score += 30
            reasons += "IP address host (common in phishing)"
            codes += "IP_HOST"
        }
        if (host.contains("xn--")) {
            score += 25
            reasons += "Punycode / IDN host — verify carefully"
            codes += "PUNYCODE_HOST"
        }
        if (host.count { it == '.' } >= 4) {
            score += 15
            reasons += "Many subdomains"
            codes += "MANY_SUBDOMAINS"
        }
        if (BLOCK_HOST_FRAGMENTS.any { host == it || host.endsWith(".$it") }) {
            score += 20
            reasons += "URL shortener — destination hidden until opened"
            codes += "URL_SHORTENER"
        }
        if (RISKY_TLDS.any { host.endsWith(it) }) {
            score += 20
            reasons += "Higher-abuse TLD (${host.substringAfterLast('.')})"
            codes += "RISKY_TLD"
        }
        for (w in PHISH_WORDS) {
            if (host.contains(w) || path.contains(w)) {
                score += 35
                reasons += "Suspicious keyword \"$w\""
                codes += "PHISH_KEYWORD"
                break
            }
        }
        val encodedCount = url.count { it == '%' }
        if (encodedCount > 4 && ENCODED_PATTERN.containsMatchIn(url)) {
            score += 10
            reasons += "Heavy URL encoding"
            codes += "HEAVY_ENCODING"
        }

        if (reasons.isEmpty()) {
            reasons += "No local red flags — still verify before entering passwords / OTP"
            codes += "NO_LOCAL_FLAGS"
        }

        val capped = score.coerceIn(0, 100)
        return UrlRiskResult(
            input = input,
            normalized = url,
            score = capped,
            band = RiskBand.fromScore(capped),
            reasons = reasons,
            reasonCodes = codes,
            domainHash = DomainHashUtil.hashHost(host),
            host = host,
        )
    }

    private fun evaluateWifiQr(input: String): UrlRiskResult {
        val ssid = Regex(";S:([^;]*);", RegexOption.IGNORE_CASE).find(input)?.groupValues?.getOrNull(1) ?: "?"
        val sec = Regex(";T:([^;]*);", RegexOption.IGNORE_CASE).find(input)?.groupValues?.getOrNull(1)?.uppercase(Locale.US) ?: "UNKNOWN"
        val reasons = mutableListOf("Wi‑Fi QR · SSID \"$ssid\" · $sec")
        val codes = mutableListOf("WIFI_QR")
        val open = sec.isEmpty() || sec == "NOPASS" || sec == "NONE"
        val wep = sec == "WEP"
        val score = when {
            open -> {
                reasons += "Open network QR — traffic is unencrypted"
                codes += "WIFI_OPEN"
                55
            }
            wep -> {
                reasons += "WEP is obsolete — treat as weak"
                codes += "WIFI_WEP"
                35
            }
            else -> {
                reasons += "Local decode only — confirm SSID before joining"
                25
            }
        }
        return UrlRiskResult(
            input = input,
            normalized = null,
            score = score,
            band = RiskBand.fromScore(score),
            reasons = reasons,
            reasonCodes = codes,
            domainHash = null,
            host = null,
        )
    }

    private fun invalid(input: String, reasons: List<String>, codes: List<String>) = UrlRiskResult(
        input = input,
        normalized = null,
        score = -1,
        band = RiskBand.INVALID,
        reasons = reasons,
        reasonCodes = codes,
        domainHash = null,
        host = null,
    )

    private fun extractUrl(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null
        val urlInText = Regex("https?://[^\\s<>\"']+", RegexOption.IGNORE_CASE).find(trimmed)?.value
        if (urlInText != null) {
            return urlInText.trimEnd('.', ',', ';', ')', ']')
        }
        if (DOMAIN_LIKE.matches(trimmed) && !trimmed.contains(' ')) {
            return "https://$trimmed"
        }
        if (trimmed.lowercase(Locale.US).startsWith("www.")) {
            return "https://$trimmed"
        }
        return null
    }

    private val IP_HOST = Regex("^\\d{1,3}(\\.\\d{1,3}){3}$")
    private val DOMAIN_LIKE = Regex("^[a-z0-9.-]+\\.[a-z]{2,}(/.*)?$", RegexOption.IGNORE_CASE)
    private val ENCODED_PATTERN = Regex("%[0-9a-fA-F]{2}")
}
