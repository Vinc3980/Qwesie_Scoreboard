import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, SlidersHorizontal, Play, Calendar, MapPin, ClipboardList, Edit3, Rocket, CheckCircle2, Clock3, AlertTriangle, Archive, RotateCcw } from 'lucide-react';
import { matchApi } from '../services/api.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Badge } from '../components/ui/Badge.js';
import { Input } from '../components/ui/Input.js';
import { useNotification } from '../contexts/NotificationContext.js';
import { CourtConflictDialog, getCourtConflict, type CourtConflict } from '../components/match/CourtConflictDialog.js';
import { Modal } from '../components/ui/Modal.js';

function startLabel(scheduledAt?: string | null) {
  if (!scheduledAt) return null;
  const t = new Date(scheduledAt).getTime();
  if (!Number.isFinite(t)) return null;
  const diffMin = Math.round((t - Date.now()) / 60000);
  if (diffMin > 1) return { text: `Starts in ${diffMin} min`, tone: 'neutral' as const };
  if (diffMin >= -1) return { text: 'Starting now', tone: 'warning' as const };
  return { text: `${Math.abs(diffMin)} min late`, tone: 'warning' as const };
}

function statusAction(status: string) {
  const s = String(status || '').toUpperCase();
  if (s === 'LIVE' || s === 'PAUSED' || s === 'BETWEEN_SETS' || s === 'SUSPENDED') return { label: 'Open console', kind: 'open' as const };
  if (s === 'COMPLETED' || s === 'FINISHED' || s === 'CANCELLED') return { label: 'View report', kind: 'report' as const };
  if (s === 'READY') return { label: 'Go live', kind: 'goLive' as const };
  if (s === 'SCHEDULED') return { label: 'Go live', kind: 'goLive' as const };
  return { label: 'Open setup', kind: 'setup' as const };
}

