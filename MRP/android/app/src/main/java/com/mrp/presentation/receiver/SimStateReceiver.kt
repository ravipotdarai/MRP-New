package com.mrp.presentation.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.mrp.data.local.SettingsStorage
import com.mrp.data.local.TimelineStorage
import com.mrp.domain.model.*
import com.mrp.domain.usecase.TimelineEventLogger

/**
 * BroadcastReceiver for SIM state changes and USB connections.
 * Logs SIM removal/insertion events with location and geofencing data.
 */
class SimStateReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent == null) return

        if (com.mrp.service.MrpMonitorService.isServiceRunning) {
            Log.d(TAG, "Service is running, letting service handle action: ${intent.action}")
            return
        }

        val settings = SettingsStorage(context).getSettings()
        if (!settings.isMonitoringEnabled) return

        when (intent.action) {
            "android.intent.action.SIM_STATE_CHANGED" -> {
                val simState = intent.getStringExtra("ss") ?: return
                handleSimStateChange(context, simState, settings.captureOnSimChange)
            }

            Intent.ACTION_BOOT_COMPLETED -> {
                Log.d(TAG, "Device boot completed")
            }

            Intent.ACTION_UMS_CONNECTED -> {
                if (settings.captureOnUsb) {
                    handleUsbConnection(context)
                }
            }
        }
    }

    private fun handleSimStateChange(context: Context, simState: String, shouldCapture: Boolean) {
        if (!shouldCapture) return

        Log.d(TAG, "SIM state changed: $simState")

        val eventType: String
        val description: String

        when (simState) {
            "ABSENT", "NOT_READY" -> {
                eventType = "SIM_REMOVED"
                description = "SIM card removed"
            }
            "READY" -> {
                eventType = "SIM_INSERTED"
                description = "SIM card inserted"
            }
            "LOCKED" -> {
                eventType = "SIM_LOCKED"
                description = "SIM card locked"
            }
            "IMSI" -> {
                eventType = "SIM_INSERTED"
                description = "SIM card ready"
            }
            else -> return
        }

        val eventLogger = TimelineEventLogger(context)
        eventLogger.logEventSync(
            eventType = eventType,
            status = if (eventType == "SIM_INSERTED") StatusValues.ENABLED else StatusValues.DISABLED,
            metadata = mapOf(
                "sim_state" to simState,
                "description" to description,
                "source" to "SimStateReceiver"
            )
        )

        try {
            com.mrp.domain.usecase.SimChangeRecoveryAlertUseCase(context).onSimStateChanged(
                simState = simState,
                isInsertion = eventType == "SIM_INSERTED"
            )
        } catch (e: Exception) {
            Log.e(TAG, "SIM recovery alert failed", e)
        }
    }

    private fun handleUsbConnection(context: Context) {
        Log.d(TAG, "USB mass storage connected")

        val eventLogger = TimelineEventLogger(context)
        eventLogger.logEventSync(
            eventType = "USB_CONNECTED",
            status = StatusValues.ENABLED,
            metadata = mapOf(
                "description" to "USB mass storage connected",
                "source" to "SimStateReceiver"
            )
        )
    }

    companion object {
        private const val TAG = "SimStateReceiver"
    }
}