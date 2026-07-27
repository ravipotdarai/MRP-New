'use client';

import {useEffect, useMemo, useState} from 'react';
import Link from 'next/link';

/**
 * P8-4 — HTTPS landing for Circle invites.
 * Opens the MRP app via custom scheme when possible; otherwise shows the code.
 */
export default function CircleJoinPage() {
  const [code, setCode] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = (params.get('code') || '').trim().toUpperCase();
    setCode(c);
    if (c.length >= 4) {
      // Try to hand off to the installed Android app
      window.location.href = `mrp://circle/join?code=${encodeURIComponent(c)}`;
    }
  }, []);

  const appLink = useMemo(
    () => (code ? `mrp://circle/join?code=${encodeURIComponent(code)}` : ''),
    [code],
  );

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
      }}>
      <div style={{maxWidth: 420, width: '100%', textAlign: 'center'}}>
        <p style={{opacity: 0.7, letterSpacing: 0.08, textTransform: 'uppercase', fontSize: 12}}>
          MRP Circle
        </p>
        <h1 style={{fontSize: 28, margin: '8px 0 16px'}}>Join invite</h1>
        {code ? (
          <>
            <p style={{fontSize: 15, opacity: 0.85}}>
              Invite code
            </p>
            <p
              style={{
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: 4,
                margin: '8px 0 24px',
                fontFamily: 'ui-monospace, monospace',
              }}>
              {code}
            </p>
            <a
              href={appLink}
              style={{
                display: 'inline-block',
                background: '#3b82f6',
                color: '#fff',
                padding: '12px 20px',
                borderRadius: 10,
                textDecoration: 'none',
                fontWeight: 600,
              }}>
              Open in MRP app
            </a>
            <p style={{marginTop: 20, fontSize: 13, opacity: 0.65}}>
              If the app does not open, install MRP and enter this code under Hub → Circle → Join.
            </p>
          </>
        ) : (
          <p style={{opacity: 0.8}}>Missing invite code in the link.</p>
        )}
        <p style={{marginTop: 32}}>
          <Link href="/login" style={{color: '#93c5fd'}}>
            MRP Web login
          </Link>
        </p>
      </div>
    </main>
  );
}
