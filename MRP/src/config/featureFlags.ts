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
