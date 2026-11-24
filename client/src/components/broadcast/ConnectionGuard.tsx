import React, { useEffect, useState } from 'react';

export type GuardProps = {
  debug?: boolean;
  live?: boolean;
  connected?: boolean;
  revision?: number;
  matchId?: string | null;
  status?: string | null;
  court?: string | null;
  scene?: string | null;
  scorebugVisible?: boolean | null;
  lastError?: string | null;
  lastSnapshotAt?: number;
};

function shortId(id?: string | null) {
  if (!id) return '-';
  return id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

/**
 * Never renders on air unless `?debug=1`.
 * Rendered outside the 1920x1080 design canvas in a screen corner (tiny) so it
 * does not interfere with on-air composition.
 */
export const ConnectionGuard: React.FC<GuardProps> = ({
  debug, live, connected, revision, matchId, status, court, scene, scorebugVisible, lastError, lastSnapshotAt,
}) => {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!debug) return;
    const t = window.setInterval(() => tick(x => x + 1), 1000);
    return () => window.clearInterval(t);
  }, [debug]);

  if (!debug) return null; // never show on-air when not debug
  const ok = connected && live;
  const state = ok ? 'LIVE' : connected ? 'STALE' : 'OFFLINE';
  const age = lastSnapshotAt ? Math.max(0, Math.round((Date.now() - lastSnapshotAt) / 1000)) : null;
  const w = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const h = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const rows = [
    `${state}${revision != null ? ` r${revision}` : ''}`,
    `match ${shortId(matchId)}${status ? ` · ${status}` : ''}`,
    `court ${court || '-'} · scene ${scene || '-'}`,
    `scorebug ${scorebugVisible == null ? '-' : scorebugVisible ? 'ON' : 'OFF'}${age != null ? ` · snap ${age}s` : ''}`,
  ];
  if (w !== 1920 || h !== 1080) rows.push(`Browser source should be 1920x1080 (current ${w}x${h})`);
  if (lastError) rows.push(`ERROR ${lastError}`);
  return (
    <div
      data-overlay-debug
      style={{
        position: 'fixed', right: 6, bottom: 6, zIndex: 10000, pointerEvents: 'none',
        display: 'flex', alignItems: 'flex-start', gap: 5, padding: '3px 5px', borderRadius: 4,
        background: 'rgba(0,0,0,0.5)', color: lastError ? '#fca5a5' : ok ? '#86efac' : '#fcd34d',
        fontSize: 9, lineHeight: 1.2, fontFamily: 'Inter, sans-serif',
        whiteSpace: 'pre', maxWidth: 320,
      }}
    >
      <span style={{ marginTop: 2, width: 5, height: 5, borderRadius: 999, flexShrink: 0, background: ok ? '#22c55e' : connected ? '#f59e0b' : '#ef4444' }} />
      <span>{rows.join('\n')}</span>
    </div>
  );
};

export default ConnectionGuard;
