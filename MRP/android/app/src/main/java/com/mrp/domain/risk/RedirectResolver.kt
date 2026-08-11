package com.mrp.domain.risk

import android.util.Log
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

/**
 * Resolve short-link redirect chains safely (no JS execution).
 * Max depth 5, 8s total budget, HEAD then GET fallback.
 */
object RedirectResolver {

    private const val TAG = "RedirectResolver"
    private const val MAX_DEPTH = 5
    private const val TIMEOUT_MS = 8_000

    data class Result(
        val original: String,
        val finalUrl: String,
        val hops: List<String>,
        val resolved: Boolean,
        val error: String? = null,
    )

    fun resolve(rawUrl: String): Result {
        val start = rawUrl.trim()
        if (start.isEmpty()) {
            return Result(start, start, emptyList(), false, "empty")
        }
        val hops = mutableListOf<String>()
        var current = start
        val deadline = System.currentTimeMillis() + TIMEOUT_MS
        try {
            for (i in 0 until MAX_DEPTH) {
                if (System.currentTimeMillis() > deadline) {
                    return Result(start, current, hops, hops.isNotEmpty(), "timeout")
                }
                val next = followOnce(current, (deadline - System.currentTimeMillis()).toInt().coerceAtLeast(500))
                    ?: break
                if (next.equals(current, ignoreCase = true)) break
                hops += next
                current = next
            }
            return Result(start, current, hops, hops.isNotEmpty())
        } catch (e: Exception) {
            Log.w(TAG, "resolve failed: ${e.message}")
            return Result(start, current, hops, hops.isNotEmpty(), e.message)
        }
    }

    private fun followOnce(urlStr: String, remainingMs: Int): String? {
        val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            connectTimeout = remainingMs.coerceAtMost(4_000)
            readTimeout = remainingMs.coerceAtMost(4_000)
            requestMethod = "HEAD"
            setRequestProperty("User-Agent", "MRP-SafeLink/1.0")
        }
        return try {
            conn.connect()
            val code = conn.responseCode
            if (code in 300..399) {
                conn.getHeaderField("Location")?.let { loc ->
                    absoluteUrl(urlStr, loc)
                }
            } else if (code == HttpURLConnection.HTTP_OK || code == HttpURLConnection.HTTP_BAD_METHOD) {
                // Some hosts reject HEAD — try GET without body read
                if (conn.requestMethod == "HEAD" && code == HttpURLConnection.HTTP_BAD_METHOD) {
                    followOnceGet(urlStr, remainingMs)
                } else {
                    null
                }
            } else {
                null
            }
        } finally {
            conn.disconnect()
        }
    }

    private fun followOnceGet(urlStr: String, remainingMs: Int): String? {
        val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            connectTimeout = remainingMs.coerceAtMost(4_000)
            readTimeout = remainingMs.coerceAtMost(4_000)
            requestMethod = "GET"
            setRequestProperty("User-Agent", "MRP-SafeLink/1.0")
        }
        return try {
            conn.connect()
            val code = conn.responseCode
            if (code in 300..399) {
                conn.getHeaderField("Location")?.let { absoluteUrl(urlStr, it) }
            } else null
        } finally {
            conn.disconnect()
        }
    }

    private fun absoluteUrl(base: String, location: String): String {
        val loc = location.trim()
        if (loc.lowercase(Locale.US).startsWith("http://") ||
            loc.lowercase(Locale.US).startsWith("https://")
        ) {
            return loc
        }
        return try {
            URL(URL(base), loc).toString()
        } catch (_: Exception) {
            loc
        }
    }
}
