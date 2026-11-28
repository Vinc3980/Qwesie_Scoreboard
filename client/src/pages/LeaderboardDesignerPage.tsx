import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { competitionsApi, leaderboardApi, matchApi } from '../services/api.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Input, Label, Select } from '../components/ui/Input.js';
import { Button } from '../components/ui/Button.js';
import { defaultLeaderboardThemeConfig, sanitizeLeaderboardThemeConfig, leaderboardContrastWarnings, computeLeaderboardFit, type LeaderboardThemeConfig } from '@qwesie/shared';

const COLUMNS: Array<{ key: any; label: string }> = [
  { key:'played', label:'P' },{ key:'won', label:'W' },{ key:'lost', label:'L' },{ key:'setsFor', label:'SF' },{ key:'setsAgainst', label:'SA' },{ key:'setRatio', label:'SR' },{ key:'pointsFor', label:'PF' },{ key:'pointsAgainst', label:'PA' },{ key:'pointRatio', label:'PR' },{ key:'matchPoints', label:'Pts' },{ key:'form', label:'Form' },
];

function makeScenario(kind: string) {
  const base = Array.from({ length: kind === '20' ? 20 : kind === '10' ? 10 : kind === 'long' ? 8 : kind === 'ties' ? 8 : 6 }, (_, i) => ({
    rank: i+1, teamId: `t${i+1}`, teamName: kind==='long' && i===1 ? 'Extremely Long Volleyball Club Name With Many Words' : `Team ${i+1}`,
    shortName: `T${i+1}`, teamLogoUrl: kind==='missing' && i%3===0 ? null : '', played: 10, won: 10-i, lost: i, setsFor: 30-i, setsAgainst: 10+i, setRatio: +( (30-i)/Math.max(1,10+i) ).toFixed(2), pointsFor: 750-i*10, pointsAgainst: 600+i*10, pointRatio: +(750/(600+i*10)).toFixed(2), matchPoints: Math.max(0, 30-i*3-(kind==='ties'&&i===2?0:0)), form: ['W','W','L','W','W'].slice(0,5),
  }));
  if (kind === 'ties') { base[1].matchPoints = base[0].matchPoints; base[2].matchPoints = base[0].matchPoints; base[1].rank=1; base[2].rank=1; base[3].rank=4; }
  if (kind === 'missing') { base.forEach((r:any,i:number)=>{ if(i%2===0) r.teamLogoUrl=null; }); }
  return base;
}

