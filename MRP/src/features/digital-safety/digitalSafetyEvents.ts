import mrpmModule from '../../shared/hooks/useNativeBridge';
import {bandFromScore, safeLinkEventType, type RiskBand} from './risk/types';

export async function logDigitalSafetyEvent(
  eventType: string,
  status = 'completed',
  metadata: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  try {
    await (mrpmModule as any).logDigitalSafetyEvent?.(eventType, status, metadata);
  } catch (e) {
    console.warn('[DigitalSafety] log event failed', e);
  }
}

export async function evaluateUrlRiskNative(raw: string): Promise<{
  input: string;
  normalized: string | null;
  score: number;
  band: RiskBand;
  reasons: string[];
  reasonCodes: string[];
  domainHash?: string;
  host?: string;
  eventType: string;
} | null> {
  try {
    const r = await (mrpmModule as any).evaluateUrlRisk?.(raw);
    if (!r) return null;
    return {
      input: r.input ?? raw,
      normalized: r.normalized ?? null,
      score: typeof r.score === 'number' ? r.score : 0,
      band: (r.band as RiskBand) ?? bandFromScore(r.score ?? 0),
      reasons: Array.isArray(r.reasons) ? r.reasons : [],
      reasonCodes: Array.isArray(r.reasonCodes) ? r.reasonCodes : [],
      domainHash: r.domainHash,
      host: r.host,
      eventType: r.eventType ?? safeLinkEventType(r.score ?? 0),
    };
  } catch {
    return null;
  }
}

export async function logUrlScanEvent(
  score: number,
  band: RiskBand,
  reasonCodes: string[],
  domainHash?: string,
  host?: string,
  invalid = false,
  source = 'safe_link',
): Promise<void> {
  const eventType = safeLinkEventType(score, invalid);
  await logDigitalSafetyEvent(eventType, 'completed', {
    score,
    band,
    reason_codes: reasonCodes.join(','),
    ...(domainHash ? {domain_hash: domainHash} : {}),
    ...(host ? {host: host.slice(0, 64)} : {}),
    source,
  });
}

export async function logOtpScanEvent(
  verdict: string,
  score: number,
  reasonCodes: string[],
): Promise<void> {
  const eventType =
    verdict === 'scam_likely' || score >= 60
      ? 'SCAM_DETECTED'
      : score >= 40
        ? 'SAFE_LINK_WARNED'
        : 'SAFE_LINK_SCANNED';
  await logDigitalSafetyEvent(eventType, 'completed', {
    score,
    band: bandFromScore(score),
    verdict,
    reason_codes: reasonCodes.join(','),
    source: 'otp_paste',
  });
}
