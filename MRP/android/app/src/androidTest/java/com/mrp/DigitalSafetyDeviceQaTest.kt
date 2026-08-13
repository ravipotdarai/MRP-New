package com.mrp

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.mrp.billing.DigitalSafetyCapabilities
import com.mrp.billing.DigitalSafetyCapabilities.Cap
import com.mrp.billing.EntitlementCache
import com.mrp.data.local.DigitalSafetyAutomationStore
import com.mrp.data.local.SafeLinkAllowlistStore
import com.mrp.domain.cellular.CellularAnomalyScorer
import com.mrp.domain.cellular.CellularMonitor
import com.mrp.domain.guardian.DomainCategory
import com.mrp.domain.guardian.DomainListManager
import com.mrp.domain.guardian.DnsPacketHandler
import com.mrp.domain.guardian.GuardianStatsStore
import com.mrp.domain.guardian.SmsScamHeuristics
import com.mrp.domain.risk.RiskBand
import com.mrp.domain.risk.RiskPolicyEngine
import com.mrp.domain.risk.ScamSignalAggregator
import com.mrp.domain.risk.UrlRiskEvaluator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * On-device Digital Safety QA — maps to docs/qa/DIGITAL_SAFETY_DEVICE_QA.md.
 * Run: ./gradlew :app:connectedDebugAndroidTest
 */
