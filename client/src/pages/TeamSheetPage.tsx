import React, { useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer, Download, ArrowLeft, FileText } from 'lucide-react';
import { matchApi } from '../services/api.js';
import { CourtDiagram, assignmentsFromArray, type CourtPlayer, type LineupAssignments } from '../components/lineup/CourtDiagram.js';
import { Avatar } from '../components/ui/Avatar.js';
import { Button } from '../components/ui/Button.js';
import { PageHeader } from '../components/ui/PageHeader.js';

type SheetTeam = any;

function toAssignments(slots: any[]): LineupAssignments {
  const arr: Array<string | null> = [null, null, null, null, null, null];
  for (const s of slots || []) {
    const p = Number(s.rotationPos);
    if (p >= 1 && p <= 6) arr[p - 1] = s.playerId || s.id || null;
  }
  return assignmentsFromArray(arr);
}

function rosterToCourtPlayers(roster: any[]): CourtPlayer[] {
  return (roster || []).map((p: any) => ({
    id: String(p.playerId || p.id),
    name: p.name || `#${p.jerseyNumber ?? '?'}`,
    jerseyNumber: p.jerseyNumber ?? null,
    photoUrl: p.photoUrl || null,
    thumbUrl: p.thumbUrl || p.photoUrl || null,
    isLibero: !!p.isLibero,
    position: p.position || null,
  }));
}

const SignatureLine: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex-1 min-w-[140px]">
    <div className="border-b border-gray-400 h-8" />
    <div className="text-[11px] text-gray-600 mt-1">{label}</div>
  </div>
);

