package com.mrp.domain.risk

import android.net.Uri
import java.net.IDN
import java.util.Locale

/**
 * URL normalization pipeline — single contract for Safe Link, QR, and Guardian lookups.
 * Decodes punycode/IDN hosts to Unicode for display and ASCII (punycode) for matching.
 */
object UrlNormalizer {

    data class NormalizedUrl(
        val input: String,
        val url: String?,
        val host: String?,
        /** ASCII / punycode host for DNS matching */
        val hostAscii: String?,
        /** Unicode host when IDN was decoded */
        val hostUnicode: String?,
        val path: String,
        val scheme: String?,
        val isIdn: Boolean = false,
    )

    fun normalize(raw: String): NormalizedUrl {
        val input = raw.trim()
        if (input.isEmpty()) {
            return NormalizedUrl(input, null, null, null, null, "", null)
        }
        if (input.uppercase(Locale.US).startsWith("WIFI:")) {
            return NormalizedUrl(input, null, null, null, null, input, "wifi")
        }
        val url = extractUrl(input) ?: return NormalizedUrl(input, null, null, null, null, "", null)
        val uri = try {
            Uri.parse(url)
        } catch (_: Exception) {
            return NormalizedUrl(input, url, null, null, null, "", null)
        }
        val rawHost = uri.host?.lowercase(Locale.US)
        val (hostAscii, hostUnicode, isIdn) = decodeHost(rawHost)
        val path = stripSensitiveQuery(
            "${uri.path ?: ""}${uri.query?.let { "?$it" } ?: ""}".lowercase(Locale.US),
        )
        val scheme = uri.scheme?.lowercase(Locale.US)
        return NormalizedUrl(
            input = input,
            url = url,
            host = hostAscii ?: rawHost,
            hostAscii = hostAscii ?: rawHost,
            hostUnicode = hostUnicode,
            path = path,
            scheme = scheme,
            isIdn = isIdn,
        )
    }

    fun extractUrl(raw: String): String? {
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

    fun normalizeHost(raw: String): String? {
        val trimmed = raw.trim().trimEnd('.').lowercase(Locale.US)
            .removePrefix("http://")
            .removePrefix("https://")
            .substringBefore('/')
        if (trimmed.isBlank() || trimmed.length > 253) return null
        if (trimmed.any { it.isWhitespace() }) return null
        return decodeHost(trimmed).first ?: trimmed
    }

    /**
     * Returns (asciiHost, unicodeHost, isIdn).
     */
    fun decodeHost(host: String?): Triple<String?, String?, Boolean> {
        if (host.isNullOrBlank()) return Triple(null, null, false)
        return try {
            val ascii = IDN.toASCII(host, IDN.ALLOW_UNASSIGNED).lowercase(Locale.US)
            val unicode = IDN.toUnicode(ascii, IDN.ALLOW_UNASSIGNED).lowercase(Locale.US)
            val isIdn = ascii != unicode || host.contains("xn--")
            Triple(ascii, unicode, isIdn)
        } catch (_: Exception) {
            Triple(host.lowercase(Locale.US), host.lowercase(Locale.US), host.contains("xn--"))
        }
    }

    /** Drop common credential / session query params from retained path strings. */
    fun stripSensitiveQuery(pathAndQuery: String): String {
        if (!pathAndQuery.contains('?')) return pathAndQuery
        val path = pathAndQuery.substringBefore('?')
        val query = pathAndQuery.substringAfter('?', "")
        if (query.isBlank()) return path
        val kept = query.split('&').filter { pair ->
            val key = pair.substringBefore('=').lowercase(Locale.US)
            key !in SENSITIVE_QUERY_KEYS
        }
        return if (kept.isEmpty()) path else "$path?${kept.joinToString("&")}"
    }

    private val DOMAIN_LIKE = Regex("^[a-z0-9.-]+\\.[a-z]{2,}(/.*)?$", RegexOption.IGNORE_CASE)

    private val SENSITIVE_QUERY_KEYS = setOf(
        "password", "passwd", "pass", "pwd", "pin", "otp", "cvv", "token",
        "access_token", "refresh_token", "session", "sid", "auth", "code",
        "client_secret", "api_key", "apikey",
    )
}