export const MatchesPage: React.FC = () => {
  const navigate = useNavigate();
  const notify = useNotification();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const focusId = params.get('match');
  const [q, setQ] = useState('');
  const [conflict, setConflict] = useState<{ court: string; conflict: CourtConflict; matchId: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);

  const { data: matches = [], isLoading } = useQuery({ queryKey: ['matches'], queryFn: matchApi.listMatches, refetchInterval: 5000 });

  const goLive = useMutation({
    mutationFn: (id: string) => matchApi.goLive(id),
    onSuccess: (m: any) => { qc.invalidateQueries({ queryKey: ['matches'] }); notify.success('Match is LIVE'); navigate(`/live/${m.id}`); },
    onError: (e: any, id: string) => {
      const c = getCourtConflict(e);
      if (c) {
        const m = (matches as any[]).find((x) => x.id === id);
        setConflict({ court: String(m?.court || c.court || '1'), conflict: c, matchId: id });
        return;
      }
      const msg = String(e?.message || 'Could not go live');
      notify.error(msg);
      if (/not ready/i.test(msg)) navigate(`/matches/${id}/setup`);
    },
  });

  const resetMatch = useMutation({
    mutationFn: (id: string) => matchApi.resetMatch(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['matches'] }); notify.success('Match reset to 0-0'); setResetTarget(null); },
    onError: (e: any) => notify.error(e?.message || 'Failed to reset match'),
  });

  const archiveTests = useMutation({
    mutationFn: () => matchApi.archiveTestMatches(),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['matches'] }); notify.success(`Archived ${r.archived.length} test match(es)`); setArchiveConfirm(false); },
    onError: (e: any) => notify.error(e?.message || 'Failed to archive test matches'),
  });

  const filtered = useMemo(() => {
    const list = matches.filter(m => {
      const hay = `${m.teams.A.name} ${m.teams.B.name} ${m.tournament} ${m.division} ${m.court} ${m.match_no}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
    return list.sort((a: any, b: any) => {
      const ta = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });
  }, [matches, q]);

  const todayStr = new Date().toDateString();
  const today = filtered.filter((m: any) => m.scheduledAt && new Date(m.scheduledAt).toDateString() === todayStr);
  const rest = filtered.filter((m: any) => !today.includes(m));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Prepare"
        title="Matches"
        description="Configure fixtures, teams, rules, venue, rosters, and lineups before going live."
        actions={<div className="flex items-center gap-2"><Button variant="outline" onClick={() => setArchiveConfirm(true)}><Archive className="w-4 h-4" /> Archive test matches</Button><Button variant="primary" onClick={() => navigate('/matches/new')}><Plus className="w-4 h-4" /> New match</Button></div>}
      />

      <Card>
        <CardHeader>
          <CardTitle>Match list</CardTitle>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-72"><Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" /><Input className="pl-9" placeholder="Search teams, competition, court, match number" value={q} onChange={(e)=>setQ(e.target.value)} /></div>
            <Button variant="outline" size="md"><SlidersHorizontal className="w-4 h-4" /> Filters</Button>
          </div>
        </CardHeader>
        <div className="space-y-4">
          {isLoading && (
            <div className="space-y-2 animate-pulse">
              {[0,1,2,3].map(i => <div key={i} className="h-20 rounded-[14px] border border-border bg-surface-sunken" />)}
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="text-sm text-fg-subtle py-10 text-center border border-dashed border-border rounded-[14px]">
              <div className="font-semibold text-fg mb-1">No matches found</div>
              <div>Create a new match to begin setup.</div>
            </div>
          )}
          {!isLoading && today.length > 0 && <div className="text-xs font-bold uppercase tracking-[0.1em] text-fg-subtle">Today</div>}
          {(!isLoading ? (today.length ? today.concat(rest.length ? [{ __section: 'rest' } as any] : [], rest) : filtered) : []).map((m: any) => {
            if (m.__section === 'rest') return <div key="rest" className="text-xs font-bold uppercase tracking-[0.1em] text-fg-subtle pt-2">Other matches</div>;
            const action = statusAction(m.status);
            const when = startLabel(m.scheduledAt);
            const onPrimary = () => {
              if (action.kind === 'open') navigate(`/live/${m.id}`);
              else if (action.kind === 'report') navigate(`/statistics?match=${m.id}`);
              else if (action.kind === 'goLive') goLive.mutate(m.id);
              else navigate(`/matches/${m.id}/setup`);
            };
            const primaryIcon = action.kind === 'goLive' ? <Rocket className="w-4 h-4" /> : action.kind === 'open' ? <Play className="w-4 h-4" /> : action.kind === 'report' ? <CheckCircle2 className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />;
            return (
              <div key={m.id} className={`rounded-[14px] border p-3.5 bg-surface-sunken ${m.id === focusId ? 'border-accent/50' : 'border-border'}`}>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant={m.status === 'LIVE' ? 'live' : m.status === 'COMPLETED' || m.status === 'FINISHED' ? 'finished' : m.status === 'READY' ? 'success' : m.status === 'SCHEDULED' ? 'neutral' : 'warning'}>{m.status}</Badge>
                      {when && <span className={`inline-flex items-center gap-1 text-xs ${when.tone === 'warning' ? 'text-warning' : 'text-fg-subtle'}`}><Clock3 className="w-3.5 h-3.5" />{when.text}</span>}
                      <span className="text-xs text-fg-subtle font-mono tabular-nums">#{m.match_no || '-'} � {m.scheduledAt ? new Date(m.scheduledAt).toLocaleString() : (m.match_date || 'unscheduled')}</span>
                    </div>
                    <div className="text-lg font-bold text-fg font-display tracking-wide">{m.teams.A.name} <span className="text-fg-muted">vs</span> {m.teams.B.name}</div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-subtle">
                      <span className="inline-flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> {m.tournament || '-'} {m.division ? `/ ${m.division}` : ''}</span>
                      <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {m.court || '-'}</span>
                      <span className="inline-flex items-center gap-1.5 font-mono tabular-nums"><Calendar className="w-3.5 h-3.5" /> Set {m.current_set} � {m.teams.A.sets}-{m.teams.B.sets}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/matches/${m.id}/setup`)}><Edit3 className="w-4 h-4" /> {action.kind === 'goLive' ? 'Finish setup' : 'Edit setup'}</Button>
                    {m.status !== 'LIVE' && <Button variant="outline" size="sm" onClick={() => setResetTarget(m)}><RotateCcw className="w-4 h-4" /> Reset</Button>}
                    <Button variant="primary" size="sm" onClick={onPrimary} isLoading={goLive.isPending && action.kind === 'goLive'}>{primaryIcon} {action.label}</Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <CourtConflictDialog
        open={!!conflict}
        court={conflict?.court || '1'}
        conflict={conflict?.conflict || null}
        onClose={() => setConflict(null)}
        onResolved={async () => { if (conflict?.matchId) goLive.mutate(conflict.matchId); }}
      />

      <Modal isOpen={!!resetTarget} onClose={() => !resetMatch.isPending && setResetTarget(null)} title="Reset match">
        <div className="space-y-4">
          <div className="text-sm text-fg-muted">
            This will delete all events and return the match to 0-0, set 1, sets won 0-0. Rosters and setup are kept.
          </div>
          {resetTarget && (
            <div className="rounded-lg border border-border bg-surface-alt p-3 text-sm text-fg">
              <span className="font-semibold">#{resetTarget.match_no || '?'}</span> {resetTarget.teams?.A?.name || 'Home'} vs {resetTarget.teams?.B?.name || 'Away'}
              <div className="text-xs text-fg-muted mt-1">{resetTarget.status} • {resetTarget.court ? `Court ${resetTarget.court}` : 'No court'} • {resetTarget.scheduledAt ? new Date(resetTarget.scheduledAt).toLocaleString() : (resetTarget.match_date || 'unscheduled')}</div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={resetMatch.isPending}>Cancel</Button>
            <Button variant="danger" isLoading={resetMatch.isPending} onClick={() => resetTarget?.id && resetMatch.mutate(resetTarget.id)}>Reset match</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={archiveConfirm} onClose={() => !archiveTests.isPending && setArchiveConfirm(false)} title="Archive test matches">
        <div className="space-y-4">
          <div className="text-sm text-fg-muted">
            This will cancel/archive matches that look like test data (test/demo/probe/dev in match number, tournament, or team name). Live matches are never archived.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setArchiveConfirm(false)} disabled={archiveTests.isPending}>Cancel</Button>
            <Button variant="danger" isLoading={archiveTests.isPending} onClick={() => archiveTests.mutate()}>Archive test matches</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
