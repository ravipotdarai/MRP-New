import { Controller, HttpCode, Post, ServiceUnavailableException } from '@nestjs/common';
import { AdminOnly } from '../auth/auth.decorators';
import { getAdminDb, isAdminSdkConfigured } from '../firebase/admin';

const TTL_MS = 15 * 60 * 1000;
const PURGE_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * P8-6 ops fallback — same purge logic as Cloud Function (uses atMs).
 * Requires allowlisted admin JWT (AdminOnly) + FIREBASE_SERVICE_ACCOUNT_JSON
 * or GOOGLE_APPLICATION_CREDENTIALS.
 */
@Controller('admin/circle-live')
export class CircleLiveAdminController {
  @AdminOnly()
  @Post('purge')
  @HttpCode(200)
  async purge() {
    if (!isAdminSdkConfigured()) {
      throw new ServiceUnavailableException(
        'Firebase Admin credentials required (FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS)',
      );
    }
    const db = getAdminDb();
    if (!db) {
      throw new ServiceUnavailableException('RTDB Admin unavailable');
    }

    try {
      const snap = await withTimeout(
        db.ref('circle_live').once('value'),
        PURGE_TIMEOUT_MS,
        'circle_live read',
      );
      const now = Date.now();
      const updates: Record<string, null> = {};
      let scanned = 0;
      snap.forEach((circleSnap) => {
        circleSnap.forEach((memberSnap) => {
          scanned += 1;
          const atMs = memberSnap.child('atMs').val();
          const shareOn = memberSnap.child('shareOn').val();
          const staleByAge =
            typeof atMs === 'number' && atMs > 0 && now - atMs > TTL_MS;
          const staleShareOff = shareOn === false;
          if (staleByAge || staleShareOff) {
            updates[`circle_live/${circleSnap.key}/${memberSnap.key}`] = null;
          }
        });
      });
      const deleted = Object.keys(updates).length;
      if (deleted > 0) {
        await withTimeout(
          db.ref().update(updates),
          PURGE_TIMEOUT_MS,
          'circle_live update',
        );
      }
      return { ok: true, scanned, deleted, ttlMs: TTL_MS };
    } catch (e) {
      throw new ServiceUnavailableException(
        e instanceof Error ? e.message : 'purge_failed',
      );
    }
  }

  @Post('purge-status')
  @AdminOnly()
  @HttpCode(200)
  status() {
    return {
      ok: true,
      firebaseAdmin: isAdminSdkConfigured(),
      ttlMs: TTL_MS,
      note: 'Scheduled CF needs Blaze. Nest purge needs Admin credentials.',
    };
  }
}