function downloadJson(name: string, data: any) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
function downloadBlob(name: string, blob: Blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
function exportCsv(name: string, rows: any[], columns: string[]) {
  const header = ['rank','team',...columns];
  const lines = [header.join(',')];
  for (const r of rows) {
    const vals = [r.rank, `"${String(r.teamName||'').replace(/"/g,'""')}"`, ...columns.map(c => c==='form' ? `"${(r.form||[]).join('')}"` : (r[c] ?? ''))];
    lines.push(vals.join(','));
  }
  downloadBlob(name, new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }));
}
async function exportPng(name: string, rows: any[], draft: LeaderboardThemeConfig, title: string, subtitle?: string | null) {
  const W = 1920, H = 1080;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.fillStyle = draft.layout.backgroundMode === 'transparent' ? 'rgba(0,0,0,0)' : draft.colors.background;
  ctx.fillRect(0,0,W,H);
  ctx.fillStyle = draft.colors.text;
  ctx.font = `800 ${draft.typography.titleSize}px ${draft.typography.fontFamily}`;
  ctx.fillText(draft.layout.showTitle ? (draft.layout.title || title) : title, 60, 90);
  if (draft.layout.showSubtitle && (draft.layout.subtitle || subtitle)) {
    ctx.fillStyle = draft.colors.mutedText; ctx.font = `600 ${Math.max(24,draft.typography.titleSize*0.45)}px ${draft.typography.fontFamily}`;
    ctx.fillText(String(draft.layout.subtitle || subtitle), 60, 130);
  }
  const cols = (draft.columns?.length ? draft.columns : ['played','won','lost','matchPoints']).slice(0,8);
  const colLabels: any = { played:'P', won:'W', lost:'L', setsFor:'SF', setsAgainst:'SA', setRatio:'SR', pointsFor:'PF', pointsAgainst:'PA', pointRatio:'PR', matchPoints:'PTS', form:'FORM' };
  const fitAll = draft.layout.fitAll;
  const limit = fitAll ? Math.min(20, rows.length) : Math.min(draft.layout.rowsPerPage, rows.length);
  const show = rows.slice(0, limit);
  const rowH = draft.layout.rowHeight;
  const gap = 8; const top = 170; const available = H - top - 60;
  const needed = show.length * rowH + Math.max(0,show.length-1)*gap;
  const scale = fitAll ? Math.max(0.35, Math.min(1, available / Math.max(1, needed))) : 1;
  const x0 = 60;
  const colW = [70, draft.logos.show ? draft.logos.size + 16 : 0, 760, ...cols.map(c => c==='form'?140:90)];
  const drawRow = (y: number, r: any, i: number, header=false) => {
    let x = x0;
    ctx.fillStyle = header ? draft.colors.headerBg : (draft.zones.find((z:any)=>r.rank<=z.toRank)?.color || (r.rank===1 ? draft.colors.leaderHighlight : (i%2?draft.colors.rowAltBg:draft.colors.rowBg)));
    ctx.fillRect(x0-16, y, W-88, rowH*scale);
    ctx.fillStyle = header ? draft.colors.mutedText : draft.colors.accent;
    ctx.font = `${header?700:800} ${Math.max(14, (header?20:draft.typography.rowSize)*scale)}px ${draft.typography.fontFamily}`;
    ctx.fillText(header ? '#' : String(r.rank), x, y + rowH*scale*0.65); x += colW[0]*scale;
    if (draft.logos.show) { x += colW[1]*scale; }
    ctx.fillStyle = header ? draft.colors.mutedText : draft.colors.text;
    ctx.font = `${header?700:800} ${Math.max(14, (header?20:draft.typography.rowSize)*scale)}px ${draft.typography.fontFamily}`;
    const name = header ? 'TEAM' : (draft.names.mode==='short'?(r.shortName||r.teamName):draft.names.mode==='code'?(r.shortName||r.teamName||'').slice(0,3).toUpperCase():r.teamName);
    ctx.fillText(String(name||'').slice(0, 42), x, y + rowH*scale*0.65); x += colW[2]*scale;
    cols.forEach((c, ci) => {
      const label = header ? (colLabels[c]||c) : (c==='setRatio'||c==='pointRatio'?Number(r[c]||0).toFixed(2):c==='form'?(r.form||[]).slice(-5).join(''):String(r[c]??'-'));
      const w = colW[3+ci]*scale;
      ctx.fillStyle = header ? draft.colors.mutedText : (c==='matchPoints'?draft.colors.accent:draft.colors.text);
      ctx.font = `${header?700:(c==='matchPoints'?800:600)} ${Math.max(12, (header?18:draft.typography.rowSize*0.9)*scale)}px ${draft.typography.fontFamily}`;
      const tx = c==='form' ? x : x + w - ctx.measureText(String(label)).width;
      ctx.fillText(String(label), tx, y + rowH*scale*0.65);
      x += w;
    });
  };
  drawRow(top, {}, -1, true);
  show.forEach((r, i) => drawRow(top + (rowH+gap)*scale*(i+1), r, i, false));
  const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/png'));
  if (blob) downloadBlob(name, blob);
}

