package com.mrp.domain.usecase

/**
 * Pure GPS-wake rules (no Android types) so unit tests can cover idle vs active.
 */
object LocationWakePolicy {

    const val T_REUSE_MS = 3 * 60_000L
    const val LOCK_GPS_COALESCE_MS = 75_000L
    const val T_DRIVE_STALE_MS = 18 * 60_000L
    /** Idle may reuse a trusted snapshot up to this wall age. */
    const val T_IDLE_SNAPSHOT_MS = 6 * 60 * 60 * 1000L

    const val KIND_HOME_REFRESH = "HomeRefresh"
    const val KIND_HOME_PEEK = "HomePeek"
    const val KIND_EMERGENCY = "EmergencyTick"
    const val KIND_DRIVE = "DriveHeartbeat"
    const val KIND_GEOFENCE = "GeofenceOs"
    const val KIND_EVENT = "Event"

    fun isLockUnlock(eventType: String): Boolean {
        val t = eventType.uppercase()
        return t == "SCREEN_LOCK" || t == "SCREEN_UNLOCK"
    }

    fun isHighSeverity(eventType: String): Boolean {
        return when (eventType.uppercase()) {
            "WRONG_PASSWORD", "WRONG_BIOMETRIC", "WRONG_UNLOCK_ATTEMPT", "UNLOCK_FAILED",
            "USB_CONNECTED", "USB_DISCONNECTED", "FACTORY_RESET",
            "SIM_REMOVED", "SIM_INSERTED", "SIM_CHANGE" -> true
            else -> false
        }
    }

    fun shouldWakeGps(
        idle: Boolean,
        demandKind: String,
        eventType: String?,
        hasTrusted: Boolean,
        snapshotAgeMs: Long,
        lockGpsCoalesceOk: Boolean,
    ): Boolean {
        val trustedFresh = hasTrusted && snapshotAgeMs <= T_REUSE_MS
        val idleReusable = hasTrusted && snapshotAgeMs <= T_IDLE_SNAPSHOT_MS

        return when (demandKind) {
            KIND_HOME_REFRESH -> true
            KIND_HOME_PEEK -> false
            KIND_EMERGENCY -> true
            KIND_DRIVE -> {
                if (idle && idleReusable) false
                else !hasTrusted || snapshotAgeMs > T_DRIVE_STALE_MS
            }
            KIND_GEOFENCE -> {
                if (idle && idleReusable) false
                else !trustedFresh
            }
            KIND_EVENT -> {
                val t = (eventType ?: "").uppercase()
                when {
                    isHighSeverity(t) -> true
                    t == "SCREEN_LOCK" && idle && idleReusable -> false
                    isLockUnlock(t) -> {
                        if (trustedFresh) false else lockGpsCoalesceOk
                    }
                    idle && idleReusable -> false
                    else -> !trustedFresh
                }
            }
            else -> !trustedFresh
        }
    }
}
