package com.mrp.util

import java.util.concurrent.atomic.AtomicBoolean

/**
 * Prevents overlapping QR (back) and selfie (front) camera sessions.
 */
object CameraSessionGate {
    private val qrHolding = AtomicBoolean(false)

    fun markQrActive(active: Boolean) {
        qrHolding.set(active)
    }

    fun isQrHoldingCamera(): Boolean = qrHolding.get()
}
