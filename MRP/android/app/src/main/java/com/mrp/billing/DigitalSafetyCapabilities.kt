package com.mrp.billing

/**
 * Hardcoded Digital Safety capability matrix — mirrors DigitalSafetyCapabilityMatrix.ts (plan §4.2).
 */
object DigitalSafetyCapabilities {

    enum class Cap {
        SAFE_LINK_MANUAL,
        SAFE_LINK_SHARE,
        CLIPBOARD_URL_SCAN,
        QR_PROTECTION,
        SCAM_CHECK,
        SMS_SCAM_AUTO_SCAN,
        SECURITY_ADVISOR,
        THREAT_ANALYZER,
        BREACH_EMAIL_MONITORING,
        LOST_MOBILE,
        SIM_RECOVERY,
        SECURE_VAULT,
        SECURE_VAULT_BACKUP,
        NETWORK_GUARDIAN,
        GUARDIAN_CUSTOM_RULES,
        CELLULAR_MONITOR,
        FAMILY_SHARING,
        ENTERPRISE_CONTROLS,
    }

    private enum class Level { OFF, LIMITED, FULL }

    private fun level(tier: String, cap: Cap): Level = when (tier) {
        "enterprise" -> enterpriseLevel(cap)
        "family" -> familyLevel(cap)
        "premium" -> premiumLevel(cap)
        "basic" -> basicLevel(cap)
        else -> freeLevel(cap)
    }

    fun has(tier: String, cap: Cap): Boolean {
        val l = level(tier, cap)
        return l == Level.FULL || l == Level.LIMITED
    }

    fun hasFull(tier: String, cap: Cap): Boolean = level(tier, cap) == Level.FULL

    fun timelineRetentionDays(tier: String): Int = when (tier) {
        "enterprise" -> 365
        "family" -> 180
        "premium" -> 90
        "basic" -> 30
        else -> 7
    }

    private fun freeLevel(cap: Cap): Level = when (cap) {
        Cap.SAFE_LINK_MANUAL, Cap.SAFE_LINK_SHARE, Cap.QR_PROTECTION, Cap.SCAM_CHECK, Cap.SECURITY_ADVISOR -> Level.FULL
        Cap.THREAT_ANALYZER -> Level.LIMITED
        else -> Level.OFF
    }

    private fun basicLevel(cap: Cap): Level = when (cap) {
        Cap.SAFE_LINK_MANUAL, Cap.SAFE_LINK_SHARE, Cap.CLIPBOARD_URL_SCAN, Cap.QR_PROTECTION,
        Cap.SCAM_CHECK, Cap.SECURITY_ADVISOR, Cap.THREAT_ANALYZER, Cap.BREACH_EMAIL_MONITORING,
        Cap.SIM_RECOVERY -> Level.FULL
        Cap.LOST_MOBILE, Cap.SECURE_VAULT, Cap.CELLULAR_MONITOR -> Level.LIMITED
        else -> Level.OFF
    }

    private fun premiumLevel(cap: Cap): Level = when (cap) {
        Cap.FAMILY_SHARING, Cap.ENTERPRISE_CONTROLS -> Level.OFF
        else -> Level.FULL
    }

    private fun familyLevel(cap: Cap): Level = when (cap) {
        Cap.ENTERPRISE_CONTROLS -> Level.OFF
        else -> Level.FULL
    }

    private fun enterpriseLevel(cap: Cap): Level = Level.FULL
}
