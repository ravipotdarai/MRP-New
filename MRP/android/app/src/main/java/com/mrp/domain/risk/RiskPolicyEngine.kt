package com.mrp.domain.risk

import com.mrp.domain.model.EventTypes

object RiskPolicyEngine {

    fun evaluateUrl(
        raw: String,
        allowlist: List<String> = emptyList(),
        brandStore: BrandListStore? = null,
        blocklist: List<String> = emptyList(),
    ): UrlRiskResult =
        UrlRiskEvaluator.evaluate(raw, allowlist, brandStore, blocklist)

    fun enrich(result: UrlRiskResult, extraScore: Int, reason: String, code: String): UrlRiskResult {
        if (result.band == RiskBand.INVALID || extraScore <= 0) return result
        if (result.reasonCodes.contains(code)) return result
        val nextScore = (result.score.coerceAtLeast(0) + extraScore).coerceIn(0, 100)
        val reasons = result.reasons.filterNot { it.startsWith("No local red flags") } + reason
        val codes = result.reasonCodes.filterNot { it == "NO_LOCAL_FLAGS" } + code
        return result.copy(
            score = nextScore,
            band = RiskBand.fromScore(nextScore),
            reasons = reasons,
            reasonCodes = codes,
        )
    }

    /** Map URL risk band to timeline event type (no full URL in metadata). */
    fun safeLinkEventType(result: UrlRiskResult): String = when (result.band) {
        RiskBand.CRITICAL -> EventTypes.SAFE_LINK_BLOCKED
        RiskBand.HIGH, RiskBand.SUSPICIOUS -> EventTypes.SAFE_LINK_WARNED
        RiskBand.LOW -> EventTypes.SAFE_LINK_SCANNED
        RiskBand.SAFE -> EventTypes.SAFE_LINK_ALLOWED
        RiskBand.INVALID -> EventTypes.SAFE_LINK_SCANNED
    }

    fun safeLinkMetadata(result: UrlRiskResult): Map<String, Any?> = buildMap {
        put("score", result.score.coerceAtLeast(0))
        put("band", result.band.label)
        put("reason_codes", result.reasonCodes.joinToString(","))
        result.domainHash?.let { put("domain_hash", it) }
        result.host?.let { put("host", it.take(64)) }
        put("source", "safe_link")
    }

    fun otpScamMetadata(score: Int, verdict: String, reasonCodes: List<String>): Map<String, Any?> =
        mapOf(
            "score" to score.coerceIn(0, 100),
            "band" to RiskBand.fromScore(score).label,
            "verdict" to verdict,
            "reason_codes" to reasonCodes.joinToString(","),
            "source" to "otp_paste",
        )
}
