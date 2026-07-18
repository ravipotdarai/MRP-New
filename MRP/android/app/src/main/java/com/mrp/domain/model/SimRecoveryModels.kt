package com.mrp.domain.model

enum class GpsFixStatus {
    FreshFix,
    WarmFix,
    LastKnown,
    Cached,
    NoFix
}

data class GpsCapture(
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val accuracy: Float = 0f,
    val altitude: Double = 0.0,
    val bearing: Float = 0f,
    val speed: Float = 0f,
    val provider: String = "",
    val satelliteCount: Int? = null,
    val timestampMs: Long = System.currentTimeMillis(),
    val fixStatus: GpsFixStatus = GpsFixStatus.NoFix
)

data class SimIdentity(
    val iccid: String = "",
    val subscriptionId: Int = -1,
    val carrier: String = "",
    val simSlot: Int = -1,
    val phoneNumber: String = "",
    val imsi: String = "",
    val enrolledAtMs: Long = System.currentTimeMillis()
) {
    fun fingerprint(): String =
        listOf(iccid, subscriptionId.toString(), carrier, simSlot.toString())
            .joinToString("|")

    fun differsFrom(other: SimIdentity?): Boolean {
        if (other == null) return false
        // Prefer ICCID when both present; else subscriptionId; else carrier+slot
        if (iccid.isNotBlank() && other.iccid.isNotBlank()) {
            return iccid != other.iccid
        }
        if (subscriptionId >= 0 && other.subscriptionId >= 0) {
            return subscriptionId != other.subscriptionId
        }
        return fingerprint() != other.fingerprint()
    }
}

data class RecoveryContact(
    val id: String,
    val name: String,
    val phoneNumber: String,
    val relationship: String = "",
    val priority: Int = 1,
    val verified: Boolean = false,
    val createdAtMs: Long = System.currentTimeMillis()
)

data class SimChangeEvidence(
    val id: String,
    val previous: SimIdentity?,
    val current: SimIdentity,
    val gps: GpsCapture,
    val batteryPercent: Int = -1,
    val charging: Boolean = false,
    val networkType: String = "",
    val internetAvailable: Boolean = false,
    val wifiEnabled: Boolean = false,
    val mobileDataEnabled: Boolean = false,
    val airplaneMode: Boolean = false,
    val gpsEnabled: Boolean = false,
    val deviceModel: String = "",
    val androidId: String = "",
    val androidVersion: String = "",
    val manufacturer: String = "",
    val brand: String = "",
    val timestampUtcMs: Long = System.currentTimeMillis(),
    val timezone: String = "",
    val locale: String = "",
    val smsSent: Boolean = false,
    val smsFailed: Boolean = false
)
