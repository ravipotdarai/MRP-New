package com.mrp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.mrp.domain.guardian.AgentDebugLog
import com.mrp.domain.guardian.GuardianStatsStore

/**
 * Debug-build only. Trigger:
 * adb shell am broadcast -a com.mrp.DEBUG_GUARDIAN --es cmd enable|disable|status
 */
class DebugGuardianReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val cmd = intent?.getStringExtra("cmd") ?: "enable"
        AgentDebugLog.init(context.filesDir)
        AgentDebugLog.log(
            "E",
            "DebugGuardianReceiver.onReceive",
            "debug guardian command",
            mapOf("cmd" to cmd),
        )
        when (cmd) {
            "disable" -> NetworkGuardianVpnService.stop(context)
            "status" -> {
                val state = NetworkGuardianVpnService.state(context)
                AgentDebugLog.log(
                    "E",
                    "DebugGuardianReceiver.status",
                    "guardian state snapshot",
                    mapOf(
                        "enabled" to state["enabled"],
                        "dnsBlockingReady" to state["dnsBlockingReady"],
                        "dnsQueries" to state["dnsQueries"],
                        "dnsForwarded" to state["dnsForwarded"],
                        "blockedAds" to state["blockedAds"],
                        "lastError" to state["lastError"],
                        "privateDnsActive" to state["privateDnsActive"],
                        "otherVpnActive" to state["otherVpnActive"],
                        "mode" to state["mode"],
                    ),
                )
                Log.i("MRP_DEBUG_A8950B", "status=$state")
            }
            else -> {
                GuardianStatsStore(context).reset()
                NetworkGuardianVpnService.setEnabled(context, true)
                NetworkGuardianVpnService.start(context)
            }
        }
    }
}
