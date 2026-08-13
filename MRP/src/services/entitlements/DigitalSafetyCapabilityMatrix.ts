/**
 * Hardcoded Digital Safety capability matrix — mirrors plan §4.2 / §4.3.
 * Source of truth for JS gating; Kotlin mirrors in DigitalSafetyCapabilities.kt.
 */
import type {SubscriptionTier} from './EntitlementTypes';

export type DigitalSafetyCapability =
  | 'safeLinkManual'
  | 'safeLinkShare'
  | 'clipboardUrlScan'
  | 'qrProtection'
  | 'scamCheck'
  | 'smsScamAutoScan'
  | 'securityAdvisor'
  | 'threatAnalyzer'
  | 'breachEmailMonitoring'
  | 'lostMobile'
  | 'simRecovery'
  | 'secureVault'
  | 'secureVaultBackup'
  | 'networkGuardian'
  | 'guardianCustomRules'
  | 'cellularMonitor'
  | 'familySharing'
  | 'enterpriseControls';

type TierMatrix = Record<DigitalSafetyCapability, boolean | 'limited'>;

/** Plan §4.2 — hardcoded tier defaults. */
const MATRIX: Record<SubscriptionTier, TierMatrix> = {
  free: {
    safeLinkManual: true,
    safeLinkShare: true,
    clipboardUrlScan: false,
    qrProtection: true,
    scamCheck: true,
    smsScamAutoScan: false,
    securityAdvisor: true,
    threatAnalyzer: 'limited',
    breachEmailMonitoring: false,
    lostMobile: false,
    simRecovery: false,
    secureVault: false,
    secureVaultBackup: false,
    networkGuardian: false,
    guardianCustomRules: false,
    cellularMonitor: false,
    familySharing: false,
    enterpriseControls: false,
  },
  basic: {
    safeLinkManual: true,
    safeLinkShare: true,
    clipboardUrlScan: true,
    qrProtection: true,
    scamCheck: true,
    smsScamAutoScan: false,
    securityAdvisor: true,
    threatAnalyzer: true,
    breachEmailMonitoring: true,
    lostMobile: 'limited',
    simRecovery: true,
    secureVault: 'limited',
    secureVaultBackup: false,
    networkGuardian: false,
    guardianCustomRules: false,
    cellularMonitor: 'limited',
    familySharing: false,
    enterpriseControls: false,
  },
  premium: {
    safeLinkManual: true,
    safeLinkShare: true,
    clipboardUrlScan: true,
    qrProtection: true,
    scamCheck: true,
    smsScamAutoScan: true,
    securityAdvisor: true,
    threatAnalyzer: true,
    breachEmailMonitoring: true,
    lostMobile: true,
    simRecovery: true,
    secureVault: true,
    secureVaultBackup: true,
    networkGuardian: true,
    guardianCustomRules: true,
    cellularMonitor: true,
    familySharing: false,
    enterpriseControls: false,
  },
  family: {
    safeLinkManual: true,
    safeLinkShare: true,
    clipboardUrlScan: true,
    qrProtection: true,
    scamCheck: true,
    smsScamAutoScan: true,
    securityAdvisor: true,
    threatAnalyzer: true,
    breachEmailMonitoring: true,
    lostMobile: true,
    simRecovery: true,
    secureVault: true,
    secureVaultBackup: true,
    networkGuardian: true,
    guardianCustomRules: true,
    cellularMonitor: true,
    familySharing: true,
    enterpriseControls: false,
  },
  enterprise: {
    safeLinkManual: true,
    safeLinkShare: true,
    clipboardUrlScan: true,
    qrProtection: true,
    scamCheck: true,
    smsScamAutoScan: true,
    securityAdvisor: true,
    threatAnalyzer: true,
    breachEmailMonitoring: true,
    lostMobile: true,
    simRecovery: true,
    secureVault: true,
    secureVaultBackup: true,
    networkGuardian: true,
    guardianCustomRules: true,
    cellularMonitor: true,
    familySharing: true,
    enterpriseControls: true,
  },
};

/** Timeline retention days per tier — plan §4.2. */
export const TIMELINE_RETENTION_DAYS: Record<SubscriptionTier, number> = {
  free: 7,
  basic: 30,
  premium: 90,
  family: 180,
  enterprise: 365,
};

export function capabilityLevel(
  tier: SubscriptionTier,
  cap: DigitalSafetyCapability,
): boolean | 'limited' {
  return MATRIX[tier][cap];
}

export function hasCapability(tier: SubscriptionTier, cap: DigitalSafetyCapability): boolean {
  const level = capabilityLevel(tier, cap);
  return level === true || level === 'limited';
}

export function hasFullCapability(tier: SubscriptionTier, cap: DigitalSafetyCapability): boolean {
  return capabilityLevel(tier, cap) === true;
}

/** Maps legacy FeatureKey → capability for DS gates. */
export function capabilityForFeature(feature: string): DigitalSafetyCapability | null {
  switch (feature) {
    case 'digitalsafe.secure_vault':
      return 'secureVault';
    case 'digitalsafe.network_guardian':
      return 'networkGuardian';
    case 'digitalsafe.cellular_monitor':
      return 'cellularMonitor';
    case 'digitalsafe.sms_auto':
      return 'smsScamAutoScan';
    case 'digitalsafe.clipboard_scan':
      return 'clipboardUrlScan';
    case 'digitalsafe.breach_monitor':
      return 'breachEmailMonitoring';
    case 'digitalsafe.secure_vault_backup':
      return 'secureVaultBackup';
    case 'digitalsafe.sim_recovery':
      return 'simRecovery';
    case 'digitalsafe.lost_mobile':
      return 'lostMobile';
    default:
      return null;
  }
}

/** Minimum plan label for hub lock badges (claim-safe, short). */
export function minPlanLabelForCapability(cap: DigitalSafetyCapability): string | null {
  if (hasCapability('free', cap)) return null;
  if (hasCapability('basic', cap)) return 'Basic+';
  if (hasCapability('premium', cap)) return 'Premium+';
  if (hasCapability('family', cap)) return 'Family+';
  return 'Enterprise';
}
