import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, RefreshCw } from 'lucide-react';
import { competitionsApi } from '../services/api.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Select, Label } from '../components/ui/Input.js';
import { TeamLogo } from '../components/broadcast/TeamLogo.js';

function toCsv(rows: any[]) {
  const header = ['Rank','Team','P','W','L','SF','SA','SetRatio','PF','PA','PointRatio','Pts','Form'];
  const esc = (v: any) => '"' + String(v ?? '').replace(/"/g,'""') + '"';
  const lines = rows.map(r => [r.rank,r.teamName,r.played,r.won,r.lost,r.setsFor,r.setsAgainst,r.setRatio==null?'':r.setRatio.toFixed(3),r.pointsFor,r.pointsAgainst,r.pointRatio==null?'':r.pointRatio.toFixed(3),r.matchPoints,(r.form||[]).join('')].map(esc).join(','));
  return [header.join(','), ...lines].join('\n');
}

export const LeaderboardPage: React.FC = () => {
  const compsQ = useQuery({ queryKey:['competitions'], queryFn: competitionsApi.list });
  const [competitionId, setCompetitionId] = useState<string>('');
  const [division, setDivision] = useState<string>('');
  const [provisional, setProvisional] = useState(false);
  const [compact, setCompact] = useState(false);
  const compId = competitionId || (compsQ.data?.[0]?.id ?? '');
  const divisionsQ = useQuery({ queryKey:['competition-divisions', compId], queryFn: () => competitionsApi.divisions(compId), enabled: !!compId });
  const standingsQ = useQuery({ queryKey:['standings', compId, division, provisional], queryFn: () => competitionsApi.standings(compId, { division: division || undefined, provisional }), enabled: !!compId, refetchInterval: 30000 });
  const data = standingsQ.data; const rows = data?.rows || [];
  const zoneFor = (rank: number) => (data?.qualificationZones||[]).find((z:any)=>rank <= z.toRank);
  const exportCsv = () => { const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `standings-${compId}.csv`; a.click(); URL.revokeObjectURL(a.href); };
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="League" title="Leaderboard" description="Standings computed from completed matches." actions={<div className="flex gap-2"><Button variant="outline" onClick={()=>standingsQ.refetch()}><RefreshCw className="w-4 h-4"/>Refresh</Button><Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4"/>CSV</Button><Button variant="outline" onClick={()=>window.print()}>PDF</Button></div>} />
      <Card>
        <CardHeader><CardTitle>Standings</CardTitle></CardHeader>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div><Label>Competition</Label><Select value={compId} onChange={e=>{setCompetitionId(e.target.value); setDivision('');}}>{(compsQ.data||[]).map((c:any)=><option key={c.id} value={c.id}>{c.name}{c.season?` (${c.season})`:''}</option>)}</Select></div>
          <div><Label>Division / Group</Label><Select value={division} onChange={e=>setDivision(e.target.value)}><option value="">All divisions</option>{(divisionsQ.data||[]).map((d:string)=><option key={d} value={d}>{d}</option>)}</Select></div>
          <label className="flex items-end gap-2 text-sm text-fg pb-2"><input type="checkbox" checked={provisional} onChange={e=>setProvisional(e.target.checked)} /> Provisional (include live)</label>
          <label className="flex items-end gap-2 text-sm text-fg pb-2"><input type="checkbox" checked={compact} onChange={e=>setCompact(e.target.checked)} /> Compact</label>
        </div>
        {standingsQ.isLoading && <div className="text-sm text-fg-subtle">Loading standings...</div>}
        {!standingsQ.isLoading && rows.length===0 && <div className="text-sm text-fg-subtle py-8 text-center border border-dashed border-border rounded-xl">No completed matches for this selection.</div>}
        {rows.length>0 && <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left text-fg-muted border-b border-border"><th className="py-2 pr-2">#</th><th className="py-2 pr-2">Team</th><th className="py-2 pr-2">P</th><th className="py-2 pr-2">W</th><th className="py-2 pr-2">L</th>{!compact && <><th className="py-2 pr-2">SF</th><th className="py-2 pr-2">SA</th><th className="py-2 pr-2">SR</th><th className="py-2 pr-2">PF</th><th className="py-2 pr-2">PA</th><th className="py-2 pr-2">PR</th></>}<th className="py-2 pr-2">Pts</th><th className="py-2 pr-2">Form</th></tr></thead><tbody>
          {rows.map((r:any)=>{ const zone=zoneFor(r.rank); return <tr key={r.teamId} className="border-b border-border/60" style={zone?{boxShadow:`inset 3px 0 0 ${zone.color}`}:undefined}><td className="py-2 pr-2 font-semibold">{r.rank}</td><td className="py-2 pr-2"><div className="flex items-center gap-2"><TeamLogo src={r.logoUrl} name={r.teamName} shortName={r.shortName||r.teamName} size={28} color="rgba(255,255,255,0.08)" textColor="#fff" /><span className="font-medium">{r.teamName}</span>{zone && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{background:`${zone.color}22`,color:zone.color}}>{zone.label}</span>}</div></td><td className="py-2 pr-2">{r.played}</td><td className="py-2 pr-2">{r.won}</td><td className="py-2 pr-2">{r.lost}</td>{!compact && <><td className="py-2 pr-2">{r.setsFor}</td><td className="py-2 pr-2">{r.setsAgainst}</td><td className="py-2 pr-2">{r.setRatio==null?'—':r.setRatio.toFixed(3)}</td><td className="py-2 pr-2">{r.pointsFor}</td><td className="py-2 pr-2">{r.pointsAgainst}</td><td className="py-2 pr-2">{r.pointRatio==null?'—':r.pointRatio.toFixed(3)}</td></>}<td className="py-2 pr-2 font-bold">{r.matchPoints}</td><td className="py-2 pr-2"><div className="flex gap-1">{(r.form||[]).map((f:string,i:number)=><span key={i} className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${f==='W'?'bg-success-subtle text-success':'bg-danger-subtle text-danger'}`}>{f}</span>)}</div></td></tr>; })}
        </tbody></table></div>}
      </Card>
    </div>
  );
};
