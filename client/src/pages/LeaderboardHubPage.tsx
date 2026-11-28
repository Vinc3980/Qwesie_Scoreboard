import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { competitionsApi, leaderboardApi } from '../services/api.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Select, Label } from '../components/ui/Input.js';
import { Button } from '../components/ui/Button.js';

function dlBlob(name: string, blob: Blob) { const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
function exportRowsCsv(name: string, rows: any[], cols: string[]) { const head=['rank','team',...cols]; const lines=[head.join(',')]; rows.forEach(r=>lines.push([r.rank,`"${String(r.teamName||r.name||'').replace(/"/g,'""')}"`,...cols.map(c=>r[c]??'')].join(','))); dlBlob(name,new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'})); }
async function exportSimplePng(name: string, title: string, rows: any[], cols: Array<[string,string]>) {
  const W=1920,H=1080; const c=document.createElement('canvas'); c.width=W; c.height=H; const ctx=c.getContext('2d'); if(!ctx) return;
  ctx.fillStyle='#0b1220'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#fff'; ctx.font='800 52px Inter, system-ui, sans-serif'; ctx.fillText(title,60,80);
  const rowH=58, top=130, limit=Math.min(rows.length, Math.floor((H-top-60)/(rowH+8)));
  rows.slice(0,limit).forEach((r:any,i:number)=>{ const y=top+i*(rowH+8); ctx.fillStyle=i===0?'rgba(255,209,102,0.12)':'rgba(255,255,255,0.05)'; ctx.fillRect(60,y,W-120,rowH); ctx.fillStyle='#f59e0b'; ctx.font='800 30px Inter, system-ui, sans-serif'; ctx.fillText(String(r.rank??i+1),80,y+38); ctx.fillStyle='#fff'; ctx.fillText(String(r.teamName||r.name||'').slice(0,36),150,y+38); let x=980; cols.forEach(([k,label])=>{ ctx.fillStyle=k==='matchPoints'||k==='value'?'#f59e0b':'#d6deea'; ctx.font=`700 28px Inter, system-ui, sans-serif`; const val=String(r[k]??''); ctx.fillText(val,x,y+38); x+=140; }); });
  const blob:Blob|null=await new Promise(res=>c.toBlob(res,'image/png')); if(blob) dlBlob(name,blob);
}

const CATS = [
  { id:'standings', label:'Standings' },
  { id:'points', label:'Top Scorers' },
  { id:'aces', label:'Aces' },
  { id:'blocks', label:'Blocks' },
  { id:'kills', label:'Kills' },
  { id:'digs', label:'Digs' },
  { id:'assists', label:'Assists' },
  { id:'all', label:'All' },
] as const;

export const LeaderboardHubPage: React.FC = () => {
  const compsQ = useQuery({ queryKey:['competitions'], queryFn: competitionsApi.list });
  const [competitionId, setCompetitionId] = useState('');
  const [tab, setTab] = useState<string>('standings');
  const [division, setDivision] = useState('');
  const compId = competitionId || (compsQ.data?.[0]?.id ?? '');
  const divisionsQ = useQuery({ queryKey:['competition-divisions',compId], queryFn:()=>competitionsApi.divisions(compId), enabled:!!compId });
  const standingsQ = useQuery({ queryKey:['standings',compId,division], queryFn:()=>competitionsApi.standings(compId,{division:division||undefined}), enabled:!!compId && (tab==='standings'||tab==='all') });
  const playerQ = useQuery({ queryKey:['player-lb',compId,tab,division], queryFn:()=>leaderboardApi.playerLeaderboard(compId,{category:tab,division:division||undefined,limit:10}), enabled:!!compId && tab!=='standings' && tab!=='all' });
  const combinedQ = useQuery({ queryKey:['combined-lb',compId,division], queryFn:()=>leaderboardApi.combined(compId,{division:division||undefined}), enabled:!!compId && tab==='all' });

  const exportCurrent = async () => {
    if (tab === 'standings' || tab === 'all') { const rows = standingsQ.data?.rows || []; exportRowsCsv('standings.csv', rows, ['played','won','lost','matchPoints']); await exportSimplePng('standings.png', 'Standings', rows, [['played','P'],['won','W'],['lost','L'],['matchPoints','PTS']]); }
    else { const rows = playerQ.data?.rows || []; exportRowsCsv(`${tab}.csv`, rows.map((r:any)=>({ ...r, teamName: r.teamName })), ['matchesPlayed','value']); await exportSimplePng(`${tab}.png`, CATS.find(c=>c.id===tab)?.label||tab, rows.map((r:any)=>({ ...r, teamName:r.name })), [['matchesPlayed','MP'],['value','VAL']]); }
  };
  const publicBase = `/p/${compId}`;

  return <div className="space-y-6">
    <PageHeader eyebrow="League" title="Leaderboard Hub" description="Standings and player leaderboards in one place." actions={<div className="flex gap-2"><Button size="sm" variant="outline" onClick={exportCurrent}>Export PNG/CSV</Button></div>} />
    <Card>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div><Label>Competition</Label><Select value={compId} onChange={e=>{setCompetitionId(e.target.value); setDivision('');}}>{(compsQ.data||[]).map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
        <div><Label>Division</Label><Select value={division} onChange={e=>setDivision(e.target.value)}><option value="">All</option>{(divisionsQ.data||[]).map((d:string)=><option key={d} value={d}>{d}</option>)}</Select></div>
        <div className="md:col-span-2"><Label>Public/Embed links</Label><div className="text-xs text-fg-muted space-y-1"><div><a className="underline" href={`${publicBase}/standings`} target="_blank" rel="noreferrer">Standings</a> · <a className="underline" href={`${publicBase}/leaderboard/players`} target="_blank" rel="noreferrer">Players</a> · <a className="underline" href={`${publicBase}/leaderboard/combined`} target="_blank" rel="noreferrer">Combined</a></div><div>Embed: <code>{`${publicBase}/leaderboard/combined?embed=1`}</code></div></div></div>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">{CATS.map(c=><Button key={c.id} size="sm" variant={tab===c.id?'primary':'outline'} onClick={()=>setTab(c.id)}>{c.label}</Button>)}</div>

      {tab==='standings' && <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left text-fg-muted border-b border-border"><th className="py-2 pr-2">#</th><th className="py-2 pr-2">Team</th><th className="py-2 pr-2">P</th><th className="py-2 pr-2">W</th><th className="py-2 pr-2">L</th><th className="py-2 pr-2">Pts</th></tr></thead><tbody>{(standingsQ.data?.rows||[]).map((r:any)=><tr key={r.teamId} className="border-b border-border/60"><td className="py-2 pr-2">{r.rank}</td><td className="py-2 pr-2 font-medium">{r.teamName}</td><td className="py-2 pr-2">{r.played}</td><td className="py-2 pr-2">{r.won}</td><td className="py-2 pr-2">{r.lost}</td><td className="py-2 pr-2 font-bold">{r.matchPoints}</td></tr>)}</tbody></table></div>}

      {tab!=='standings' && tab!=='all' && <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left text-fg-muted border-b border-border"><th className="py-2 pr-2">#</th><th className="py-2 pr-2">Player</th><th className="py-2 pr-2">Team</th><th className="py-2 pr-2">MP</th><th className="py-2 pr-2">Value</th></tr></thead><tbody>{(playerQ.data?.rows||[]).map((r:any)=><tr key={r.playerId} className="border-b border-border/60"><td className="py-2 pr-2">{r.rank}</td><td className="py-2 pr-2 font-medium">{r.name}</td><td className="py-2 pr-2">{r.teamShortName||r.teamName}</td><td className="py-2 pr-2">{r.matchesPlayed}</td><td className="py-2 pr-2 font-bold">{Math.round((r.value||0)*10)/10}</td></tr>)}</tbody></table>{playerQ.data?.coverage && <div className="text-xs text-fg-muted mt-2">Data coverage: {playerQ.data.coverage.pct ?? 'n/a'}% ({playerQ.data.coverage.attributed}/{playerQ.data.coverage.total} scoring events attributed)</div>}</div>}

      {tab==='all' && <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div><CardHeader><CardTitle>Standings</CardTitle></CardHeader><div className="space-y-1">{(combinedQ.data?.standings?.rows||[]).slice(0,8).map((r:any)=><div key={r.teamId} className="flex justify-between text-sm py-1 border-b border-border/50"><span>{r.rank}. {r.teamName}</span><span className="font-bold">{r.matchPoints}</span></div>)}</div></div>
        <div className="grid grid-cols-2 gap-3">{['points','aces','blocks','kills'].map(c=><div key={c} className="border border-border rounded-lg p-2"><div className="text-xs font-bold text-fg-muted mb-1 uppercase">{c}</div>{(combinedQ.data?.leaders?.[c]?.rows||[]).slice(0,3).map((r:any)=><div key={r.playerId} className="text-xs flex justify-between"><span className="truncate">{r.rank}. {r.name}</span><span className="font-semibold ml-2">{Math.round(r.value||0)}</span></div>)}</div>)}</div>
      </div>}
    </Card>
  </div>;
};