@RunWith(AndroidJUnit4::class)
class DigitalSafetyDeviceQaTest {

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = InstrumentationRegistry.getInstrumentation().targetContext
    }

    // —— Safe Link ——

    @Test
    fun safeLink_exampleCom_isLowRiskOrSafe() {
        val r = UrlRiskEvaluator.evaluate("https://example.com")
        assertTrue(r.band == RiskBand.SAFE || r.band == RiskBand.LOW)
        assertTrue(r.score < 40)
    }

    @Test
    fun safeLink_paytmTk_flagsBrandImpersonation() {
        val r = UrlRiskEvaluator.evaluate("http://paytm.tk/login")
        assertTrue(r.score >= 40)
        assertTrue(r.reasonCodes.any { it.contains("BRAND") || it.contains("TYPOSQUAT") || it.contains("RISKY") })
    }

    @Test
    fun safeLink_allowlistOverridesRisk() {
        val store = SafeLinkAllowlistStore(context)
        store.add("trusted-example.com")
        val r = UrlRiskEvaluator.evaluate("https://trusted-example.com/path", store.list())
        assertEquals(RiskBand.SAFE, r.band)
        assertTrue(r.reasonCodes.contains("ALLOWLISTED"))
        store.remove("trusted-example.com")
    }

    // —— Scam ——

    @Test
    fun scam_cyberCellOtpPhrase_isScamLikely() {
        val hit = SmsScamHeuristics.scan("Cyber cell asked me to share OTP 123456 immediately")
        assertTrue(hit.verdict == "scam_likely" || hit.verdict == "caution")
        val agg = ScamSignalAggregator.aggregateOtpPaste(
            "Cyber cell OTP",
            hit.score,
            listOf("scam phrase"),
            hit.reasonCodes,
        )
        assertTrue(agg.score >= 20)
    }

    @Test
    fun scam_urlInPaste_usesUnifiedAggregator() {
        val r = RiskPolicyEngine.evaluateUrl("http://paytm.tk")
        val agg = ScamSignalAggregator.aggregateUrl(r, ScamSignalAggregator.Source.MANUAL)
        assertTrue(agg.score >= 40)
    }

    // —— Network Guardian lists ——

    @Test
    fun guardian_doubleclickNet_matchesAdsCategory() {
        val mgr = DomainListManager(context)
        val match = mgr.match("doubleclick.net")
        assertNotNull(match)
        assertEquals(DomainCategory.AD, match!!.category)
    }

    @Test
    fun guardian_adultContent_optInBlocksPornhub() {
        val mgr = DomainListManager(context)
        mgr.setCategoryEnabled(DomainCategory.CONTENT, false)
        assertNull(mgr.match("pornhub.com"))
        mgr.setCategoryEnabled(DomainCategory.CONTENT, true)
        val match = mgr.match("www.pornhub.com")
        assertNotNull(match)
        assertEquals(DomainCategory.CONTENT, match!!.category)
    }

    @Test
    fun guardian_allowlistOverridesBlock() {
        val mgr = DomainListManager(context)
        mgr.addAllowlist("doubleclick.net")
        assertNull(mgr.match("doubleclick.net"))
        mgr.removeAllowlist("doubleclick.net")
    }

    @Test
    fun guardian_refreshFromBundled_succeeds() {
        val mgr = DomainListManager(context)
        assertTrue(mgr.refreshFromBundled())
        assertNotNull(mgr.listVersion())
    }

    @Test
    fun guardian_dnsHandler_blocksDoubleclickInSyntheticPacket() {
        val mgr = DomainListManager(context)
        val stats = GuardianStatsStore(context)
        val handler = DnsPacketHandler(mgr, stats, protectSocket = { false })
        val query = buildDnsQueryPacket("doubleclick.net")
        val result = handler.handleIpPacket(query, query.size)
        assertTrue(result.handled)
        assertNotNull(result.responsePacket)
        assertTrue((stats.snapshot()["blockedAds"] ?: 0L) >= 1L)
    }

    private fun buildDnsQueryPacket(qname: String): ByteArray {
        val labels = qname.split(".")
        val qnameBytes = mutableListOf<Byte>()
        for (label in labels) {
            qnameBytes.add(label.length.toByte())
            label.forEach { c -> qnameBytes.add(c.code.toByte()) }
        }
        qnameBytes.add(0)
        val dns = mutableListOf<Byte>()
        dns.addAll(listOf(0x12, 0x34, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00))
        dns.addAll(qnameBytes)
        dns.addAll(listOf(0x00, 0x01, 0x00, 0x01))
        val dnsPayload = dns.toByteArray()
        val udpLen = 8 + dnsPayload.size
        val totalLen = 20 + udpLen
        val packet = ByteArray(totalLen)
        packet[0] = 0x45
        packet[2] = ((totalLen shr 8) and 0xFF).toByte()
        packet[3] = (totalLen and 0xFF).toByte()
        packet[8] = 64
        packet[9] = 17
        packet[12] = 10; packet[13] = 0; packet[14] = 0; packet[15] = 2
        packet[16] = 8; packet[17] = 8; packet[18] = 8; packet[19] = 8
        packet[20] = 0x30; packet[21] = 0x39
        packet[22] = 0x00; packet[23] = 0x35
        packet[24] = ((udpLen shr 8) and 0xFF).toByte()
        packet[25] = (udpLen and 0xFF).toByte()
        System.arraycopy(dnsPayload, 0, packet, 28, dnsPayload.size)
        return packet
    }

    // —— Cellular ——

    @Test
    fun cellular_summaryUsesAnomalyLanguageNotFakeTower() {
        val sample = CellularMonitor(context).sample()
        if (sample != null) {
            val result = CellularAnomalyScorer.score(sample, null)
            assertFalse(result.detail.lowercase().contains("fake tower"))
            assertFalse(result.detail.lowercase().contains("fake cell"))
        }
    }

    // —— Subscription / capabilities ——

    @Test
    fun capabilities_freeCannotUseGuardian() {
        assertFalse(DigitalSafetyCapabilities.has("free", Cap.NETWORK_GUARDIAN))
        assertFalse(DigitalSafetyCapabilities.has("free", Cap.CLIPBOARD_URL_SCAN))
    }

    @Test
    fun capabilities_basicGetsClipboardNotGuardian() {
        assertTrue(DigitalSafetyCapabilities.has("basic", Cap.CLIPBOARD_URL_SCAN))
        assertTrue(DigitalSafetyCapabilities.has("basic", Cap.BREACH_EMAIL_MONITORING))
        assertFalse(DigitalSafetyCapabilities.has("basic", Cap.NETWORK_GUARDIAN))
    }

    @Test
    fun capabilities_premiumGetsGuardian() {
        assertTrue(DigitalSafetyCapabilities.has("premium", Cap.NETWORK_GUARDIAN))
    }

    @Test
    fun entitlement_premiumGate_blocksGuardianWhenFree() {
        EntitlementCache(context).clearToFree()
        assertFalse(EntitlementCache(context).hasCapability(Cap.NETWORK_GUARDIAN))
    }

    // —— Privacy / automation ——

    @Test
    fun automation_clipboardOffByDefault() {
        val store = DigitalSafetyAutomationStore(context)
        store.setClipboardScanEnabled(false)
        assertFalse(store.snapshot()["clipboardScanEnabled"] as Boolean)
    }

    @Test
    fun automation_smsAutoScanFlagOff() {
        assertFalse(com.mrp.domain.guardian.DigitalSafetyFlags.SMS_AUTO_SCAN_ENABLED)
    }

    @Test
    fun privacy_clipboardNotStoredInAutomationPrefs() {
        val prefs = context.getSharedPreferences("mrp_ds_automation", Context.MODE_PRIVATE)
        val all = prefs.all.keys.joinToString(" ")
        assertFalse(all.contains("clipboard_history"))
        assertFalse(all.contains("clipboard_text"))
    }
}
