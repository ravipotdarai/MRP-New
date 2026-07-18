/**
 * Pure-logic tests for SIM identity compare + SMS template + phone masking.
 * Android-side classes are mirrored here for Jest (no JVM).
 */

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return '*'.repeat(8) + digits.slice(-4);
}

function differsFrom(
  a: {iccid: string; subscriptionId: number; carrier: string; simSlot: number},
  b: {iccid: string; subscriptionId: number; carrier: string; simSlot: number} | null,
): boolean {
  if (!b) return false;
  if (a.iccid && b.iccid) return a.iccid !== b.iccid;
  if (a.subscriptionId >= 0 && b.subscriptionId >= 0) {
    return a.subscriptionId !== b.subscriptionId;
  }
  return (
    `${a.iccid}|${a.subscriptionId}|${a.carrier}|${a.simSlot}` !==
    `${b.iccid}|${b.subscriptionId}|${b.carrier}|${b.simSlot}`
  );
}

function buildSms(opts: {
  hasPhone: boolean;
  phone?: string;
  carrier: string;
  model: string;
  battery: number;
  lat: number;
  lng: number;
  deviceId: string;
  iccidMasked: string;
  timestamp: string;
}): string {
  const numberLine =
    opts.hasPhone && opts.phone
      ? opts.phone
      : 'Unavailable — update device number in MRP settings';
  return [
    '⚠ Mobile Resilience Platform',
    'SIM Change Detected',
    'Device:',
    opts.model,
    'New Number:',
    numberLine,
    'Carrier:',
    opts.carrier,
    'Battery:',
    `${opts.battery}%`,
    'Time:',
    opts.timestamp,
    'Latitude:',
    String(opts.lat),
    'Longitude:',
    String(opts.lng),
    'Google Maps',
    `https://maps.google.com/?q=${opts.lat},${opts.lng}`,
    'Device ID',
    opts.deviceId,
    'ICCID:',
    opts.iccidMasked,
  ].join('\n');
}

describe('SIM recovery logic', () => {
  it('masks phone numbers', () => {
    expect(maskPhone('+919876543210')).toBe('********3210');
    expect(maskPhone('123')).toBe('****');
  });

  it('detects ICCID change', () => {
    const baseline = {iccid: 'AAA', subscriptionId: 1, carrier: 'Airtel', simSlot: 0};
    const current = {iccid: 'BBB', subscriptionId: 1, carrier: 'Airtel', simSlot: 0};
    expect(differsFrom(current, baseline)).toBe(true);
    expect(differsFrom(baseline, baseline)).toBe(false);
  });

  it('falls back to subscriptionId when ICCID blank', () => {
    const baseline = {iccid: '', subscriptionId: 1, carrier: 'Airtel', simSlot: 0};
    const current = {iccid: '', subscriptionId: 2, carrier: 'Airtel', simSlot: 0};
    expect(differsFrom(current, baseline)).toBe(true);
  });

  it('builds full SMS template', () => {
    const msg = buildSms({
      hasPhone: true,
      phone: '+919999999999',
      carrier: 'Jio',
      model: 'Pixel 7',
      battery: 80,
      lat: 12.97,
      lng: 77.59,
      deviceId: 'abc',
      iccidMasked: '********1234',
      timestamp: '2026-07-18 12:00:00',
    });
    expect(msg).toContain('SIM Change Detected');
    expect(msg).toContain('New Number:');
    expect(msg).toContain('+919999999999');
    expect(msg).toContain('Jio');
    expect(msg).toContain('https://maps.google.com/?q=12.97,77.59');
  });

  it('always includes New Number line even when phone missing', () => {
    const msg = buildSms({
      hasPhone: false,
      carrier: 'Vi',
      model: 'X',
      battery: 10,
      lat: 1,
      lng: 2,
      deviceId: 'd',
      iccidMasked: '********9999',
      timestamp: 't',
    });
    expect(msg).toContain('New Number:');
    expect(msg).toContain('⚠ Mobile Resilience Platform');
  });
});
