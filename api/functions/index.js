/**
 * P8-6 — purge stale circle_live/{circleId}/{uid} nodes.
 * Freshness field is `atMs` (see CircleLiveModule / CIRCLE_LIVE.md).
 */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

setGlobalOptions({ region: 'us-central1', maxInstances: 2 });

if (!admin.apps.length) {
  admin.initializeApp();
}

const TTL_MS = 15 * 60 * 1000;

/**
 * @returns {Promise<{ scanned: number, deleted: number }>}
 */
async function purgeStaleCircleLivePoints() {
  const db = admin.database();
  const snap = await db.ref('circle_live').once('value');
  const now = Date.now();
  const updates = {};
  let scanned = 0;

  snap.forEach((circleSnap) => {
    circleSnap.forEach((memberSnap) => {
      scanned += 1;
      const atMs = memberSnap.child('atMs').val();
      const shareOn = memberSnap.child('shareOn').val();
      const staleByAge =
        typeof atMs === 'number' && atMs > 0 && now - atMs > TTL_MS;
      const staleShareOff = shareOn === false;
      if (staleByAge || staleShareOff || atMs == null || atMs === 0) {
        if (staleByAge || staleShareOff) {
          updates[`circle_live/${circleSnap.key}/${memberSnap.key}`] = null;
        }
      }
    });
  });

  const deleted = Object.keys(updates).length;
  if (deleted > 0) {
    await db.ref().update(updates);
  }
  return { scanned, deleted, ttlMs: TTL_MS };
}

/** Scheduled every 10 minutes (requires Blaze + Cloud Scheduler). */
exports.purgeStaleCircleLive = onSchedule(
  {
    schedule: 'every 10 minutes',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    const result = await purgeStaleCircleLivePoints();
    console.log('purgeStaleCircleLive', result);
  },
);

/**
 * Manual / ops trigger (protect with MRP_PURGE_SECRET header).
 * POST with header x-mrp-purge-secret: <MRP_PURGE_SECRET>
 */
exports.purgeStaleCircleLiveHttp = onRequest(
  { timeoutSeconds: 120, memory: '256MiB' },
  async (req, res) => {
    if (req.method !== 'POST' && req.method !== 'GET') {
      res.status(405).send('Method not allowed');
      return;
    }
    const expected = process.env.MRP_PURGE_SECRET || '';
    const provided =
      req.get('x-mrp-purge-secret') ||
      (req.query && req.query.secret) ||
      '';
    if (!expected || provided !== expected) {
      res.status(401).json({ ok: false, reason: 'unauthorized' });
      return;
    }
    try {
      const result = await purgeStaleCircleLivePoints();
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error(e);
      res.status(500).json({
        ok: false,
        reason: e instanceof Error ? e.message : 'purge_failed',
      });
    }
  },
);

exports._purgeStaleCircleLivePoints = purgeStaleCircleLivePoints;
