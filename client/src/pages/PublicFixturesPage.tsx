import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { publicApi } from '../services/api.js';

export const PublicFixturesPage: React.FC = () => {
  const { competitionId = '' } = useParams();
  const [division, setDivision] = useState('');
  const compQ = useQuery({ queryKey: ['pub-comp', competitionId], queryFn: () => publicApi.competition(competitionId), enabled: !!competitionId });
  const divQ = useQuery({ queryKey: ['pub-div', competitionId], queryFn: () => publicApi.divisions(competitionId), enabled: !!competitionId });
  const fxQ = useQuery({ queryKey: ['pub-fixtures', competitionId, division], queryFn: () => publicApi.fixtures(competitionId, { division: division || undefined }), enabled: !!competitionId, refetchInterval: 30000 });
  const items = fxQ.data?.items || [];
  return (
    <div className="min-h-screen bg-[#0b1220] text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6"><div className="text-sm text-white/60 uppercase tracking-wider">Fixtures</div><h1 className="text-3xl font-bold">{compQ.data?.name || 'Competition'}</h1></div>
        <div className="mb-4"><select className="bg-white/10 border border-white/20 rounded px-3 py-2" value={division} onChange={e => setDivision(e.target.value)}><option value="">All divisions</option>{(divQ.data || []).map((d: string) => <option key={d} value={d}>{d}</option>)}</select></div>
        <div className="space-y-2">{items.map((m: any) => <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10"><div className="w-28 text-xs text-white/60">{m.scheduledAt ? new Date(m.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBD'}<div>{m.court || ''}</div></div><div className="flex-1 font-semibold">{m.homeTeam?.shortName || m.homeTeamName} <span className="text-white/60">{m.status === 'COMPLETED' || m.status === 'LIVE' ? `${m.setsWonHome}-${m.setsWonAway}` : 'vs'}</span> {m.awayTeam?.shortName || m.awayTeamName}</div><div className="text-xs text-white/50">{m.status}</div></div>)}</div>
        <div className="text-xs text-white/40 mt-4">Auto-refreshes every 30s.</div>
      </div>
    </div>
  );
};
