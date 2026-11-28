import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePollingFallback } from '../hooks/useSocketHealthy.js';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  BarChart, Bar,
} from 'recharts';
import { BarChart3, TrendingUp, Target, Zap, Users, Search, Download, Printer, Tv, Trophy, ArrowUpDown } from 'lucide-react';
import { broadcastApi, matchApi } from '../services/api.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Input, Select } from '../components/ui/Input.js';
import { useNotification } from '../contexts/NotificationContext.js';

function fmt(v: number | null | undefined, suffix = '') {
  if (v === null || v === undefined) return '—';
  return `${typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2).replace(/\.00$/, '') : v}${suffix}`;
}

function pctText(key: string, v: number | null | undefined) {
  if (v == null) return '—';
  if (key === 'breakPoint' || key === 'attackEfficiency' || key === 'receptionEfficiency') return `${(v * 100).toFixed(1)}%`;
  if (key === 'attackSuccessPct' || key === 'sideOutPct' || key === 'acePct') return `${v.toFixed(1)}%`;
  return fmt(v);
}

const SIDE_NAMES: Record<string, string> = { HOME: 'A', AWAY: 'B' };
const REQUIRED_METRICS = ['totalPoints', 'kills', 'attackSuccessPct', 'aces', 'blocks', 'digs', 'errors', 'sideOutPct', 'breakPoint'];

function teamLabel(match: any, side: 'HOME' | 'AWAY') {
  const team = side === 'HOME' ? match?.teams?.A : match?.teams?.B;
  return team?.shortName || team?.name || (side === 'HOME' ? 'Home' : 'Away');
}
function teamFullName(match: any, side: 'HOME' | 'AWAY') {
  const team = side === 'HOME' ? match?.teams?.A : match?.teams?.B;
  return team?.name || (side === 'HOME' ? 'Home' : 'Away');
}

const PLAYER_COLUMNS: Array<{ key: string; label: string; numeric?: boolean }> = [
  { key: 'name', label: 'Player' },
  { key: 'jerseyNumber', label: 'No' },
  { key: 'points', label: 'PTS', numeric: true },
  { key: 'attackKills', label: 'K', numeric: true },
  { key: 'attackAttempts', label: 'ATT', numeric: true },
  { key: 'attackErrors', label: 'E', numeric: true },
  { key: 'attackSuccessPct', label: 'ATK %', numeric: true },
  { key: 'serviceAces', label: 'A', numeric: true },
  { key: 'blocks', label: 'B', numeric: true },
  { key: 'digs', label: 'D', numeric: true },
  { key: 'assists', label: 'AST', numeric: true },
];

