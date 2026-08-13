package com.mrp.domain.guardian

/**
 * Build-time Digital Safety flags. Keep in sync with MRP/src/config/featureFlags.ts.
 * SMS auto-scan stays off until policy review records Play-safe RECEIVE_SMS justification.
 */
object DigitalSafetyFlags {
    const val SMS_AUTO_SCAN_ENABLED = false
}
