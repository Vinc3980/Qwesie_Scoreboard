import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, Copy, Save, Upload, AlertTriangle, Wand2, Tv, Hash, UserPlus } from 'lucide-react';
import { competitionsApi, lineupApi, matchApi, rosterApi, systemApi, teamsApi } from '../services/api.js';
import OutputsPanel from '../components/outputs/OutputsPanel.js';
import { CourtConflictDialog, getCourtConflict, type CourtConflict } from '../components/match/CourtConflictDialog.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Input, Label, Select, Textarea } from '../components/ui/Input.js';
import { Badge } from '../components/ui/Badge.js';
import { useNotification } from '../contexts/NotificationContext.js';
import { useCurrentMatch } from '../contexts/CurrentMatchContext.js';
import { parseBulkPlayerRows } from '@qwesie/shared';
import { formatApiError } from '../utils/apiErrors.js';
import {
  POSITIONS,
  autoNumberRows,
  buildRosterPayload,
  emptyRow,
  hasRowContent,
  isValidJersey,
  mapSavedRosterToRow,
  mapTeamPlayerToRow,
  meaningfulRowCount,
  parseJersey,
  rosterSaveBlockMessage,
  sideLabel,
  validateRosterRows,
  type RosterRow,
  type RowIssueMap,
} from '../utils/matchSetupRoster.js';

type RosterEditorViewProps = {
  side: 'A' | 'B';
  rows: RosterRow[];
  paste: string; setPaste: (v: string) => void;
  quick: string; setQuick: (v: string) => void;
  saving: boolean;
  issuesByRow: RowIssueMap;
  teamHasNoPlayers: boolean;
  onLoadTeam: (side: 'A'|'B') => void;
  onCopyLast: (side: 'A'|'B') => void;
  onSave: (side: 'A'|'B') => void;
  onAutoNumber: (side: 'A'|'B') => void;
  onUpdateCell: (side: 'A'|'B', key: string, patch: Partial<RosterRow>) => void;
  onKeyDownCell: (e: React.KeyboardEvent<HTMLInputElement>, side: 'A'|'B', key: string, col: 'jersey'|'name'|'position') => void;
  onRemoveRow: (side: 'A'|'B', key: string) => void;
  onAddRow: (side: 'A'|'B') => void;
  onSelectAll: (side: 'A'|'B') => void;
  onImportPaste: (side: 'A'|'B') => void;
  onQuickAdd: (side: 'A'|'B') => void;
};

