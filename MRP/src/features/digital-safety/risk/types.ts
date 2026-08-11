/** Digital Safety risk bands — mirrors Kotlin RiskBand. */
export type RiskBand =
  | 'SAFE'
  | 'LOW_RISK'
  | 'SUSPICIOUS'
  | 'HIGH_RISK'
  | 'CRITICAL'
  | 'INVALID';

export type UrlRiskEvaluation = {
  input: string;
  normalized: string | null;
  score: number;
  band: RiskBand;
  reasons: string[];
  reasonCodes: string[];
  domainHash?: string;
  host?: string;
  eventType: string;
};

export const DIGITAL_SAFETY_EVENT_TYPES = {
  SAFE_LINK_SCANNED: 'SAFE_LINK_SCANNED',
  SAFE_LINK_ALLOWED: 'SAFE_LINK_ALLOWED',
  SAFE_LINK_WARNED: 'SAFE_LINK_WARNED',
  SAFE_LINK_BLOCKED: 'SAFE_LINK_BLOCKED',
  SCAM_DETECTED: 'SCAM_DETECTED',
  QR_SCANNED: 'QR_SCANNED',
  QR_BLOCKED: 'QR_BLOCKED',
  EMERGENCY_CARD_UPDATED: 'EMERGENCY_CARD_UPDATED',
  VAULT_ITEM_CREATED: 'VAULT_ITEM_CREATED',
  VAULT_ITEM_VIEWED: 'VAULT_ITEM_VIEWED',
  VAULT_ITEM_UPDATED: 'VAULT_ITEM_UPDATED',
  VAULT_ITEM_DELETED: 'VAULT_ITEM_DELETED',
} as const;

export function bandFromScore(score: number): RiskBand {
  if (score < 0) return 'INVALID';
  if (score <= 19) return 'SAFE';
  if (score <= 39) return 'LOW_RISK';
  if (score <= 59) return 'SUSPICIOUS';
  if (score <= 79) return 'HIGH_RISK';
  return 'CRITICAL';
}

export function safeLinkEventType(score: number, invalid = false): string {
  if (invalid) return DIGITAL_SAFETY_EVENT_TYPES.SAFE_LINK_SCANNED;
  if (score >= 80) return DIGITAL_SAFETY_EVENT_TYPES.SAFE_LINK_BLOCKED;
  if (score >= 40) return DIGITAL_SAFETY_EVENT_TYPES.SAFE_LINK_WARNED;
  if (score >= 20) return DIGITAL_SAFETY_EVENT_TYPES.SAFE_LINK_SCANNED;
  return DIGITAL_SAFETY_EVENT_TYPES.SAFE_LINK_ALLOWED;
}
