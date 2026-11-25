/**
 * Product feature flags (build-time).
 *
 * ONLY Circle live share is gated for store v1.
 * All other features stay on: Panic, Emergency / Find-my-device, Geofence,
 * Drive Sync, SIM Recovery, Monitoring, Timeline, Photos, App Usage, etc.
 */
export const CIRCLE_ENABLED = false;

/** When true, web/console invite landing stays reachable for QA (v2). */
export const CIRCLE_INVITE_LANDING_ENABLED = false;

/**
 * Incoming SMS auto-scan. Off until Play/policy review records RECEIVE_SMS justification.
 * When false, the toggle is hidden and native enable rejects with FLAG_OFF.
 */
export const SMS_AUTO_SCAN_ENABLED = false;

/**
 * QR Protection (CameraX + ML Kit). Low-priority feature; heavy camera/ML draw can
 * brown-out phones below ~25% battery. Off for store v1 — Safe Link / paste still work.
 */
export const QR_PROTECTION_ENABLED = false;