const RosterEditorView: React.FC<RosterEditorViewProps> = ({
  side, rows, paste, setPaste, quick, setQuick, saving, issuesByRow, teamHasNoPlayers,
  onLoadTeam, onCopyLast, onSave, onAutoNumber, onUpdateCell, onKeyDownCell, onRemoveRow, onAddRow, onSelectAll, onImportPaste, onQuickAdd,
}) => {
  const parsed = parseBulkPlayerRows(paste);
  const validation = validateRosterRows(rows, side);
  const included = rows.filter(r => r.included).length;
  const needsJersey = rows.filter(r => r.included && !isValidJersey(parseJersey(r.jerseyNumber))).length;
  const dupNums = new Set<number>();
  const seen = new Map<number, number>();
  rows.forEach(r => { if (!r.included) return; const n = parseJersey(r.jerseyNumber); if (isValidJersey(n)) seen.set(n, (seen.get(n) || 0) + 1); });
  seen.forEach((count, n) => { if (count > 1) dupNums.add(n); });

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{sideLabel(side)} Roster</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onLoadTeam(side)}>Pre-fill from team</Button>
          <Button variant="outline" size="sm" onClick={() => onAutoNumber(side)} disabled={needsJersey === 0}><Hash className="w-4 h-4" />Auto-number</Button>
          <Button variant="outline" size="sm" onClick={() => onCopyLast(side)}><Copy className="w-4 h-4" />Copy last match</Button>
          <Button variant="secondary" size="sm" onClick={() => onSave(side)} isLoading={saving}>Save roster</Button>
        </div>
      </CardHeader>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={Object.keys(issuesByRow).length || validation.missingJerseyCount ? 'neutral' : 'success'}>{included} players</Badge>
          <span className="text-fg-muted">{validation.liberos} libero â€¢ {validation.captains} captain</span>
          {needsJersey > 0 && <span className="text-warning inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{needsJersey} need jersey numbers</span>}
          {included < 6 && <span className="text-warning inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Need at least 6 players</span>}
          {included > 16 && <span className="text-warning inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Max 16 players</span>}
          {dupNums.size > 0 && <span className="text-danger inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Duplicate jerseys</span>}
          {validation.captains > 1 && <span className="text-danger inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Only 1 captain allowed</span>}
          {validation.liberos > 1 && <span className="text-danger inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Only 1 libero allowed</span>}
        </div>

        {teamHasNoPlayers && (
          <div className="rounded-lg border border-warning/40 bg-warning-subtle p-3 text-sm text-fg flex flex-wrap items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span>This team has no players yet.</span>
            <Link to="/players" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"><UserPlus className="w-4 h-4" />Add players</Link>
          </div>
        )}

        <div className="overflow-auto border border-border rounded-lg">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-surface-sunken"><tr><th className="p-2 text-left text-fg-muted">Use</th><th className="p-2 text-left text-fg-muted">#</th><th className="p-2 text-left text-fg-muted">Name</th><th className="p-2 text-left text-fg-muted">Pos</th><th className="p-2 text-fg-muted">C</th><th className="p-2 text-fg-muted">L</th><th className="p-2"></th></tr></thead>
            <tbody>
              {rows.map((r, rowIndex) => {
                const rowIssues = issuesByRow[r._key] || [];
                const jerseyNum = parseJersey(r.jerseyNumber);
                const jerseyInvalid = r.included && (String(r.jerseyNumber || '').trim() === '' ? hasRowContent(r) : !isValidJersey(jerseyNum));
                const dup = isValidJersey(jerseyNum) && dupNums.has(jerseyNum);
                return (
                  <tr key={r._key} className="border-t border-border align-top">
                    <td className="p-2 pt-3"><input type="checkbox" checked={r.included} onChange={e => onUpdateCell(side, r._key, { included: e.target.checked })} aria-label={`Include row ${rowIndex + 1}`} /></td>
                    <td className="p-2 w-24">
                      <input
                        data-side={side}
                        data-col="jersey"
                        value={r.jerseyNumber}
                        onKeyDown={e => onKeyDownCell(e, side, r._key, 'jersey')}
                        onChange={e => onUpdateCell(side, r._key, { jerseyNumber: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) })}
                        className={`w-16 rounded border px-2 py-1 bg-surface-sunken text-fg ${(jerseyInvalid || dup) ? 'border-danger focus-visible:ring-danger' : 'border-border-strong'}`}
                        aria-label={`Row ${rowIndex + 1} jersey number`}
                        inputMode="numeric"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        data-side={side}
                        data-col="name"
                        value={r.name}
                        onKeyDown={e => onKeyDownCell(e, side, r._key, 'name')}
                        onChange={e => onUpdateCell(side, r._key, { name: e.target.value })}
                        className={`w-full rounded border px-2 py-1 bg-surface-sunken text-fg ${(rowIssues.some(m => /name/i.test(m))) ? 'border-danger' : 'border-border-strong'}`}
                        placeholder="Player name"
                        aria-label={`Row ${rowIndex + 1} name`}
                      />
                      {rowIssues.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {rowIssues.map((msg, i) => <div key={i} className="text-xs text-danger">{msg}</div>)}
                        </div>
                      )}
                    </td>
                    <td className="p-2 w-28">
                      <select data-col="position" value={r.position} onChange={e => onUpdateCell(side, r._key, { position: e.target.value, isLibero: e.target.value === 'L' ? true : r.isLibero })} className="w-full rounded border border-border-strong px-2 py-1 bg-surface-sunken text-fg" aria-label={`Row ${rowIndex + 1} position`}>
                        <option value="">-</option>{POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td className="p-2 text-center"><input type="checkbox" checked={r.isCaptain} onChange={e => onUpdateCell(side, r._key, { isCaptain: e.target.checked })} aria-label={`Row ${rowIndex + 1} captain`} /></td>
                    <td className="p-2 text-center"><input type="checkbox" checked={r.isLibero} onChange={e => onUpdateCell(side, r._key, { isLibero: e.target.checked, position: e.target.checked ? 'L' : r.position })} aria-label={`Row ${rowIndex + 1} libero`} /></td>
                    <td className="p-2 text-right"><button type="button" className="text-xs text-fg-muted hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded px-1" onClick={() => onRemoveRow(side, r._key)}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => onAddRow(side)}>+ Add row</Button><Button variant="ghost" size="sm" onClick={() => onSelectAll(side)}>Select all</Button></div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-3 space-y-2 bg-surface">
            <div className="text-xs font-semibold text-fg">Paste roster</div>
            <Textarea value={paste} onChange={e => setPaste(e.target.value)} className="h-24 text-xs font-mono" placeholder={"7, K. Mensah, OH\n12\tJ. Doe\tL"} />
            {paste && <div className="text-xs text-fg-muted">Preview: {parsed.validCount} valid, {parsed.errorCount} errors {parsed.rows.filter(r => !r.valid).slice(0, 2).map(r => r.errors.join(';')).join(' | ')}</div>}
            <Button variant="secondary" size="sm" onClick={() => onImportPaste(side)}><Upload className="w-4 h-4" />Import valid rows</Button>
          </div>
          <div className="rounded-lg border border-border p-3 space-y-2 bg-surface">
            <div className="text-xs font-semibold text-fg">Quick-add number chips</div>
            <div className="flex gap-2"><Input value={quick} onChange={e => setQuick(e.target.value)} placeholder="7, 12, 3" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onQuickAdd(side); } }} /><Button variant="secondary" size="sm" onClick={() => onQuickAdd(side)}>Add</Button></div>
            <p className="text-xs text-fg-muted">Type jersey numbers + Enter to add placeholders to name later.</p>
          </div>
        </div>
      </div>
    </Card>
  );
};

type LineupPickerViewProps = {
  side: 'A' | 'B';
  roster: RosterRow[];
  lineup: Array<string | null>;
  selectedPos: { side: 'A'|'B'; idx: number } | null;
  onSameAsLast: (side: 'A'|'B') => void;
  onSwap: () => void;
  onSave: (side: 'A'|'B') => void;
  onSelectPos: (pos: { side: 'A'|'B'; idx: number }) => void;
  onAssign: (side: 'A'|'B', playerId: string) => void;
};

const LineupPickerView: React.FC<LineupPickerViewProps> = ({
  side, roster, lineup, selectedPos, onSameAsLast, onSwap, onSave, onSelectPos, onAssign,
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{sideLabel(side)} starting six (Set 1)</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onSameAsLast(side)}>Same as last set</Button>
          {side === 'A' && <Button variant="outline" size="sm" onClick={onSwap}>Swap A/B</Button>}
          <Button variant="secondary" size="sm" onClick={() => onSave(side)}>Save lineup</Button>
        </div>
      </CardHeader>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-fg-muted mb-2">Tap a court position, then tap a player. Positions 1-6 (rotation).</div>
          <div className="grid grid-cols-3 gap-2 bg-success-subtle border border-success/30 rounded-xl p-3 aspect-[4/3]">
            {[3,2,1,4,5,6].map((p) => {
              const idx = p - 1; const pid = lineup[idx]; const player = roster.find(r => r.playerId === pid || r._key === pid);
              const sel = selectedPos?.side === side && selectedPos.idx === idx;
              return (
                <button type="button" key={p} onClick={() => onSelectPos({ side, idx })} className={`rounded-lg border p-2 text-left min-h-[72px] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${sel ? 'border-accent ring-1 ring-accent/40' : 'border-border-strong'} bg-surface-raised text-fg`}>
                  <div className="text-[10px] font-bold text-fg-muted">POS {p}</div>
                  <div className="text-sm font-semibold truncate">{player ? `#${player.jerseyNumber} ${player.name}` : 'Tap to assign'}</div>
                </button>
              );
            })}
          </div>
          {lineup.some(x => !x) && <div className="text-xs text-warning mt-2 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Assign all 6 positions</div>}
        </div>
        <div>
          <div className="text-xs text-fg-muted mb-2">Roster players (tap to place in selected position)</div>
          <div className="flex flex-wrap gap-2">
            {roster.map(r => {
              const placed = lineup.findIndex(x => x === r.playerId || x === r._key);
              return (
                <button type="button" key={r._key} onClick={() => onAssign(side, r.playerId || r._key)} className={`px-3 py-2 rounded-lg border text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${placed >= 0 ? 'border-accent bg-accent-subtle' : 'border-border bg-surface-raised'} text-fg`}>
                  <span className="font-bold mr-1">#{r.jerseyNumber}</span>{r.name} {r.isLibero ? <span className="text-xs text-warning ml-1">L</span> : null}
                </button>
              );
            })}
            {!roster.length && <div className="text-sm text-fg-muted">Save roster first to pick players.</div>}
          </div>
        </div>
      </div>
    </Card>
  );
};

export const MatchSetupWizardPage: React.FC = () => {
  const { id: routeMatchId } = useParams();
  const navigate = useNavigate();
  const notify = useNotification();
  const qc = useQueryClient();
  const { setCurrentMatchId } = useCurrentMatch();
  const [conflict, setConflict] = useState<{ court: string; conflict: CourtConflict; retry?: () => Promise<void> } | null>(null);
  const [step, setStep] = useState(1);
  const [matchId, setMatchId] = useState<string | undefined>(routeMatchId);
  const [saving, setSaving] = useState(false);
  const [outputsOpen, setOutputsOpen] = useState(false);
  const [teamHasNoPlayers, setTeamHasNoPlayers] = useState<{ A: boolean; B: boolean }>({ A: false, B: false });
  const [rowIssues, setRowIssues] = useState<{ A: RowIssueMap; B: RowIssueMap }>({ A: {}, B: {} });

  const [form, setForm] = useState<any>({
    competitionId: '', tournamentId: '', division: '', court: '', venueType: 'INDOOR', scheduledAt: '', match_no: '',
    ruleset: 'FIVB_BO5', bestOfSets: 5, setsToWin: 3, regularSetPoints: 25, finalSetPoints: 15, minPointDifference: 2, timeoutsPerSet: 2, substitutionsPerSet: 6, confirmSetEnd: true,
    referee1: '', referee2: '', homeTeamId: '', awayTeamId: ''
  });
  const [homeRows, setHomeRows] = useState<RosterRow[]>([emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow()]);
  const [awayRows, setAwayRows] = useState<RosterRow[]>([emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow()]);
  const [homeLineup, setHomeLineup] = useState<Array<string | null>>([null,null,null,null,null,null]);
  const [awayLineup, setAwayLineup] = useState<Array<string | null>>([null,null,null,null,null,null]);
  const [selectedPos, setSelectedPos] = useState<{ side: 'A'|'B'; idx: number } | null>(null);
  const [pasteHome, setPasteHome] = useState(''); const [pasteAway, setPasteAway] = useState('');
  const [quickHome, setQuickHome] = useState(''); const [quickAway, setQuickAway] = useState('');

  const teamsQ = useQuery({ queryKey: ['teams'], queryFn: teamsApi.list });
  const compsQ = useQuery({ queryKey: ['competitions'], queryFn: competitionsApi.list });
  const matchesQ = useQuery({ queryKey: ['matches'], queryFn: matchApi.listMatches });
  const matchQ = useQuery({ queryKey: ['match', matchId], queryFn: () => matchApi.getMatchById(matchId!), enabled: !!matchId });
  const readinessQ = useQuery({ queryKey: ['readiness', matchId], queryFn: () => matchApi.getReadiness(matchId!), enabled: !!matchId, refetchInterval: 3000 });

  useEffect(() => { if (routeMatchId) setMatchId(routeMatchId); }, [routeMatchId]);

  useEffect(() => {
    const m = matchQ.data as any;
    if (!m) return;
    setForm((f: any) => ({
      ...f,
      competitionId: m.competitionId || '', tournamentId: m.tournamentId || '', division: m.division || '', court: m.court || '', venueType: m.venueType || 'INDOOR',
      scheduledAt: m.scheduledAt ? String(m.scheduledAt).slice(0,16) : (m.match_date ? `${m.match_date}T00:00` : ''),
      match_no: m.match_no || '', ruleset: m.ruleset || f.ruleset, referee1: m.referee1 || '', referee2: m.referee2 || '',
      homeTeamId: m.teams?.A?.id || '', awayTeamId: m.teams?.B?.id || '',
      bestOfSets: m.rules?.bestOfSets ?? f.bestOfSets, setsToWin: m.rules?.setsToWin ?? f.setsToWin, regularSetPoints: m.rules?.regularSetPoints ?? f.regularSetPoints,
      finalSetPoints: m.rules?.finalSetPoints ?? f.finalSetPoints, minPointDifference: m.rules?.minPointDifference ?? f.minPointDifference, timeoutsPerSet: m.rules?.timeoutsPerSet ?? f.timeoutsPerSet, substitutionsPerSet: m.rules?.substitutionsPerSet ?? f.substitutionsPerSet, confirmSetEnd: m.rules?.confirmSetEnd !== false,
    }));

    const toLineup = (team: any) => {
      const lineup = Array.isArray(team?.lineup) ? team.lineup : [];
      const ids = Array.from({ length: 6 }, (_, i) => lineup[i]?.id || null);
      return ids;
    };
    setHomeLineup((prev) => prev.some(Boolean) ? prev : toLineup(m.teams?.A));
    setAwayLineup((prev) => prev.some(Boolean) ? prev : toLineup(m.teams?.B));
  }, [matchQ.data]);

  const setRowsFor = (side:'A'|'B', updater: (rows:RosterRow[])=>RosterRow[]) => side==='A'?setHomeRows(updater):setAwayRows(updater);
  const rowsFor = (side:'A'|'B') => side==='A'?homeRows:awayRows;

  const applyRosterRows = (side: 'A'|'B', roster: any[]) => {
    const rows = (Array.isArray(roster) ? roster : []).map(mapSavedRosterToRow);
    setRowsFor(side, () => (rows.length ? rows : [emptyRow()]));
    setRowIssues(prev => ({ ...prev, [side]: {} }));
  };

  useEffect(() => {
    if (!matchId) return;
    let alive = true;
    (async () => {
      try {
        const [home, away] = await Promise.all([rosterApi.get(matchId, 'A').catch(() => []), rosterApi.get(matchId, 'B').catch(() => [])]);
        if (!alive) return;
        if (Array.isArray(home) && home.length) applyRosterRows('A', home);
        if (Array.isArray(away) && away.length) applyRosterRows('B', away);
      } catch {
        // ignore hydration errors
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // live validation feedback per row
  useEffect(() => { setRowIssues(prev => ({ ...prev, A: validateRosterRows(homeRows, 'A').issuesByRow })); }, [homeRows]);
  useEffect(() => { setRowIssues(prev => ({ ...prev, B: validateRosterRows(awayRows, 'B').issuesByRow })); }, [awayRows]);

  const ensureDraft = async (opts?: { skipConflictCheck?: boolean }) => {
    if (matchId) return matchId;
    if (!opts?.skipConflictCheck && form.court) {
      try {
        const ca = await systemApi.activeCourtMatch(form.court);
        const st = String(ca?.status || '').toUpperCase();
        if (ca?.matchId && ['LIVE','PAUSED','BETWEEN_SETS','SUSPENDED'].includes(st)) {
          setConflict({ court: String(form.court || '1'), conflict: { id: ca.matchId, court: form.court, status: ca.status, ...(ca.match || {}) }, retry: async () => { await ensureDraft({ skipConflictCheck: true }); } });
          throw new Error('COURT_CONFLICT_PENDING');
        }
      } catch (e: any) {
        if (e?.message === 'COURT_CONFLICT_PENDING') throw e;
        // ignore check failures, server/goLive will still enforce
      }
    }
    const created = await matchApi.createMatch({
      homeTeamId: form.homeTeamId || undefined, awayTeamId: form.awayTeamId || undefined,
      competitionId: form.competitionId || undefined, tournamentId: form.tournamentId || undefined,
      division: form.division, court: form.court, venueType: form.venueType, match_no: form.match_no,
      scheduledAt: form.scheduledAt || undefined, ruleset: form.ruleset,
      confirmSetEnd: form.confirmSetEnd !== false,
      ...(form.ruleset === 'CUSTOM' ? { bestOfSets: +form.bestOfSets, setsToWin: +form.setsToWin, regularSetPoints: +form.regularSetPoints, finalSetPoints: +form.finalSetPoints, minPointDifference: +form.minPointDifference, timeoutsPerSet: +form.timeoutsPerSet, substitutionsPerSet: +form.substitutionsPerSet } : {}),
      referee1: form.referee1, referee2: form.referee2,
    } as any);
    const newId: string = String(created?.id || '');
    const matchNo = created?.match_no || (created as any)?.matchNumber || form.match_no || 'new';
    setMatchId(newId);
    setCurrentMatchId(newId, { explicit: true });
    navigate(`/matches/${newId}/setup`, { replace: true });
    qc.invalidateQueries({ queryKey: ['matches'] });
    notify.success(`Match #${matchNo} is now current`);
    return newId;
  };

  const autosave = async (patch?: any) => {
    const id = matchId || await ensureDraft().catch(()=>undefined);
    if (!id) return;
    setSaving(true);
    try {
      await matchApi.setup({ ...form, ...patch, scheduledAt: (patch?.scheduledAt ?? form.scheduledAt) || undefined } as any, id);
      await matchApi.info({ match_no: (patch?.match_no ?? form.match_no), scheduledAt: (patch?.scheduledAt ?? form.scheduledAt) || undefined, referee1: (patch?.referee1 ?? form.referee1), referee2: (patch?.referee2 ?? form.referee2) } as any, id);
      qc.invalidateQueries({ queryKey: ['match', id] }); qc.invalidateQueries({ queryKey: ['readiness', id] });
    } catch (e: any) { notify.error(formatApiError(e)); } finally { setSaving(false); }
  };

  useEffect(() => {
    if (!matchId) return;
    const t = setTimeout(() => { autosave().catch(()=>{}); }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, form.homeTeamId, form.awayTeamId, form.competitionId, form.tournamentId, form.division, form.court, form.venueType, form.scheduledAt, form.match_no, form.ruleset, form.referee1, form.referee2, form.bestOfSets, form.setsToWin, form.regularSetPoints, form.finalSetPoints, form.minPointDifference, form.timeoutsPerSet, form.substitutionsPerSet, form.confirmSetEnd]);

  const mergeTeamRows = (existing: RosterRow[], teamRows: RosterRow[]) => {
    const byId = new Map(existing.filter(r => r.playerId).map(r => [r.playerId as string, r]));
    const manual = existing.filter(r => !r.playerId);
    const mergedTeam = teamRows.map(tr => {
      if (tr.playerId && byId.has(tr.playerId)) {
        const prev = byId.get(tr.playerId)!;
        return { ...tr, included: prev.included };
      }
      return tr;
    });
    const mergedTeamIds = new Set(mergedTeam.map(r => r.playerId).filter(Boolean) as string[]);
    const keptManual = manual.filter(r => hasRowContent(r));
    // keep any existing team-linked rows not returned? unlikely, but preserve
    const leftovers = existing.filter(r => r.playerId && !mergedTeamIds.has(r.playerId)).map(r => ({ ...r }));
    const result = [...mergedTeam, ...leftovers, ...keptManual];
    return result.length ? result : [emptyRow()];
  };

  const loadTeamRoster = async (side: 'A'|'B') => {
    const teamId = side === 'A' ? form.homeTeamId : form.awayTeamId;
    if (!teamId) return notify.error('Select a team first');
    try {
      const players = await teamsApi.players(teamId);
      const list = Array.isArray(players) ? players : [];
      if (list.length === 0) {
        setTeamHasNoPlayers(prev => ({ ...prev, [side]: true }));
        notify.info('This team has no players yet');
        return;
      }
      setTeamHasNoPlayers(prev => ({ ...prev, [side]: false }));
      const teamRows = list.map(mapTeamPlayerToRow);
      const current = rowsFor(side);
      const existingCount = meaningfulRowCount(current);

      let nextRows = teamRows;
      if (existingCount > 0) {
        const replace = window.confirm(`Replace ${existingCount} existing roster row${existingCount === 1 ? '' : 's'} with ${teamRows.length} player${teamRows.length === 1 ? '' : 's'} from this team?\n\nClick OK to replace.\nClick Cancel to merge by player.`);
        if (!replace) nextRows = mergeTeamRows(current, teamRows);
      }

      if (side === 'A') setHomeRows(nextRows.length ? nextRows : [emptyRow()]); else setAwayRows(nextRows.length ? nextRows : [emptyRow()]);
      const needJersey = nextRows.filter(r => r.included && !isValidJersey(parseJersey(r.jerseyNumber))).length;
      notify.success(`Loaded ${teamRows.length} player${teamRows.length === 1 ? '' : 's'}${needJersey ? ` (${needJersey} need jersey number${needJersey === 1 ? '' : 's'})` : ''}`);
    } catch (e: any) {
      notify.error(formatApiError(e));
    }
  };

  const copyLastRoster = async (side: 'A'|'B') => {
    if (!matchId) return notify.error('Save draft first');
    const others = (matchesQ.data || []).filter((m: any) => m.id !== matchId);
    const other = others[0];
    if (!other) return notify.error('No previous match to copy from');
    try { await rosterApi.copyFrom(matchId, side, other.id); const r = await rosterApi.get(matchId, side); applyRosterRows(side, r); notify.success('Roster copied from last match'); qc.invalidateQueries({queryKey:['readiness',matchId]}); } catch(e:any){ notify.error(formatApiError(e)); }
  };

  const saveRoster = async (side: 'A'|'B') => {
    const rows = side==='A'?homeRows:awayRows;
    const validation = validateRosterRows(rows, side, { forSave: true });
    setRowIssues(prev => ({ ...prev, [side]: validation.issuesByRow }));
    if (!validation.ok) {
      notify.error(rosterSaveBlockMessage(rows, side));
      return;
    }
    try {
      const id = await ensureDraft();
      const entries = buildRosterPayload(rows);
      await rosterApi.replace(id, side, entries as any);
      const r = await rosterApi.get(id, side); applyRosterRows(side, r);
      notify.success(`${sideLabel(side)} roster saved`); qc.invalidateQueries({queryKey:['readiness',id]});
    } catch(e:any){
      notify.error(formatApiError(e, { sideLabel: sideLabel(side) }));
    }
  };

  const updateCell = (side:'A'|'B', key:string, patch: Partial<RosterRow>) => setRowsFor(side, rows => rows.map(r => r._key===key ? { ...r, ...patch } : r));
  const addRow = (side:'A'|'B') => setRowsFor(side, rows => [...rows, emptyRow()]);
  const removeRow = (side:'A'|'B', key:string) => setRowsFor(side, rows => rows.length>1 ? rows.filter(r=>r._key!==key) : [emptyRow()]);
  const autoNumber = (side:'A'|'B') => {
    setRowsFor(side, rows => autoNumberRows(rows));
    notify.success(`${sideLabel(side)} roster: assigned available jersey numbers where missing.`);
  };

  const onKeyDownCell = (e: React.KeyboardEvent<HTMLInputElement>, side:'A'|'B', key:string, col:'jersey'|'name'|'position') => {
    const rows = rowsFor(side);
    const idx = rows.findIndex(r=>r._key===key);
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx === rows.length - 1) addRow(side);
      setTimeout(() => {
        const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-side="${side}"][data-col="jersey"]`));
        inputs[idx+1]?.focus();
      }, 0);
    }
    if (e.key === 'Delete' && col==='jersey' && !(e.target as HTMLInputElement).value) { e.preventDefault(); removeRow(side,key); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-side="${side}"][data-col="${col}"]`));
      const cur = inputs.indexOf(e.target as HTMLInputElement);
      const next = e.key==='ArrowDown'?cur+1:cur-1; if (inputs[next]) { e.preventDefault(); inputs[next].focus(); }
    }
  };

  const importPaste = (side:'A'|'B') => {
    const text = side==='A'?pasteHome:pasteAway; const parsed = parseBulkPlayerRows(text);
    const newRows = parsed.rows.filter(r=>r.valid).map(r=>({ _key: Math.random().toString(36).slice(2), jerseyNumber: r.jerseyNumber != null ? String(r.jerseyNumber) : '', name: r.name || '', position: r.position || '', isCaptain: false, isLibero: (r.position||'').toUpperCase()==='L', included: true }));
    if (!newRows.length) return notify.error('No valid rows to import');
    setRowsFor(side, rows => {
      const base = rows.filter(r=>hasRowContent(r)); return [...base, ...newRows];
    });
    notify.success(`Imported ${newRows.length} valid row${newRows.length === 1 ? '' : 's'}${parsed.errorCount ? ` (${parsed.errorCount} skipped)` : ''}`);
  };

  const quickAdd = (side:'A'|'B') => {
    const text = side==='A'?quickHome:quickAway;
    const nums = text.split(/[\s,]+/).map(s=>parseInt(s,10)).filter(n=>Number.isInteger(n)&&n>=1&&n<=99);
    if (!nums.length) return;
    setRowsFor(side, rows => [...rows.filter(r=>hasRowContent(r)), ...nums.map(n=>({ ...emptyRow(), jerseyNumber:String(n), name:`Player ${n}` }))]);
    side==='A'?setQuickHome(''):setQuickAway('');
  };

  const selectedRosterFor = (side:'A'|'B') => rowsFor(side).filter(r=>r.included && isValidJersey(parseJersey(r.jerseyNumber)) && (r.name || r.playerId));

  const saveLineup = async (side:'A'|'B') => {
    if (!matchId) return notify.error('Save draft first');
    const ids = side==='A'?homeLineup:awayLineup;
    if (ids.some(x=>!x)) return notify.error('Select all 6 positions');
    const roster = selectedRosterFor(side);
    const players = ids.map((pid, i) => {
      const r = roster.find(x => x.playerId === pid || x._key === pid);
      return {
        rotationPos: i + 1,
        ...(r?.playerId ? { playerId: r.playerId } : {}),
        ...(!r?.playerId && isValidJersey(parseJersey(r?.jerseyNumber || '')) ? { jerseyNumber: parseJersey(r!.jerseyNumber) } : {}),
      };
    });
    if (players.some((p:any) => !p.playerId && !isValidJersey(p.jerseyNumber))) {
      return notify.error(`${sideLabel(side)} lineup: each selected player must be saved with a valid jersey number. Save roster first, then save starting six.`);
    }
    try {
      await lineupApi.set(matchId, side, 1, { players } as any);
      notify.success(`${sideLabel(side)} starting six saved`);
      qc.invalidateQueries({queryKey:['readiness',matchId]});
      qc.invalidateQueries({queryKey:['match',matchId]});
    } catch(e:any){
      notify.error(formatApiError(e, { sideLabel: sideLabel(side) }));
    }
  };

  const assignToSelected = (side:'A'|'B', playerId:string) => {
    if (!selectedPos || selectedPos.side !== side) return;
    const arr = side==='A'?[...homeLineup]:[...awayLineup];
    const existing = arr.indexOf(playerId); if (existing>=0) arr[existing] = arr[selectedPos.idx];
    arr[selectedPos.idx] = playerId;
    side==='A'?setHomeLineup(arr):setAwayLineup(arr);
  };

  const sameAsLastSet = (side:'A'|'B') => {
    const m:any = matchQ.data; const team = side==='A'?m?.teams?.A:m?.teams?.B; const lineup = (team?.lineup||[]).map((p:any)=>p.id||null).slice(0,6);
    while (lineup.length<6) lineup.push(null);
    if (side==='A') setHomeLineup(lineup); else setAwayLineup(lineup);
  };
  const swapAB = () => { const h=[...homeLineup]; setHomeLineup([...awayLineup]); setAwayLineup(h); };

  const goLive = async () => {
    if (!matchId) return;
    try {
      await matchApi.goLive(matchId);
      notify.success('Match is LIVE');
      qc.invalidateQueries({queryKey:['matches']});
      navigate(`/live/${matchId}`);
    } catch(e:any){
      const c = getCourtConflict(e);
      if (c) { setConflict({ court: String(form.court || c.court || '1'), conflict: c }); return; }
      notify.error(formatApiError(e));
    }
  };

  const saveDraftAndStay = async () => {
    try {
      await ensureDraft();
      await autosave();
      // only save rosters that are currently valid to avoid blocking draft save with noisy errors
      if (matchId) {
        if (validateRosterRows(homeRows, 'A', { forSave: true }).ok) await saveRoster('A');
        if (validateRosterRows(awayRows, 'B', { forSave: true }).ok) await saveRoster('B');
      }
      notify.success('Draft saved');
    } catch(e:any){ if (e?.message === 'COURT_CONFLICT_PENDING') return; notify.error(formatApiError(e)); }
  };

  const teams = teamsQ.data || []; const comps = compsQ.data || [];
  const steps = ['Match','Teams','Rosters','Starting six','Review'];
  const readiness = readinessQ.data;

  return (
    <div className="space-y-6 text-fg">
      <PageHeader eyebrow="Match Operations" title="Match Setup Wizard" description="Configure match, teams, rosters and starting six. Autosaves draft." actions={
        <div className="flex gap-2"><Button variant="outline" onClick={()=>navigate('/matches')}>Back</Button><Button variant="secondary" onClick={saveDraftAndStay} isLoading={saving}><Save className="w-4 h-4"/>Save draft</Button></div>
      } />

      <div className="flex flex-wrap gap-2">
        {steps.map((s,i)=> (
          <button key={s} onClick={()=>setStep(i+1)} className={`px-3 py-2 rounded-lg text-sm font-semibold border focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${step===i+1?'bg-accent text-accent-fg border-accent':'bg-surface text-fg-muted border-border-strong hover:bg-surface-alt hover:text-fg'}`}>{i+1}. {s}</button>
        ))}
        {saving && <span className="text-xs text-fg-muted self-center">Savingâ€¦</span>}
      </div>

      {step===1 && (
        <Card>
          <CardHeader><CardTitle>1. Match details</CardTitle></CardHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Competition</Label><Select value={form.competitionId} onChange={e=>setForm({...form, competitionId:e.target.value})}><option value="">Select competition (or none)</option>{comps.map((c:any)=><option key={c.id} value={c.id}>{c.name} {c.season?`(${c.season})`:''}</option>)}</Select></div>
            <div><Label>Division</Label><Input value={form.division} onChange={e=>setForm({...form, division:e.target.value})} placeholder="Division" /></div>
            <div>
              <Label>Court / Venue</Label>
              <Input
                list="court-suggestions"
                value={form.court}
                onChange={e=>setForm({...form, court:e.target.value})}
                placeholder="Court 1"
              />
              <datalist id="court-suggestions">
                {Array.from(new Set((matchesQ.data || []).map((m: any) => String(m.court || '').trim()).filter(Boolean))).sort().map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div><Label>Venue type</Label><Select value={form.venueType} onChange={e=>setForm({...form, venueType:e.target.value})}><option value="INDOOR">Indoor</option><option value="OUTDOOR">Outdoor</option><option value="BEACH">Beach</option></Select></div>
            <div><Label>Date & time</Label><Input type="datetime-local" value={form.scheduledAt} onChange={e=>setForm({...form, scheduledAt:e.target.value})} /></div>
            <div><Label>Match number</Label><Input value={form.match_no} onChange={e=>setForm({...form, match_no:e.target.value})} placeholder="Auto" /></div>
            <div className="md:col-span-2"><Label>Ruleset preset</Label><Select value={form.ruleset} onChange={e=>setForm({...form, ruleset:e.target.value})}><option value="FIVB_BO5">Official (FIVB Best of 5)</option><option value="BO3">Best of 3</option><option value="CUSTOM">Custom</option></Select></div>
            {form.ruleset==='CUSTOM' && (<>
              <div><Label>Best of sets</Label><Input type="number" value={form.bestOfSets} onChange={e=>setForm({...form,bestOfSets:+e.target.value})} /></div>
              <div><Label>Sets to win</Label><Input type="number" value={form.setsToWin} onChange={e=>setForm({...form,setsToWin:+e.target.value})} /></div>
              <div><Label>Regular set points</Label><Input type="number" value={form.regularSetPoints} onChange={e=>setForm({...form,regularSetPoints:+e.target.value})} /></div>
              <div><Label>Final set points</Label><Input type="number" value={form.finalSetPoints} onChange={e=>setForm({...form,finalSetPoints:+e.target.value})} /></div>
              <div><Label>Win by (min diff)</Label><Input type="number" value={form.minPointDifference} onChange={e=>setForm({...form,minPointDifference:+e.target.value})} /></div>
              <div><Label>Timeouts/subs per set</Label><div className="flex gap-2"><Input type="number" value={form.timeoutsPerSet} onChange={e=>setForm({...form,timeoutsPerSet:+e.target.value})} /><Input type="number" value={form.substitutionsPerSet} onChange={e=>setForm({...form,substitutionsPerSet:+e.target.value})} /></div></div>
            </>)}
            <div><Label>End set confirmation</Label><Select value={String(form.confirmSetEnd !== false)} onChange={e=>setForm({...form, confirmSetEnd: e.target.value === 'true'})}><option value="true">Confirm before ending set</option><option value="false">Auto-end at winning score</option></Select></div>
            <div><Label>First referee</Label><Input value={form.referee1} onChange={e=>setForm({...form, referee1:e.target.value})} /></div>
            <div><Label>Second referee</Label><Input value={form.referee2} onChange={e=>setForm({...form, referee2:e.target.value})} /></div>
          </div>
        </Card>
      )}

      {step===2 && (
        <Card>
          <CardHeader><CardTitle>2. Teams</CardTitle><Button variant="outline" size="sm" onClick={()=>navigate('/teams')}>+ Create/manage teams</Button></CardHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><Label htmlFor="home-team-select">Home team</Label><Select id="home-team-select" value={form.homeTeamId} onChange={e=>{setForm({...form, homeTeamId:e.target.value}); setHomeRows([emptyRow(),emptyRow(),emptyRow(),emptyRow(),emptyRow(),emptyRow()]); setTeamHasNoPlayers(p=>({...p,A:false}));}}><option value="">Select team</option>{teams.map((t:any)=><option key={t.id} value={t.id}>{t.name} ({t.shortName||t.code||''})</option>)}</Select></div>
            <div><Label htmlFor="away-team-select">Away team</Label><Select id="away-team-select" value={form.awayTeamId} onChange={e=>{setForm({...form, awayTeamId:e.target.value}); setAwayRows([emptyRow(),emptyRow(),emptyRow(),emptyRow(),emptyRow(),emptyRow()]); setTeamHasNoPlayers(p=>({...p,B:false}));}}><option value="">Select team</option>{teams.map((t:any)=><option key={t.id} value={t.id}>{t.name} ({t.shortName||t.code||''})</option>)}</Select></div>
          </div>
          <p className="text-xs text-fg-muted mt-3">Use Teams page to create/edit teams, logos and colors. Rosters and starting six are saved per match in steps 3-4.</p>
        </Card>
      )}

      {step===3 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <RosterEditorView
            side="A"
            rows={homeRows}
            paste={pasteHome} setPaste={setPasteHome}
            quick={quickHome} setQuick={setQuickHome}
            saving={saving}
            issuesByRow={rowIssues.A}
            teamHasNoPlayers={teamHasNoPlayers.A}
            onLoadTeam={loadTeamRoster}
            onCopyLast={copyLastRoster}
            onSave={saveRoster}
            onAutoNumber={autoNumber}
            onUpdateCell={updateCell}
            onKeyDownCell={onKeyDownCell}
            onRemoveRow={removeRow}
            onAddRow={addRow}
            onSelectAll={(side)=>setRowsFor(side, rows=>rows.map(r=>({...r,included:true})))}
            onImportPaste={importPaste}
            onQuickAdd={quickAdd}
          />
          <RosterEditorView
            side="B"
            rows={awayRows}
            paste={pasteAway} setPaste={setPasteAway}
            quick={quickAway} setQuick={setQuickAway}
            saving={saving}
            issuesByRow={rowIssues.B}
            teamHasNoPlayers={teamHasNoPlayers.B}
            onLoadTeam={loadTeamRoster}
            onCopyLast={copyLastRoster}
            onSave={saveRoster}
            onAutoNumber={autoNumber}
            onUpdateCell={updateCell}
            onKeyDownCell={onKeyDownCell}
            onRemoveRow={removeRow}
            onAddRow={addRow}
            onSelectAll={(side)=>setRowsFor(side, rows=>rows.map(r=>({...r,included:true})))}
            onImportPaste={importPaste}
            onQuickAdd={quickAdd}
          />
        </div>
      )}

      {step===4 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-warning/40 bg-warning-subtle p-3 text-sm text-fg">
            Save each team&apos;s <span className="font-semibold">Roster</span> (Step 3) before saving a starting six. Then assign all 6 positions and click <span className="font-semibold">Save lineup</span> for Home and Away.
          </div>
          <LineupPickerView
            side="A"
            roster={selectedRosterFor('A')}
            lineup={homeLineup}
            selectedPos={selectedPos}
            onSameAsLast={sameAsLastSet}
            onSwap={swapAB}
            onSave={saveLineup}
            onSelectPos={setSelectedPos}
            onAssign={assignToSelected}
          />
          <LineupPickerView
            side="B"
            roster={selectedRosterFor('B')}
            lineup={awayLineup}
            selectedPos={selectedPos}
            onSameAsLast={sameAsLastSet}
            onSwap={swapAB}
            onSave={saveLineup}
            onSelectPos={setSelectedPos}
            onAssign={assignToSelected}
          />
        </div>
      )}

      {step===5 && (
        <Card>
          <CardHeader><CardTitle>5. Review & go live</CardTitle><Button variant="outline" size="sm" onClick={()=>qc.invalidateQueries({queryKey:['readiness',matchId]})}>Refresh</Button></CardHeader>
          {!matchId && <div className="text-sm text-fg-muted">Save draft first to run readiness checks.</div>}
          {matchId && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(readiness?.checklist||[]).map((c:any)=> {
                  const stepFor = c.key === 'teams' ? 2 : String(c.key || '').startsWith('roster_') ? 3 : String(c.key || '').startsWith('lineup_') ? 4 : 1;
                  return (
                    <button type="button" key={c.key} onClick={()=>{ if (!c.ok) setStep(stepFor); }} className={`flex items-center gap-2 rounded-lg border p-3 text-sm text-left ${c.ok?'border-success/40 bg-success-subtle':'border-warning/40 bg-warning-subtle hover:bg-warning/20'}`}>
                      {c.ok ? <CheckCircle2 className="w-4 h-4 text-success"/> : <AlertTriangle className="w-4 h-4 text-warning"/>}
                      <span className="flex-1 text-fg">{c.message}</span>
                      {!c.ok && <span className="text-xs font-semibold text-warning">Fix</span>}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                <Button variant="outline" onClick={()=>setOutputsOpen(true)}><Tv className="w-4 h-4"/>Outputs</Button>
                <Button variant="secondary" onClick={saveDraftAndStay}><Save className="w-4 h-4"/>Save draft</Button>
                <Button variant="primary" onClick={goLive} disabled={!readiness?.ready}><Wand2 className="w-4 h-4"/>Go live</Button>
              </div>
              {!readiness?.ready && <div className="text-xs text-fg-muted">Complete missing items above to enable Go live. Click a failed item to jump to its step. You must <span className="font-semibold text-fg">Save roster</span> (Step 3) and <span className="font-semibold text-fg">Save lineup</span> (Step 4) for both Home and Away.</div>}
            </div>
          )}
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={()=>setStep(s=>Math.max(1,s-1))} disabled={step===1}><ChevronLeft className="w-4 h-4"/>Back</Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={async()=>{try { await ensureDraft(); await autosave(); notify.success('Draft saved'); } catch(e:any){ if (e?.message !== 'COURT_CONFLICT_PENDING') notify.error(formatApiError(e)); }}}>Save draft</Button>
          <Button variant="primary" onClick={()=>setStep(s=>Math.min(5,s+1))} disabled={step===5}>Next<ChevronRight className="w-4 h-4"/></Button>
        </div>
      </div>
      <OutputsPanel open={outputsOpen} onClose={()=>setOutputsOpen(false)} matchId={matchId} court={form.court} />
      <CourtConflictDialog
        open={!!conflict}
        court={conflict?.court || form.court || '1'}
        conflict={conflict?.conflict || null}
        onClose={() => setConflict(null)}
        onResolved={async () => { const r = conflict?.retry; setConflict(null); if (r) await r(); else await goLive(); }}
      />
    </div>
  );
};

export default MatchSetupWizardPage;

