/**
 * Smoke test: geocoding endpoints (requires Nest on :3000, MRP_AUTH_BYPASS=1).
 * Usage: MRP_AUTH_BYPASS=1 node scripts/p9-geocoding-smoke.js
 */
const BASE = process.env.MRP_API_BASE || 'http://localhost:3000/v1';
const UID = process.env.MRP_DEV_UID || 'smoke-test-uid';

async function main() {
  const headers = {
    'Content-Type': 'application/json',
    'X-MRP-Dev-Uid': UID,
  };

  const rev = await fetch(`${BASE}/geocoding/reverse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ lat: 18.5204, lng: 73.8567 }),
  });
  console.log('reverse', rev.status, await rev.text());

  const near = await fetch(`${BASE}/geocoding/nearby`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ lat: 18.5204, lng: 73.8567, radiusM: 500 }),
  });
  console.log('nearby', near.status, (await near.text()).slice(0, 500));

  if (!rev.ok || !near.ok) process.exit(1);
  console.log('OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
