package com.mrp.domain.guardian

/**
 * Local-only SMS scam heuristics. Never persist the message body.
 * Keep aligned with MRP/src/features/security-center/otpHeuristics.ts.
 */
object SmsScamHeuristics {

    data class Result(
        val verdict: String,
        val score: Int,
        val reasonCodes: List<String>,
    )

    private val otpCode = Regex("\\b(\\d{4,8})\\b")
    private val urlInSms = Regex("https?://\\S+", RegexOption.IGNORE_CASE)
    private val shortLink = Regex("\\b(bit\\.ly|tinyurl|t\\.co|cutt\\.ly|is\\.gd|rb\\.gy)\\b", RegexOption.IGNORE_CASE)
    private val bankish = Regex("\\b(sbi|hdfc|icici|axis|kotak|paytm|phonepe|gpay|google\\s*pay|upi|bank|otp)\\b", RegexOption.IGNORE_CASE)
    private val remoteApp = Regex("whatsapp|telegram|anydesk|teamviewer", RegexOption.IGNORE_CASE)

    private val scamPhrases = listOf(
        Regex("digital\\s*arrest", RegexOption.IGNORE_CASE),
        Regex("cyber\\s*cell", RegexOption.IGNORE_CASE),
        Regex("share\\s*(your\\s*)?(otp|one[\\s-]?time)", RegexOption.IGNORE_CASE),
        Regex("send\\s*(your\\s*)?otp", RegexOption.IGNORE_CASE),
        Regex("forward\\s*(this\\s*)?otp", RegexOption.IGNORE_CASE),
        Regex("kyc\\s*(update|pending|fail)", RegexOption.IGNORE_CASE),
        Regex("account\\s*(will\\s*)?(be\\s*)?(block|suspend|frozen)", RegexOption.IGNORE_CASE),
        Regex("click\\s*(here|link)\\s*(to\\s*)?(verify|unlock|claim)", RegexOption.IGNORE_CASE),
        Regex("won\\s*(a\\s*)?(prize|lottery|iphone)", RegexOption.IGNORE_CASE),
        Regex("upi\\s*(pin|pass)", RegexOption.IGNORE_CASE),
        Regex("remote\\s*(access|anydesk|teamviewer)", RegexOption.IGNORE_CASE),
    )

    fun scan(raw: String): Result {
        val text = raw.trim()
        if (text.isBlank()) {
            return Result("empty", 0, emptyList())
        }
        var score = 0
        val codes = mutableListOf<String>()
        val hasOtp = otpCode.containsMatchIn(text)
        if (hasOtp) codes.add("OTP_CODE")

        if (scamPhrases.any { it.containsMatchIn(text) }) {
            score += 40
            codes.add("SCAM_PHRASE")
        }
        if (urlInSms.containsMatchIn(text) && hasOtp) {
            score += 25
            codes.add("OTP_WITH_LINK")
        }
        if (shortLink.containsMatchIn(text)) {
            score += 20
            codes.add("SHORT_LINK")
        }
        if (bankish.containsMatchIn(text) && urlInSms.containsMatchIn(text)) {
            score += 15
            codes.add("BANKISH_LINK")
        }
        if (remoteApp.containsMatchIn(text) && hasOtp) {
            score += 30
            codes.add("REMOTE_APP_OTP")
        }

        val verdict = when {
            score >= 40 -> "scam_likely"
            score >= 20 -> "caution"
            else -> "ok"
        }
        return Result(verdict, score, codes)
    }
}
