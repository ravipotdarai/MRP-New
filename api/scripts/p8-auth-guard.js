/**
 * P8-3 — unauthenticated device/circle writes must be 401; health stays public.
 *
 * Usage:
 *   node scripts/p8-auth-guard.js
 *   node scripts/p8-auth-guard.js http://127.0.0.1:3000/v1
 *
 * Optional local bypass check (API started with MRP_AUTH_BYPASS=1, non-production):
 *   MRP_AUTH_BYPASS_PROBE=1 node scripts/p8-auth-guard.js
 */
const base = (process.argv[2] || process.env.MRP_API_BASE || 'http://127.0.0.1:3000/v1').replace(
  /\/$/,
  '',
);

async function hit(method, path, headers = {}, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, json };
}

function expect(name, ok, detail) {
  if (!ok) {
    console.error(`FAIL ${name}: ${detail}`);
    process.exitCode = 1;
  } else {
    console.log(`OK   ${name}`);
  }
}

async function main() {
  console.log(`P8-3 auth guard smoke → ${base}`);

  const health = await hit('GET', '/health');
  expect('GET /health → 200', health.status === 200, `status=${health.status}`);

  const noAuthDefaults = await hit('GET', '/devices/test-uid/config/defaults');
  expect(
    'GET /devices/:uid/config/defaults (no auth) → 401',
    noAuthDefaults.status === 401,
    `status=${noAuthDefaults.status}`,
  );

  const noAuthPatch = await hit('PATCH', '/devices/test-uid/config', {}, {
    syncFrequencyMinutes: 15,
  });
  expect(
    'PATCH /devices/:uid/config (no auth) → 401',
    noAuthPatch.status === 401,
    `status=${noAuthPatch.status}`,
  );

  const noAuthCircles = await hit('GET', '/circles');
  expect(
    'GET /circles (no auth) → 401',
    noAuthCircles.status === 401,
    `status=${noAuthCircles.status}`,
  );

  const badToken = await hit(
    'GET',
    '/devices/test-uid/config/defaults',
    { Authorization: 'Bearer not-a-real-jwt' },
  );
  expect(
    'GET /devices with garbage Bearer → 401 or 503',
    badToken.status === 401 || badToken.status === 503,
    `status=${badToken.status}`,
  );

  if (process.env.MRP_AUTH_BYPASS_PROBE === '1') {
    const bypass = await hit(
      'GET',
      '/devices/dev-user/config/defaults',
      { 'X-MRP-Dev-Uid': 'dev-user' },
    );
    expect(
      'bypass probe GET defaults → 200',
      bypass.status === 200,
      `status=${bypass.status} (start API with MRP_AUTH_BYPASS=1)`,
    );

    const mismatch = await hit(
      'GET',
      '/devices/other-user/config/defaults',
      { 'X-MRP-Dev-Uid': 'dev-user' },
    );
    expect(
      'bypass UID mismatch → 403',
      mismatch.status === 403,
      `status=${mismatch.status}`,
    );

    const adminStatus = await hit(
      'POST',
      '/admin/circle-live/purge-status',
      {
        'X-MRP-Dev-Uid': 'admin-user',
        'X-MRP-Dev-Email': 'ravipotdarai@gmail.com',
      },
    );
    expect(
      'admin purge-status with allowlisted email → 200/201',
      adminStatus.status === 200 || adminStatus.status === 201,
      `status=${adminStatus.status}`,
    );

    const nonAdmin = await hit(
      'POST',
      '/admin/circle-live/purge-status',
      {
        'X-MRP-Dev-Uid': 'user',
        'X-MRP-Dev-Email': 'nobody@example.com',
      },
    );
    expect(
      'non-admin purge-status → 401',
      nonAdmin.status === 401,
      `status=${nonAdmin.status}`,
    );
  }

  if (process.exitCode) {
    console.error('P8-3 smoke failed');
    process.exit(1);
  }
  console.log('P8-3 smoke passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
