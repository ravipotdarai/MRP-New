package com.mrp.domain.risk

import com.mrp.domain.model.EventTypes

object RiskPolicyEngine {

    fun evaluateUrl(raw: String): UrlRiskResult = UrlRiskEvaluator.evaluate(raw)

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
