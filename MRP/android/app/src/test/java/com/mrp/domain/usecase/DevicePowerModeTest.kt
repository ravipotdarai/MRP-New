package com.mrp.domain.usecase

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DevicePowerModeTest {

    @Test
    fun idle_only_when_screen_off_and_still() {
        assertTrue(
            DevicePowerMode.evaluate(
                screenOn = false,
                activity = DevicePowerMode.ACTIVITY_STILL,
                emergency = false,
                recognitionGranted = true,
                stillDefaultElapsed = false,
            )
        )
    }

    @Test
    fun screen_on_is_active() {
        assertFalse(
            DevicePowerMode.evaluate(
                screenOn = true,
                activity = DevicePowerMode.ACTIVITY_STILL,
                emergency = false,
                recognitionGranted = true,
                stillDefaultElapsed = false,
            )
        )
    }

    @Test
    fun walking_screen_off_is_active() {
        assertFalse(
            DevicePowerMode.evaluate(
                screenOn = false,
                activity = DevicePowerMode.ACTIVITY_MOVING,
                emergency = false,
                recognitionGranted = true,
                stillDefaultElapsed = false,
            )
        )
    }

    @Test
    fun emergency_is_active() {
        assertFalse(
            DevicePowerMode.evaluate(
                screenOn = false,
                activity = DevicePowerMode.ACTIVITY_STILL,
                emergency = true,
                recognitionGranted = true,
                stillDefaultElapsed = false,
            )
        )
    }

    @Test
    fun recognition_denied_is_active() {
        assertFalse(
            DevicePowerMode.evaluate(
                screenOn = false,
                activity = DevicePowerMode.ACTIVITY_STILL,
                emergency = false,
                recognitionGranted = false,
                stillDefaultElapsed = true,
            )
        )
    }

    @Test
    fun unknown_after_still_default_is_idle_when_screen_off() {
        assertTrue(
            DevicePowerMode.evaluate(
                screenOn = false,
                activity = DevicePowerMode.ACTIVITY_UNKNOWN,
                emergency = false,
                recognitionGranted = true,
                stillDefaultElapsed = true,
            )
        )
    }

    @Test
    fun unknown_before_still_default_is_active() {
        assertFalse(
            DevicePowerMode.evaluate(
                screenOn = false,
                activity = DevicePowerMode.ACTIVITY_UNKNOWN,
                emergency = false,
                recognitionGranted = true,
                stillDefaultElapsed = false,
            )
        )
    }
}
