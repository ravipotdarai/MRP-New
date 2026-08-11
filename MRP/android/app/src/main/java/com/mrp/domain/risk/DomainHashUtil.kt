package com.mrp.domain.risk

import java.security.MessageDigest

object DomainHashUtil {
    /** SHA-256 prefix of hostname — never store full URLs in timeline metadata. */
    fun hashHost(host: String?): String? {
        if (host.isNullOrBlank()) return null
        val digest = MessageDigest.getInstance("SHA-256")
        val bytes = digest.digest(host.lowercase().trim().toByteArray(Charsets.UTF_8))
        return bytes.take(8).joinToString("") { "%02x".format(it) }
    }
}
