/**
 * Selfie ↔ event matching.
 *
 * Photos are saved as `<EVENT_PREFIX>_yyyyMMdd_HHmmss.jpg` (timestamp in device
 * local time, but the `timestamp` field returned to JS is file.lastModified()
 * epoch ms — timezone-independent and directly comparable to the event timestamp).
 *
 * Legacy Camera2Helper used `intruder_<stripped>_yyyyMMdd_HHmmss.jpg` — both
 * formats are accepted.
 *
 * The event_type ↔ photo prefix is 1:1 for almost every event, with one special
 * case: a WRONG_PASSWORD timeline row is logged by the device-admin receiver
 * alongside a WRONG_UNLOCK_ATTEMPT row, and the single captured selfie is named
 * WRONG_UNLOCK_ATTEMPT — so WRONG_PASSWORD must map to that prefix.
 *
 * SCREEN_LOCK / SCREEN_UNLOCK / DEVICE_SHUTDOWN / DEVICE_REBOOT / SIM_LOCKED
 * never capture a selfie, so they must never match.
 */

export interface SelfiePhoto {
  path: string;
  timestamp: number;
  name?: string;
}

export interface SelfieEvent {
  event_type: string;
  timestamp: string | number;
}

// Events that never produce a selfie — short-circuit to no match.
const NO_SELFIE_EVENTS = new Set<string>([
  'SCREEN_LOCK',
  'SCREEN_UNLOCK',
  'DEVICE_SHUTDOWN',
  'DEVICE_REBOOT',
  'SIM_LOCKED',
  'UNLOCK_FAILED',
  'SIM_CHANGE',
  'APP_MISUSE',
  'POSTURE_ALERT',
]);

// event_type → expected photo filename prefix (only the exceptions need listing;
// everything else maps to itself).
const EVENT_TO_PHOTO_PREFIX: Record<string, string> = {
  WRONG_PASSWORD: 'WRONG_UNLOCK_ATTEMPT',
};

// <prefix>_<8-digit date>_<6-digit time>.jpg — prefix may contain underscores,
// so anchor on the fixed-width timestamp suffix instead of splitting.
const PHOTO_NAME_RE = /^(?:intruder_)?(.+)_\d{8}_\d{6}\.jpg$/i;

// Selfie is captured in the same handler immediately after the event is logged,
// so the photo's lastModified is within ~1–8s of the event timestamp. 45s covers
// lock-screen wake + camera open without re-attaching a nearby unrelated selfie.
const MATCH_WINDOW_MS = 45000;

export function getExpectedPhotoPrefix(eventType: string | undefined): string | null {
  if (!eventType) return null;
  if (NO_SELFIE_EVENTS.has(eventType)) return null;
  return EVENT_TO_PHOTO_PREFIX[eventType] ?? eventType;
}

/** Normalize a photo filename prefix for comparison (uppercase, restore underscores). */
function normalizePrefix(raw: string): string {
  // Legacy intruder_wrongpassword_… stored event name with underscores stripped
  const upper = raw.toUpperCase();
  if (upper.includes('_')) return upper;
  // Re-insert underscores before known multi-word tokens when possible
  return upper;
}

function photoPrefix(name?: string): string | null {
  if (!name) return null;
  const m = name.match(PHOTO_NAME_RE);
  if (!m) return null;
  return normalizePrefix(m[1]);
}

function prefixesMatch(photoPref: string, expected: string): boolean {
  if (photoPref === expected) return true;
  // Legacy: intruder_wrongpassword matches WRONG_PASSWORD / WRONG_UNLOCK_ATTEMPT
  const compactPhoto = photoPref.replace(/_/g, '');
  const compactExpected = expected.replace(/_/g, '');
  return compactPhoto === compactExpected;
}

function toEpochMs(timestamp: string | number): number {
  if (typeof timestamp === 'number') return timestamp;
  const parsed = Date.parse(timestamp);
  return isNaN(parsed) ? Number(timestamp) || 0 : parsed;
}

/**
 * Find the selfie that belongs to a given event, or null if the event has none.
 * Matches by filename prefix (event type) AND proximity in time.
 */
export function findMatchingSelfie(
  eventType: string | undefined,
  eventTimestamp: string | number,
  photos: SelfiePhoto[],
): SelfiePhoto | null {
  const expected = getExpectedPhotoPrefix(eventType);
  if (!expected || !photos.length) return null;

  const evtTime = toEpochMs(eventTimestamp);
  let best: SelfiePhoto | null = null;
  let minDiff = MATCH_WINDOW_MS;

  for (const p of photos) {
    const pref = photoPrefix(p.name);
    if (!pref || !prefixesMatch(pref, expected)) continue;
    const diff = Math.abs(p.timestamp - evtTime);
    if (diff < minDiff) {
      minDiff = diff;
      best = p;
    }
  }
  return best;
}

/**
 * Reverse match: find the timeline event that belongs to a photo.
 */
export function findMatchingEventForPhoto<T extends SelfieEvent>(
  photo: SelfiePhoto,
  events: T[],
): T | null {
  if (!events.length) return null;

  const pref = photoPrefix(photo.name);
  if (!pref) return null;

  let best: T | null = null;
  let minDiff = MATCH_WINDOW_MS;

  for (const evt of events) {
    const expected = getExpectedPhotoPrefix(evt.event_type);
    if (!expected || !prefixesMatch(pref, expected)) continue;
    const diff = Math.abs(photo.timestamp - toEpochMs(evt.timestamp));
    if (diff < minDiff) {
      minDiff = diff;
      best = evt;
    }
  }
  return best;
}