export const LeaderboardDesignerPage: React.FC = () => {
  const compsQ = useQuery({ queryKey:['competitions'], queryFn: competitionsApi.list });
  const matchesQ = useQuery({ queryKey:['matches','list'], queryFn: () => matchApi.listMatches() });
  const [competitionId, setCompetitionId] = useState('');
  const compId = competitionId || (compsQ.data?.[0]?.id ?? '');
  const themesQ = useQuery({ queryKey:['lb-themes', compId], queryFn: () => leaderboardApi.listThemes(compId), enabled: !!compId });
  const standingsQ = useQuery({ queryKey:['standings', compId], queryFn: () => competitionsApi.standings(compId, {}), enabled: !!compId });

  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<LeaderboardThemeConfig>(defaultLeaderboardThemeConfig());
  const [name, setName] = useState('Custom Leaderboard');
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [history, setHistory] = useState<LeaderboardThemeConfig[]>([]);
  const [future, setFuture] = useState<LeaderboardThemeConfig[]>([]);
  const [scenario, setScenario] = useState('real');
  const [matchId, setMatchId] = useState('');
  const [status, setStatus] = useState('');

  const selected = (themesQ.data||[]).find((t:any)=>t.id===selectedId) || (themesQ.data||[])[0];
  useEffect(()=>{ if (selected && !selectedId) setSelectedId(selected.id); }, [selected, selectedId]);
  useEffect(()=>{ if (selected) { const cfg = sanitizeLeaderboardThemeConfig(selected.config); setDraft(cfg); setName(selected.name); setSavedSnapshot(JSON.stringify(cfg)); setHistory([]); setFuture([]); } }, [selected?.id]);

  const dirty = savedSnapshot !== JSON.stringify(draft);
  const warnings = useMemo(()=>leaderboardContrastWarnings(draft), [draft]);

  const updateDraft = (next: LeaderboardThemeConfig) => {
    setHistory(h => [...h.slice(-40), draft]);
    setFuture([]);
    setDraft(sanitizeLeaderboardThemeConfig(next));
  };
  const undo = () => { setHistory(h => { if (!h.length) return h; const prev = h[h.length-1]; setFuture(f => [draft, ...f]); setDraft(prev); return h.slice(0,-1); }); };
  const redo = () => { setFuture(f => { if (!f.length) return f; const [next,...rest] = f; setHistory(h=>[...h,draft]); setDraft(next); return rest; }); };

  const scenarioRows = useMemo(() => scenario === 'real' ? (standingsQ.data?.rows || []) : makeScenario(scenario), [scenario, standingsQ.data]);
  const fit = computeLeaderboardFit(scenarioRows.length, { rowHeight: draft.layout.rowHeight, minScale: 0.35 });
  const rowsToShow = draft.layout.fitAll ? scenarioRows.slice(0, 20) : scenarioRows.slice(0, draft.layout.rowsPerPage);
  const scale = draft.layout.fitAll ? Math.max(0.35, Math.min(1, 760 / Math.max(1, rowsToShow.length * (draft.layout.rowHeight/2 + 4)))) : 1;

  const save = async (asNew=false) => {
    const body = { name, kind:'leaderboard', config: draft, competitionId: compId };
    let saved;
    if (!asNew && selected && !selected.isBuiltIn) saved = await leaderboardApi.updateTheme(selected.id, body);
    else saved = await leaderboardApi.createTheme(body);
    setStatus('Saved'); setSavedSnapshot(JSON.stringify(draft));
    await themesQ.refetch();
    if (saved?.id) setSelectedId(saved.id);
  };
  const duplicate = async () => { if (!selected) return; const d = await leaderboardApi.duplicateTheme(selected.id, { name: `${name} Copy` }); setStatus('Duplicated'); await themesQ.refetch(); if (d?.id) setSelectedId(d.id); };
  const setDefault = async () => { if (!selected) return; await leaderboardApi.setDefault(selected.id, { competitionId: compId }); await leaderboardApi.applyToCompetition(selected.id, compId); setStatus('Set as competition default'); await themesQ.refetch(); };
  const applyCompetition = async () => { if (!selected) return; const id = selected.isBuiltIn ? (await leaderboardApi.createTheme({ name: selected.name, kind:selected.kind, config:draft, competitionId: compId })).id : selected.id; await leaderboardApi.applyToCompetition(id, compId); setStatus('Applied to competition'); };
  const applyOnAir = async () => {
    if (!selected) return;
    const targetMatchId = matchId || (matchesQ.data?.find?.((m:any)=>m.status==='LIVE')?.id) || (matchesQ.data?.[0]?.id);
    if (!targetMatchId) { setStatus('No match selected for on-air apply'); return; }
    const themeId = selected.isBuiltIn ? (await leaderboardApi.createTheme({ name: selected.name, kind:selected.kind, config:draft, competitionId: compId })).id : selected.id;
    await leaderboardApi.applyToOnAir(themeId, { matchId: targetMatchId, template:'LEADERBOARD', payload: { competitionId: compId, fitAll: draft.layout.fitAll, limit: draft.layout.rowsPerPage } });
    setStatus(`Applied on-air to match ${targetMatchId}`);
  };
  const exportTheme = async () => { if (!selected) return; const data = await leaderboardApi.exportTheme(selected.id); downloadJson(`${(data.name||'leaderboard-theme').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.json`, data); };
  const importTheme = async (file: File | null) => { if (!file) return; const text = await file.text(); const json = JSON.parse(text); const created = await leaderboardApi.importTheme(json); setStatus('Imported'); await themesQ.refetch(); if (created?.id) setSelectedId(created.id); };

  const colToggle = (key: string) => { const cols = draft.columns.includes(key as any) ? draft.columns.filter(c=>c!==key) : [...draft.columns, key as any]; updateDraft({ ...draft, columns: cols as any }); };
  const moveCol = (key: string, dir: -1|1) => { const idx = draft.columns.indexOf(key as any); if (idx<0) return; const to = idx+dir; if (to<0||to>=draft.columns.length) return; const cols=[...draft.columns]; const [v]=cols.splice(idx,1); cols.splice(to,0,v); updateDraft({ ...draft, columns: cols as any }); };

  return <div className="space-y-6">
    <PageHeader eyebrow="Design" title="Leaderboard Designer" description="Customize leaderboard look and apply themes." actions={<div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={undo} disabled={!history.length}>Undo</Button>
      <Button variant="outline" size="sm" onClick={redo} disabled={!future.length}>Redo</Button>
      <Button variant="outline" size="sm" onClick={()=>save(true)}>Save as</Button>
      <Button variant="primary" size="sm" onClick={()=>save(false)}>{dirty ? 'Save*' : 'Save'}</Button>
      <Button variant="secondary" size="sm" onClick={applyOnAir}>Apply to on-air</Button>
    </div>} />
    {status && <div className="text-sm text-fg-muted">{status}</div>}
    <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr_300px] gap-4">
      <Card>
        <CardHeader><CardTitle>Controls</CardTitle></CardHeader>
        <div className="space-y-3 text-sm max-h-[75vh] overflow-auto pr-1">
          <div><Label>Competition</Label><Select value={compId} onChange={e=>setCompetitionId(e.target.value)}>{(compsQ.data||[]).map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          <div><Label>Match for Apply to on-air</Label><Select value={matchId} onChange={e=>setMatchId(e.target.value)}><option value="">Auto (live/first)</option>{(matchesQ.data||[]).slice(0,30).map((m:any)=><option key={m.id} value={m.id}>{m.homeTeamName||m.homeTeam?.name} vs {m.awayTeamName||m.awayTeam?.name} ({m.status})</option>)}</Select></div>
          <div><Label>Theme name</Label><Input value={name} onChange={e=>setName(e.target.value)} /></div>
          <div><Label>Scenario</Label><Select value={scenario} onChange={e=>setScenario(e.target.value)}><option value="real">Real standings</option><option value="6">Few teams</option><option value="10">10 teams</option><option value="20">20 teams</option><option value="long">Long names</option><option value="missing">Missing logos</option><option value="ties">Ties</option></Select></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Rows/page</Label><Input type="number" min={4} max={20} value={draft.layout.rowsPerPage} onChange={e=>updateDraft({...draft, layout:{...draft.layout, rowsPerPage:Number(e.target.value)}})} /></div>
            <div><Label>Row height</Label><Input type="number" min={32} max={120} value={draft.layout.rowHeight} onChange={e=>updateDraft({...draft, layout:{...draft.layout, rowHeight:Number(e.target.value)}})} /></div>
          </div>
          <label className="flex gap-2 items-center"><input type="checkbox" checked={!!draft.layout.fitAll} onChange={e=>updateDraft({...draft, layout:{...draft.layout, fitAll:e.target.checked}})} /> Fit all on one screen</label>
          <label className="flex gap-2 items-center"><input type="checkbox" checked={!!draft.showRankMovement} onChange={e=>updateDraft({...draft, showRankMovement:e.target.checked})} /> Show rank movement</label>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Logo size</Label><Input type="number" min={20} max={120} value={draft.logos.size} onChange={e=>updateDraft({...draft, logos:{...draft.logos, size:Number(e.target.value)}})} /></div>
            <div><Label>Logo shape</Label><Select value={draft.logos.shape} onChange={e=>updateDraft({...draft, logos:{...draft.logos, shape:e.target.value as any}})}><option value="circle">Circle</option><option value="rounded">Rounded</option><option value="square">Square</option></Select></div>
          </div>
          <label className="flex gap-2 items-center"><input type="checkbox" checked={!!draft.logos.show} onChange={e=>updateDraft({...draft, logos:{...draft.logos, show:e.target.checked}})} /> Show logos</label>
          <div><Label>Name mode</Label><Select value={draft.names.mode} onChange={e=>updateDraft({...draft, names:{...draft.names, mode:e.target.value as any}})}><option value="full">Full</option><option value="short">Short</option><option value="code">Code</option></Select></div>
          <div><Label>Layout</Label><Select value={draft.layout.mode} onChange={e=>updateDraft({...draft, layout:{...draft.layout, mode:e.target.value as any}})}><option value="full">Full screen</option><option value="side">Side panel</option><option value="strip">Compact strip</option></Select></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Background</Label><Input value={draft.colors.background} onChange={e=>updateDraft({...draft, colors:{...draft.colors, background:e.target.value}})} /></div>
            <div><Label>Text</Label><Input value={draft.colors.text} onChange={e=>updateDraft({...draft, colors:{...draft.colors, text:e.target.value}})} /></div>
            <div><Label>Header</Label><Input value={draft.colors.headerBg} onChange={e=>updateDraft({...draft, colors:{...draft.colors, headerBg:e.target.value}})} /></div>
            <div><Label>Accent</Label><Input value={draft.colors.accent} onChange={e=>updateDraft({...draft, colors:{...draft.colors, accent:e.target.value}})} /></div>
            <div><Label>Row</Label><Input value={draft.colors.rowBg} onChange={e=>updateDraft({...draft, colors:{...draft.colors, rowBg:e.target.value}})} /></div>
            <div><Label>Alt row</Label><Input value={draft.colors.rowAltBg} onChange={e=>updateDraft({...draft, colors:{...draft.colors, rowAltBg:e.target.value}})} /></div>
          </div>
          <div><Label>Title</Label><Input value={draft.layout.title} onChange={e=>updateDraft({...draft, layout:{...draft.layout, title:e.target.value}})} /></div>
          <div><Label>Subtitle</Label><Input value={draft.layout.subtitle || ''} onChange={e=>updateDraft({...draft, layout:{...draft.layout, subtitle:e.target.value || null}})} /></div>
          <div><Label>Sponsor</Label><Input value={draft.layout.sponsorText || ''} onChange={e=>updateDraft({...draft, layout:{...draft.layout, sponsorText:e.target.value || null}})} /></div>
          <label className="flex gap-2 items-center"><input type="checkbox" checked={!!draft.layout.safeArea} onChange={e=>updateDraft({...draft, layout:{...draft.layout, safeArea:e.target.checked}})} /> Safe area guides</label>
          <div><Label>Font family</Label><Input value={draft.typography.fontFamily} onChange={e=>updateDraft({...draft, typography:{...draft.typography, fontFamily:e.target.value}})} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Title size</Label><Input type="number" min={24} max={96} value={draft.typography.titleSize} onChange={e=>updateDraft({...draft, typography:{...draft.typography, titleSize:Number(e.target.value)}})} /></div>
            <div><Label>Row size</Label><Input type="number" min={16} max={64} value={draft.typography.rowSize} onChange={e=>updateDraft({...draft, typography:{...draft.typography, rowSize:Number(e.target.value)}})} /></div>
          </div>
          <label className="flex gap-2 items-center"><input type="checkbox" checked={!!draft.typography.uppercase} onChange={e=>updateDraft({...draft, typography:{...draft.typography, uppercase:e.target.checked}})} /> Uppercase</label>
          <div><Label>Animation duration (ms)</Label><Input type="number" min={100} max={2000} value={draft.animation.durationMs} onChange={e=>updateDraft({...draft, animation:{...draft.animation, durationMs:Number(e.target.value)}})} /></div>
          <div><Label>Columns (toggle/reorder)</Label>
            <div className="space-y-1 mt-1">{COLUMNS.map(c=>{ const on=draft.columns.includes(c.key); return <div key={c.key} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={on} onChange={()=>colToggle(c.key)} /><span className="flex-1">{c.label} ({c.key})</span><button className="px-1 border rounded" onClick={()=>moveCol(c.key,-1)}>↑</button><button className="px-1 border rounded" onClick={()=>moveCol(c.key,1)}>↓</button></div>; })}</div>
          </div>
          <div><Label>Qualification/Relegation zones</Label>
            <div className="space-y-2 mt-1">{draft.zones.map((z:any,i:number)=><div key={i} className="grid grid-cols-3 gap-1"><Input type="number" min={1} max={30} value={z.toRank} onChange={e=>{ const zones=[...draft.zones]; zones[i]={...z,toRank:Number(e.target.value)}; updateDraft({...draft,zones}); }} /><Input value={z.label} onChange={e=>{ const zones=[...draft.zones]; zones[i]={...z,label:e.target.value}; updateDraft({...draft,zones}); }} /><Input value={z.color} onChange={e=>{ const zones=[...draft.zones]; zones[i]={...z,color:e.target.value}; updateDraft({...draft,zones}); }} /></div>)}
              <Button size="sm" variant="outline" onClick={()=>updateDraft({...draft, zones:[...draft.zones, {toRank:Math.min(30,draft.zones.length+1), label:'Zone', color:'rgba(34,197,94,0.15)'}]})}>Add zone</Button>
            </div>
          </div>
          {warnings.length>0 && <div className="text-xs text-warning bg-warning-subtle p-2 rounded">{warnings.map((w,i)=><div key={i}>{w}</div>)}</div>}
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>Live preview (1920x1080 scaled)</CardTitle></CardHeader>
        <div className="overflow-auto bg-surface-sunken p-2 rounded-xl">
          <div style={{ width: 960, height: 540, background: draft.colors.background, color: draft.colors.text, fontFamily: draft.typography.fontFamily, position:'relative', overflow:'hidden', border: draft.layout.safeArea ? '1px dashed rgba(255,255,255,0.2)' : undefined }}>
            <div style={{ padding: 20 }}>
              {draft.layout.showTitle && <div style={{ fontSize: draft.typography.titleSize/2, fontWeight: 800, textTransform: draft.typography.uppercase?'uppercase':'none' }}>{draft.layout.title || 'LEADERBOARD'}</div>}
              {draft.layout.showSubtitle && <div style={{ fontSize: Math.max(12, draft.typography.titleSize*0.22), color: draft.colors.mutedText }}>{draft.layout.subtitle || standingsQ.data?.competitionName || 'Competition'}</div>}
            </div>
            <div style={{ padding:'0 20px', transform:`scale(${scale})`, transformOrigin:'top left', width:`${100/scale}%` }}>
              <div style={{ display:'grid', gridTemplateColumns:`44px ${draft.logos.show?`${draft.logos.size/2}px`:''} 1fr ${draft.columns.slice(0,5).map(c=>c==='form'?'56px':'40px').join(' ')}`, gap:8, padding:'6px 10px', background:draft.colors.headerBg, color:draft.colors.mutedText, fontSize:10, fontWeight:700 }}>
                <div>#</div>{draft.logos.show&&<div></div>}<div>TEAM</div>{draft.columns.slice(0,5).map(c=><div key={c} style={{textAlign:c==='form'?'left':'right'}}>{COLUMNS.find(x=>x.key===c)?.label||c}</div>)}
              </div>
              {rowsToShow.map((r:any,i:number)=>{ const zone=draft.zones.find((z:any)=>r.rank<=z.toRank); const bg=zone?.color||(r.rank===1?draft.colors.leaderHighlight:(i%2?draft.colors.rowAltBg:draft.colors.rowBg)); return <div key={r.teamId||i} style={{ display:'grid', gridTemplateColumns:`44px ${draft.logos.show?`${draft.logos.size/2}px`:''} 1fr ${draft.columns.slice(0,5).map(c=>c==='form'?'56px':'40px').join(' ')}`, gap:8, alignItems:'center', minHeight:draft.layout.rowHeight/2, background:bg, marginTop:4, padding:'4px 10px', fontSize:draft.typography.rowSize/2 }}>
                <div style={{fontWeight:800,color:draft.colors.accent}}>{r.rank}</div>
                {draft.logos.show && <div style={{ width:draft.logos.size/2, height:draft.logos.size/2, borderRadius:draft.logos.shape==='circle'?'999px':draft.logos.shape==='square'?'2px':'6px', background:'rgba(255,255,255,0.1)', overflow:'hidden' }}>{r.teamLogoUrl ? <img src={r.teamLogoUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/> : null}</div>}
                <div style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',fontWeight:700}}>{draft.names.mode==='short'?(r.shortName||r.teamName):draft.names.mode==='code'?(r.shortName||r.teamName||'').slice(0,3).toUpperCase():r.teamName}</div>
                {draft.columns.slice(0,5).map(c=><div key={c} style={{textAlign:c==='form'?'left':'right', fontWeight:c==='matchPoints'?800:600}}>{c==='setRatio'||c==='pointRatio'?Number(r[c]||0).toFixed(2):c==='form'?(r.form||[]).slice(-5).join(''): (r[c]??'-')}</div>)}
              </div>; })}
            </div>
          </div>
        </div>
        <div className="text-xs text-fg-muted mt-2">{draft.layout.fitAll ? `Fit-all: scale ${scale.toFixed(2)} for ${rowsToShow.length} teams${!fit.fits ? ` (min scale reached; consider paging)` : ''}` : `Paged: ${draft.layout.rowsPerPage} rows/page`} • 1920x1080 frame</div>
      </Card>

      <Card>
        <CardHeader><CardTitle>Themes & Actions</CardTitle></CardHeader>
        <div className="space-y-2 max-h-[75vh] overflow-auto pr-1">
          {(themesQ.data||[]).map((t:any)=><button key={t.id} className={`w-full text-left px-3 py-2 rounded border ${t.id===selectedId?'border-accent bg-accent-subtle':'border-border bg-surface-sunken'}`} onClick={()=>setSelectedId(t.id)}><div className="font-medium text-sm">{t.name}</div><div className="text-xs text-fg-muted">{t.isBuiltIn?'Built-in':'Custom'}{t.competitionId===compId?' • competition':''}</div></button>)}
          <div className="pt-2 border-t border-border grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" onClick={duplicate}>Duplicate</Button>
            <Button size="sm" variant="outline" onClick={setDefault}>Set default</Button>
            <Button size="sm" variant="outline" onClick={applyCompetition}>Apply to competition</Button>
            <Button size="sm" variant="outline" onClick={exportTheme}>Export JSON</Button>
            <Button size="sm" variant="outline" onClick={()=>exportPng(`${name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.png`, scenarioRows, draft, name, standingsQ.data?.competitionName)}>Export PNG</Button>
            <Button size="sm" variant="outline" onClick={()=>exportCsv(`${name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.csv`, scenarioRows, draft.columns as any)}>Export CSV</Button>
            <Button size="sm" variant="outline" onClick={()=>{ const w=window.open('','_blank'); if(!w) return; w.document.write(`<html><head><title>${name}</title></head><body style="font-family:sans-serif;padding:20px"><h1>${name}</h1><table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>#</th><th>Team</th>${draft.columns.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${scenarioRows.map((r:any)=>`<tr><td>${r.rank}</td><td>${r.teamName}</td>${draft.columns.map(c=>`<td>${c==='form'?(r.form||[]).join(''):r[c]??''}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`); w.document.close(); }}>Export PDF</Button>
            <label className="inline-flex items-center justify-center font-semibold rounded-[10px] text-xs px-2.5 py-1.5 gap-1.5 min-h-[36px] bg-transparent hover:bg-surface-alt text-fg border border-border-strong cursor-pointer">
              Import JSON
              <input type="file" accept="application/json" className="hidden" onChange={e=>{ importTheme(e.target.files?.[0]||null); e.currentTarget.value=''; }} />
            </label>
          </div>
          <div className="text-xs text-fg-muted pt-2 border-t border-border">Draft until Save. Apply to on-air updates the selected match output immediately through the broadcast pipeline.</div>
        </div>
      </Card>
    </div>
  </div>;
};
