/**
 * P8-3 — live Firebase ID token round-trip against Nest JWT guard.
 *
 * Uses Admin SDK custom token → Identity Toolkit exchange → Bearer call.
 * Loads MRP/.env (PUBLIC_FIREBASE_API_KEY) + Admin credentials.
 *
 * Usage (API must be running):
 *   node scripts/p8-jwt-live.js
 *   node scripts/p8-jwt-live.js http://127.0.0.1:3000/v1
 */
const { resolve } = require('path');
const { config: loadEnv } = require('dotenv');

loadEnv({ path: resolve(__dirname, '../../MRP/.env') });
loadEnv({ path: resolve(__dirname, '../.env') });

const base = (
  process.argv[2] ||
  process.env.MRP_API_BASE ||
  'http://127.0.0.1:3000/v1'
).replace(/\/$/, '');

const TEST_UID = process.env.MRP_JWT_TEST_UID || 'p8_jwt_test_uid';

function expect(name, ok, detail) {
  if (!ok) {
    console.error(`FAIL ${name}: ${detail}`);
    process.exitCode = 1;
  } else {
    console.log(`OK   ${name}`);
  }
}

async function getAdmin() {
  // Reuse Nest firebase admin helper via require after path setup
  const admin = require('firebase-admin');
  if (admin.apps.length) return admin.app();

  const databaseURL =
    process.env.FIREBASE_DATABASE_URL ||
    process.env.PUBLIC_FIREBASE_DATABASE_URL ||
    'https://mobileresilienceplatform-default-rtdb.firebaseio.com';

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(json)),
      databaseURL,
    });
    return admin.app();
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      databaseURL,
    });
    return admin.app();
  }
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      databaseURL,
      projectId:
        process.env.PUBLIC_FIREBASE_PROJECT_ID || 'mobileresilienceplatform',
    });
    return admin.app();
  } catch (e) {
    throw new Error(
      `Firebase Admin unavailable: ${e.message}. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.`,
    );
  }
}

async function idTokenFromCustom(app, apiKey, uid) {
  const admin = require('firebase-admin');
  const customToken = await admin.auth(app).createCustomToken(uid);
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const body = await res.json();
  if (!res.ok || !body.idToken) {
    throw new Error(
      `Custom token exchange failed: ${res.status} ${JSON.stringify(body)}`,
    );
  }
  return body.idToken;
}

async function hit(method, path, headers = {}) {
  const res = await fetch(`${base}${path}`, { method, headers });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, json };
}

async function main() {
  console.log(`P8-3 live JWT → ${base}`);
  const apiKey = process.env.PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    console.error('FAIL missing PUBLIC_FIREBASE_API_KEY in MRP/.env');
    process.exit(1);
  }

  const app = await getAdmin();
  const idToken = await idTokenFromCustom(app, apiKey, TEST_UID);
  expect('minted live ID token', !!idToken && idToken.length > 20, 'empty');

  const health = await hit('GET', '/health');
  expect('GET /health → 200', health.status === 200, `status=${health.status}`);

  const authed = await hit('GET', `/devices/${TEST_UID}/config/defaults`, {
    Authorization: `Bearer ${idToken}`,
  });
  expect(
    'GET /devices/:uid/config/defaults with live JWT → 200',
    authed.status === 200,
    `status=${authed.status} body=${JSON.stringify(authed.json)}`,
  );

  const mismatch = await hit('GET', '/devices/other-uid/config/defaults', {
    Authorization: `Bearer ${idToken}`,
  });
  expect(
    'UID mismatch with live JWT → 403',
    mismatch.status === 403,
    `status=${mismatch.status}`,
  );

  const garbage = await hit('GET', `/devices/${TEST_UID}/config/defaults`, {
    Authorization: 'Bearer not-a-jwt',
  });
  expect(
    'garbage Bearer → 401',
    garbage.status === 401,
    `status=${garbage.status}`,
  );

  if (process.exitCode) {
    console.error('P8-3 live JWT failed');
    process.exit(1);
  }
  console.log('P8-3 live JWT passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
