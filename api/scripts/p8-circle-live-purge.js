/**
 * P8-6 — run Nest circle_live purge (Admin JWT or local bypass).
 *
 * Requires API running. Prefer:
 *   MRP_AUTH_BYPASS=1 + admin email allowlist
 *
 * Usage:
 *   MRP_AUTH_BYPASS_PROBE=1 node scripts/p8-circle-live-purge.js
 *   node scripts/p8-circle-live-purge.js http://127.0.0.1:3000/v1 <BearerToken>
 */
const base = (
  process.argv[2] ||
  process.env.MRP_API_BASE ||
  'http://127.0.0.1:3000/v1'
).replace(/\/$/, '');
const bearer = process.argv[3] || process.env.MRP_ID_TOKEN || '';

async function main() {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.MRP_AUTH_BYPASS_PROBE === '1') {
    headers['X-MRP-Dev-Uid'] = process.env.MRP_JWT_TEST_UID || 'p8_admin';
    headers['X-MRP-Dev-Email'] =
      process.env.MRP_ADMIN_EMAILS?.split(',')[0]?.trim() ||
      'ravipotdarai@gmail.com';
  } else if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  } else {
    console.error(
      'Pass Bearer token or set MRP_AUTH_BYPASS_PROBE=1 with API MRP_AUTH_BYPASS=1',
    );
    process.exit(1);
  }

  const res = await fetch(`${base}/admin/circle-live/purge`, {
    method: 'POST',
    headers,
  });
  const body = await res.json().catch(() => null);
  console.log(res.status, body);
  if (!res.ok || !body?.ok) process.exit(1);
  console.log('P8-6 Nest purge OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
