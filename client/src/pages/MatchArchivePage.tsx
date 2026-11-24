import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, Search, Filter, FileText, Calendar, Trophy, Building2 } from 'lucide-react';
import { matchApi } from '../services/api.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Badge } from '../components/ui/Badge.js';
import { Input, Label, Select } from '../components/ui/Input.js';

export const MatchArchivePage: React.FC = () => {
  const { data: matches = [], isLoading } = useQuery({ queryKey: ['matches'], queryFn: matchApi.listMatches, refetchInterval: 15000 });
  const [search, setSearch] = useState('');
  const [team, setTeam] = useState('');
  const [tournament, setTournament] = useState('');
  const [competition, setCompetition] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const completed = useMemo(() => matches.filter(m => m.status === 'FINISHED'), [matches]);

  const teamOptions = useMemo(() => Array.from(new Set(completed.flatMap(m => [m.teams.A.name, m.teams.B.name]).filter(Boolean))).sort(), [completed]);
  const tournamentOptions = useMemo(() => Array.from(new Set(completed.map(m => m.tournament).filter(Boolean))).sort(), [completed]);
  const competitionOptions = useMemo(() => Array.from(new Set(completed.map((m: any) => m.competition || '').filter(Boolean))).sort(), [completed]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return completed.filter(m => {
      const date = m.match_date || '';
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;
      if (tournament && m.tournament !== tournament) return false;
      if (competition && (m as any).competition !== competition) return false;
      if (team && !(m.teams.A.name === team || m.teams.B.name === team)) return false;
      if (q) {
        const hay = `${m.match_no} ${m.teams.A.name} ${m.teams.B.name} ${m.tournament} ${(m as any).competition || ''} ${m.court || ''} ${m.winner ? m.teams[m.winner]?.name : ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [completed, search, team, tournament, competition, dateFrom, dateTo]);

  const { data: report, isLoading: reportLoading, error: reportError } = useQuery({
    queryKey: ['match-report', selectedId],
    queryFn: () => matchApi.getMatchReport(selectedId!),
    enabled: !!selectedId,
  });

  const openPrintable = () => {
    if (!selectedId) return;
    // open same page hash-less? easiest: open a new window with inline printable content by cloning report area is complex;
    // use browser print on current page with a print-focused view rendered below.
    window.print();
  };

  const downloadCsv = () => {
    if (!report) return;
    const rows: string[][] = [];
    rows.push(['Match Report']);
    rows.push(['Match', `${report.teams.HOME.name} vs ${report.teams.AWAY.name}`]);
    rows.push(['Tournament', report.match.tournament || '']);
    rows.push(['Competition', report.match.competition || '']);
    rows.push(['Date', report.match.matchDate || '']);
    rows.push(['Final Score (Sets)', `${report.finalScore.homeSets}-${report.finalScore.awaySets}`]);
    rows.push(['Winner', report.match.winningTeam || '']);
    rows.push(['Duration (min)', report.match.durationMinutes != null ? String(report.match.durationMinutes) : '']);
    rows.push([]);
    rows.push(['Set Results']);
    rows.push(['Set', 'Home', 'Away', 'Winner']);
    (report.setResults || []).forEach((s: any) => rows.push([String(s.setNumber), String(s.homePoints), String(s.awayPoints), s.winnerSide || '']));
    rows.push([]);
    rows.push(['Team Statistics']);
    rows.push(['Metric', report.teams.HOME.name, report.teams.AWAY.name]);
    const tsH = report.teamStatistics?.HOME || {}, tsA = report.teamStatistics?.AWAY || {};
    [['Points','points'],['Kills','kills'],['Errors','errors'],['Aces','aces'],['Blocks','blocks'],['Digs','digs'],['Assists','assists'],['Timeouts Used','timeoutsUsed'],['Substitutions Used','substitutionsUsed']].forEach(([label,key]) => rows.push([label, String(tsH[key] ?? ''), String(tsA[key] ?? '')]));
    rows.push([]);
    rows.push(['Player Statistics']);
    rows.push(['Player','Side','Points','Kills','Errors','Aces','Blocks','Digs','Assists','Receptions']);
    (report.playerStatistics || []).forEach((p: any) => rows.push([p.name, p.side, p.points, p.kills, p.errors, p.aces, p.blocks, p.digs, p.assists, p.receptions]));
    rows.push([]);
    rows.push(['Events']);
    rows.push(['Seq','Time','Set','Team','Type','Correction','Reversal','Payload']);
    (report.events || []).forEach((e: any) => rows.push([String(e.sequenceNumber), e.eventTimestamp, '', e.teamSide || '', e.type, String(!!e.isCorrection), String(!!e.isReversal), JSON.stringify(e.payload || {})]));
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `match-report-${report.match.id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    // Browser print-to-PDF friendly export (printable report view)
    window.print();
  };

  return (
    <div className="space-y-6 print:space-y-3">
      <div className="print:hidden">
        <PageHeader eyebrow="Review" title="Match Archive" description="Completed matches, records, and exports." />
      </div>

      <Card className="print:hidden">
        <CardHeader><CardTitle>Search & filters</CardTitle><Filter className="w-4 h-4 text-fg-muted" /></CardHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2"><Label>Search</Label><div className="relative"><Search className="w-4 h-4 text-fg-subtle absolute left-3 top-1/2 -translate-y-1/2" /><Input className="pl-9" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Team, match #, tournament, court, winner" /></div></div>
          <div><Label>Team</Label><Select value={team} onChange={e=>setTeam(e.target.value)}><option value="">All teams</option>{teamOptions.map(t => <option key={t} value={t}>{t}</option>)}</Select></div>
          <div><Label>Tournament</Label><Select value={tournament} onChange={e=>setTournament(e.target.value)}><option value="">All tournaments</option>{tournamentOptions.map(t => <option key={t} value={t}>{t}</option>)}</Select></div>
          <div><Label>Competition</Label><Select value={competition} onChange={e=>setCompetition(e.target.value)}><option value="">All competitions</option>{competitionOptions.map(t => <option key={t} value={t}>{t}</option>)}</Select></div>
          <div className="grid grid-cols-2 gap-2 lg:col-span-1 md:col-span-3">
            <div><Label>Date from</Label><Input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} /></div>
            <div><Label>Date to</Label><Input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} /></div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
        <Card className="print:hidden">
          <CardHeader><CardTitle>Completed Matches ({filtered.length})</CardTitle><Archive className="w-4 h-4 text-fg-muted" /></CardHeader>
          <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
            {isLoading && <div className="space-y-2 animate-pulse">{[0,1,2,3].map(i => <div key={i} className="h-20 rounded-[14px] border border-border bg-surface-sunken" />)}</div>}
            {!isLoading && filtered.length === 0 && <div className="text-sm text-fg-subtle py-10 text-center border border-dashed border-border rounded-[14px]"><div className="font-semibold text-fg mb-1">No completed matches</div><div>Adjust filters or complete a match to see it here.</div></div>}
            {filtered.map(m => (
              <button key={m.id} onClick={() => setSelectedId(m.id)} className={`w-full text-left rounded-xl border p-3 transition ${selectedId===m.id ? 'border-info/40 bg-info/10' : 'border-border bg-surface-subtle/30 hover:bg-surface/[0.03]'}`}>
                <div className="flex items-center gap-2 mb-1"><Badge variant="finished">Completed</Badge><span className="text-xs text-fg-subtle">#{m.match_no} • {m.match_date}</span></div>
                <div className="font-bold text-fg">{m.teams.A.name} vs {m.teams.B.name}</div>
                <div className="text-xs text-fg-muted mt-0.5">Final {m.teams.A.sets}-{m.teams.B.sets} • Winner: {m.winner ? m.teams[m.winner].name : '—'}</div>
                <div className="text-xs text-fg-subtle mt-1 flex items-center gap-2 flex-wrap"><span className="inline-flex items-center gap-1"><Trophy className="w-3 h-3" />{m.tournament}</span>{(m as any).competition ? <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{(m as any).competition}</span> : null}</div>
              </button>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          {!selectedId && <Card className="print:hidden"><div className="py-14 text-center text-fg-muted"><FileText className="w-8 h-8 mx-auto mb-3 text-fg-subtle" />Select a completed match to open its full record and report.</div></Card>}
          {selectedId && reportLoading && <Card><div className="py-10 text-center text-fg-muted">Loading match report...</div></Card>}
          {selectedId && reportError && <Card><div className="py-10 text-center text-danger">Failed to load match report.</div></Card>}
          {report && (
            <Card className="print:shadow-none print:border-0 print:bg-surface print:text-black">
              <div className="flex items-start justify-between gap-3 flex-wrap print:block">
                <div>
                  <div className="text-xs uppercase tracking-wider text-fg-muted print:text-fg-muted font-bold mb-1">Match Report</div>
                  <h2 className="text-2xl font-black text-fg print:text-black">{report.teams.HOME.name} vs {report.teams.AWAY.name}</h2>
                  <div className="text-sm text-fg-muted print:text-fg mt-1">{report.match.tournament}{report.match.competition ? ` • ${report.match.competition}` : ''} • {report.match.matchDate} • {report.match.court || 'Court'}</div>
                </div>
                <div className="flex flex-wrap gap-2 print:hidden">
                  <Button variant="outline" size="sm" onClick={downloadCsv}>Export CSV</Button>
                  <Button variant="outline" size="sm" onClick={downloadPdf}>Export PDF</Button>
                  <Button variant="secondary" size="sm" onClick={openPrintable}>Printable Summary</Button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                <div className="rounded-lg border border-border p-3 print:border-border"><div className="text-xs text-fg-subtle">Final Score</div><div className="text-2xl font-black text-fg print:text-black">{report.finalScore.homeSets} - {report.finalScore.awaySets}</div></div>
                <div className="rounded-lg border border-border p-3 print:border-border"><div className="text-xs text-fg-subtle">Winning Team</div><div className="text-lg font-bold text-success print:text-success">{report.match.winningTeam || '—'}</div></div>
                <div className="rounded-lg border border-border p-3 print:border-border"><div className="text-xs text-fg-subtle">Match Duration</div><div className="text-lg font-bold text-fg print:text-black">{report.match.durationMinutes != null ? `${report.match.durationMinutes} min` : '—'}</div></div>
                <div className="rounded-lg border border-border p-3 print:border-border"><div className="text-xs text-fg-subtle">Status</div><div className="text-lg font-bold text-fg print:text-black">{report.match.status}</div></div>
              </div>

              <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div>
                  <h3 className="text-sm font-bold text-fg print:text-black mb-2">Set-by-Set Results</h3>
                  <div className="space-y-2">
                    {(report.setResults || []).map((s: any) => (
                      <div key={s.setNumber} className="rounded-lg border border-border p-2.5 flex items-center justify-between print:border-border"><span className="text-sm text-fg-muted print:text-fg">Set {s.setNumber}</span><span className="font-mono font-bold text-fg print:text-black">{s.homePoints} - {s.awayPoints}</span><span className="text-xs text-fg-subtle">{s.winnerSide || s.status}</span></div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-fg print:text-black mb-2">Team Statistics</h3>
                  <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-fg-muted print:text-fg-muted border-b border-border"><th className="text-left py-1.5">Metric</th><th className="text-right py-1.5">{report.teams.HOME.name}</th><th className="text-right py-1.5">{report.teams.AWAY.name}</th></tr></thead><tbody>
                    {([['Points','points'],['Kills','kills'],['Errors','errors'],['Aces','aces'],['Blocks','blocks'],['Digs','digs'],['Assists','assists'],['Timeouts Used','timeoutsUsed'],['Substitutions Used','substitutionsUsed']] as const).map(([label,key]) => (
                      <tr key={key} className="border-b border-border"><td className="py-1.5 text-fg-muted print:text-fg">{label}</td><td className="py-1.5 text-right font-mono">{report.teamStatistics?.HOME?.[key] ?? 0}</td><td className="py-1.5 text-right font-mono">{report.teamStatistics?.AWAY?.[key] ?? 0}</td></tr>
                    ))}
                  </tbody></table></div>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-bold text-fg print:text-black mb-2">Player Statistics</h3>
                {(report.playerStatistics || []).length === 0 ? <div className="text-sm text-fg-subtle">No player-attributed statistics recorded for this match. Team/event statistics are available above.</div> : (
                  <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-fg-muted print:text-fg-muted border-b border-border"><th className="text-left py-1.5">Player</th><th className="text-left py-1.5">Side</th><th className="text-right">Pts</th><th className="text-right">K</th><th className="text-right">E</th><th className="text-right">Ace</th><th className="text-right">Blk</th><th className="text-right">Dig</th><th className="text-right">Ast</th><th className="text-right">Rec</th></tr></thead><tbody>
                    {report.playerStatistics.map((p: any) => (<tr key={p.id} className="border-b border-border"><td className="py-1.5 text-fg print:text-black">{p.name}</td><td className="py-1.5 text-fg-muted">{p.side}</td><td className="text-right font-mono">{p.points}</td><td className="text-right font-mono">{p.kills}</td><td className="text-right font-mono">{p.errors}</td><td className="text-right font-mono">{p.aces}</td><td className="text-right font-mono">{p.blocks}</td><td className="text-right font-mono">{p.digs}</td><td className="text-right font-mono">{p.assists}</td><td className="text-right font-mono">{p.receptions}</td></tr>))}
                  </tbody></table></div>
                )}
              </div>

              <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div>
                  <h3 className="text-sm font-bold text-fg print:text-black mb-2">Timeouts</h3>
                  {(report.timeouts || []).length === 0 ? <div className="text-sm text-fg-subtle">No timeouts recorded.</div> : <div className="space-y-1.5 text-sm">{report.timeouts.map((t: any) => <div key={t.id} className="rounded border border-border px-2.5 py-1.5 flex justify-between print:border-border"><span>Set {t.setNumber} • {t.side === 'HOME' ? report.teams.HOME.name : report.teams.AWAY.name} (#{t.timeoutNumber})</span><span className="text-fg-subtle">{new Date(t.calledAt).toLocaleTimeString()}</span></div>)}</div>}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-fg print:text-black mb-2">Substitutions</h3>
                  {(report.substitutions || []).length === 0 ? <div className="text-sm text-fg-subtle">No substitutions recorded.</div> : <div className="space-y-1.5 text-sm">{report.substitutions.map((s: any) => <div key={s.id} className="rounded border border-border px-2.5 py-1.5 print:border-border">Set {s.setNumber} • {s.side === 'HOME' ? report.teams.HOME.name : report.teams.AWAY.name} • Out {s.playerOutName || s.playerOutJersey || '—'} / In {s.playerInName || s.playerInJersey || '—'}</div>)}</div>}
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-bold text-fg print:text-black mb-2">Match Events ({(report.events||[]).length})</h3>
                <div className="max-h-72 overflow-auto rounded border border-border print:max-h-none">
                  <table className="w-full text-xs"><thead className="sticky top-0 bg-background print:bg-surface"><tr className="text-fg-muted print:text-fg-muted border-b border-border"><th className="text-left p-2">#</th><th className="text-left p-2">Time</th><th className="text-left p-2">Team</th><th className="text-left p-2">Type</th><th className="text-left p-2">Flags</th></tr></thead><tbody>
                    {(report.events || []).slice().reverse().slice(0, 200).reverse().map((e: any) => (
                      <tr key={e.id} className="border-b border-border"><td className="p-2 font-mono">{e.sequenceNumber}</td><td className="p-2 text-fg-muted">{new Date(e.eventTimestamp).toLocaleTimeString()}</td><td className="p-2">{e.teamSide === 'HOME' ? report.teams.HOME.name : e.teamSide === 'AWAY' ? report.teams.AWAY.name : '—'}</td><td className="p-2">{e.type}</td><td className="p-2 text-fg-subtle">{e.isCorrection ? 'correction ' : ''}{e.isReversal ? 'reversal' : ''}</td></tr>
                    ))}
                  </tbody></table>
                </div>
              </div>

              <div className="mt-6 text-xs text-fg-subtle print:text-fg-muted border-t border-border pt-3">
                Data integrity: completed matches are retained. {report.integrity?.note}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};