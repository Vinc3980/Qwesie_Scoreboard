import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, BarChart, Bar } from 'recharts';
import { FileText, Download, TrendingUp, Users, Trophy, Filter } from 'lucide-react';
import { matchApi } from '../services/api.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Input, Label } from '../components/ui/Input.js';

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export const ReportsPage: React.FC = () => {
  const [team, setTeam] = useState('');
  const [tournament, setTournament] = useState('');
  const [competition, setCompetition] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [player, setPlayer] = useState('');
  const [applied, setApplied] = useState({ team: '', tournament: '', competition: '', dateFrom: '', dateTo: '', player: '' });

  const { data: history, isLoading, error } = useQuery({
    queryKey: ['history-analytics', applied],
    queryFn: () => matchApi.getHistoricalAnalytics(applied),
  });
  const { data: matches = [] } = useQuery({ queryKey: ['matches'], queryFn: matchApi.listMatches });

  const teamTrend = useMemo(() => (history?.trends || []).slice(-20).map((t: any, i: number) => ({ i: i + 1, date: t.date, points: t.totalPoints, kills: t.totalKills, aces: t.totalAces, blocks: t.totalBlocks, digs: t.totalDigs, eff: t.attackEfficiency ?? 0 })), [history]);

  const exportHistoryCsv = () => {
    if (!history) return;
    const rows: string[][] = [];
    rows.push(['Historical Analytics Summary']);
    rows.push(['Completed Matches', String(history.summary?.completedMatches ?? 0)]);
    rows.push([]);
    rows.push(['Team Performance']);
    rows.push(['Team','Matches','Wins','Losses','Win Rate %','Sets Won','Sets Lost','Points','Kills','Errors','Aces','Blocks','Digs','Assists','Attack Eff','Pts/Match']);
    (history.teamPerformance || []).forEach((t: any) => rows.push([t.team,t.matches,t.wins,t.losses,t.winRate ?? '',t.setsWon,t.setsLost,t.points,t.kills,t.errors,t.aces,t.blocks,t.digs,t.assists,t.attackEfficiency ?? '',t.pointsPerMatch]));
    rows.push([]);
    rows.push(['Player Performance']);
    rows.push(['Player','Matches','Points','Kills','Errors','Aces','Blocks','Digs','Assists','Attack Eff','Pts/Match']);
    (history.playerPerformance || []).forEach((p: any) => rows.push([p.player,p.matches,p.points,p.kills,p.errors,p.aces,p.blocks,p.digs,p.assists,p.attackEfficiency ?? '',p.pointsPerMatch]));
    rows.push([]);
    rows.push(['Tournament Statistics']);
    rows.push(['Tournament','Matches','Total Sets','Total Points']);
    (history.tournamentStatistics || []).forEach((t: any) => rows.push([t.tournament,t.matches,t.totalSets,t.totalPoints]));
    downloadCsv('qwesie-historical-analytics.csv', rows);
  };

  const exportMatchesCsv = () => {
    const rows: string[][] = [['Match #','Date','Tournament','Competition','Home','Away','Home Sets','Away Sets','Winner','Status']];
    matches.forEach((m: any) => rows.push([m.match_no, m.match_date, m.tournament, m.competition || '', m.teams.A.name, m.teams.B.name, m.teams.A.sets, m.teams.B.sets, m.winner ? m.teams[m.winner].name : '', m.status]));
    downloadCsv('qwesie-matches-summary.csv', rows);
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Review" title="Reports" description="Historical performance, trends, and exports." actions={<div className="flex gap-2 flex-wrap"><Button variant="outline" onClick={exportMatchesCsv}><Download className="w-4 h-4" /> Matches CSV</Button><Button variant="outline" onClick={exportHistoryCsv} disabled={!history}><Download className="w-4 h-4" /> History CSV</Button></div>} />

      <Card>
        <CardHeader><CardTitle>Filters</CardTitle><Filter className="w-4 h-4 text-fg-muted" /></CardHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div><Label>Tournament</Label><Input value={tournament} onChange={e=>setTournament(e.target.value)} placeholder="Filter tournament" /></div>
          <div><Label>Competition</Label><Input value={competition} onChange={e=>setCompetition(e.target.value)} placeholder="Filter competition" /></div>
          <div><Label>Team</Label><Input value={team} onChange={e=>setTeam(e.target.value)} placeholder="Filter team" /></div>
          <div><Label>Player</Label><Input value={player} onChange={e=>setPlayer(e.target.value)} placeholder="Filter player" /></div>
          <div><Label>Date from</Label><Input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} /></div>
          <div><Label>Date to</Label><Input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} /></div>
        </div>
        <div className="mt-3 flex gap-2"><Button variant="primary" onClick={()=>setApplied({ team, tournament, competition, dateFrom, dateTo, player })}>Apply Filters</Button><Button variant="outline" onClick={()=>{ setTeam(''); setTournament(''); setCompetition(''); setDateFrom(''); setDateTo(''); setPlayer(''); setApplied({ team:'', tournament:'', competition:'', dateFrom:'', dateTo:'', player:'' }); }}>Reset</Button><Button variant="secondary" onClick={()=>window.print()}><FileText className="w-4 h-4" /> Printable / PDF</Button></div>
      </Card>

      {isLoading && <Card><div className="py-10 animate-pulse space-y-3"><div className="h-4 w-48 bg-surface-alt rounded mx-auto" /><div className="h-40 bg-surface-alt rounded-[10px] border border-border" /></div></Card>}
      {error && <Card><div className="py-10 text-center text-danger">Failed to load historical analytics.</div></Card>}

      {history && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><div className="text-xs text-fg-subtle">Completed Matches</div><div className="text-3xl font-black text-fg mt-1">{history.summary?.completedMatches ?? 0}</div></Card>
            <Card><div className="text-xs text-fg-subtle">Teams</div><div className="text-3xl font-black text-fg mt-1">{history.summary?.teams ?? 0}</div></Card>
            <Card><div className="text-xs text-fg-subtle">Players</div><div className="text-3xl font-black text-fg mt-1">{history.summary?.players ?? 0}</div></Card>
            <Card><div className="text-xs text-fg-subtle">Tournaments</div><div className="text-3xl font-black text-fg mt-1">{history.summary?.tournaments ?? 0}</div></Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Scoring & Performance Trends</CardTitle><TrendingUp className="w-4 h-4 text-info" /></CardHeader>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={teamTrend}>
                    <CartesianGrid stroke="var(--app-chart-grid)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="var(--app-chart-axis)" tick={{ fontSize: 10 }} />
                    <YAxis stroke="var(--app-chart-axis)" tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "var(--app-surface-raised)", border: "1px solid var(--app-border)", borderRadius: 8, color: "var(--app-foreground)" }} />
                    <Legend />
                    <Line type="monotone" dataKey="points" stroke="var(--app-team-a)" strokeWidth={2} dot={false} name="Points" />
                    <Line type="monotone" dataKey="kills" stroke="var(--app-team-b)" strokeWidth={2} dot={false} name="Kills" />
                    <Line type="monotone" dataKey="aces" stroke="var(--app-accent)" strokeWidth={2} dot={false} name="Aces" />
                    <Line type="monotone" dataKey="blocks" stroke="var(--app-success)" strokeWidth={2} dot={false} name="Blocks" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardHeader><CardTitle>Attack Efficiency Trend</CardTitle><TrendingUp className="w-4 h-4 text-success" /></CardHeader>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={teamTrend}>
                    <CartesianGrid stroke="var(--app-chart-grid)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="var(--app-chart-axis)" tick={{ fontSize: 10 }} />
                    <YAxis stroke="var(--app-chart-axis)" tick={{ fontSize: 11 }} domain={[-1, 1]} />
                    <Tooltip contentStyle={{ background: "var(--app-surface-raised)", border: "1px solid var(--app-border)", borderRadius: 8, color: "var(--app-foreground)" }} />
                    <Legend />
                    <Bar dataKey="eff" name="Attack Efficiency" fill="var(--app-success)" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Team Performance (multiple matches)</CardTitle><Trophy className="w-4 h-4 text-warning" /></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-fg-muted border-b border-border"><th className="text-left py-2">Team</th><th className="text-right py-2">M</th><th className="text-right py-2">W</th><th className="text-right py-2">L</th><th className="text-right py-2">Win %</th><th className="text-right py-2">Sets</th><th className="text-right py-2">Pts/M</th><th className="text-right py-2">Kills</th><th className="text-right py-2">Aces</th><th className="text-right py-2">Blocks</th><th className="text-right py-2">Digs</th><th className="text-right py-2">Atk Eff</th></tr></thead>
                <tbody>
                  {(history.teamPerformance || []).map((t: any) => (
                    <tr key={t.team} className="border-b border-border"><td className="py-2.5 font-semibold text-fg">{t.team}</td><td className="text-right font-mono">{t.matches}</td><td className="text-right font-mono text-success">{t.wins}</td><td className="text-right font-mono text-danger">{t.losses}</td><td className="text-right font-mono">{t.winRate ?? '—'}%</td><td className="text-right font-mono">{t.setsWon}-{t.setsLost}</td><td className="text-right font-mono">{t.pointsPerMatch}</td><td className="text-right font-mono">{t.kills}</td><td className="text-right font-mono">{t.aces}</td><td className="text-right font-mono">{t.blocks}</td><td className="text-right font-mono">{t.digs}</td><td className="text-right font-mono">{t.attackEfficiency ?? '—'}</td></tr>
                  ))}
                  {(history.teamPerformance || []).length === 0 && <tr><td colSpan={12} className="py-8 text-center text-fg-subtle">No completed team performance data for selected filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader><CardTitle>Player Performance (multiple matches)</CardTitle><Users className="w-4 h-4 text-info" /></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-fg-muted border-b border-border"><th className="text-left py-2">Player</th><th className="text-right py-2">M</th><th className="text-right py-2">Pts</th><th className="text-right py-2">Pts/M</th><th className="text-right py-2">Kills</th><th className="text-right py-2">Aces</th><th className="text-right py-2">Blocks</th><th className="text-right py-2">Digs</th><th className="text-right py-2">Assists</th><th className="text-right py-2">Atk Eff</th></tr></thead>
                <tbody>
                  {(history.playerPerformance || []).slice(0, 30).map((p: any) => (
                    <tr key={p.player} className="border-b border-border"><td className="py-2.5 font-semibold text-fg">{p.player}</td><td className="text-right font-mono">{p.matches}</td><td className="text-right font-mono">{p.points}</td><td className="text-right font-mono">{p.pointsPerMatch}</td><td className="text-right font-mono">{p.kills}</td><td className="text-right font-mono">{p.aces}</td><td className="text-right font-mono">{p.blocks}</td><td className="text-right font-mono">{p.digs}</td><td className="text-right font-mono">{p.assists}</td><td className="text-right font-mono">{p.attackEfficiency ?? '—'}</td></tr>
                  ))}
                  {(history.playerPerformance || []).length === 0 && <tr><td colSpan={10} className="py-8 text-center text-fg-subtle">No player-attributed statistics for selected filters. (Player stats require player-attributed recorded events.)</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader><CardTitle>Tournament Statistics</CardTitle><Trophy className="w-4 h-4 text-info" /></CardHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(history.tournamentStatistics || []).map((t: any) => (
                <div key={t.tournament} className="rounded-xl border border-border p-4 bg-surface-subtle/30"><div className="font-bold text-fg">{t.tournament}</div><div className="text-sm text-fg-muted mt-1">Matches: <span className="text-fg font-mono">{t.matches}</span></div><div className="text-sm text-fg-muted">Total Sets: <span className="text-fg font-mono">{t.totalSets}</span></div><div className="text-sm text-fg-muted">Total Points: <span className="text-fg font-mono">{t.totalPoints}</span></div></div>
              ))}
              {(history.tournamentStatistics || []).length === 0 && <div className="text-sm text-fg-subtle py-6">No tournament statistics for selected filters.</div>}
            </div>
            <div className="mt-4 text-xs text-fg-subtle">Data integrity: completed matches are retained and historical aggregates are computed from recorded match data; event corrections are auditable in match records.</div>
          </Card>
        </>
      )}
    </div>
  );
};