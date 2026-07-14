package com.mrp.domain.usecase

import android.content.Context
import android.util.Log
import com.mrp.data.local.SettingsStorage
import com.mrp.domain.model.EventMetadata
import com.mrp.domain.model.EventType
import com.mrp.domain.model.MonitoringEvent
import com.mrp.domain.model.Severity
import java.util.Date
import java.util.UUID

class TakeSelfieOnEventUseCase(private val context: Context) {

    fun execute(type: EventType, metadata: EventMetadata = EventMetadata()): MonitoringEvent {
        val event = MonitoringEvent(
            id = UUID.randomUUID().toString(),
            type = type,
            severity = getSeverityFor(type),
            timestamp = Date(),
            metadata = metadata
        )

        Log.d(TAG, "Event captured: ${event.type}, severity: ${event.severity}")

        // Check settings before proceeding - only create entry if event type is enabled
        val settings = SettingsStorage(context).getSettings()
        if (settings.isMonitoringEnabled && isEventCaptureEnabled(type, settings)) {
            Log.d(TAG, "Triggering selfie capture for event type: ${type.name}")
            com.mrp.service.MrpMonitorService.requestPhoto(context, type.name)
        } else {
            Log.d(TAG, "Event capture disabled for event type: ${type.name}")
        }

        return event
    }

    private fun isEventCaptureEnabled(type: EventType, settings: com.mrp.domain.model.MonitoringSettings): Boolean {
        return when (type) {
            EventType.WRONG_PASSWORD, EventType.WRONG_BIOMETRIC -> settings.captureOnWrongUnlock
            EventType.AIRPLANE_MODE -> settings.captureOnAirplaneMode
            EventType.WIFI_TOGGLE -> settings.captureOnWifiToggle
            EventType.MOBILE_DATA_TOGGLE -> settings.captureOnMobileData
            EventType.HOTSPOT_TOGGLE -> settings.captureOnHotspot
            EventType.SIM_REMOVED, EventType.SIM_INSERTED -> settings.captureOnSimChange
            EventType.FACTORY_RESET -> settings.captureOnFactoryReset
            EventType.USB_CONNECTED -> settings.captureOnUsb
            else -> true
        }
    }

    private fun getSeverityFor(type: EventType): Severity {
        return when (type) {
            EventType.WRONG_PASSWORD, EventType.WRONG_BIOMETRIC -> Severity.HIGH
            EventType.SIM_REMOVED, EventType.FACTORY_RESET -> Severity.CRITICAL
            EventType.AIRPLANE_MODE, EventType.WIFI_TOGGLE,
            EventType.MOBILE_DATA_TOGGLE, EventType.HOTSPOT_TOGGLE -> Severity.MEDIUM
            EventType.SIM_INSERTED -> Severity.LOW
            else -> Severity.MEDIUM
        }
    }

    companion object {
        private const val TAG = "TakeSelfieOnEventUseCase"
    }
}