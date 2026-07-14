package com.mrp.domain.model

data class AppUsageSession(
    val id: Long = 0,
    val userId: String? = null,
    val deviceId: String? = null,
    val packageName: String,
    val appName: String? = null,
    val category: String? = null,
    val startTime: Long,
    val endTime: Long,
    val durationSeconds: Long,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val batteryLevel: Int? = null,
    val networkType: String? = null,
    val createdAt: Long = System.currentTimeMillis()
)
