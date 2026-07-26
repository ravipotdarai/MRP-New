#!/usr/bin/env node
/**
 * P7-10 — simple concurrent hit of Nest /v1/health (local or MRP_API_BASE).
 * Usage: node scripts/p7-load-health.js [concurrency=100] [url]
 */
const concurrency = Number(process.argv[2] || 100);
const base = (process.argv[3] || process.env.MRP_API_BASE || 'http://127.0.0.1:3000/v1').replace(
  /\/$/,
  '',
);
const url = `${base}/health`;

async function one() {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {cache: 'no-store'});
    const ok = res.ok;
    return {ok, ms: Date.now() - t0, status: res.status};
  } catch (e) {
    return {ok: false, ms: Date.now() - t0, error: String(e)};
  }
}

(async () => {
  const jobs = Array.from({length: concurrency}, () => one());
  const results = await Promise.all(jobs);
  const ok = results.filter(r => r.ok).length;
  const avg = results.reduce((s, r) => s + r.ms, 0) / results.length;
  console.log(
    JSON.stringify(
      {
        url,
        concurrency,
        ok,
        fail: concurrency - ok,
        avgMs: Math.round(avg),
        pass: ok === concurrency,
      },
      null,
      2,
    ),
  );
  process.exit(ok === concurrency ? 0 : 1);
})();
