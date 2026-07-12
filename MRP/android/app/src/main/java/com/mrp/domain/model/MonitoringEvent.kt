package com.mrp.domain.model

import java.util.Date

data class MonitoringEvent(
    val id: String,
    val type: EventType,
    val severity: Severity,
    val timestamp: Date,
    val intruderId: String? = null,
    val photoPath: String? = null,
    val metadata: EventMetadata = EventMetadata()
)

enum class EventType {
    WRONG_PASSWORD,
    WRONG_BIOMETRIC,
    AIRPLANE_MODE,
    WIFI_TOGGLE,
    MOBILE_DATA_TOGGLE,
    HOTSPOT_TOGGLE,
    SIM_REMOVED,
    SIM_INSERTED,
    FACTORY_RESET,
    DEVICE_BOOT,
    USB_CONNECTED,
    DEVELOPER_OPTIONS_CHANGED,
    UNKNOWN_APP_INSTALLED,
    LOCK_SCREEN_DISABLED
}

enum class Severity {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL
}

data class EventMetadata(
    val attempts: Int = 0,
    val wifiEnabled: Boolean? = null,
    val mobileDataEnabled: Boolean? = null,
    val hotspotEnabled: Boolean? = null,
    val simState: String? = null,
    val packageName: String? = null,
    val description: String? = null
)