function PlayerTable({ players, title, accent }: { players: any[]; title: string; accent: string }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'points', dir: -1 });
  const sorted = useMemo(() => {
    const list = [...(players || [])];
    list.sort((a, b) => {
      if (sort.key === 'name') return String(a.name || '').localeCompare(String(b.name || '')) * sort.dir;
      const av = Number(a[sort.key] ?? -1); const bv = Number(b[sort.key] ?? -1);
      return (av - bv) * sort.dir;
    });
    return list;
  }, [players, sort]);
  const toggle = (key: string) => setSort(s => s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) } : { key, dir: key === 'name' ? 1 : -1 });
  if (!players || players.length === 0) {
    return <div className="text-sm text-fg-subtle py-6">No player-attributed statistics for this scope.</div>;
  }
  return (
    <div>
      <div className="font-semibold text-sm mb-2" style={{ color: accent }}>{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-fg-muted border-b border-border">
              {PLAYER_COLUMNS.map(c => (
                <th key={c.key} className={`py-2 font-semibold ${c.numeric ? 'text-right' : 'text-left'} ${c.key === 'name' ? 'pr-3' : 'px-2'}`}>
                  <button className="inline-flex items-center gap-1 hover:text-fg" onClick={() => toggle(c.key)}>
                    {c.label}<ArrowUpDown className="w-3 h-3 text-fg-subtle" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p: any, i: number) => (
              <tr key={p.playerId || `${p.name}-${i}`} className="border-b border-border text-fg-muted">
                <td className="py-1.5 pr-3 text-fg font-medium">{p.jerseyNumber != null ? `No. ${p.jerseyNumber} ` : ''}{p.name || p.playerId}</td>
                <td className="py-1.5 px-2 text-right font-mono">{p.jerseyNumber ?? '—'}</td>
                {PLAYER_COLUMNS.slice(2).map(c => (
                  <td key={c.key} className="py-1.5 px-2 text-right font-mono">
                    {c.key === 'attackSuccessPct' ? pctText('attackSuccessPct', p[c.key]) : fmt(p[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const StatisticsPage: React.FC = () => {
  const notify = useNotification();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const poll = usePollingFallback(20_000);

  const tab: 'match' | 'all' = params.get('tab') === 'all' ? 'all' : 'match';
  const scopeParam = params.get('scope') || 'match';
  const scope: 'match' | number = scopeParam.startsWith('set') ? (Number(scopeParam.slice(3)) || 1) : 'match';

  const { data: matches = [], isLoading: matchesLoading } = useQuery({ queryKey: ['matches'], queryFn: matchApi.listMatches, refetchInterval: poll, staleTime: 15_000 });

  const defaultMatchId = useMemo(() => {
    const live = matches.find((m: any) => ['LIVE', 'PAUSED', 'BETWEEN_SETS', 'SUSPENDED'].includes(String(m.status)));
    const done = matches.find((m: any) => ['COMPLETED', 'FINISHED'].includes(String(m.status)));
    return live?.id || done?.id || matches[0]?.id || '';
  }, [matches]);

  const matchId = params.get('match') || defaultMatchId;

  const filteredMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return matches;
    return matches.filter((m: any) => {
      const hay = [m.teams?.A?.name, m.teams?.B?.name, m.teams?.A?.shortName, m.teams?.B?.shortName, m.tournament, m.match_date, m.scheduledAt, m.court, m.status]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [matches, search]);

  const { data: analytics, isLoading, error } = useQuery({
    queryKey: ['analytics', matchId],
    queryFn: () => matchApi.getAnalytics(matchId),
    enabled: !!matchId && tab === 'match',
    refetchInterval: poll,
    staleTime: 15_000,
  });

  const { data: matchDetail } = useQuery({
    queryKey: ['stats-match', matchId],
    queryFn: () => matchApi.getMatchById(matchId),
    enabled: !!matchId,
    refetchInterval: poll,
    staleTime: 10_000,
  });

  const selected = useMemo(() => {
    if (!analytics) return null;
    if (scope === 'match') return analytics.match;
    return analytics.bySet?.find((s: any) => s.setNumber === scope) || analytics.match;
  }, [analytics, scope]);

  const progressionData = useMemo(() => {
    if (!analytics?.progression) return [];
    const filtered = scope === 'match'
      ? analytics.progression
      : analytics.progression.filter((p: any) => p.setNumber === scope || p.seq === 0);
    return filtered.map((p: any, idx: number) => ({ ...p, idx: idx + 1, name: p.label || `No. ${idx + 1}` }));
  }, [analytics, scope]);

  const setRows = useMemo(() => {
    const history = (matchDetail as any)?.setHistory || [];
    if (history.length) return history;
    return (analytics?.bySet || []).map((s: any) => ({
      number: s.setNumber,
      scoreA: s.teams.HOME.totalPoints,
      scoreB: s.teams.AWAY.totalPoints,
      winner: s.teams.HOME.totalPoints > s.teams.AWAY.totalPoints ? 'A' : s.teams.AWAY.totalPoints > s.teams.HOME.totalPoints ? 'B' : null,
    }));
  }, [matchDetail, analytics]);

  const setComparisonData = useMemo(() => {
    return (analytics?.bySet || []).map((s: any) => ({
      set: `Set ${s.setNumber}`,
      homePoints: s.teams.HOME.totalPoints,
      awayPoints: s.teams.AWAY.totalPoints,
      homeKills: s.teams.HOME.totalAttackKills,
      awayKills: s.teams.AWAY.totalAttackKills,
    }));
  }, [analytics]);

  const comparisonRows = useMemo(() => {
    const all = selected?.comparison || [];
    return REQUIRED_METRICS.map(key => all.find((m: any) => m.key === key)).filter(Boolean);
  }, [selected]);

  const topPerformers = useMemo(() => {
    const all = [...(selected?.players?.HOME || []), ...(selected?.players?.AWAY || [])];
    return all
      .map((p: any) => ({ ...p, score: (p.points || 0) * 2 + (p.attackKills || 0) + (p.serviceAces || 0) + (p.blocks || 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [selected]);

  const timeline = useMemo(() => [...((matchDetail as any)?.events || [])].reverse().slice(0, 30), [matchDetail]);

  const setQuery = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => { if (v == null || v === '') p.delete(k); else p.set(k, v); });
    setParams(p, { replace: true });
  };

  const showOnScreen = async (scene: 'MATCH_STATS' | 'PLAYER_SPOTLIGHT' | 'SET_BREAK') => {
    if (!matchId) return;
    try {
      await broadcastApi.setScene(matchId, { scene });
      notify.success(`${scene === 'MATCH_STATS' ? 'Team comparison' : scene === 'PLAYER_SPOTLIGHT' ? 'Player spotlight' : 'Set summary'} sent to the output`);
    } catch (e: any) { notify.error(e?.message || 'Could not send graphic'); }
  };

  const downloadCsv = () => {
    if (!selected) return;
    const rows: Array<Array<string | number | null>> = [];
    rows.push(['Match', `${teamFullName(matchDetail, 'HOME')} vs ${teamFullName(matchDetail, 'AWAY')}`]);
    rows.push(['Scope', scope === 'match' ? 'Entire match' : `Set ${scope}`]);
    rows.push([]);
    rows.push(['Team comparison', teamLabel(matchDetail, 'HOME'), teamLabel(matchDetail, 'AWAY'), 'Advantage']);
    (selected.comparison || []).forEach((m: any) => rows.push([m.label, m.home, m.away, m.advantage]));
    (['HOME', 'AWAY'] as const).forEach(side => {
      rows.push([]);
      rows.push([`${teamFullName(matchDetail, side)} players`]);
      rows.push(['Player', 'No', 'PTS', 'K', 'ATT', 'E', 'ATK%', 'A', 'B', 'D', 'AST']);
      (selected.players?.[side] || []).forEach((p: any) => rows.push([
        p.name, p.jerseyNumber ?? '', p.points ?? '', p.attackKills ?? '', p.attackAttempts ?? '', p.attackErrors ?? '',
        p.attackSuccessPct ?? '', p.serviceAces ?? '', p.blocks ?? '', p.digs ?? '', p.assists ?? '',
      ]));
    });
    const csv = rows.map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qwesie-statistics-${scope === 'match' ? 'match' : `set${scope}`}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const header = (
    <PageHeader
      eyebrow="Review"
      title="Statistics"
      description="Match selector, per-set scope, team comparisons and player statistics from recorded events."
    />
  );

  // -------- All matches tab --------
  if (tab === 'all') {
    return (
      <div className="space-y-5">
        {header}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => setQuery({ tab: null })}>Match statistics</Button>
          <Button variant="outline" size="sm" onClick={() => setQuery({ tab: 'all' })}>All matches</Button>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-fg-subtle" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team, date or competition" className="pl-8 w-72" />
            </div>
          </div>
        </div>
        <Card>
          <CardHeader><CardTitle>All matches</CardTitle><span className="text-xs text-fg-subtle">{filteredMatches.length} result(s)</span></CardHeader>
          {matchesLoading ? <div className="py-8 text-center text-sm text-fg-subtle">Loading matches…</div> : filteredMatches.length === 0 ? (
            <div className="py-10 text-center text-sm text-fg-subtle">No matches match “{search}”.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-fg-muted border-b border-border"><th className="text-left py-2 pr-3">Date</th><th className="text-left py-2 px-3">Competition</th><th className="text-left py-2 px-3">Match</th><th className="text-center py-2 px-3">Score</th><th className="text-left py-2 px-3">Status</th><th className="text-right py-2 pl-3"> </th></tr></thead>
                <tbody>
                  {filteredMatches.map((m: any) => {
                    const setsA = m.teams?.A?.sets ?? 0; const setsB = m.teams?.B?.sets ?? 0;
                    return (
                      <tr key={m.id} className="border-b border-border">
                        <td className="py-2 pr-3 text-fg-muted">{m.match_date || (m.scheduledAt ? String(m.scheduledAt).slice(0, 10) : '—')}</td>
                        <td className="py-2 px-3 text-fg-muted">{m.tournament || '—'}</td>
                        <td className="py-2 px-3 text-fg font-medium"><span className="text-fg-muted font-mono text-xs mr-1.5">#{m.match_no || '?'}</span>{teamFullName(m, 'HOME')} vs {teamFullName(m, 'AWAY')}</td>
                        <td className="py-2 px-3 text-center font-mono text-fg">{setsA}-{setsB}</td>
                        <td className="py-2 px-3"><span className={`text-xs px-2 py-0.5 rounded border ${m.status === 'LIVE' ? 'bg-success-subtle text-success border-success/30' : m.status === 'COMPLETED' || m.status === 'FINISHED' ? 'bg-surface-sunken text-fg-muted border-border-strong' : 'bg-teamA/10 text-teamA border-teamA/30'}`}>{m.status}</span></td>
                        <td className="py-2 pl-3 text-right"><Button size="sm" variant="outline" onClick={() => setQuery({ tab: null, match: m.id, scope: 'match' })}>Open</Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    );
  }

  // -------- Single match tab --------
  if (!matchId) {
    return (
      <div className="space-y-5">
        {header}
        <Card>
          <div className="py-10 text-center text-fg-subtle">
            {matchesLoading ? 'Loading matches…' : (<><div className="font-semibold text-fg mb-1">No match data</div><div>Create or play a match to generate analytics.</div><div className="mt-3"><Button variant="outline" size="sm" onClick={() => setQuery({ tab: 'all' })}>Browse all matches</Button></div></>)}
          </div>
        </Card>
      </div>
    );
  }

  const teamA = teamFullName(matchDetail, 'HOME');
  const teamB = teamFullName(matchDetail, 'AWAY');
  const setsA = (matchDetail as any)?.teams?.A?.sets ?? 0;
  const setsB = (matchDetail as any)?.teams?.B?.sets ?? 0;
  const winner = (matchDetail as any)?.winner;
  const status = String((matchDetail as any)?.status || '');

  return (
    <div className="space-y-5">
      {header}

      {/* Selector + tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setQuery({ tab: 'all' })}>All matches</Button>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-fg-subtle" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team, date or competition" className="pl-8 w-64" />
        </div>
        <div className="min-w-[260px] max-w-[380px] flex-1">
          <Select value={matchId} onChange={e => setQuery({ match: e.target.value, scope: 'match' })}>
            {filteredMatches.length === 0 && <option value={matchId}>No matches in filter</option>}
            {filteredMatches.map((m: any) => (
              <option key={m.id} value={m.id}>
                #{m.match_no || '?'} · {teamFullName(m, 'HOME')} vs {teamFullName(m, 'AWAY')} · {m.status} · {m.match_date || (m.scheduledAt ? String(m.scheduledAt).slice(0, 10) : '—')}
              </option>
            ))}
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={downloadCsv} disabled={!selected}><Download className="w-4 h-4" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!selected}><Printer className="w-4 h-4" />PDF</Button>
        </div>
      </div>

      {/* Scoreline */}
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[240px]">
            <div className="text-xs uppercase tracking-wide text-fg-subtle">{status || '—'} · {scope === 'match' ? 'Entire match' : `Set ${scope}`}</div>
            <div className="text-xl font-bold text-fg mt-1">{teamA} <span className="text-fg-subtle">vs</span> {teamB}</div>
            <div className="text-xs text-fg-subtle mt-1">{(matchDetail as any)?.tournament || '—'} · Court {(matchDetail as any)?.court || '—'} · {(matchDetail as any)?.match_date || '—'}</div>
          </div>
          <div className="text-center px-4">
            <div className="text-5xl font-extrabold tabular-nums text-fg">{setsA} <span className="text-fg-muted">-</span> {setsB}</div>
            <div className="text-xs text-fg-subtle mt-1">{winner ? `${teamFullName(matchDetail, winner === 'A' ? 'HOME' : 'AWAY')} won` : 'Sets'}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => showOnScreen('SET_BREAK')}><Tv className="w-4 h-4" />Set summary</Button>
            <Button variant="outline" size="sm" onClick={() => showOnScreen('MATCH_STATS')}><BarChart3 className="w-4 h-4" />Team comparison</Button>
            <Button variant="outline" size="sm" onClick={() => showOnScreen('PLAYER_SPOTLIGHT')}><Trophy className="w-4 h-4" />Player spotlight</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border">
          <span className="text-xs uppercase tracking-wide text-fg-subtle mr-1">Scope</span>
          <button onClick={() => setQuery({ scope: 'match' })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${scope === 'match' ? 'bg-info text-info-fg border-info' : 'bg-surface border-border-strong text-fg-muted hover:text-fg'}`}>Match</button>
          {(analytics?.bySet || []).map((s: any) => (
            <button key={s.setNumber} onClick={() => setQuery({ scope: `set${s.setNumber}` })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${scope === s.setNumber ? 'bg-info text-info-fg border-info' : 'bg-surface border-border-strong text-fg-muted hover:text-fg'}`}>Set {s.setNumber}</button>
          ))}
        </div>
      </Card>

      {isLoading && <Card><div className="py-10 animate-pulse space-y-3"><div className="h-4 w-56 bg-surface-alt rounded mx-auto" /><div className="h-48 bg-surface-alt rounded-[10px] border border-border" /></div></Card>}
      {error && <Card><div className="py-10 text-center text-danger">Failed to load analytics. <button className="underline ml-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded" onClick={() => window.location.reload()}>Retry</button></div></Card>}

      {!isLoading && !error && !selected && (
        <Card><div className="py-10 text-center text-sm text-fg-subtle">No statistics recorded for this match/scope yet.</div></Card>
      )}

      {selected && analytics && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
          {/* Set-by-set table */}
          <Card>
            <CardHeader><CardTitle>Set-by-set scoreline</CardTitle><BarChart3 className="w-4 h-4 text-info" /></CardHeader>
            {setRows.length === 0 ? <div className="text-sm text-fg-subtle py-6">No sets recorded.</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-fg-muted border-b border-border"><th className="text-left py-2 pr-3">Set</th><th className="text-right py-2 px-3">{teamLabel(matchDetail, 'HOME')}</th><th className="text-right py-2 px-3">{teamLabel(matchDetail, 'AWAY')}</th><th className="text-left py-2 pl-3">Winner</th></tr></thead>
                  <tbody>
                    {setRows.map((s: any) => (
                      <tr key={s.number} className="border-b border-border">
                        <td className="py-2 pr-3 text-fg">Set {s.number}</td>
                        <td className={`py-2 px-3 text-right font-mono ${s.scoreA > s.scoreB ? 'text-info font-bold' : 'text-fg-muted'}`}>{s.scoreA}</td>
                        <td className={`py-2 px-3 text-right font-mono ${s.scoreB > s.scoreA ? 'text-teamB font-bold' : 'text-fg-muted'}`}>{s.scoreB}</td>
                        <td className="py-2 pl-3 text-fg-muted">{s.winner ? teamLabel(matchDetail, s.winner === 'A' ? 'HOME' : 'AWAY') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Team comparison bars */}
            <Card>
              <CardHeader><CardTitle>Team comparison</CardTitle><span className="text-xs text-fg-subtle">{scope === 'match' ? 'Entire match' : `Set ${scope}`}</span></CardHeader>
              <div className="space-y-3">
                {comparisonRows.map((m: any) => {
                  const home = m.home ?? 0; const away = m.away ?? 0;
                  const max = Math.max(Math.abs(home), Math.abs(away), 1);
                  return (
                    <div key={m.key}>
                      <div className="flex items-center justify-between text-xs text-fg-muted mb-1">
                        <span className="font-mono text-info">{pctText(m.key, m.home)}</span>
                        <span>{m.label}</span>
                        <span className="font-mono text-teamB">{pctText(m.key, m.away)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2.5 rounded bg-surface-alt overflow-hidden flex justify-end"><div className="h-full bg-teamA" style={{ width: `${(Math.abs(home) / max) * 100}%` }} /></div>
                        <div className="flex-1 h-2.5 rounded bg-surface-alt overflow-hidden"><div className="h-full bg-teamB" style={{ width: `${(Math.abs(away) / max) * 100}%` }} /></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Momentum */}
            <Card>
              <CardHeader><CardTitle>Momentum</CardTitle><TrendingUp className="w-4 h-4 text-info" /></CardHeader>
              {progressionData.length === 0 ? <div className="text-sm text-fg-subtle py-8">No scoring progression recorded.</div> : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={progressionData}>
                      <CartesianGrid stroke="var(--app-chart-grid)" strokeDasharray="3 3" />
                      <XAxis dataKey="idx" stroke="var(--app-chart-axis)" tick={{ fontSize: 11 }} />
                      <YAxis stroke="var(--app-chart-axis)" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "var(--app-surface-raised)", border: "1px solid var(--app-border)", borderRadius: 8, color: "var(--app-foreground)" }} />
                      <Legend />
                      <Line type="stepAfter" dataKey="homePoints" name={teamLabel(matchDetail, 'HOME')} stroke="var(--app-team-a)" strokeWidth={2} dot={false} />
                      <Line type="stepAfter" dataKey="awayPoints" name={teamLabel(matchDetail, 'AWAY')} stroke="var(--app-team-b)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Set comparisons */}
            <Card>
              <CardHeader><CardTitle>Points by set</CardTitle><BarChart3 className="w-4 h-4 text-info" /></CardHeader>
              {setComparisonData.length === 0 ? <div className="text-sm text-fg-subtle py-8">No sets recorded.</div> : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={setComparisonData}>
                      <CartesianGrid stroke="var(--app-chart-grid)" strokeDasharray="3 3" />
                      <XAxis dataKey="set" stroke="var(--app-chart-axis)" tick={{ fontSize: 11 }} />
                      <YAxis stroke="var(--app-chart-axis)" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "var(--app-surface-raised)", border: "1px solid var(--app-border)", borderRadius: 8, color: "var(--app-foreground)" }} />
                      <Legend />
                      <Bar dataKey="homePoints" name={teamLabel(matchDetail, 'HOME')} fill="var(--app-team-a)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="awayPoints" name={teamLabel(matchDetail, 'AWAY')} fill="var(--app-team-b)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Top performers */}
            <Card>
              <CardHeader><CardTitle>Top performers</CardTitle><Trophy className="w-4 h-4 text-warning" /></CardHeader>
              {topPerformers.length === 0 ? <div className="text-sm text-fg-subtle py-8">No player-attributed statistics for this scope.</div> : (
                <div className="space-y-2">
                  {topPerformers.map((p: any, i: number) => (
                    <div key={p.playerId || p.name} className="flex items-center gap-3 rounded-lg border border-border bg-surface-subtle/30 p-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${i === 0 ? 'bg-warning-subtle text-warning' : 'bg-surface-sunken text-fg-muted'}`}>{i + 1}</div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-fg truncate">{p.jerseyNumber != null ? `No. ${p.jerseyNumber} ` : ''}{p.name}</div>
                        <div className="text-xs text-fg-subtle">{p.side === 'HOME' ? teamLabel(matchDetail, 'HOME') : teamLabel(matchDetail, 'AWAY')}</div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="font-mono text-fg">{p.points ?? 0} PTS</div>
                        <div className="text-xs text-fg-subtle">{p.attackKills ?? 0}K · {p.serviceAces ?? 0}A · {p.blocks ?? 0}B</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Player tables */}
          <Card>
            <CardHeader><CardTitle>Player statistics (sortable)</CardTitle><Users className="w-4 h-4 text-info" /></CardHeader>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <PlayerTable players={selected.players?.HOME || []} title={teamFullName(matchDetail, 'HOME')} accent="var(--app-team-a)" />
              <PlayerTable players={selected.players?.AWAY || []} title={teamFullName(matchDetail, 'AWAY')} accent="var(--app-team-b)" />
            </div>
          </Card>

          {/* Event timeline */}
          <Card>
            <CardHeader><CardTitle>Event timeline</CardTitle><Zap className="w-4 h-4 text-warning" /></CardHeader>
            {timeline.length === 0 ? <div className="text-sm text-fg-subtle py-6">No events recorded.</div> : (
              <div className="max-h-80 overflow-auto pr-1 space-y-1.5">
                {timeline.map((e: any) => (
                  <div key={e.id || e.seq} className="flex items-center gap-3 text-sm rounded border border-border px-3 py-1.5">
                    <span className="font-mono text-xs text-fg-subtle w-20 shrink-0">{e.time || `Seq ${e.seq}`}</span>
                    <span className={`text-xs px-2 py-0.5 rounded border ${e.team === 'A' ? 'bg-teamA/10 text-teamA border-teamA/30' : e.team === 'B' ? 'bg-teamB/10 text-teamB border-teamB/30' : 'bg-surface-sunken text-fg-muted border-border-strong'}`}>{e.team ? teamLabel(matchDetail, e.team === 'A' ? 'HOME' : 'AWAY') : 'Match'}</span>
                    <span className="text-fg">{String(e.action || '').replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Formulas */}
          <Card>
            <CardHeader><CardTitle>Documented statistical formulas</CardTitle></CardHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {Object.entries(analytics.formulas || {}).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border bg-surface-subtle/30 p-3"><div className="text-xs uppercase tracking-wide text-fg-subtle font-bold mb-1">{k}</div><div className="font-mono text-fg text-xs">{String(v)}</div></div>
              ))}
            </div>
            <p className="text-xs text-fg-subtle mt-3">Statistics are derived from recorded events and recalculated from the event stream (correction/reversal aware). Rates with unavailable denominators are shown as —.</p>
          </Card>
        </motion.div>
      )}
    </div>
  );
};

export default StatisticsPage;
