package com.mrp.domain.risk

/**
 * Unified scam signal aggregation for URL, OTP paste, and optional SMS heuristics.
 */
object ScamSignalAggregator {

    enum class Source(val tag: String) {
        MANUAL("manual"),
        SHARED("shared"),
        CLIPBOARD("clipboard"),
        SMS_AUTO("sms_auto"),
        QR("qr"),
    }

    data class ScamSignalResult(
        val score: Int,
        val band: RiskBand,
        val reasons: List<String>,
        val reasonCodes: List<String>,
        val source: Source,
        val verdict: String,
    )

    fun aggregateUrl(urlResult: UrlRiskResult, source: Source = Source.MANUAL): ScamSignalResult {
        return ScamSignalResult(
            score = urlResult.score.coerceAtLeast(0),
            band = urlResult.band,
            reasons = urlResult.reasons,
            reasonCodes = urlResult.reasonCodes,
            source = source,
            verdict = verdictFromBand(urlResult.band),
        )
    }

    fun aggregateOtpPaste(
        text: String,
        otpScore: Int,
        otpReasons: List<String>,
        otpCodes: List<String>,
    ): ScamSignalResult {
        val url = UrlNormalizer.extractUrl(text)
        val urlBoost = url?.let {
            val host = UrlNormalizer.normalize(it).host
            if (host != null) {
                val urlResult = UrlRiskEvaluator.evaluate(it)
                if (urlResult.score > otpScore) urlResult else null
            } else null
        }
        if (urlBoost != null && urlBoost.score > otpScore) {
            return aggregateUrl(urlBoost, Source.MANUAL).copy(
                reasons = urlBoost.reasons + otpReasons.take(2),
                reasonCodes = urlBoost.reasonCodes + otpCodes.take(2),
            )
        }
        val score = otpScore.coerceIn(0, 100)
        val band = RiskBand.fromScore(score)
        return ScamSignalResult(
            score = score,
            band = band,
            reasons = otpReasons,
            reasonCodes = otpCodes,
            source = Source.MANUAL,
            verdict = verdictFromBand(band),
        )
    }

    fun aggregateSms(body: String, @Suppress("UNUSED_PARAMETER") sender: String?): ScamSignalResult {
        val hit = com.mrp.domain.guardian.SmsScamHeuristics.scan(body)
        val score = hit.score.coerceIn(0, 100)
        val band = RiskBand.fromScore(score)
        val reasons = hit.reasonCodes.map { code ->
            when (code) {
                "OTP_CODE" -> "Message contains an OTP-like code"
                "SCAM_PHRASE" -> "Matches known scam phrasing"
                "OTP_WITH_LINK" -> "OTP request with a link"
                "SHORT_LINK" -> "Contains a URL shortener"
                "BANKISH_LINK" -> "Bank/payment wording with a link"
                "REMOTE_APP_OTP" -> "Remote-access app mentioned with OTP"
                else -> code.replace('_', ' ').lowercase()
            }
        }
        return ScamSignalResult(
            score = score,
            band = band,
            reasons = reasons,
            reasonCodes = hit.reasonCodes,
            source = Source.SMS_AUTO,
            verdict = hit.verdict,
        )
    }

    private fun verdictFromBand(band: RiskBand): String = when (band) {
        RiskBand.CRITICAL, RiskBand.HIGH -> "scam_likely"
        RiskBand.SUSPICIOUS, RiskBand.LOW -> "caution"
        RiskBand.SAFE -> "ok"
        RiskBand.INVALID -> "empty"
    }
}
