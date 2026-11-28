import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { List, LayoutGrid, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { competitionsApi } from '../services/api.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Select, Label, Input } from '../components/ui/Input.js';

function isoDay(d: Date) { return d.toISOString().slice(0, 10); }
function rangeFor(preset: string) {
  const now = new Date(); const start = new Date(now); start.setHours(0, 0, 0, 0); const end = new Date(start);
  if (preset === 'today') { end.setDate(end.getDate() + 1); return { from: start.toISOString(), to: end.toISOString() }; }
  if (preset === 'tomorrow') { start.setDate(start.getDate() + 1); end.setDate(end.getDate() + 2); return { from: start.toISOString(), to: end.toISOString() }; }
  if (preset === 'week') { const day = (start.getDay() + 6) % 7; start.setDate(start.getDate() - day); end.setTime(start.getTime()); end.setDate(end.getDate() + 7); return { from: start.toISOString(), to: end.toISOString() }; }
  return {};
}

export const FixturesPage: React.FC = () => {
  const compsQ = useQuery({ queryKey: ['competitions'], queryFn: competitionsApi.list });
  const [competitionId, setCompetitionId] = useState('');
  const [division, setDivision] = useState('');
  const [status, setStatus] = useState('');
  const [court, setCourt] = useState('');
  const [preset, setPreset] = useState('today');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [view, setView] = useState<'list' | 'timeline' | 'court'>('list');
  const [genOpen, setGenOpen] = useState(false);
  const [gen, setGen] = useState({ teamIds: '', startDate: '', timeSlots: '18:00', courts: '1', matchDurationMinutes: 90, doubleRoundRobin: false, division: '', group: '', round: '' });
  const [preview, setPreview] = useState<any[]>([]);
  const compId = competitionId || (compsQ.data?.[0]?.id ?? '');
  const divisionsQ = useQuery({ queryKey: ['competition-divisions', compId], queryFn: () => competitionsApi.divisions(compId), enabled: !!compId });
  const r = preset === 'custom' ? { from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(to + 'T23:59:59').toISOString() : undefined } : rangeFor(preset);
  const fixturesQ = useQuery({ queryKey: ['fixtures', compId, division, status, court, preset, from, to], queryFn: () => competitionsApi.fixtures(compId, { division: division || undefined, status: status || undefined, court: court || undefined, ...r }), enabled: !!compId, refetchInterval: 30000 });
  const items = fixturesQ.data?.items || [];
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const it of items) { const k = it.scheduledAt ? isoDay(new Date(it.scheduledAt)) : 'Unscheduled'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(it); }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);
  const courts = useMemo(() => Array.from(new Set(items.map((i: any) => String(i.court || 'Unassigned')))) as string[], [items]);
  const badge = (s: string) => s === 'LIVE' ? 'bg-live/15 text-live' : (s === 'COMPLETED' || s === 'FINISHED') ? 'bg-success-subtle text-success' : s === 'CANCELLED' ? 'bg-danger-subtle text-danger' : 'bg-surface-alt text-fg-muted';
  const score = (m: any) => (m.status === 'COMPLETED' || m.status === 'LIVE' || m.status === 'BETWEEN_SETS' || m.status === 'PAUSED') ? `${m.setsWonHome}-${m.setsWonAway}` : 'vs';

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="League" title="Fixtures" description="Fixtures and results by day, time, court, competition, and status." actions={<Button variant="outline" onClick={()=>setGenOpen(v=>!v)}>{genOpen?'Close generator':'Generate fixtures'}</Button>} />
      {genOpen && <Card><CardHeader><CardTitle>Fixture generator (round-robin)</CardTitle></CardHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div className="md:col-span-2"><Label>Team IDs (comma-separated)</Label><Input value={gen.teamIds} onChange={e=>setGen({...gen,teamIds:e.target.value})} placeholder="teamId1,teamId2,..." /></div>
          <div><Label>Start date</Label><Input type="date" value={gen.startDate} onChange={e=>setGen({...gen,startDate:e.target.value})} /></div>
          <div><Label>Time slots (comma)</Label><Input value={gen.timeSlots} onChange={e=>setGen({...gen,timeSlots:e.target.value})} /></div>
          <div><Label>Courts (comma)</Label><Input value={gen.courts} onChange={e=>setGen({...gen,courts:e.target.value})} /></div>
          <div><Label>Duration min</Label><Input type="number" value={gen.matchDurationMinutes} onChange={e=>setGen({...gen,matchDurationMinutes:Number(e.target.value)||90})} /></div>
          <div><Label>Division</Label><Input value={gen.division} onChange={e=>setGen({...gen,division:e.target.value})} /></div>
          <label className="flex items-end gap-2 text-sm pb-2"><input type="checkbox" checked={gen.doubleRoundRobin} onChange={e=>setGen({...gen,doubleRoundRobin:e.target.checked})} /> Double round-robin</label>
        </div>
        <div className="flex gap-2 mb-3"><Button size="sm" variant="primary" onClick={async ()=>{ const body={ teamIds: gen.teamIds.split(',').map(s=>s.trim()).filter(Boolean), startDate: gen.startDate||undefined, timeSlots: gen.timeSlots.split(',').map(s=>s.trim()).filter(Boolean), courts: gen.courts.split(',').map(s=>s.trim()).filter(Boolean), matchDurationMinutes: gen.matchDurationMinutes, doubleRoundRobin: gen.doubleRoundRobin, division: gen.division||undefined, group: gen.group||undefined, round: gen.round||undefined }; const res = await competitionsApi.generateFixturesPreview(compId, body); setPreview(res.preview||[]); }}>Preview</Button><Button size="sm" variant="secondary" disabled={!preview.length} onClick={async ()=>{ await competitionsApi.commitFixtures(compId, { items: preview }); setPreview([]); setGenOpen(false); fixturesQ.refetch(); }}>Save fixtures</Button></div>
        {preview.length>0 && <div className="max-h-64 overflow-auto border border-border rounded-lg text-xs"><table className="w-full"><thead><tr className="text-left text-fg-muted"><th className="p-2">Date</th><th className="p-2">Court</th><th className="p-2">Home</th><th className="p-2">Away</th><th className="p-2">Round</th></tr></thead><tbody>{preview.map((p:any,i:number)=><tr key={i} className="border-t border-border/50"><td className="p-2">{new Date(p.scheduledAt).toLocaleString()}</td><td className="p-2">{p.court}</td><td className="p-2">{p.homeTeamName}</td><td className="p-2">{p.awayTeamName}</td><td className="p-2">{p.round}</td></tr>)}</tbody></table></div>}
      </Card>}
      <Card>
        <CardHeader><CardTitle>Filters</CardTitle><div className="flex gap-2"><Button size="sm" variant={view === 'list' ? 'primary' : 'outline'} onClick={() => setView('list')}><List className="w-4 h-4" />List</Button><Button size="sm" variant={view === 'timeline' ? 'primary' : 'outline'} onClick={() => setView('timeline')}><Clock className="w-4 h-4" />Timeline</Button><Button size="sm" variant={view === 'court' ? 'primary' : 'outline'} onClick={() => setView('court')}><LayoutGrid className="w-4 h-4" />By court</Button></div></CardHeader>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
          <div><Label>Competition</Label><Select value={compId} onChange={e => { setCompetitionId(e.target.value); setDivision(''); }}>{(compsQ.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          <div><Label>Division</Label><Select value={division} onChange={e => setDivision(e.target.value)}><option value="">All</option>{(divisionsQ.data || []).map((d: string) => <option key={d} value={d}>{d}</option>)}</Select></div>
          <div><Label>Date</Label><Select value={preset} onChange={e => setPreset(e.target.value)}><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="week">This week</option><option value="custom">Custom</option><option value="all">All</option></Select></div>
          <div><Label>Status</Label><Select value={status} onChange={e => setStatus(e.target.value)}><option value="">All</option>{['SCHEDULED', 'READY', 'LIVE', 'BETWEEN_SETS', 'COMPLETED', 'CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}</Select></div>
          <div><Label>Court</Label><Input value={court} onChange={e => setCourt(e.target.value)} placeholder="Court" /></div>
          <div className="flex items-end text-sm text-fg-muted">{fixturesQ.data?.total ?? 0} matches</div>
          {preset === 'custom' && <><div><Label>From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div><div><Label>To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div></>}
        </div>
        {fixturesQ.isLoading && <div className="text-sm text-fg-subtle">Loading fixtures...</div>}
        {!fixturesQ.isLoading && items.length === 0 && <div className="text-sm text-fg-subtle py-8 text-center border border-dashed border-border rounded-xl">No fixtures for this filter.</div>}
        {view !== 'court' && groups.map(([day, ms]) => (
          <div key={day} className="mb-4">
            <div className="text-xs font-bold uppercase tracking-wider text-fg-muted mb-2">{day}</div>
            <div className="space-y-2">{ms.map((m: any) => (
              <Link key={m.id} to={`/matches?match=${m.id}`} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface-subtle/30 hover:bg-surface-alt">
                <div className="w-24 text-xs text-fg-muted">{m.scheduledAt ? new Date(m.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}<div>{m.court || ''}</div></div>
                <div className="flex-1 min-w-0"><div className="font-semibold text-fg truncate">{m.homeTeam?.shortName || m.homeTeamName} <span className="text-fg-muted">{score(m)}</span> {m.awayTeam?.shortName || m.awayTeamName}</div><div className="text-xs text-fg-subtle">{m.division || ''} {m.round ? `· ${m.round}` : ''} {m.group ? `· ${m.group}` : ''}</div></div>
                <span className={`text-[10px] px-2 py-1 rounded font-bold ${badge(m.status)}`}>{m.status}</span>
              </Link>
            ))}</div>
          </div>
        ))}
        {view === 'court' && <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{courts.map(c => <div key={c} className="border border-border rounded-xl p-3"><div className="font-semibold text-fg mb-2">{c}</div><div className="space-y-2">{items.filter((m: any) => (m.court || 'Unassigned') === c).map((m: any) => <div key={m.id} className="text-sm p-2 rounded bg-surface-sunken"><div className="text-xs text-fg-muted">{m.scheduledAt ? new Date(m.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</div><div className="font-medium">{m.homeTeam?.shortName || m.homeTeamName} {score(m)} {m.awayTeam?.shortName || m.awayTeamName}</div></div>)}</div></div>)}</div>}
      </Card>
    </div>
  );
};
