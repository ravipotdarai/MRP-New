package com.mrp.domain.risk

enum class RiskBand(val label: String) {
    SAFE("SAFE"),
    LOW("LOW_RISK"),
    SUSPICIOUS("SUSPICIOUS"),
    HIGH("HIGH_RISK"),
    CRITICAL("CRITICAL"),
    INVALID("INVALID");

    companion object {
        fun fromScore(score: Int): RiskBand = when {
            score < 0 -> INVALID
            score <= 19 -> SAFE
            score <= 39 -> LOW
            score <= 59 -> SUSPICIOUS
            score <= 79 -> HIGH
            else -> CRITICAL
        }
    }
}

data class UrlRiskResult(
    val input: String,
    val normalized: String?,
    val score: Int,
    val band: RiskBand,
    val reasons: List<String>,
    val reasonCodes: List<String>,
    val domainHash: String?,
    val host: String?,
)
