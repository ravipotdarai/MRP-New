package com.mrp.domain.guardian

/** Coalesce timeline events — counters always increment; events are rate-limited. */
class GuardianEventDebouncer(private val minIntervalMs: Long = 60_000L) {
    private val lastEmittedMs = mutableMapOf<String, Long>()

    fun shouldEmit(category: DomainCategory): Boolean {
        val key = category.name
        val now = System.currentTimeMillis()
        val last = lastEmittedMs[key] ?: 0L
        if (now - last < minIntervalMs) return false
        lastEmittedMs[key] = now
        return true
    }
}
