import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TeamLogo } from '../../components/broadcast/TeamLogo.js';

type AnyMatch = any;
type AnyScene = any;

const EASE = [0.22, 1, 0.36, 1] as const;
const SAFE = { x: 96, y: 54 }; // title-safe margins on 1920x1080

function asText(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}
function num(v: any, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

function useCountUp(value: number, duration = 700) {
  const [v, setV] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const to = Number.isFinite(value) ? value : 0;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = clamp((t - start) / duration, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      const cur = from + (to - from) * e;
      setV(p >= 1 ? to : Math.round(cur));
      if (p < 1) raf = requestAnimationFrame(tick); else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return v;
}

function useCountdown(endsAt?: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);
  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return null;
  const ms = Math.max(0, end - now);
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return { ms, total, label: `${m}:${String(s).padStart(2, '0')}` };
}

const Fade: React.FC<{ delay?: number; y?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ delay = 0, y = 18, children, style }) => (
  <motion.div initial={{ opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay }} style={style}>{children}</motion.div>
);

const HeaderBand: React.FC<{ match: AnyMatch; title: string; subtitle?: string | null; right?: React.ReactNode }> = ({ match, title, subtitle, right }) => {
  const tname = asText(match?.tournament);
  return (
    <Fade delay={0}>
      <div style={{ height: 118, display: 'flex', alignItems: 'stretch', background: 'linear-gradient(90deg, rgba(10,14,22,0.98), rgba(18,24,38,0.96))', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ width: 10, background: 'linear-gradient(180deg,var(--team-a),var(--team-b))' }} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 28px', gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 10, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800, color: '#fff', border: '1px solid rgba(255,255,255,0.08)' }}>QT</div>
          <div style={{ minWidth: 0 }}>
            {tname ? <div style={{ fontSize: 24, color: 'var(--broadcast-muted)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>{tname}</div> : null}
            <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{title}</div>
            {subtitle ? <div style={{ fontSize: 28, color: '#d6deea', marginTop: 2 }}>{subtitle}</div> : null}
          </div>
        </div>
        {right ? <div style={{ display: 'flex', alignItems: 'center', paddingRight: 28 }}>{right}</div> : null}
      </div>
    </Fade>
  );
};

const TeamBlock: React.FC<{ match: AnyMatch; side: 'A'|'B'; align?: 'left'|'right'; big?: boolean }> = ({ match, side, align = 'left', big = false }) => {
  const t = match?.teams?.[side] || {};
  const color = side === 'A' ? 'var(--team-a)' : 'var(--team-b)';
  const tcolor = side === 'A' ? 'var(--team-a-text)' : 'var(--team-b-text)';
  const name = asText(t.name) || asText(t.shortName) || side;
  const short = asText(t.shortName) || name;
  const right = align === 'right';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, justifyContent: right ? 'flex-end' : 'flex-start', flexDirection: right ? 'row-reverse' : 'row' }}>
      {asText(t.logoUrl) || asText(name) ? <TeamLogo src={asText(t.logoUrl)} name={name} shortName={short} color={color} textColor={tcolor} size={big ? 120 : 88} /> : null}
      <div style={{ textAlign: right ? 'right' : 'left', minWidth: 0 }}>
        <div style={{ fontSize: big ? 68 : 54, fontWeight: 800, lineHeight: 0.95, letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 560 }}>{name}</div>
        {asText(t.shortName) && asText(t.shortName) !== name ? <div style={{ fontSize: 30, color: 'var(--broadcast-muted)', letterSpacing: '0.12em' }}>{t.shortName}</div> : null}
      </div>
    </div>
  );
};

