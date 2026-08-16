package com.mrp.domain.usecase

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LocationWakePolicyTest {

    private val fresh = LocationWakePolicy.T_REUSE_MS / 2
    private val idleAge = 4 * 60 * 60 * 1000L
    private val tooOldIdle = LocationWakePolicy.T_IDLE_SNAPSHOT_MS + 1
    private val driveStale = LocationWakePolicy.T_DRIVE_STALE_MS + 1

    @Test
    fun idle_screen_lock_reuses_snapshot() {
        assertFalse(
            LocationWakePolicy.shouldWakeGps(
                idle = true,
                demandKind = LocationWakePolicy.KIND_EVENT,
                eventType = "SCREEN_LOCK",
                hasTrusted = true,
                snapshotAgeMs = idleAge,
                lockGpsCoalesceOk = true,
            )
        )
    }

    @Test
    fun active_screen_lock_wakes_when_stale() {
        assertTrue(
            LocationWakePolicy.shouldWakeGps(
                idle = false,
                demandKind = LocationWakePolicy.KIND_EVENT,
                eventType = "SCREEN_LOCK",
                hasTrusted = true,
                snapshotAgeMs = idleAge,
                lockGpsCoalesceOk = true,
            )
        )
    }

    @Test
    fun idle_drive_heartbeat_no_gps_with_snapshot() {
        assertFalse(
            LocationWakePolicy.shouldWakeGps(
                idle = true,
                demandKind = LocationWakePolicy.KIND_DRIVE,
                eventType = null,
                hasTrusted = true,
                snapshotAgeMs = idleAge,
                lockGpsCoalesceOk = true,
            )
        )
    }

    @Test
    fun active_drive_wakes_when_stale() {
        assertTrue(
            LocationWakePolicy.shouldWakeGps(
                idle = false,
                demandKind = LocationWakePolicy.KIND_DRIVE,
                eventType = null,
                hasTrusted = true,
                snapshotAgeMs = driveStale,
                lockGpsCoalesceOk = true,
            )
        )
    }

    @Test
    fun idle_geofence_wakes_when_snapshot_stale() {
        assertTrue(
            LocationWakePolicy.shouldWakeGps(
                idle = true,
                demandKind = LocationWakePolicy.KIND_GEOFENCE,
                eventType = null,
                hasTrusted = true,
                snapshotAgeMs = idleAge,
                lockGpsCoalesceOk = true,
            )
        )
    }

    @Test
    fun idle_geofence_skips_when_fresh() {
        assertFalse(
            LocationWakePolicy.shouldWakeGps(
                idle = true,
                demandKind = LocationWakePolicy.KIND_GEOFENCE,
                eventType = null,
                hasTrusted = true,
                snapshotAgeMs = fresh,
                lockGpsCoalesceOk = true,
            )
        )
    }

    @Test
    fun active_geofence_skips_when_fresh() {
        assertFalse(
            LocationWakePolicy.shouldWakeGps(
                idle = false,
                demandKind = LocationWakePolicy.KIND_GEOFENCE,
                eventType = null,
                hasTrusted = true,
                snapshotAgeMs = fresh,
                lockGpsCoalesceOk = true,
            )
        )
    }

    @Test
    fun wrong_password_always_wakes() {
        assertTrue(
            LocationWakePolicy.shouldWakeGps(
                idle = true,
                demandKind = LocationWakePolicy.KIND_EVENT,
                eventType = "WRONG_PASSWORD",
                hasTrusted = true,
                snapshotAgeMs = idleAge,
                lockGpsCoalesceOk = false,
            )
        )
    }

    @Test
    fun idle_no_snapshot_wakes_lock() {
        assertTrue(
            LocationWakePolicy.shouldWakeGps(
                idle = true,
                demandKind = LocationWakePolicy.KIND_EVENT,
                eventType = "SCREEN_LOCK",
                hasTrusted = false,
                snapshotAgeMs = Long.MAX_VALUE,
                lockGpsCoalesceOk = true,
            )
        )
    }

    @Test
    fun idle_snapshot_older_than_six_hours_wakes() {
        assertTrue(
            LocationWakePolicy.shouldWakeGps(
                idle = true,
                demandKind = LocationWakePolicy.KIND_DRIVE,
                eventType = null,
                hasTrusted = true,
                snapshotAgeMs = tooOldIdle,
                lockGpsCoalesceOk = true,
            )
        )
    }
}
