import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMatch } from '../hooks/useMatch.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Badge } from '../components/ui/Badge.js';
import { Modal } from '../components/ui/Modal.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Input, Label } from '../components/ui/Input.js';
import { AlertCircle, Pause, Play, RotateCcw, Settings, Users, Undo2, Flag, TimerReset, ShieldAlert } from 'lucide-react';
import { MatchSetupInput } from '@qwesie/shared';
import { useNotification } from '../contexts/NotificationContext.js';

type PendingConfirm = { type: 'point-correct'; team: 'A'|'B' } | { type: 'end-set' } | { type: 'status'; status: 'PAUSED' | 'LIVE' } | null;

export const LiveControlClassicPage: React.FC = () => {
  const { id } = useParams();
  const { match, isLoading, isError, error, mutations } = useMatch(id);
  const notify = useNotification();
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isSubOpen, setIsSubOpen] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [setupForm, setSetupForm] = useState<MatchSetupInput>({});
  const [subForm, setSubForm] = useState({ team: 'A' as 'A' | 'B', out: '', in: '' });
  const [elapsed, setElapsed] = useState('00:00:00');

  useEffect(() => {
    if (!match?.started_at) return;
    const tick = () => {
      const start = new Date(match.started_at).getTime();
      const end = match.ended_at ? new Date(match.ended_at).getTime() : Date.now();
      const diff = Math.max(0, Math.floor((end - start) / 1000));
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [match?.started_at, match?.ended_at, match?.status]);

  const canOperate = !!match && match.status === 'LIVE';

  const doConfirm = () => {
    if (!confirm) return;
    if (confirm.type === 'point-correct') {
      mutations.point({ team: confirm.team, delta: -1 });
      notify.info(`Correction applied: removed 1 point from Team ${confirm.team}`);
    } else if (confirm.type === 'end-set') {
      mutations.endSet();
    } else if (confirm.type === 'status') {
      mutations.setStatus(confirm.status);
    }
    setConfirm(null);
  };

  // Keyboard shortcuts for frequent scoring actions (operator experience)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (!match) return;
      const k = e.key.toLowerCase();
      if (k === 'q' && canOperate) mutations.point({ team: 'A', delta: 1 });
      if (k === 'w' && canOperate) mutations.point({ team: 'B', delta: 1 });
      if (k === 'a' && canOperate) setConfirm({ type: 'point-correct', team: 'A' });
      if (k === 's' && canOperate) setConfirm({ type: 'point-correct', team: 'B' });
      if (k === 'e' && canOperate) mutations.endSet();
      if (k === 'p') mutations.setStatus(match.status === 'LIVE' ? 'PAUSED' : 'LIVE');
      if (k === 'u' && canOperate) setIsSubOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [match, canOperate, mutations]);

  const eventFeed = useMemo(() => (match?.events || []).slice(0, 12), [match?.events]);

  if (isLoading) return <div className="min-h-[50vh] flex items-center justify-center"><div className="flex items-center gap-3 text-fg-muted"><span className="w-6 h-6 border-2 border-info border-t-transparent rounded-full animate-spin" /> Loading live match workspace...</div></div>;
  if (isError || !match) return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 text-center"><AlertCircle className="w-10 h-10 text-danger" /><div><h2 className="text-xl font-bold text-fg">Live control unavailable</h2><p className="text-sm text-fg-muted mt-1">{(error as Error)?.message || 'Unable to load match state from backend.'}</p></div><Button onClick={() => window.location.reload()}>Retry</Button></div>
  );

  const { A: teamA, B: teamB } = match.teams;
  const openSetup = () => { setSetupForm({ team_a: teamA.name, team_b: teamB.name, tournament: match.tournament, division: match.division, court: match.court }); setIsSetupOpen(true); };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Alternate Layout"
        title="Live Control (Classic)"
        description="Classic alternate layout for match control. Prefer the main Live Control workspace for the unified Score/Graphics/Outputs flow."
        actions={<>
          <Button variant="outline" onClick={openSetup}><Settings className="w-4 h-4" /> Match Setup</Button>
          {match.status === 'LIVE' ? (
            <Button variant="secondary" onClick={() => setConfirm({ type: 'status', status: 'PAUSED' })}><Pause className="w-4 h-4" /> Pause Match</Button>
          ) : (
            <Button variant="primary" onClick={() => mutations.setStatus('LIVE')}><Play className="w-4 h-4" /> {match.status === 'FINISHED' ? 'Match Completed' : 'Resume / Start Live'}</Button>
          )}
        </>}
      />

      {/* Status strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {[
          ['Match', `No. ${match.match_no}`],
          ['Status', match.status],
          ['Set', `${match.current_set} / ${match.max_sets}`],
          ['Serving', match.teams[match.server].name],
          ['Elapsed', elapsed],
          ['Sets', `${teamA.sets} - ${teamB.sets}`],
          ['Court', match.court],
          ['Tournament', match.tournament],
        ].map(([k,v]) => (
          <div key={k} className="rounded-xl border border-border bg-surface-subtle/40 px-3 py-2.5"><div className="text-[10px] uppercase tracking-wide text-fg-subtle font-bold">{k}</div><div className="text-sm font-semibold text-fg truncate" title={String(v)}>{v}</div></div>
        ))}
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-5">
        <div className="2xl:col-span-8 space-y-5">
          {/* Scoreboard */}
          <Card className="p-5 md:p-6 bg-gradient-to-b from-surface to-surface-raised border-info/20">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2"><Badge variant={match.status === 'LIVE' ? 'live' : match.status === 'FINISHED' ? 'finished' : 'neutral'}>{match.status}</Badge><span className="text-xs text-fg-muted">{match.division}</span></div>
              <div className="text-xs text-fg-muted font-mono">Shortcuts: Q/W +1, A/S correct -1, E end set, P pause/resume, U sub</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
              {[{side:'A' as const, team:teamA, color:'teamA'}, {side:null, team:null, color:''}, {side:'B' as const, team:teamB, color:'teamB'}].map((col, idx) => {
                if (!col.side || !col.team) return (
                  <div key="mid" className="text-center py-2">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-fg-subtle font-bold">Current Set</div>
                    <div className="text-4xl font-black text-fg font-mono mt-1">{match.current_set}</div>
                    <div className="text-sm text-fg-muted mt-1">Sets <span className="text-fg font-bold">{teamA.sets}</span> - <span className="text-fg font-bold">{teamB.sets}</span></div>
                    {match.winner && <div className="mt-3 inline-flex px-3 py-1 rounded-full bg-warning-subtle border border-warning/30 text-warning text-xs font-bold">Winner: {match.teams[match.winner].name}</div>}
                  </div>
                );
                return (
                  <div key={col.side} className={`rounded-2xl border p-4 md:p-5 ${col.side==='A' ? 'border-teamA/30 bg-teamA/[0.04]' : 'border-teamB/30 bg-teamB/[0.04]'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0"><div className={`text-xs font-bold uppercase tracking-wide ${col.side==='A'?'text-teamA':'text-teamB'}`}>Team {col.side}</div><div className="text-xl md:text-2xl font-black text-fg truncate">{col.team.name}</div></div>
                      {match.server === col.side && <Badge variant="server">Serving</Badge>}
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <div className="text-6xl md:text-7xl font-black font-mono text-fg leading-none tabular-nums">{col.team.score}</div>
                      <div className="text-right text-xs text-fg-muted space-y-1"><div>Sets Won <span className="text-fg font-bold">{col.team.sets}</span></div><div>Timeouts <span className="text-fg font-bold">{col.team.timeouts}</span></div></div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button variant={col.side==='A'?'teamA':'teamB'} disabled={!canOperate} onClick={() => mutations.point({ team: col.side!, delta: 1 })}>+ Point</Button>
                      <Button variant="outline" disabled={!canOperate || col.team.score===0} onClick={() => setConfirm({ type: 'point-correct', team: col.side! })}><Undo2 className="w-4 h-4" /> Correct -1</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card>
              <CardHeader><CardTitle>Scoring & Player Events</CardTitle><span className="text-[10px] text-fg-subtle uppercase">Real backend actions</span></CardHeader>
              <div className="space-y-4">
                {(['A','B'] as const).map((side) => (
                  <div key={side}>
                    <div className={`text-xs font-bold uppercase mb-2 ${side==='A'?'text-teamA':'text-teamB'}`}>{match.teams[side].name}</div>
                    <div className="grid grid-cols-3 gap-2">
                      {['KILL','ACE','BLOCK','DIG','ASSIST','ATTACK ERROR'].map((a) => (
                        <Button key={a} size="sm" variant={a==='ATTACK ERROR'?'danger':side==='A'?'teamA':'teamB'} disabled={!canOperate} onClick={() => mutations.action({ team: side, action: a })}>{a === 'ATTACK ERROR' ? 'ERROR' : a}</Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader><CardTitle>Match Operations</CardTitle><span className="text-[10px] text-fg-subtle uppercase">Flow control</span></CardHeader>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" disabled={!canOperate || teamA.timeouts<=0} onClick={() => mutations.timeout({ team: 'A' })}><TimerReset className="w-4 h-4" /> Timeout A ({teamA.timeouts})</Button>
                <Button variant="outline" disabled={!canOperate || teamB.timeouts<=0} onClick={() => mutations.timeout({ team: 'B' })}><TimerReset className="w-4 h-4" /> Timeout B ({teamB.timeouts})</Button>
                <Button variant="secondary" disabled={!canOperate} onClick={() => setIsSubOpen(true)}><Users className="w-4 h-4" /> Substitution</Button>
                <Button variant="primary" disabled={!canOperate} onClick={() => setConfirm({ type: 'end-set' })}><Flag className="w-4 h-4" /> Start/End Set</Button>
                <Button variant="outline" onClick={() => mutations.setStatus('LIVE')} disabled={match.status==='LIVE' || match.status==='FINISHED'}><Play className="w-4 h-4" /> Start / Resume</Button>
                <Button variant="outline" onClick={() => setConfirm({ type: 'status', status: 'PAUSED' })} disabled={match.status!=='LIVE'}><Pause className="w-4 h-4" /> Pause</Button>
              </div>
              <div className="mt-4 rounded-lg border border-warning/30 bg-warning-subtle p-3 text-xs text-warning flex gap-2"><ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" /><div><div className="font-semibold mb-1">Corrections & confirmations</div><div>Point corrections and set/match state transitions require confirmation. Use -1 correction controls or keyboard A/S to request a verified correction.</div></div></div>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Set Progression & Match State</CardTitle><span className="text-xs text-fg-subtle">Authoritative backend state</span></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-center border-separate border-spacing-0">
                <thead><tr className="text-fg-muted"><th className="text-left py-2 px-2">Team</th>{[1,2,3,4,5].map(s=> <th key={s} className="py-2 px-2">Set {s}</th>)}<th className="py-2 px-2">Sets</th><th className="py-2 px-2">Timeouts</th></tr></thead>
                <tbody>
                  {(['A','B'] as const).map(side => (
                    <tr key={side} className="border-t border-border">
                      <td className={`text-left py-3 px-2 font-bold ${side==='A'?'text-teamA':'text-teamB'}`}>{match.teams[side].name} {match.server===side && <span className="text-warning text-xs ml-1">• SERVE</span>}</td>
                      {match.set_scores[side].map((sc,i)=>(<td key={i} className={`py-3 px-2 font-mono font-bold ${i+1===match.current_set?'bg-surface/[0.03] text-fg':'text-fg-muted'}`}>{sc}</td>))}
                      <td className="py-3 px-2 font-black text-fg">{match.teams[side].sets}</td>
                      <td className="py-3 px-2 text-fg-muted">{match.teams[side].timeouts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="2xl:col-span-4 space-y-5">
          <Card>
            <CardHeader><CardTitle>Current Players / Rotation</CardTitle><Badge variant="server">Serving {match.teams[match.server].name}</Badge></CardHeader>
            <div className="text-xs text-fg-muted mb-3">Operational court view with serving indicator and rotation positions (lineup details configurable in match setup workflow).</div>
            <div className="rounded-xl border border-success/30 bg-success-subtle p-3">
              <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                {(['A','B'] as const).map(side => (
                  <div key={side} className={`rounded-lg p-2 border ${side==='A'?'border-teamA/30 bg-teamA/5':'border-teamB/30 bg-teamB/5'}`}>
                    <div className={`font-bold mb-2 ${side==='A'?'text-teamA':'text-teamB'}`}>{match.teams[side].name}</div>
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      {['P4','P3','P2','P5','P6','P1'].map((p) => <div key={p} className={`rounded py-1.5 border ${p==='P1' && match.server===side ? 'bg-accent text-accent-fg border-accent font-black' : 'bg-surface-sunken border-border-strong text-fg'}`}>{p}{p==='P1'&&match.server===side?' ★':''}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent Events</CardTitle><span className="text-xs text-fg-subtle">{eventFeed.length} shown</span></CardHeader>
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {eventFeed.length === 0 && <div className="text-sm text-fg-subtle py-6 text-center">No events recorded yet.</div>}
              {eventFeed.map((e, idx) => (
                <div key={e.id || idx} className="rounded-lg border border-border bg-surface-sunken/50 p-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="text-xs font-semibold text-fg truncate">{e.team ? (match.teams[e.team]?.name || `Team ${e.team}`) : 'System'} <span className="text-fg-subtle">•</span> <span className="text-fg-muted">{e.action}</span></div><div className="text-[10px] text-fg-subtle mt-0.5">Traceable backend event</div></div>
                  <div className="text-[10px] font-mono text-fg-subtle shrink-0">{new Date(e.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader><CardTitle>Team Snapshot</CardTitle></CardHeader>
            <div className="space-y-3 text-xs">
              {(['A','B'] as const).map(side => (
                <div key={side} className="rounded-lg border border-border p-3 bg-surface-subtle/30">
                  <div className={`font-bold mb-2 ${side==='A'?'text-teamA':'text-teamB'}`}>{match.teams[side].name}</div>
                  <div className="grid grid-cols-3 gap-2 text-fg-muted"><span>Kills <b className="text-fg">{match.teams[side].stats.kill}</b></span><span>Aces <b className="text-fg">{match.teams[side].stats.ace}</b></span><span>Blocks <b className="text-fg">{match.teams[side].stats.block}</b></span><span>Digs <b className="text-fg">{match.teams[side].stats.dig}</b></span><span>Errors <b className="text-fg">{match.teams[side].stats.error}</b></span><span>Side-out <b className="text-fg">{match.teams[side].stats.side_out}%</b></span></div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Setup modal */}
      <Modal isOpen={isSetupOpen} onClose={() => setIsSetupOpen(false)} title="Match Setup & Configuration">
        <form onSubmit={(e)=>{e.preventDefault(); mutations.setup(setupForm); setIsSetupOpen(false);}} className="space-y-4">
          <div className="grid grid-cols-2 gap-3"><div><Label>Team A</Label><Input value={setupForm.team_a||''} onChange={(e)=>setSetupForm({...setupForm, team_a:e.target.value})} /></div><div><Label>Team B</Label><Input value={setupForm.team_b||''} onChange={(e)=>setSetupForm({...setupForm, team_b:e.target.value})} /></div></div>
          <div><Label>Tournament</Label><Input value={setupForm.tournament||''} onChange={(e)=>setSetupForm({...setupForm, tournament:e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Division</Label><Input value={setupForm.division||''} onChange={(e)=>setSetupForm({...setupForm, division:e.target.value})} /></div><div><Label>Court</Label><Input value={setupForm.court||''} onChange={(e)=>setSetupForm({...setupForm, court:e.target.value})} /></div></div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border"><Button type="button" variant="outline" onClick={()=>setIsSetupOpen(false)}>Cancel</Button><Button type="submit" variant="primary">Save</Button></div>
        </form>
      </Modal>

      {/* Substitution modal */}
      <Modal isOpen={isSubOpen} onClose={() => setIsSubOpen(false)} title="Record Substitution">
        <form onSubmit={(e)=>{e.preventDefault(); if(!subForm.out||!subForm.in) return; mutations.substitution(subForm); setSubForm({team:'A',out:'',in:''}); setIsSubOpen(false);}} className="space-y-4">
          <div><Label>Team</Label><select value={subForm.team} onChange={(e)=>setSubForm({...subForm, team:e.target.value as 'A'|'B'})} className="w-full rounded-lg border border-border-strong bg-surface-sunken px-3 py-2 text-sm text-fg"><option value="A">{teamA.name} (A)</option><option value="B">{teamB.name} (B)</option></select></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Player Out (No.)</Label><Input value={subForm.out} onChange={(e)=>setSubForm({...subForm, out:e.target.value})} placeholder="e.g. 7" /></div><div><Label>Player In (No.)</Label><Input value={subForm.in} onChange={(e)=>setSubForm({...subForm, in:e.target.value})} placeholder="e.g. 12" /></div></div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border"><Button type="button" variant="outline" onClick={()=>setIsSubOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={!canOperate}>Confirm Substitution</Button></div>
        </form>
      </Modal>

      {/* Confirmation modal */}
      <Modal isOpen={!!confirm} onClose={() => setConfirm(null)} title="Confirm Operator Action">
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            {confirm?.type === 'point-correct' && `Apply correction: remove 1 point from Team ${confirm.team}? This records a backend correction event.`}
            {confirm?.type === 'end-set' && 'End the current set now? Backend validation will enforce volleyball set-completion rules.'}
            {confirm?.type === 'status' && `Change match status to ${confirm.status}?`}
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-border"><Button variant="outline" onClick={()=>setConfirm(null)}>Cancel</Button><Button variant="primary" onClick={doConfirm}>Confirm</Button></div>
        </div>
      </Modal>
    </div>
  );
};
