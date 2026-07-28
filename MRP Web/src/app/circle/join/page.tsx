'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

/**
 * Circle invite landing — disabled while CIRCLE_ENABLED is false (v1).
 * Re-enable when product ships Circle in v2.
 */
const CIRCLE_INVITE_LANDING_ENABLED = false;

export default function CircleJoinPage() {
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!CIRCLE_INVITE_LANDING_ENABLED) return;
    const params = new URLSearchParams(window.location.search);
    const c = (params.get('code') || '').trim().toUpperCase();
    setCode(c);
    if (c.length >= 4) {
      window.location.href = `mrp://circle/join?code=${encodeURIComponent(c)}`;
    }
  }, []);

  const appLink = useMemo(
    () => (code ? `mrp://circle/join?code=${encodeURIComponent(code)}` : ''),
    [code],
  );

  if (!CIRCLE_INVITE_LANDING_ENABLED) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: 'var(--font-body), system-ui, sans-serif',
          background: 'var(--bg)',
          color: 'var(--text)',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28 }}>Circle coming later</h1>
          <p className="muted" style={{ marginTop: 12 }}>
            Multi-device Circle live share is not part of the current release. Your security vault
            still stays on your device and private Drive.
          </p>
          <p style={{ marginTop: 24 }}>
            <Link href="/login" style={{ color: 'var(--signal)' }}>
              Open MRP Web
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        background: '#0b1220',
        color: '#e8eefc',
      }}
    >
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <p style={{ opacity: 0.7, letterSpacing: 0.08, textTransform: 'uppercase', fontSize: 12 }}>
          MRP Circle
        </p>
        <h1 style={{ fontSize: 28, margin: '8px 0 16px' }}>Join invite</h1>
        {code ? (
          <>
            <p style={{ fontSize: 32, fontWeight: 700, letterSpacing: 4 }}>{code}</p>
            <a href={appLink}>Open in MRP app</a>
          </>
        ) : (
          <p>Missing invite code.</p>
        )}
      </div>
    </main>
  );
}