const StatCompareRow: React.FC<{ label: string; a: number; b: number; pct?: boolean; delay?: number }> = ({ label, a, b, pct = false, delay = 0 }) => {
  const va = useCountUp(a); const vb = useCountUp(b);
  const total = Math.max(1, a + b);
  const pa = (a / total) * 100; const pb = (b / total) * 100;
  const fmt = (v: number, raw: number) => pct ? `${raw.toFixed ? raw.toFixed(0) : v}%` : String(v);
  return (
    <Fade delay={delay}>
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 140px', alignItems: 'center', gap: 18, padding: '10px 0' }}>
        <div style={{ fontSize: 58, fontWeight: 800, textAlign: 'right', color: 'var(--team-a)' }} className="tabular-score">{pct ? `${a.toFixed(0)}%` : va}</div>
        <div>
          <div style={{ textAlign: 'center', fontSize: 30, color: 'var(--broadcast-muted)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
          <div style={{ height: 18, background: 'rgba(255,255,255,0.08)', display: 'flex', overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${pa}%` }} transition={{ duration: 0.7, ease: EASE, delay: delay + 0.1 }} style={{ height: '100%', background: 'var(--team-a)' }} />
            <motion.div initial={{ width: 0 }} animate={{ width: `${pb}%` }} transition={{ duration: 0.7, ease: EASE, delay: delay + 0.1 }} style={{ height: '100%', background: 'var(--team-b)' }} />
          </div>
        </div>
        <div style={{ fontSize: 58, fontWeight: 800, textAlign: 'left', color: 'var(--team-b)' }} className="tabular-score">{pct ? `${b.toFixed(0)}%` : vb}</div>
      </div>
    </Fade>
  );
};

function computeStats(match: AnyMatch) {
  const A = match?.teams?.A?.stats || {}; const B = match?.teams?.B?.stats || {};
  const atkPct = (s: any) => {
    const k = num(s.kill), e = num(s.error);
    const den = k + e;
    return den > 0 ? Math.round((k / den) * 100) : null;
  };
  const sideOut = (s: any) => {
    if (s.sideout_attempts != null && s.sideout_wins != null) {
      const a = num(s.sideout_attempts), w = num(s.sideout_wins);
      return a > 0 ? Math.round((w / a) * 100) : (s.side_out != null ? num(s.side_out) : null);
    }
    return s.side_out != null ? num(s.side_out) : null;
  };
  return {
    killsA: num(A.kill), killsB: num(B.kill),
    atkA: atkPct(A), atkB: atkPct(B),
    acesA: num(A.ace), acesB: num(B.ace),
    blocksA: num(A.block), blocksB: num(B.block),
    digsA: num(A.dig), digsB: num(B.dig),
    errA: num(A.error), errB: num(B.error),
    soA: sideOut(A), soB: sideOut(B),
    ptsA: num(match?.teams?.A?.score), ptsB: num(match?.teams?.B?.score),
  };
}

function playedSets(match: AnyMatch) {
  const hist = Array.isArray(match?.setHistory) ? match.setHistory : null;
  if (hist && hist.length) return hist.filter((s: any) => s && (s.scoreA > 0 || s.scoreB > 0 || s.winner != null || s.number < (match.current_set || 99)));
  const a = match?.set_scores?.A || []; const b = match?.set_scores?.B || [];
  return a.map((sa: number, i: number) => ({ number: i + 1, scoreA: sa, scoreB: b[i] || 0, winner: sa > b[i] ? 'A' : b[i] > sa ? 'B' : null })).filter((s: any) => s.scoreA > 0 || s.scoreB > 0);
}

function getPlayers(team: any): any[] {
  const list = [...(Array.isArray(team?.lineup) ? team.lineup : []), ...(Array.isArray(team?.bench) ? team.bench : [])];
  const seen = new Set<string>();
  return list.filter((p) => p && (p.name || p.jerseyNumber != null || p.id)).filter((p) => { const k = String(p.id || p.jerseyNumber || p.name); if (seen.has(k)) return false; seen.add(k); return true; });
}

function deriveTopPerformer(match: AnyMatch) {
  const candidates: any[] = [];
  (['A','B'] as const).forEach((side) => {
    const team = match?.teams?.[side];
    getPlayers(team).forEach((p) => {
      const st = p.stats || p.matchStats || {};
      const kills = num(st.kill ?? st.kills); const aces = num(st.ace ?? st.aces); const blocks = num(st.block ?? st.blocks); const digs = num(st.dig ?? st.digs); const pts = kills + aces + blocks;
      if (pts > 0 || digs > 0) candidates.push({ side, name: asText(p.name), jersey: p.jerseyNumber, pts, kills, aces, blocks, digs, team: asText(team?.shortName) || asText(team?.name) });
    });
  });
  candidates.sort((x,y)=> (y.pts - x.pts) || (y.kills - x.kills));
  return candidates[0] && candidates[0].name ? candidates[0] : null;
}

function getTimeoutCaller(match: AnyMatch, scene: AnyScene) {
  // try last event
  const le = match?.lastEvent; const payload = le?.payload || {}; const t = String(le?.action || payload?.type || '').toUpperCase();
  if (t.includes('TIMEOUT')) {
    const side = (le?.team || (payload.teamSide === 'HOME' ? 'A' : payload.teamSide === 'AWAY' ? 'B' : null));
    if (side === 'A' || side === 'B') return side as 'A'|'B';
  }
  // fallback from payload
  const ps = scene?.payload?.team || scene?.payload?.side;
  if (ps === 'A' || ps === 'B') return ps;
  return null;
}

const SceneShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: 'absolute', inset: 0, color: '#fff', fontFamily: '"Barlow Condensed", Inter, sans-serif' }}>
    <div style={{ position: 'absolute', left: SAFE.x, top: SAFE.y, right: SAFE.x, bottom: SAFE.y, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(8,12,20,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {children}
    </div>
  </div>
);

export const SetBreakScene: React.FC<{ match: AnyMatch; scene?: AnyScene }> = ({ match }) => {
  const sets = playedSets(match);
  const last = sets[sets.length - 1];
  const stats = computeStats(match);
  const top = deriveTopPerformer(match);
  const aSets = num(match?.teams?.A?.sets), bSets = num(match?.teams?.B?.sets);
  return (
    <SceneShell>
      <HeaderBand match={match} title="Set Break" subtitle={last ? `Set ${last.number} Result` : 'Between Sets'} right={<div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '0.08em' }}><span style={{ color: 'var(--team-a)' }}>{aSets}</span> <span style={{ color: '#7b879b' }}>-</span> <span style={{ color: 'var(--team-b)' }}>{bSets}</span></div>} />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 28, padding: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Fade delay={0.05}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: 22, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 16 }}>
              <TeamBlock match={match} side="A" big />
              <div style={{ textAlign: 'center', padding: '10px 22px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: 24, color: 'var(--broadcast-muted)', letterSpacing: '0.18em' }}>{last ? `SET ${last.number}` : 'SETS'}</div>
                <div style={{ fontSize: 110, fontWeight: 800, lineHeight: 1 }} className="tabular-score">{last ? <>{last.scoreA} <span style={{ color: '#6b778c' }}>-</span> {last.scoreB}</> : <>{aSets}-{bSets}</>}</div>
              </div>
              <TeamBlock match={match} side="B" align="right" big />
            </div>
          </Fade>
          {sets.length ? (
            <Fade delay={0.12}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: 18 }}>
                <div style={{ fontSize: 28, color: 'var(--broadcast-muted)', letterSpacing: '0.16em', marginBottom: 10 }}>SET-BY-SET</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {sets.slice(0,5).map((s: any, i: number) => (
                    <div key={s.number} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px', alignItems: 'center', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 46, fontWeight: 800, textAlign: 'right', color: 'var(--team-a)' }} className="tabular-score">{s.scoreA}</div>
                      <div style={{ textAlign: 'center', fontSize: 26, color: '#9fb0c8', letterSpacing: '0.12em' }}>SET {s.number}{s.winner ? ` · ${s.winner}` : ''}</div>
                      <div style={{ fontSize: 46, fontWeight: 800, textAlign: 'left', color: 'var(--team-b)' }} className="tabular-score">{s.scoreB}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Fade>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Fade delay={0.16}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: 18 }}>
              <div style={{ fontSize: 28, color: 'var(--broadcast-muted)', letterSpacing: '0.16em', marginBottom: 8 }}>MATCH STATS</div>
              <div style={{ display: 'grid', gap: 6 }}>
                <StatCompareRow label="Kills" a={stats.killsA} b={stats.killsB} delay={0.18} />
                <StatCompareRow label="Aces" a={stats.acesA} b={stats.acesB} delay={0.22} />
                <StatCompareRow label="Blocks" a={stats.blocksA} b={stats.blocksB} delay={0.26} />
                <StatCompareRow label="Errors" a={stats.errA} b={stats.errB} delay={0.3} />
              </div>
            </div>
          </Fade>
          {top ? (
            <Fade delay={0.34}>
              <div style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))', border: '1px solid rgba(255,255,255,0.08)', padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 8, alignSelf: 'stretch', background: top.side === 'A' ? 'var(--team-a)' : 'var(--team-b)' }} />
                <div>
                  <div style={{ fontSize: 26, color: 'var(--broadcast-muted)', letterSpacing: '0.16em' }}>TOP PERFORMER</div>
                  <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1.05 }}>{top.jersey != null ? `#${top.jersey} ` : ''}{top.name} {top.team ? <span style={{ color: '#9fb0c8', fontSize: 34 }}>· {top.team}</span> : null}</div>
                  <div style={{ fontSize: 30, color: '#d6deea', marginTop: 4 }}>{top.pts} PTS · {top.kills} K · {top.aces} A · {top.blocks} B</div>
                </div>
              </div>
            </Fade>
          ) : null}
        </div>
      </div>
    </SceneShell>
  );
};

export const TimeoutScene: React.FC<{ match: AnyMatch; scene?: AnyScene }> = ({ match, scene }) => {
  const cd = useCountdown(scene?.timerEndsAt);
  const caller = getTimeoutCaller(match, scene);
  const cTeam = caller ? match?.teams?.[caller] : null;
  const key = caller ? (caller === 'A' ? 'side_out' : 'side_out') : null; // show a key stat: side-out% or errors depending; choose meaningful
  const stats = computeStats(match);
  const sideOutCaller = caller ? (caller === 'A' ? stats.soA : stats.soB) : null;
  const errCaller = caller ? (caller === 'A' ? stats.errA : stats.errB) : null;
  return (
    <SceneShell>
      <HeaderBand match={match} title="Timeout" subtitle={cTeam ? `Called by ${asText(cTeam.shortName) || asText(cTeam.name)}` : null} right={cd ? <div style={{ background: '#fff', color: '#0b101a', padding: '10px 18px', fontSize: 48, fontWeight: 800 }} className="tabular-score">{cd.label}</div> : null} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <Fade delay={0.06} style={{ width: '100%', maxWidth: 1320 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px 1fr', alignItems: 'stretch', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ padding: 22, borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center' }}>
              <TeamBlock match={match} side="A" big />
            </div>
            <div style={{ padding: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)' }}>
              <div style={{ fontSize: 30, color: 'var(--broadcast-muted)', letterSpacing: '0.2em' }}>SCORE</div>
              <div style={{ fontSize: 110, fontWeight: 800, lineHeight: 1 }} className="tabular-score"><span style={{ color: 'var(--team-a)' }}>{match?.teams?.A?.score ?? 0}</span> <span style={{ color: '#6b778c' }}>-</span> <span style={{ color: 'var(--team-b)' }}>{match?.teams?.B?.score ?? 0}</span></div>
              <div style={{ fontSize: 34, color: '#d6deea', marginTop: 4 }}>SET {match?.current_set ?? '-'} · SETS {match?.teams?.A?.sets ?? 0}-{match?.teams?.B?.sets ?? 0}</div>
              {cTeam ? <div style={{ marginTop: 12, padding: '8px 14px', background: caller === 'A' ? 'var(--team-a)' : 'var(--team-b)', color: caller === 'A' ? 'var(--team-a-text)' : 'var(--team-b-text)', fontSize: 30, fontWeight: 800, letterSpacing: '0.08em' }}>TIMEOUT · {asText(cTeam.shortName) || asText(cTeam.name)}</div> : null}
              {(sideOutCaller != null || errCaller != null) ? <div style={{ marginTop: 10, fontSize: 30, color: '#d6deea' }}>{sideOutCaller != null ? `Side-out ${sideOutCaller}%` : `Errors ${errCaller}`}</div> : null}
            </div>
            <div style={{ padding: 22, borderLeft: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <TeamBlock match={match} side="B" align="right" big />
            </div>
          </div>
        </Fade>
      </div>
    </SceneShell>
  );
};

export const MatchStatsScene: React.FC<{ match: AnyMatch }> = ({ match }) => {
  const s = computeStats(match);
  const rows: Array<{ label: string; a: number | null; b: number | null; pct?: boolean }> = [
    { label: 'Points', a: s.ptsA, b: s.ptsB },
    { label: 'Kills', a: s.killsA, b: s.killsB },
    { label: 'Attack %', a: s.atkA, b: s.atkB, pct: true },
    { label: 'Aces', a: s.acesA, b: s.acesB },
    { label: 'Blocks', a: s.blocksA, b: s.blocksB },
    { label: 'Digs', a: s.digsA, b: s.digsB },
    { label: 'Errors', a: s.errA, b: s.errB },
    { label: 'Side-out %', a: s.soA, b: s.soB, pct: true },
  ].filter(r => r.a != null && r.b != null) as any;
  return (
    <SceneShell>
      <HeaderBand match={match} title="Match Statistics" subtitle={`Set ${match?.current_set ?? '-'} · Sets ${match?.teams?.A?.sets ?? 0}-${match?.teams?.B?.sets ?? 0}`} />
      <div style={{ flex: 1, padding: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Fade delay={0.05}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 140px', alignItems: 'center', gap: 18, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ textAlign: 'right', fontSize: 40, fontWeight: 800, color: 'var(--team-a)' }}>{asText(match?.teams?.A?.shortName) || 'A'}</div>
            <div />
            <div style={{ textAlign: 'left', fontSize: 40, fontWeight: 800, color: 'var(--team-b)' }}>{asText(match?.teams?.B?.shortName) || 'B'}</div>
          </div>
        </Fade>
        <div style={{ flex: 1, display: 'grid', alignContent: 'start', gap: 2 }}>
          {rows.map((r, i) => <StatCompareRow key={r.label} label={r.label} a={Number(r.a)} b={Number(r.b)} pct={!!r.pct} delay={0.08 + i * 0.05} />)}
          {!rows.length ? <Fade delay={0.1}><div style={{ fontSize: 34, color: 'var(--broadcast-muted)' }}>No recorded statistics available.</div></Fade> : null}
        </div>
      </div>
    </SceneShell>
  );
};

const PlayerChip: React.FC<{ p: any; side: 'A'|'B'; showPos?: boolean; delay?: number }> = ({ p, side, showPos, delay = 0 }) => {
  const name = asText(p?.name); const jersey = p?.jerseyNumber ?? p?.number;
  if (!name && jersey == null) return null;
  const color = side === 'A' ? 'var(--team-a)' : 'var(--team-b)';
  const tcolor = side === 'A' ? 'var(--team-a-text)' : 'var(--team-b-text)';
  const markers = [p?.isCaptain ? 'C' : null, p?.isLibero ? 'L' : null].filter(Boolean).join(' · ');
  const pos = asText(p?.position);
  return (
    <Fade delay={delay}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {jersey != null ? <div style={{ minWidth: 54, height: 54, background: color, color: tcolor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 800 }} className="tabular-score">{jersey}</div> : null}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name || `#${jersey}`}{markers ? <span style={{ fontSize: 22, marginLeft: 8, color: '#ffd166', verticalAlign: 'middle' }}>{markers}</span> : null}</div>
          {showPos && (pos || markers) ? <div style={{ fontSize: 24, color: 'var(--broadcast-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{pos || ''}</div> : null}
        </div>
      </div>
    </Fade>
  );
};

export const LineupsScene: React.FC<{ match: AnyMatch }> = ({ match }) => {
  const sideBlock = (side: 'A'|'B', delayBase: number) => {
    const t = match?.teams?.[side]; const lineup = (Array.isArray(t?.lineup) ? t.lineup : []).slice(0,6);
    if (!lineup.length) return null;
    const color = side === 'A' ? 'var(--team-a)' : 'var(--team-b)';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Fade delay={delayBase}><div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: color, color: side === 'A' ? 'var(--team-a-text)' : 'var(--team-b-text)' }}>
          {asText(t.logoUrl) ? <TeamLogo src={asText(t.logoUrl)} name={asText(t.name)||side} shortName={asText(t.shortName)||side} size={48} color="rgba(255,255,255,0.18)" textColor={side==='A'?'var(--team-a-text)':'var(--team-b-text)'} /> : null}
          <div style={{ fontSize: 44, fontWeight: 800, textTransform: 'uppercase' }}>{asText(t.name) || side}</div>
        </div></Fade>
        <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderTop: 'none', display: 'grid', gap: 8 }}>
          {lineup.map((p: any, i: number) => <PlayerChip key={p?.id || i} p={p} side={side} showPos delay={delayBase + 0.05 + i * 0.04} />)}
        </div>
      </div>
    );
  };
  const a = sideBlock('A', 0.05); const b = sideBlock('B', 0.1);
  return (
    <SceneShell>
      <HeaderBand match={match} title="Starting Lineups" subtitle={`Set ${match?.current_set ?? '-'}`} />
      <div style={{ flex: 1, padding: 28, display: 'grid', gridTemplateColumns: a && b ? '1fr 1fr' : '1fr', gap: 24, alignContent: 'start' }}>
        {a}{b}
        {!a && !b ? <Fade delay={0.1}><div style={{ fontSize: 34, color: 'var(--broadcast-muted)' }}>No starting lineup data available.</div></Fade> : null}
      </div>
    </SceneShell>
  );
};

export const HeadToHeadScene: React.FC<{ match: AnyMatch }> = ({ match }) => {
  const sets = playedSets(match);
  const s = computeStats(match);
  return (
    <SceneShell>
      <HeaderBand match={match} title="Head To Head" subtitle={`Sets ${match?.teams?.A?.sets ?? 0}-${match?.teams?.B?.sets ?? 0}`} />
      <div style={{ flex: 1, padding: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Fade delay={0.05}><div style={{ padding: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
            <TeamBlock match={match} side="A" />
            <div style={{ fontSize: 90, fontWeight: 800 }} className="tabular-score"><span style={{ color: 'var(--team-a)' }}>{match?.teams?.A?.sets ?? 0}</span><span style={{ color: '#6b778c' }}>-</span><span style={{ color: 'var(--team-b)' }}>{match?.teams?.B?.sets ?? 0}</span></div>
            <TeamBlock match={match} side="B" align="right" />
          </div></Fade>
          {sets.length ? <Fade delay={0.12}><div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 26, color: 'var(--broadcast-muted)', letterSpacing: '0.16em' }}>SET SCORES</div>
            {sets.slice(0,5).map((st: any) => <div key={st.number} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr', fontSize: 40, fontWeight: 800 }} className="tabular-score"><div style={{ textAlign: 'right', color: 'var(--team-a)' }}>{st.scoreA}</div><div style={{ textAlign: 'center', fontSize: 24, color: '#9fb0c8', alignSelf: 'center' }}>S{st.number}</div><div style={{ color: 'var(--team-b)' }}>{st.scoreB}</div></div>)}
          </div></Fade> : null}
        </div>
        <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'grid', alignContent: 'start', gap: 4 }}>
          <div style={{ fontSize: 26, color: 'var(--broadcast-muted)', letterSpacing: '0.16em', marginBottom: 6 }}>COMPARISON</div>
          <StatCompareRow label="Points" a={s.ptsA} b={s.ptsB} delay={0.1} />
          <StatCompareRow label="Kills" a={s.killsA} b={s.killsB} delay={0.14} />
          <StatCompareRow label="Aces" a={s.acesA} b={s.acesB} delay={0.18} />
          <StatCompareRow label="Blocks" a={s.blocksA} b={s.blocksB} delay={0.22} />
          {s.soA != null && s.soB != null ? <StatCompareRow label="Side-out %" a={s.soA} b={s.soB} pct delay={0.26} /> : null}
        </div>
      </div>
    </SceneShell>
  );
};

export const PlayerSpotlightScene: React.FC<{ match: AnyMatch }> = ({ match }) => {
  // pick top performer with real name as spotlight if available
  const top = deriveTopPerformer(match);
  const player = top ? (() => {
    // find full player record
    const team = match?.teams?.[top.side];
    const rec = getPlayers(team).find(p => asText(p.name) === top.name) || {};
    return { ...top, ...rec, teamName: asText(team?.name), photo: asText(rec.photoUrl || rec.photo || rec.image) };
  })() : null;
  if (!player) {
    return <SceneShell><HeaderBand match={match} title="Player Spotlight" /><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fade delay={0.1}><div style={{ fontSize: 34, color: 'var(--broadcast-muted)' }}>No player data available.</div></Fade></div></SceneShell>;
  }
  const color = player.side === 'A' ? 'var(--team-a)' : 'var(--team-b)';
  const tcolor = player.side === 'A' ? 'var(--team-a-text)' : 'var(--team-b-text)';
  const statItems = [['Points', player.pts], ['Kills', player.kills], ['Aces', player.aces], ['Blocks', player.blocks], ['Digs', player.digs]].filter(([,v]) => Number(v) > 0);
  return (
    <SceneShell>
      <HeaderBand match={match} title="Player Spotlight" subtitle={player.teamName || undefined} />
      <div style={{ flex: 1, padding: 28, display: 'grid', gridTemplateColumns: '520px 1fr', gap: 28 }}>
        <Fade delay={0.06}>
          <div style={{ height: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {player.photo ? <img src={player.photo} alt="" style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', background: '#111827' }} /> : <div style={{ width: '100%', aspectRatio: '3/4', background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))', border: '1px solid rgba(255,255,255,0.08)' }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {player.jersey != null ? <div style={{ minWidth: 64, height: 64, background: color, color: tcolor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 800 }} className="tabular-score">{player.jersey}</div> : null}
              <div>
                <div style={{ fontSize: 54, fontWeight: 800, lineHeight: 1 }}>{player.name}</div>
                {asText(player.position) ? <div style={{ fontSize: 30, color: 'var(--broadcast-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{asText(player.position)}</div> : null}
              </div>
            </div>
          </div>
        </Fade>
        <div style={{ display: 'grid', alignContent: 'start', gap: 16 }}>
          <Fade delay={0.12}><div style={{ fontSize: 30, color: 'var(--broadcast-muted)', letterSpacing: '0.18em' }}>KEY PERFORMANCE</div></Fade>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {statItems.map(([k,v], i) => <Fade key={String(k)} delay={0.16 + i * 0.05}><div style={{ padding: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}><div style={{ fontSize: 26, color: 'var(--broadcast-muted)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>{k}</div><div style={{ fontSize: 80, fontWeight: 800, lineHeight: 1 }} className="tabular-score">{useCountUp(Number(v))}</div></div></Fade>)}
          </div>
        </div>
      </div>
    </SceneShell>
  );
};

export const MatchMomentumScene: React.FC<{ match: AnyMatch }> = ({ match }) => {
  const sets = playedSets(match);
  const maxScore = Math.max(25, ...sets.flatMap((s: any) => [num(s.scoreA), num(s.scoreB)]));
  const points = sets.length ? sets : [{ number: match?.current_set || 1, scoreA: num(match?.teams?.A?.score), scoreB: num(match?.teams?.B?.score) }];
  // simple momentum bars per set (visual progression) + lead indicator
  const aSets = num(match?.teams?.A?.sets), bSets = num(match?.teams?.B?.sets);
  return (
    <SceneShell>
      <HeaderBand match={match} title="Match Momentum" subtitle={`Sets ${aSets}-${bSets}`} />
      <div style={{ flex: 1, padding: 28, display: 'grid', gridTemplateRows: 'auto 1fr', gap: 18 }}>
        <Fade delay={0.05}><div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--team-a)' }}>{asText(match?.teams?.A?.shortName) || 'A'}</div>
          <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.12)' }} />
          <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--team-b)' }}>{asText(match?.teams?.B?.shortName) || 'B'}</div>
        </div></Fade>
        <div style={{ display: 'grid', alignContent: 'center', gap: 14 }}>
          {points.map((s: any, i: number) => {
            const a = num(s.scoreA), b = num(s.scoreB); const tot = Math.max(1, a + b);
            return (
              <Fade key={s.number || i} delay={0.08 + i * 0.06}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px', alignItems: 'center', gap: 14 }}>
                  <div style={{ fontSize: 48, fontWeight: 800, textAlign: 'right', color: 'var(--team-a)' }} className="tabular-score">{a}</div>
                  <div>
                    <div style={{ textAlign: 'center', fontSize: 24, color: '#9fb0c8', letterSpacing: '0.14em', marginBottom: 6 }}>SET {s.number}</div>
                    <div style={{ height: 22, background: 'rgba(255,255,255,0.08)', display: 'flex', overflow: 'hidden' }}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${(a/tot)*100}%` }} transition={{ duration: 0.7, ease: EASE, delay: 0.12 + i*0.06 }} style={{ height: '100%', background: 'var(--team-a)' }} />
                      <motion.div initial={{ width: 0 }} animate={{ width: `${(b/tot)*100}%` }} transition={{ duration: 0.7, ease: EASE, delay: 0.12 + i*0.06 }} style={{ height: '100%', background: 'var(--team-b)' }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--team-b)' }} className="tabular-score">{b}</div>
                </div>
              </Fade>
            );
          })}
        </div>
      </div>
    </SceneShell>
  );
};

export const FinalScene: React.FC<{ match: AnyMatch }> = ({ match }) => {
  const winnerSide = match?.winner === 'A' || match?.winner === 'B' ? match.winner : (num(match?.teams?.A?.sets) > num(match?.teams?.B?.sets) ? 'A' : num(match?.teams?.B?.sets) > num(match?.teams?.A?.sets) ? 'B' : null);
  const winner = winnerSide ? match?.teams?.[winnerSide] : null;
  const sets = playedSets(match);
  const top = deriveTopPerformer(match);
  return (
    <SceneShell>
      <HeaderBand match={match} title="Final Result" subtitle={winner ? `${asText(winner.name) || winnerSide} wins` : undefined} />
      <div style={{ flex: 1, padding: 28, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
        <Fade delay={0.06}>
          <div style={{ height: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 16 }}>
              <TeamBlock match={match} side="A" big />
              <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '14px 22px' }}>
                <div style={{ fontSize: 26, color: 'var(--broadcast-muted)', letterSpacing: '0.18em' }}>FINAL</div>
                <div style={{ fontSize: 120, fontWeight: 800, lineHeight: 1 }} className="tabular-score"><span style={{ color: 'var(--team-a)' }}>{match?.teams?.A?.sets ?? 0}</span><span style={{ color: '#6b778c' }}>-</span><span style={{ color: 'var(--team-b)' }}>{match?.teams?.B?.sets ?? 0}</span></div>
              </div>
              <TeamBlock match={match} side="B" align="right" big />
            </div>
            {winner ? <div style={{ textAlign: 'center', fontSize: 64, fontWeight: 800, color: winnerSide === 'A' ? 'var(--team-a)' : 'var(--team-b)', textTransform: 'uppercase' }}>{asText(winner.name)} WINS</div> : null}
          </div>
        </Fade>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {sets.length ? <Fade delay={0.12}><div style={{ padding: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 26, color: 'var(--broadcast-muted)', letterSpacing: '0.16em', marginBottom: 8 }}>SET SCORES</div>
            <div style={{ display: 'grid', gap: 6 }}>{sets.map((s: any) => <div key={s.number} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr', fontSize: 44, fontWeight: 800 }} className="tabular-score"><div style={{ textAlign: 'right', color: 'var(--team-a)' }}>{s.scoreA}</div><div style={{ textAlign: 'center', fontSize: 24, color: '#9fb0c8', alignSelf: 'center' }}>S{s.number}</div><div style={{ color: 'var(--team-b)' }}>{s.scoreB}</div></div>)}</div>
          </div></Fade> : null}
          {top ? <Fade delay={0.18}><div style={{ padding: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 26, color: 'var(--broadcast-muted)', letterSpacing: '0.16em' }}>MVP / TOP PERFORMER</div>
            <div style={{ fontSize: 46, fontWeight: 800, marginTop: 4 }}>{top.jersey != null ? `#${top.jersey} ` : ''}{top.name}</div>
            <div style={{ fontSize: 30, color: '#d6deea' }}>{top.pts} PTS · {top.kills} K · {top.aces} A · {top.blocks} B</div>
          </div></Fade> : null}
        </div>
      </div>
    </SceneShell>
  );
};

export const BreakSlateScene: React.FC<{ match: AnyMatch; scene?: AnyScene }> = ({ match, scene }) => {
  const cd = useCountdown(scene?.timerEndsAt);
  const payload = scene?.payload || {};
  const sponsor = asText(payload.sponsor) || asText(payload.sponsorText);
  const next = asText(payload.nextFixture) || asText(payload.nextMatch) || asText(payload.next);
  return (
    <SceneShell>
      <HeaderBand match={match} title="We'll Be Right Back" subtitle={asText(match?.tournament) ? undefined : 'Broadcast Break'} right={cd ? <div style={{ fontSize: 46, fontWeight: 800 }} className="tabular-score">{cd.label}</div> : null} />
      <div style={{ flex: 1, padding: 28, display: 'grid', gridTemplateRows: '1fr auto auto', gap: 18 }}>
        <Fade delay={0.06} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>We’ll Be Right Back</div>
            <div style={{ fontSize: 40, color: '#d6deea', marginTop: 8 }}>{asText(match?.teams?.A?.shortName) || asText(match?.teams?.A?.name)} vs {asText(match?.teams?.B?.shortName) || asText(match?.teams?.B?.name)}</div>
          </div>
        </Fade>
        {next ? <Fade delay={0.14}><div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 34 }}><span style={{ color: 'var(--broadcast-muted)', letterSpacing: '0.14em' }}>NEXT: </span>{next}</div></Fade> : null}
        <Fade delay={0.18}><div style={{ padding: '14px 18px', background: 'linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 26, color: 'var(--broadcast-muted)', letterSpacing: '0.16em' }}>SPONSOR</div>
          <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.12)' }} />
          <div style={{ fontSize: 34, fontWeight: 700 }}>{sponsor || 'Broadcast Partner'}</div>
        </div></Fade>
      </div>
    </SceneShell>
  );
};

function allPlayers(match: AnyMatch) {
  const out: any[] = [];
  (['A', 'B'] as const).forEach((side) => {
    const team = match?.teams?.[side];
    getPlayers(team).forEach((p) => {
      const st = p.stats || p.matchStats || {};
      out.push({
        side,
        teamName: asText(team?.shortName) || asText(team?.name) || side,
        teamColor: side === 'A' ? 'var(--team-a)' : 'var(--team-b)',
        id: p.id,
        name: asText(p.name),
        jersey: p.jerseyNumber ?? p.number,
        position: asText(p.position),
        photo: asText(p.photoUrl || p.photo || p.image),
        kills: num(st.kill ?? st.kills),
        aces: num(st.ace ?? st.aces),
        blocks: num(st.block ?? st.blocks),
        digs: num(st.dig ?? st.digs),
        assists: num(st.assist ?? st.assists),
        errors: num(st.error ?? st.errors),
        points: num(st.points) || (num(st.kill ?? st.kills) + num(st.ace ?? st.aces) + num(st.block ?? st.blocks)),
      });
    });
  });
  return out.filter(p => p.name || p.jersey != null);
}

function resolveSpotlightPlayer(match: AnyMatch, payload: any) {
  const list = allPlayers(match);
  if (!list.length) return null;
  const p = payload || {};
  const byId = p.playerId ? list.find(x => String(x.id) === String(p.playerId)) : null;
  if (byId) return byId;
  const bySideJersey = (p.side || p.team) && p.jerseyNumber != null
    ? list.find(x => String(x.side) === String(p.side || p.team) && String(x.jersey) === String(p.jerseyNumber))
    : null;
  if (bySideJersey) return bySideJersey;
  const byName = p.name ? list.find(x => (x.name || '').toLowerCase() === String(p.name).toLowerCase()) : null;
  if (byName) return byName;
  const ranked = [...list].sort((a, b) => (b.points - a.points) || (b.kills - a.kills) || (b.blocks - a.blocks));
  return ranked[0] || null;
}

export const TeamIntroScene: React.FC<{ match: AnyMatch }> = ({ match }) => {
  const subtitle = [asText(match?.tournament), asText(match?.division)].filter(Boolean).join(' · ') || null;
  const side = (s: 'A' | 'B', delay: number) => {
    const t = match?.teams?.[s] || {};
    const color = s === 'A' ? 'var(--team-a)' : 'var(--team-b)';
    const tcolor = s === 'A' ? 'var(--team-a-text)' : 'var(--team-b-text)';
    const name = asText(t.name) || s;
    const roster = getPlayers(t).slice(0, 8);
    return (
      <Fade delay={delay}>
        <div style={{ height: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 20, background: color, color: tcolor, display: 'flex', alignItems: 'center', gap: 16 }}>
            <TeamLogo src={asText(t.logoUrl)} name={name} shortName={asText(t.shortName) || name} color="rgba(255,255,255,0.18)" textColor={tcolor} size={86} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 58, fontWeight: 800, lineHeight: 1, textTransform: 'uppercase' }}>{name}</div>
              {asText(t.shortName) ? <div style={{ fontSize: 28, letterSpacing: '0.14em', opacity: 0.9 }}>{asText(t.shortName)}</div> : null}
            </div>
          </div>
          <div style={{ padding: 16, display: 'grid', gap: 8, alignContent: 'start' }}>
            {roster.map((p: any, i: number) => <PlayerChip key={p?.id || i} p={p} side={s} showPos delay={delay + 0.05 + i * 0.03} />)}
            {!roster.length ? <div style={{ fontSize: 28, color: 'var(--broadcast-muted)' }}>Roster not available.</div> : null}
          </div>
        </div>
      </Fade>
    );
  };
  return (
    <SceneShell>
      <HeaderBand match={match} title="Team Introduction" subtitle={subtitle} />
      <div style={{ flex: 1, padding: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {side('A', 0.05)}
        {side('B', 0.1)}
      </div>
    </SceneShell>
  );
};

export const SetResultScene: React.FC<{ match: AnyMatch; scene?: AnyScene; payload?: any }> = ({ match, scene, payload }) => {
  const sets = playedSets(match);
  const requestedSet = Number(payload?.setNumber || scene?.payload?.setNumber || 0);
  const last = (requestedSet ? sets.find((s: any) => Number(s.number) === requestedSet) : null) || sets[sets.length - 1];
  const setStats = payload?.setStats || scene?.payload?.setStats || null;
  const sNum = last?.number || requestedSet || match?.current_set || 1;
  const scoreA = last?.scoreA ?? setStats?.scoreA ?? 0;
  const scoreB = last?.scoreB ?? setStats?.scoreB ?? 0;
  const winnerSide = last?.winner || setStats?.winner || (scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : null);
  const winner = winnerSide ? match?.teams?.[winnerSide] : null;
  const aSets = num(match?.teams?.A?.sets), bSets = num(match?.teams?.B?.sets);
  const statRows: Array<[string, any, any, (v:any)=>string]> = [
    ['Points', setStats?.teams?.A?.points ?? scoreA, setStats?.teams?.B?.points ?? scoreB, (v) => String(v ?? '-')],
    ['Kills', setStats?.teams?.A?.kills, setStats?.teams?.B?.kills, (v) => v == null ? '-' : String(v)],
    ['Aces', setStats?.teams?.A?.aces, setStats?.teams?.B?.aces, (v) => v == null ? '-' : String(v)],
    ['Blocks', setStats?.teams?.A?.blocks, setStats?.teams?.B?.blocks, (v) => v == null ? '-' : String(v)],
    ['Errors', setStats?.teams?.A?.errors, setStats?.teams?.B?.errors, (v) => v == null ? '-' : String(v)],
    ['Atk Eff', setStats?.teams?.A?.attackEfficiency, setStats?.teams?.B?.attackEfficiency, (v) => v == null ? '-' : Number(v).toFixed(3)],
    ['Timeouts', setStats?.teams?.A?.timeoutsUsed, setStats?.teams?.B?.timeoutsUsed, (v) => v == null ? '-' : String(v)],
    ['Subs', setStats?.teams?.A?.substitutionsUsed, setStats?.teams?.B?.substitutionsUsed, (v) => v == null ? '-' : String(v)],
  ];
  const topA = Array.isArray(setStats?.topScorers?.A) ? setStats.topScorers.A.slice(0, 2) : [];
  const topB = Array.isArray(setStats?.topScorers?.B) ? setStats.topScorers.B.slice(0, 2) : [];
  return (
    <SceneShell>
      <HeaderBand match={match} title={`Set ${sNum} Result`} subtitle={winner ? `${asText(winner.shortName) || asText(winner.name)} wins the set` : 'Completed set summary'} />
      <div style={{ flex: 1, padding: 28, display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 24, alignItems: 'stretch' }}>
        <Fade delay={0.06}>
          <div style={{ height: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: 26, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 18 }}>
              <TeamBlock match={match} side="A" big />
              <div style={{ textAlign: 'center', padding: '18px 28px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: 26, color: 'var(--broadcast-muted)', letterSpacing: '0.18em' }}>{`SET ${sNum}`}</div>
                <div style={{ fontSize: 124, fontWeight: 800, lineHeight: 1 }} className="tabular-score">{scoreA} <span style={{ color: '#6b778c' }}>-</span> {scoreB}</div>
                <div style={{ fontSize: 34, color: '#d6deea', marginTop: 4 }}>SETS {aSets}-{bSets}</div>
              </div>
              <TeamBlock match={match} side="B" align="right" big />
            </div>
            {winner ? <div style={{ textAlign: 'center', fontSize: 52, fontWeight: 800, color: winnerSide === 'A' ? 'var(--team-a)' : 'var(--team-b)', textTransform: 'uppercase' }}>{asText(winner.name)} takes the set</div> : null}
          </div>
        </Fade>
        <Fade delay={0.12}>
          <div style={{ height: '100%', padding: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 28, color: 'var(--broadcast-muted)', letterSpacing: '0.16em' }}>SET STATS</div>
            {statRows.map(([label, av, bv, fmt], i) => (
              <motion.div key={label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: 0.16 + i * 0.05 }} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ textAlign: 'right', fontSize: 36, fontWeight: 800, color: 'var(--team-a)' }} className="tabular-score">{fmt(av)}</div>
                <div style={{ textAlign: 'center', fontSize: 22, color: '#9fb0c8', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--team-b)' }} className="tabular-score">{fmt(bv)}</div>
              </motion.div>
            ))}
            {(topA.length > 0 || topB.length > 0) && (
              <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ fontSize: 22, color: '#d6deea' }}><div style={{ color: 'var(--broadcast-muted)', fontSize: 18, letterSpacing: '0.1em' }}>TOP SCORERS {asText(match?.teams?.A?.shortName) || 'A'}</div>{topA.map((p:any,i:number)=><div key={i}>{p.jerseyNumber!=null?`#${p.jerseyNumber} `:''}{p.name} <span style={{ color: 'var(--team-a)' }}>{p.points} pts</span></div>)}</div>
                <div style={{ fontSize: 22, color: '#d6deea' }}><div style={{ color: 'var(--broadcast-muted)', fontSize: 18, letterSpacing: '0.1em' }}>TOP SCORERS {asText(match?.teams?.B?.shortName) || 'B'}</div>{topB.map((p:any,i:number)=><div key={i}>{p.jerseyNumber!=null?`#${p.jerseyNumber} `:''}{p.name} <span style={{ color: 'var(--team-b)' }}>{p.points} pts</span></div>)}</div>
              </div>
            )}
          </div>
        </Fade>
      </div>
    </SceneShell>
  );
};

export const SetAnalysisScene: React.FC<{ match: AnyMatch; scene?: AnyScene; payload?: any }> = ({ match, scene, payload }) => {
  const sets = playedSets(match);
  const requestedSet = Number(payload?.setNumber || scene?.payload?.setNumber || 0);
  const focus = (requestedSet ? sets.find((s: any) => Number(s.number) === requestedSet) : null) || sets[sets.length - 1];
  const sNum = focus?.number || requestedSet || match?.current_set || 1;
  const current = match?.current_set || sets.length + 1;
  const aSets = num(match?.teams?.A?.sets), bSets = num(match?.teams?.B?.sets);
  const setStats = payload?.setStats || scene?.payload?.setStats || null;
  const statRows: Array<[string, any, any, (v:any)=>string]> = [
    ['Points', setStats?.teams?.A?.points ?? focus?.scoreA, setStats?.teams?.B?.points ?? focus?.scoreB, (v) => v == null ? '-' : String(v)],
    ['Kills', setStats?.teams?.A?.kills, setStats?.teams?.B?.kills, (v) => v == null ? '-' : String(v)],
    ['Aces', setStats?.teams?.A?.aces, setStats?.teams?.B?.aces, (v) => v == null ? '-' : String(v)],
    ['Blocks', setStats?.teams?.A?.blocks, setStats?.teams?.B?.blocks, (v) => v == null ? '-' : String(v)],
    ['Errors', setStats?.teams?.A?.errors, setStats?.teams?.B?.errors, (v) => v == null ? '-' : String(v)],
    ['Atk Eff', setStats?.teams?.A?.attackEfficiency, setStats?.teams?.B?.attackEfficiency, (v) => v == null ? '-' : Number(v).toFixed(3)],
    ['Timeouts', setStats?.teams?.A?.timeoutsUsed, setStats?.teams?.B?.timeoutsUsed, (v) => v == null ? '-' : String(v)],
    ['Subs', setStats?.teams?.A?.substitutionsUsed, setStats?.teams?.B?.substitutionsUsed, (v) => v == null ? '-' : String(v)],
  ];
  const topA = Array.isArray(setStats?.topScorers?.A) ? setStats.topScorers.A.slice(0, 3) : [];
  const topB = Array.isArray(setStats?.topScorers?.B) ? setStats.topScorers.B.slice(0, 3) : [];
  return (
    <SceneShell>
      <HeaderBand match={match} title="Set Analysis" subtitle={`Set ${sNum} · Sets ${aSets}-${bSets}`} />
      <div style={{ flex: 1, padding: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <Fade delay={0.05}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <TeamBlock match={match} side="A" />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, color: 'var(--broadcast-muted)', letterSpacing: '0.16em' }}>SET {sNum}</div>
                <div style={{ fontSize: 74, fontWeight: 800 }} className="tabular-score"><span style={{ color: 'var(--team-a)' }}>{focus?.scoreA ?? 0}</span><span style={{ color: '#6b778c' }}>-</span><span style={{ color: 'var(--team-b)' }}>{focus?.scoreB ?? 0}</span></div>
              </div>
              <TeamBlock match={match} side="B" align="right" />
            </div>
          </Fade>
          <Fade delay={0.1}><div style={{ fontSize: 24, color: 'var(--broadcast-muted)', letterSpacing: '0.16em' }}>SET PROGRESSION</div></Fade>
          {sets.length ? sets.slice(0, 5).map((s: any, i: number) => (
            <motion.div key={s.number || i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: 0.12 + i * 0.05 }} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px', alignItems: 'center', gap: 12, padding: '8px 10px', background: Number(s.number) === Number(sNum) ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 40, fontWeight: 800, textAlign: 'right', color: 'var(--team-a)' }} className="tabular-score">{s.scoreA}</div>
              <div style={{ textAlign: 'center', fontSize: 22, color: '#9fb0c8', letterSpacing: '0.12em' }}>SET {s.number}{s.winner ? ` · ${s.winner} WON` : (s.number === current ? ' · IN PROGRESS' : '')}</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--team-b)' }} className="tabular-score">{s.scoreB}</div>
            </motion.div>
          )) : <Fade delay={0.12}><div style={{ fontSize: 28, color: 'var(--broadcast-muted)' }}>No completed set data available yet.</div></Fade>}
        </div>
        <div style={{ display: 'grid', gap: 8, alignContent: 'start', padding: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 24, color: 'var(--broadcast-muted)', letterSpacing: '0.16em' }}>KEY STATS · SET {sNum}</div>
          {statRows.map(([label, av, bv, fmt], i) => (
            <motion.div key={label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: 0.1 + i * 0.05 }} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ textAlign: 'right', fontSize: 34, fontWeight: 800, color: 'var(--team-a)' }} className="tabular-score">{fmt(av)}</div>
              <div style={{ textAlign: 'center', fontSize: 20, color: '#9fb0c8', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--team-b)' }} className="tabular-score">{fmt(bv)}</div>
            </motion.div>
          ))}
          {(topA.length > 0 || topB.length > 0) && (
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 20, color: '#d6deea' }}>
              <div><div style={{ color: 'var(--broadcast-muted)', fontSize: 17, letterSpacing: '0.1em' }}>TOP SCORERS {asText(match?.teams?.A?.shortName) || 'A'}</div>{topA.map((p:any,i:number)=><div key={i}>{p.jerseyNumber!=null?`#${p.jerseyNumber} `:''}{p.name} <span style={{ color: 'var(--team-a)' }}>{p.points}</span></div>)}</div>
              <div><div style={{ color: 'var(--broadcast-muted)', fontSize: 17, letterSpacing: '0.1em' }}>TOP SCORERS {asText(match?.teams?.B?.shortName) || 'B'}</div>{topB.map((p:any,i:number)=><div key={i}>{p.jerseyNumber!=null?`#${p.jerseyNumber} `:''}{p.name} <span style={{ color: 'var(--team-b)' }}>{p.points}</span></div>)}</div>
            </div>
          )}
        </div>
      </div>
    </SceneShell>
  );
};

export const TopPerformersScene: React.FC<{ match: AnyMatch }> = ({ match }) => {
  const players = allPlayers(match);
  const cats = [
    { key: 'points', label: 'Points' },
    { key: 'kills', label: 'Kills' },
    { key: 'aces', label: 'Aces' },
    { key: 'blocks', label: 'Blocks' },
    { key: 'digs', label: 'Digs' },
  ] as const;
  const leaders = cats.map(c => ({ ...c, p: [...players].sort((a: any, b: any) => (b[c.key] - a[c.key]))[0] })).filter(x => x.p && (x.p[x.key] > 0 || x.key === 'points'));
  return (
    <SceneShell>
      <HeaderBand match={match} title="Top Performers" subtitle="Leaders by category" />
      <div style={{ flex: 1, padding: 28, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignContent: 'start' }}>
        {leaders.length ? leaders.map((l, i) => (
          <Fade key={l.key} delay={0.06 + i * 0.05}>
            <div style={{ padding: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderTop: `4px solid ${l.p.teamColor}` }}>
              <div style={{ fontSize: 24, color: 'var(--broadcast-muted)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>{l.label}</div>
              <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1, margin: '6px 0' }} className="tabular-score">{l.p[l.key]}</div>
              <div style={{ fontSize: 40, fontWeight: 800 }}>{l.p.jersey != null ? `#${l.p.jersey} ` : ''}{l.p.name || 'Player'}</div>
              <div style={{ fontSize: 26, color: '#d6deea' }}>{l.p.teamName}</div>
            </div>
          </Fade>
        )) : <Fade delay={0.1}><div style={{ fontSize: 32, color: 'var(--broadcast-muted)' }}>No player performance data available yet.</div></Fade>}
      </div>
    </SceneShell>
  );
};

export const PlayerLeaderboardScene: React.FC<{ match: AnyMatch }> = ({ match }) => {
  const rows = [...allPlayers(match)].sort((a, b) => (b.points - a.points) || (b.kills - a.kills) || (b.aces - a.aces)).slice(0, 8);
  return (
    <SceneShell>
      <HeaderBand match={match} title="Player Performance Leaderboard" subtitle="Match contributions" />
      <div style={{ flex: 1, padding: 28 }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 120px 90px 90px 90px 90px', gap: 8, padding: '12px 16px', fontSize: 22, color: 'var(--broadcast-muted)', letterSpacing: '0.12em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div>#</div><div>PLAYER</div><div style={{ textAlign: 'right' }}>PTS</div><div style={{ textAlign: 'right' }}>K</div><div style={{ textAlign: 'right' }}>A</div><div style={{ textAlign: 'right' }}>B</div><div style={{ textAlign: 'right' }}>D</div>
          </div>
          {rows.length ? rows.map((p, i) => (
            <Fade key={`${p.side}-${p.id || p.jersey || p.name || i}`} delay={0.06 + i * 0.04}>
              <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 120px 90px 90px 90px 90px', gap: 8, padding: '12px 16px', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: p.teamColor }}>{i + 1}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 34, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.jersey != null ? `#${p.jersey} ` : ''}{p.name || 'Player'}</div>
                  <div style={{ fontSize: 22, color: '#9fb0c8' }}>{p.teamName}{p.position ? ` · ${p.position}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 40, fontWeight: 800 }} className="tabular-score">{p.points}</div>
                <div style={{ textAlign: 'right', fontSize: 32, fontWeight: 700 }} className="tabular-score">{p.kills}</div>
                <div style={{ textAlign: 'right', fontSize: 32, fontWeight: 700 }} className="tabular-score">{p.aces}</div>
                <div style={{ textAlign: 'right', fontSize: 32, fontWeight: 700 }} className="tabular-score">{p.blocks}</div>
                <div style={{ textAlign: 'right', fontSize: 32, fontWeight: 700 }} className="tabular-score">{p.digs}</div>
              </div>
            </Fade>
          )) : <div style={{ padding: 18, fontSize: 30, color: 'var(--broadcast-muted)' }}>No player performance data available yet.</div>}
        </div>
      </div>
    </SceneShell>
  );
};

const SpotlightStat: React.FC<{ label: string; value: number; delay: number }> = ({ label, value, delay }) => {
  const v = useCountUp(Number(value));
  return (
    <Fade delay={delay}>
      <div style={{ padding: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: 26, color: 'var(--broadcast-muted)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: 80, fontWeight: 800, lineHeight: 1 }} className="tabular-score">{v}</div>
      </div>
    </Fade>
  );
};

export const PlayerSpotlightTemplateScene: React.FC<{ match: AnyMatch; scene?: AnyScene; payload?: any }> = ({ match, scene, payload }) => {
  const resolved = resolveSpotlightPlayer(match, payload ?? scene?.payload ?? {});
  if (!resolved) return <SceneShell><HeaderBand match={match} title="Player Spotlight" /><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fade delay={0.1}><div style={{ fontSize: 34, color: 'var(--broadcast-muted)' }}>No player data available.</div></Fade></div></SceneShell>;
  const color = resolved.side === 'A' ? 'var(--team-a)' : 'var(--team-b)';
  const tcolor = resolved.side === 'A' ? 'var(--team-a-text)' : 'var(--team-b-text)';
  const candidates = [['Points', resolved.points], ['Kills', resolved.kills], ['Aces', resolved.aces], ['Blocks', resolved.blocks], ['Digs', resolved.digs]] as Array<[string, number]>;
  const positive = candidates.filter(([, v]) => Number(v) > 0);
  const statItems = (positive.length ? positive : candidates).slice(0, 5);
  return (
    <SceneShell>
      <HeaderBand match={match} title="Player Spotlight" subtitle={resolved.teamName || undefined} />
      <div style={{ flex: 1, padding: 28, display: 'grid', gridTemplateColumns: '520px 1fr', gap: 28 }}>
        <Fade delay={0.06}>
          <div style={{ height: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {resolved.photo ? <img src={resolved.photo} alt="" style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', background: '#111827' }} /> : <div style={{ width: '100%', aspectRatio: '3/4', background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))', border: '1px solid rgba(255,255,255,0.08)' }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {resolved.jersey != null ? <div style={{ minWidth: 64, height: 64, background: color, color: tcolor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 800 }} className="tabular-score">{resolved.jersey}</div> : null}
              <div>
                <div style={{ fontSize: 54, fontWeight: 800, lineHeight: 1 }}>{resolved.name || 'Player'}</div>
                {resolved.position ? <div style={{ fontSize: 30, color: 'var(--broadcast-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{resolved.position}</div> : null}
              </div>
            </div>
          </div>
        </Fade>
        <div style={{ display: 'grid', alignContent: 'start', gap: 16 }}>
          <Fade delay={0.12}><div style={{ fontSize: 30, color: 'var(--broadcast-muted)', letterSpacing: '0.18em' }}>KEY PERFORMANCE</div></Fade>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {statItems.map(([k, v], i) => <SpotlightStat key={String(k)} label={String(k)} value={Number(v)} delay={0.16 + i * 0.05} />)}
          </div>
        </div>
      </div>
    </SceneShell>
  );
};

export const SCENE_COMPONENTS: Record<string, React.FC<any>> = {
  SET_BREAK: SetBreakScene,
  TIMEOUT: TimeoutScene,
  MATCH_STATS: MatchStatsScene,
  LINEUPS: LineupsScene,
  HEAD_TO_HEAD: HeadToHeadScene,
  PLAYER_SPOTLIGHT: PlayerSpotlightTemplateScene,
  MATCH_MOMENTUM: MatchMomentumScene,
  FINAL: FinalScene,
  BREAK_SLATE: BreakSlateScene,
};

// Back-compat named exports / map for existing routes and preview tooling
export const MatchIntroGraphic = (props: any) => <BreakSlateScene {...props} />;
export const TeamIntroGraphic = TeamIntroScene;
export const StartingLineupGraphic = (props: any) => <LineupsScene {...props} />;
export const PlayerSpotlightGraphic = PlayerSpotlightTemplateScene;
export const TeamComparisonGraphic = (props: any) => <HeadToHeadScene {...props} />;
export const MatchStatisticsGraphic = (props: any) => <MatchStatsScene {...props} />;
export const SetResultGraphic = SetResultScene;
export const SetAnalysisGraphic = SetAnalysisScene;
export const MatchMomentumGraphic = (props: any) => <MatchMomentumScene {...props} />;
export const TopPerformersGraphic = TopPerformersScene;
export const PlayerLeaderboardGraphic = PlayerLeaderboardScene;
export const FinalMatchResultGraphic = (props: any) => <FinalScene {...props} />;

export const TEMPLATE_COMPONENTS: Record<string, React.FC<any>> = {
  ...SCENE_COMPONENTS,
  MATCH_INTRO: MatchIntroGraphic,
  TEAM_INTRO: TeamIntroGraphic,
  STARTING_LINEUP: StartingLineupGraphic,
  PLAYER_SPOTLIGHT: PlayerSpotlightGraphic,
  PLAYER_LEADERBOARD: PlayerLeaderboardGraphic,
  TEAM_COMPARISON: TeamComparisonGraphic,
  MATCH_STATISTICS: MatchStatisticsGraphic,
  SET_ANALYSIS: SetAnalysisGraphic,
  SET_RESULT: SetResultGraphic,
  MATCH_MOMENTUM: MatchMomentumGraphic,
  TOP_PERFORMERS: TopPerformersGraphic,
  FINAL_MATCH_RESULT: FinalMatchResultGraphic,
};
