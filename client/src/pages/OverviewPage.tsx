import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePollingFallback } from '../hooks/useSocketHealthy.js';
import { useNavigate } from 'react-router-dom';
import { Activity, CalendarClock, CheckCircle2, Circle, Plus, ArrowRight, Tv, Radio, Trophy, ClipboardCheck } from 'lucide-react';
import { broadcastApi, competitionsApi, matchApi, systemApi } from '../services/api.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Badge } from '../components/ui/Badge.js';
import { useNotification } from '../contexts/NotificationContext.js';
import { CourtConflictDialog, getCourtConflict, type CourtConflict } from '../components/match/CourtConflictDialog.js';
import { useCurrentMatch } from '../contexts/CurrentMatchContext.js';
import { cn } from '../utils/cn.js';

function statusVariant(status: string) {
  const s = String(status || '').toUpperCase();
  if (s === 'LIVE' || s === 'PAUSED' || s === 'BETWEEN_SETS') return 'live' as const;
  if (s === 'COMPLETED' || s === 'FINISHED') return 'finished' as const;
  return 'neutral' as const;
}

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const notify = useNotification();
  const qc = useQueryClient();
  const { currentMatchId, currentMatch, matches, setCurrentMatchId } = useCurrentMatch();
  const [conflict, setConflict] = useState<{ court: string; conflict: CourtConflict } | null>(null);
  const poll = usePollingFallback(20_000);

  const targetMatch = useMemo(() => {
    if (currentMatch) return currentMatch;
    const list = Array.isArray(matches) ? matches : [];
    const inPlay = list.find((m: any) => ['LIVE', 'PAUSED', 'BETWEEN_SETS', 'SUSPENDED'].includes(String(m.status || '').toUpperCase()));
    if (inPlay) return inPlay;
    const upcoming = list.filter((m: any) => !['COMPLETED', 'CANCELLED', 'FINISHED'].includes(String(m.status || '').toUpperCase()));
    return upcoming[0] || list[0] || null;
  }, [currentMatch, matches]);

  const matchId = targetMatch?.id || null;
  const compsQ = useQuery({ queryKey: ['competitions'], queryFn: competitionsApi.list, staleTime: 60_000 });
  const firstCompId = compsQ.data?.[0]?.id;
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); }, []);
  const todayEnd = useMemo(() => { const d = new Date(); d.setHours(23,59,59,999); return d.toISOString(); }, []);
  const todayFxQ = useQuery({ queryKey: ['overview-fixtures', firstCompId, todayStart], queryFn: () => competitionsApi.fixtures(firstCompId!, { from: todayStart, to: todayEnd, limit: 6 }), enabled: !!firstCompId, refetchInterval: poll ?? 30000 });
  const miniLbQ = useQuery({ queryKey: ['overview-standings', firstCompId], queryFn: () => competitionsApi.standings(firstCompId!, {}), enabled: !!firstCompId, refetchInterval: poll ?? 60000 });

  const { data: fullMatch } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => matchApi.getMatchById(matchId!),
    enabled: !!matchId,
    refetchInterval: poll,
    staleTime: 10_000,
  });
  const m: any = fullMatch || targetMatch || null;

  const { data: readiness } = useQuery({
    queryKey: ['readiness', matchId],
    queryFn: () => matchApi.getReadiness(matchId!),
    enabled: !!matchId,
    refetchInterval: poll,
    staleTime: 10_000,
  });
  const { data: scene } = useQuery({
    queryKey: ['broadcast-scene', matchId],
    queryFn: () => broadcastApi.getSceneState(matchId!),
    enabled: !!matchId,
    refetchInterval: poll,
    staleTime: 10_000,
  });
  const { data: sysInfo } = useQuery({
    queryKey: ['system-info'],
    queryFn: systemApi.info,
    refetchInterval: poll,
    staleTime: 10_000,
  });

  const createQuick = useMutation({
    mutationFn: () => matchApi.createMatch({}),
    onSuccess: (created: any) => {
      qc.invalidateQueries({ queryKey: ['matches'] });
      if (created?.id) { setCurrentMatchId(created.id); navigate(`/matches/${created.id}/setup`); }
      else navigate('/matches/new');
      notify.success('Match created');
    },
    onError: (e: any) => notify.error(e?.message || 'Failed to create match'),
  });

  const goLive = useMutation({
    mutationFn: () => matchApi.goLive(matchId!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['matches'] }); if (matchId) navigate(`/live/${matchId}`); notify.success('Match is live'); },
    onError: (e: any) => {
      const c = getCourtConflict(e);
      if (c) { setConflict({ court: String(targetMatch?.court || c.court || '1'), conflict: c }); return; }
      notify.error(e?.message || 'Unable to go live. Complete setup first.');
      if (matchId) navigate(`/matches/${matchId}/setup`);
    },
  });

  const counts = sysInfo?.connectedClients?.byType || { scorebug: 0, graphics: 0, console: 0, other: 0 };
  const outputsConnected = (counts.scorebug || 0) > 0 || (counts.graphics || 0) > 0 || (sysInfo?.connectedClients?.total || 0) > 0;
  const scorebugVisible = scene ? (scene.scorebug?.visible !== false) : false;

  const readinessItems: any[] = Array.isArray(readiness?.checklist) ? readiness.checklist : (Array.isArray((readiness as any)?.items) ? (readiness as any).items : []);
  const readyOk = (i: any) => !!(i?.ok ?? i?.done ?? i?.complete ?? i?.passed);
  const keyOf = (i: any) => String(i?.key || i?.id || i?.name || i?.label || '').toLowerCase();
  const rosterItems = readinessItems.filter(i => keyOf(i).includes('roster'));
  const lineupItems = readinessItems.filter(i => keyOf(i).includes('lineup') || keyOf(i).includes('starting') || keyOf(i).includes('start'));
  const teamsItem = readinessItems.find(i => keyOf(i).includes('team'));
  const teamsOk = teamsItem ? readyOk(teamsItem) : !!(m?.teams?.A?.name && m?.teams?.B?.name);
  const rostersOk = rosterItems.length ? rosterItems.every(readyOk) : (((m?.teams?.A?.lineup?.length || 0) + (m?.teams?.A?.bench?.length || 0)) >= 6 && ((m?.teams?.B?.lineup?.length || 0) + (m?.teams?.B?.bench?.length || 0)) >= 6);
  const startingSixOk = lineupItems.length ? lineupItems.every(readyOk) : ((m?.teams?.A?.lineup?.length || 0) >= 6 && (m?.teams?.B?.lineup?.length || 0) >= 6);
  const status = String(m?.status || '').toUpperCase();
  const isLiveOrLater = ['LIVE', 'PAUSED', 'BETWEEN_SETS', 'SUSPENDED', 'COMPLETED', 'FINISHED'].includes(status);

  const checklist = [
    { key: 'teams', label: 'Teams', ok: teamsOk, detail: teamsOk ? `${m?.teams?.A?.name || 'A'} vs ${m?.teams?.B?.name || 'B'}` : 'Set home and away teams' },
    { key: 'rosters', label: 'Rosters', ok: rostersOk, detail: rostersOk ? 'Rosters ready' : 'Add players to both rosters' },
    { key: 'startingSix', label: 'Starting six saved', ok: startingSixOk, detail: startingSixOk ? 'Starting lineups saved' : 'Set and save starting six for set 1' },
    { key: 'outputs', label: 'Outputs connected', ok: outputsConnected, detail: outputsConnected ? `Clients connected (SB ${counts.scorebug || 0}, GFX ${counts.graphics || 0})` : 'Open Outputs, copy URLs, and connect OBS/displays' },
    { key: 'scorebug', label: 'Scorebug visible', ok: scorebugVisible || isLiveOrLater, detail: scorebugVisible || isLiveOrLater ? 'Scorebug is visible' : 'Enable scorebug visibility for this match' },
  ];

  const nextStep = (() => {
    if (!m) return { label: 'Create a match', action: () => createQuick.mutate(), loading: createQuick.isPending };
    if (!teamsOk) return { label: 'Set up teams', action: () => navigate(`/matches/${m.id}/setup`), loading: false };
    if (!rostersOk) return { label: 'Set up rosters', action: () => navigate(`/matches/${m.id}/setup`), loading: false };
    if (!startingSixOk) return { label: 'Save starting six', action: () => navigate(`/matches/${m.id}/setup`), loading: false };
    if (!outputsConnected) return { label: 'Connect outputs', action: () => navigate(`/live/${m.id}?tab=outputs`), loading: false };
    if (!scorebugVisible && !isLiveOrLater) return { label: 'Show scorebug & go live', action: () => navigate(`/live/${m.id}?tab=graphics`), loading: false };
    if (isLiveOrLater) return { label: 'Open Live Control', action: () => navigate(`/live/${m.id}`), loading: false };
    return { label: 'Go Live', action: () => goLive.mutate(), loading: goLive.isPending };
  })();

  const allDone = checklist.every(c => c.ok) && isLiveOrLater;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Today"
        title="Match-day launchpad"
        description="Follow the checklist to prepare and go live. One workspace, one path."
        actions={<>
          <Button variant="secondary" onClick={() => navigate('/matches')}><CalendarClock className="w-4 h-4" /> Matches</Button>
          <Button variant="outline" onClick={() => createQuick.mutate()} isLoading={createQuick.isPending}><Plus className="w-4 h-4" /> New match</Button>
        </>}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{m ? 'Next / current match' : 'Get started'}</CardTitle>
            {m && <Badge variant={statusVariant(m.status)}>{String(m.status || 'SCHEDULED')}</Badge>}
          </CardHeader>
          {m ? (
            <div className="space-y-4">
              <div className="rounded-[14px] border border-border bg-surface-sunken/50 p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-fg-subtle">{m.tournament || 'Tournament'} · {m.division || 'Division'} · {m.court || 'Court'} · No. {m.match_no || '-'}</div>
                    <div className="mt-1 font-bold text-fg text-xl truncate font-display tracking-wide">{m.teams?.A?.name || 'Team A'} <span className="text-fg-muted font-medium">vs</span> {m.teams?.B?.name || 'Team B'}</div>
                    <div className="text-xs text-fg-subtle mt-1 num-tabular tabular-nums">Set {m.current_set || 1} · {m.teams?.A?.score ?? 0}-{m.teams?.B?.score ?? 0} · Sets {m.teams?.A?.sets ?? 0}-{m.teams?.B?.sets ?? 0}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/matches/${m.id}/setup`)}><ClipboardCheck className="w-4 h-4" /> Setup</Button>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/live/${m.id}?tab=outputs`)}><Tv className="w-4 h-4" /> Outputs</Button>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-fg mb-2 flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-warning" /> Match-day checklist</div>
                <div className="space-y-2">
                  {checklist.map((item, idx) => {
                    const isNext = !item.ok && checklist.slice(0, idx).every(c => c.ok);
                    return (
                      <div key={item.key} className={cn('flex items-start gap-3 rounded-[12px] border p-3', item.ok ? 'border-success/30 bg-success/5' : isNext ? 'border-warning/40 bg-warning/5' : 'border-border bg-surface-sunken/50')}>
                        <div className={cn('mt-0.5', item.ok ? 'text-success' : isNext ? 'text-warning' : 'text-fg-muted')}>{item.ok ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-fg">{item.label}</span>
                            {isNext && !item.ok && <span className="text-[10px] uppercase tracking-wide font-bold text-warning bg-warning-subtle border border-warning/30 rounded px-1.5 py-0.5">Next</span>}
                          </div>
                          <div className="text-xs text-fg-subtle mt-0.5">{item.detail}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-border">
                <Button variant="primary" onClick={nextStep.action} isLoading={!!nextStep.loading} className="min-w-[220px]">
                  <ArrowRight className="w-4 h-4" />
                  {nextStep.label}
                </Button>
                {allDone && <span className="text-sm text-success font-semibold">All checks complete — match is ready/live.</span>}
                {!allDone && <span className="text-xs text-fg-subtle">Complete the checklist in order to reach Go Live.</span>}
              </div>
            </div>
          ) : (
            <div className="text-sm text-fg-subtle py-10 text-center border border-dashed border-border rounded-[14px]">
              <div className="font-semibold text-fg mb-1">No matches yet</div>
              <div>Create a match to start the match-day checklist.</div>
              <Button variant="primary" size="sm" className="mt-3" onClick={() => createQuick.mutate()} isLoading={createQuick.isPending}><Plus className="w-4 h-4" /> Create match</Button>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Quick status</CardTitle><Radio className="w-4 h-4 text-fg-muted" /></CardHeader>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><span className="text-fg-muted">Scorebug clients</span><span className={cn('font-semibold', (counts.scorebug||0)>0 ? 'text-success' : 'text-fg-muted')}>{counts.scorebug || 0}</span></div>
              <div className="flex items-center justify-between"><span className="text-fg-muted">Graphics clients</span><span className={cn('font-semibold', (counts.graphics||0)>0 ? 'text-success' : 'text-fg-muted')}>{counts.graphics || 0}</span></div>
              <div className="flex items-center justify-between"><span className="text-fg-muted">Scorebug visible</span><span className={cn('font-semibold', scorebugVisible || isLiveOrLater ? 'text-success' : 'text-fg-muted')}>{m ? (scorebugVisible || isLiveOrLater ? 'Yes' : 'No') : '-'}</span></div>
              <div className="pt-2"><Button variant="outline" size="sm" className="w-full" onClick={() => window.dispatchEvent(new CustomEvent('qwesie:open-outputs'))}><Tv className="w-4 h-4" /> Open Outputs drawer</Button></div>
            </div>
          </Card>
          <Card>
            <CardHeader><CardTitle>Shortcuts</CardTitle><Trophy className="w-4 h-4 text-warning" /></CardHeader>
            <div className="grid grid-cols-1 gap-2">
              {m && <Button variant="outline" onClick={() => navigate(`/live/${m.id}`)}>Live Control</Button>}
              {m && <Button variant="outline" onClick={() => navigate(`/matches/${m.id}/team-sheet`)}><ClipboardCheck className="w-4 h-4" /> Team sheet</Button>}
              <Button variant="outline" onClick={() => navigate('/matches')}>Matches</Button>
              <Button variant="outline" onClick={() => navigate('/teams')}>Teams & players</Button>
              <Button variant="outline" onClick={() => navigate('/statistics')}>Statistics</Button>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Today's fixtures</CardTitle><Button size="sm" variant="outline" onClick={() => navigate('/fixtures')}>All fixtures</Button></CardHeader>
          <div className="space-y-2">
            {(todayFxQ.data?.items || []).slice(0,5).map((m:any) => (
              <div key={m.id} className="flex items-center gap-2 text-sm p-2 rounded border border-border bg-surface-sunken/40">
                <span className="w-14 text-xs text-fg-muted">{m.scheduledAt ? new Date(m.scheduledAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '--:--'}</span>
                <span className="flex-1 truncate font-medium">{m.homeTeam?.shortName||m.homeTeamName} <span className="text-fg-muted">{(m.status==='COMPLETED'||m.status==='LIVE')?`${m.setsWonHome}-${m.setsWonAway}`:'vs'}</span> {m.awayTeam?.shortName||m.awayTeamName}</span>
                <Badge variant={statusVariant(m.status)}>{m.status}</Badge>
              </div>
            ))}
            {!todayFxQ.isLoading && !(todayFxQ.data?.items||[]).length && <div className="text-sm text-fg-subtle">No fixtures today.</div>}
          </div>
        </Card>
        <Card>
          <CardHeader><CardTitle>Mini leaderboard</CardTitle><Button size="sm" variant="outline" onClick={() => navigate('/leaderboard')}>Full leaderboard</Button></CardHeader>
          <div className="space-y-1">
            {(miniLbQ.data?.rows || []).slice(0,5).map((r:any) => (
              <div key={r.teamId} className="flex items-center gap-2 text-sm py-1.5 border-b border-border/50 last:border-0">
                <span className="w-6 font-semibold text-fg-muted">{r.rank}</span>
                <span className="flex-1 truncate">{r.teamName}</span>
                <span className="text-fg-muted">{r.played}P</span>
                <span className="font-bold w-8 text-right">{r.matchPoints}</span>
              </div>
            ))}
            {!miniLbQ.isLoading && !(miniLbQ.data?.rows||[]).length && <div className="text-sm text-fg-subtle">No standings yet.</div>}
          </div>
        </Card>
      </div>

      <CourtConflictDialog
        open={!!conflict}
        court={conflict?.court || targetMatch?.court || '1'}
        conflict={conflict?.conflict || null}
        onClose={() => setConflict(null)}
        onResolved={async () => { if (matchId) goLive.mutate(); }}
      />
    </div>
  );
};

export default OverviewPage;
