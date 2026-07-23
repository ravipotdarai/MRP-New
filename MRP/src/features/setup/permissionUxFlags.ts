/**
 * Permission UX flags.
 *
 * AUTO_SHOW_PERMISSION_WIZARD_ON_LAUNCH — when true, opens PermissionSetupWizard
 * after PIN unlock if core permissions are incomplete (previous default).
 * Disabled for now: user grants access from Security → Monitoring (or Hub flows).
 * Re-enable later if product wants first-run prompting again.
 */
export const AUTO_SHOW_PERMISSION_WIZARD_ON_LAUNCH = false;
