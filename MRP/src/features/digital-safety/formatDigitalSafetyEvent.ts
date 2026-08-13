/**
 * Claim-safe, human-readable labels for Digital Safety timeline events.
 * Avoids raw enum noise and overstatement (e.g. no "fake tower detected").
 */
const LABELS: Record<string, string> = {
  SAFE_LINK_SCANNED: 'Safe Link scanned',
  SAFE_LINK_ALLOWED: 'Safe Link — looks safe',
  SAFE_LINK_WARNED: 'Safe Link — caution',
  SAFE_LINK_BLOCKED: 'Safe Link — high risk',
  SCAM_DETECTED: 'Scam check — likely scam',
  QR_SCANNED: 'QR destination previewed',
  QR_WARNED: 'QR — caution',
  QR_BLOCKED: 'QR — high risk',
  NETWORK_GUARDIAN_ENABLED: 'Network Guardian on',
  NETWORK_GUARDIAN_DISABLED: 'Network Guardian off',
  AD_BLOCKED: 'Ad domain blocked (DNS)',
  TRACKER_BLOCKED: 'Tracker domain blocked (DNS)',
  MALICIOUS_DOMAIN_BLOCKED: 'Threat domain blocked (DNS)',
  CONTENT_DOMAIN_BLOCKED: 'Content domain blocked (DNS)',
  BREACH_EMAIL_FOUND: 'Breach watch — known exposure',
  BREACH_EMAIL_CLEAN: 'Breach watch — no known exposure',
  CELLULAR_ANOMALY: 'Cellular anomaly signal',
  EMERGENCY_CARD_UPDATED: 'Emergency Card updated',
  EMERGENCY_CARD_CLEARED: 'Emergency Card cleared',
  VAULT_ITEM_CREATED: 'Vault item saved',
  VAULT_ITEM_UPDATED: 'Vault item updated',
  VAULT_ITEM_DELETED: 'Vault item deleted',
  VAULT_BACKUP_SYNCED: 'Vault Drive backup synced',
  SAFE_LINK_FALSE_POSITIVE: 'Safe Link false-positive reported',
};

export function formatDigitalSafetyEventType(type: string | undefined): string {
  if (!type) return 'Unknown event';
  const exact = LABELS[type];
  if (exact) return exact;
  const upper = type.toUpperCase();
  for (const [key, label] of Object.entries(LABELS)) {
    if (upper.includes(key) || upper === key) return label;
  }
  if (upper.includes('SAFE_LINK')) return 'Safe Link event';
  if (upper.includes('NETWORK_GUARDIAN') || upper.includes('AD_BLOCKED') || upper.includes('TRACKER')) {
    return 'Network Guardian event';
  }
  if (upper.includes('BREACH')) return 'Breach watch event';
  if (upper.includes('VAULT_')) return 'Secure Vault event';
  if (upper.includes('CELLULAR')) return 'Cellular security event';
  if (upper.includes('EMERGENCY')) return 'Emergency Card event';
  if (upper.includes('SCAM') || upper.includes('QR_')) return 'Protect scan event';
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
