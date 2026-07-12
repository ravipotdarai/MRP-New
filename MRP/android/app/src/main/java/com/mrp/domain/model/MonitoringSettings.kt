package com.mrp.domain.model

import java.util.Date

data class MonitoringSettings(
    val isMonitoringEnabled: Boolean = false,
    val captureOnWrongUnlock: Boolean = true,
    val captureOnAirplaneMode: Boolean = true,
    val captureOnWifiToggle: Boolean = true,
    val captureOnMobileData: Boolean = true,
    val captureOnHotspot: Boolean = true,
    val captureOnBluetooth: Boolean = true,
    val captureOnSimChange: Boolean = true,
    val captureOnFactoryReset: Boolean = true,
    val captureOnUsb: Boolean = false,
    val maxFailedAttempts: Int = 3,
    val lockAfterFailedAttempts: Boolean = true,
    val autoDeleteAfterDays: Int = 30
)