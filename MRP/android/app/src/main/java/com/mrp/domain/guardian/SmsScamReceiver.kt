package com.mrp.domain.guardian

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import com.mrp.billing.DigitalSafetyCapabilities.Cap
import com.mrp.billing.EntitlementCache
import com.mrp.data.local.DigitalSafetyAutomationStore
import com.mrp.domain.model.EventTypes
import com.mrp.domain.usecase.TimelineEventLogger

/**
 * Incoming SMS scan. No-ops unless the build flag, user opt-in, and a paid tier are all set.
 * Logs verdict metadata only — never stores SMS body or sender.
 */
class SmsScamReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (!DigitalSafetyFlags.SMS_AUTO_SCAN_ENABLED) return
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val app = context.applicationContext
        val store = DigitalSafetyAutomationStore(app)
        if (!store.smsAutoScanEnabled()) return
        if (!EntitlementCache(app).hasCapability(Cap.SMS_SCAM_AUTO_SCAN)) return

        val body = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            ?.joinToString(" ") { it.displayMessageBody.orEmpty() }
            ?.take(2000)
            .orEmpty()
        if (body.isBlank()) return

        val result = SmsScamHeuristics.scan(body)
        if (result.verdict != "scam_likely" && result.verdict != "caution") return

        TimelineEventLogger(app).logEvent(
            EventTypes.SCAM_DETECTED,
            result.verdict,
            mapOf(
                "source" to "sms_auto",
                "score" to result.score,
                "reason_codes" to result.reasonCodes.joinToString(","),
            ),
        )
        Log.i(TAG, "SMS auto-scan ${result.verdict} score=${result.score}")
    }

    companion object {
        private const val TAG = "SmsScamReceiver"
    }
}