const TeamBlock: React.FC<{ team: SheetTeam; match: any; blank?: boolean }> = ({ team, match, blank }) => {
  const roster = blank ? Array.from({ length: 12 }).map((_, i) => ({ jerseyNumber: '', name: '', position: '', isCaptain: false, isLibero: false, photoUrl: null, thumbUrl: null })) : (team?.roster || []);
  const setLineups = blank ? [1, 2, 3, 4, 5].map(n => ({ setNumber: n, slots: [] })) : (team?.setLineups?.length ? team.setLineups : [{ setNumber: 1, slots: [] }]);
  const courtRoster = rosterToCourtPlayers(blank ? [] : roster);
  return (
    <section className="break-inside-avoid mb-6 border border-gray-300 rounded-lg p-4 bg-white text-gray-900 print:border-gray-400">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          {!blank && (team?.logoUrl ? <img src={team.logoUrl} alt="" className="w-14 h-14 object-contain" width={56} height={56} /> : <Avatar name={team?.name || 'Team'} size={56} color={team?.primaryColor} textColor={team?.textColor} />)}
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate">{blank ? 'Team: ____________________' : (team?.name || 'Team')}</h2>
            <div className="text-sm text-gray-600">{blank ? 'Coach: ____________________  Assistant: ____________________' : `Coach: ${team?.coachName || '—'}${team?.assistantCoachName ? ` · Assistant: ${team.assistantCoachName}` : ''}${team?.managerName ? ` · Manager: ${team.managerName}` : ''}`}</div>
          </div>
        </div>
        <div className="text-right text-xs text-gray-600 shrink-0">
          <div><span className="font-semibold">Match:</span> {blank ? '______' : (match?.matchNumber || '—')}</div>
          <div><span className="font-semibold">Court:</span> {blank ? '______' : (match?.court || '—')}</div>
        </div>
      </div>

      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-1">Roster</h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-1 w-14">Photo</th>
              <th className="border border-gray-300 px-2 py-1 w-14">#</th>
              <th className="border border-gray-300 px-2 py-1 text-left">Name</th>
              <th className="border border-gray-300 px-2 py-1 w-24">Position</th>
              <th className="border border-gray-300 px-2 py-1 w-14">C</th>
              <th className="border border-gray-300 px-2 py-1 w-14">L</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((p: any, i: number) => (
              <tr key={p.playerId || i}>
                <td className="border border-gray-300 px-1 py-1 text-center">{!blank && (p.thumbUrl || p.photoUrl) ? <img src={p.thumbUrl || p.photoUrl} alt="" className="w-8 h-8 rounded object-cover inline-block" width={32} height={32} loading="lazy" /> : <div className="w-8 h-8 rounded bg-gray-200 inline-block" />}</td>
                <td className="border border-gray-300 px-2 py-1 text-center font-semibold">{blank ? '' : (p.jerseyNumber ?? '')}</td>
                <td className="border border-gray-300 px-2 py-1">{blank ? '' : (p.name || '')}</td>
                <td className="border border-gray-300 px-2 py-1 text-center">{blank ? '' : (p.position || '')}</td>
                <td className="border border-gray-300 px-2 py-1 text-center">{!blank && p.isCaptain ? '●' : ''}</td>
                <td className="border border-gray-300 px-2 py-1 text-center">{!blank && p.isLibero ? '●' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-2">Starting six by set</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 print:grid-cols-2">
          {setLineups.map((s: any) => (
            <div key={s.setNumber} className="border border-gray-200 rounded p-2">
              <div className="text-xs font-semibold text-gray-600 mb-1">Set {s.setNumber}</div>
              {blank ? (
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  {['P4','P3','P2','P5','P6','P1'].map(l => <div key={l} className="border border-gray-300 rounded p-1 h-14"><div className="font-bold text-gray-500">{l}</div></div>)}
                </div>
              ) : (
                <CourtDiagram value={toAssignments(s.slots)} roster={courtRoster} onChange={() => {}} readOnly teamColor={team?.primaryColor} teamTextColor={team?.textColor} />
              )}
              <div className="mt-1 text-[10px] text-gray-500">Substitutes: ____________________________</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-6 mt-4">
        <SignatureLine label="Coach signature" />
        <SignatureLine label="Captain signature" />
        <SignatureLine label="Referee signature" />
      </div>
    </section>
  );
};

export const TeamSheetPage: React.FC = () => {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const blank = sp.get('blank') === '1';
  const teamFilter = (sp.get('team') || 'ALL').toUpperCase(); // A, B, ALL
  const q = useQuery({ queryKey: ['team-sheet', id], queryFn: () => matchApi.getTeamSheet(id!), enabled: !!id && !blank });

  const sheet = q.data;
  const teams = useMemo(() => {
    if (blank) return [{ key: 'A' }, { key: 'B' }];
    const all = sheet?.teams ? [sheet.teams.A, sheet.teams.B].filter(Boolean) : [];
    if (teamFilter === 'A' || teamFilter === 'B') return all.filter((t: any) => t.side === teamFilter);
    return all;
  }, [sheet, blank, teamFilter]);

  const title = blank ? 'Blank Team Sheet' : `Team Sheet - ${sheet?.matchNumber || id || ''}`;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Match" title="Team Sheet" description={blank ? 'Printable blank template' : (sheet ? `${sheet.competition || 'Match'} · ${sheet.court || 'Court'} · ${sheet.scheduledAt ? new Date(sheet.scheduledAt).toLocaleString() : ''}` : 'Loading...')}
        actions={(
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" onClick={() => window.history.back()}><ArrowLeft className="w-4 h-4" />Back</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4" />Print</Button>
            <Button variant="primary" onClick={() => { document.title = title; window.print(); }}><Download className="w-4 h-4" />Download PDF</Button>
            {!blank && id && <Link to={`/matches/${id}/team-sheet?blank=1`}><Button variant="ghost"><FileText className="w-4 h-4" />Blank template</Button></Link>}
          </div>
        )}
      />
      <style>{`@media print { @page { size: A4 portrait; margin: 10mm; } body { background: white !important; } .print\\:hidden { display: none !important; } nav, aside, header .print\\:hidden { display: none !important; } .page-shell-title { display: none !important; } }`}</style>

      <div className="bg-white text-gray-900 rounded-lg p-4 print:p-0 print:rounded-none print:shadow-none max-w-[210mm] mx-auto">
        <div className="mb-4 border-b border-gray-300 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-tight">{blank ? 'VOLLEYBALL TEAM SHEET' : 'OFFICIAL TEAM SHEET'}</h1>
              <div className="text-sm text-gray-600 mt-1">
                {blank ? 'Competition: __________  Division: __________  Date: __________  Match #: __________' : (
                  <>
                    <span className="font-semibold">Competition:</span> {sheet?.competition || '—'}
                    {sheet?.division ? <> · <span className="font-semibold">Division:</span> {sheet.division}</> : null}
                    {' · '}<span className="font-semibold">Date:</span> {sheet?.scheduledAt ? new Date(sheet.scheduledAt).toLocaleString() : '—'}
                    {' · '}<span className="font-semibold">Match #:</span> {sheet?.matchNumber || '—'}
                  </>
                )}
              </div>
              <div className="text-sm text-gray-600">
                {blank ? 'Court/Venue: __________  Referee 1: __________  Referee 2: __________' : (
                  <>
                    <span className="font-semibold">Court/Venue:</span> {sheet?.court || '—'}{sheet?.venueType ? ` (${sheet.venueType})` : ''}
                    {' · '}<span className="font-semibold">Referee 1:</span> {sheet?.referee1 || '—'}
                    {' · '}<span className="font-semibold">Referee 2:</span> {sheet?.referee2 || '—'}
                  </>
                )}
              </div>
            </div>
            {!blank && <div className="text-right text-xs text-gray-500 print:hidden">
              <div>Filter: {teamFilter}</div>
              <div className="flex gap-1 mt-1 justify-end">
                {['ALL','A','B'].map(f => <Link key={f} to={`/matches/${id}/team-sheet?team=${f}`} className={`px-2 py-0.5 rounded border ${teamFilter===f?'bg-gray-900 text-white border-gray-900':'border-gray-300'}`}>{f}</Link>)}
              </div>
            </div>}
          </div>
        </div>

        {q.isLoading && !blank && <div className="text-sm text-gray-500">Loading team sheet...</div>}
        {q.isError && !blank && <div className="text-sm text-red-600">Failed to load team sheet.</div>}

        {teams.map((t: any, idx: number) => (
          <TeamBlock key={t.teamId || t.side || idx} team={blank ? null : t} match={sheet} blank={blank} />
        ))}
      </div>
    </div>
  );
};

export default TeamSheetPage;
