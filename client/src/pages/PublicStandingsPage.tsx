import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { publicApi } from '../services/api.js';

export const PublicStandingsPage: React.FC = () => {
  const { competitionId = '' } = useParams();
  const [division, setDivision] = useState('');
  const compQ = useQuery({ queryKey: ['pub-comp', competitionId], queryFn: () => publicApi.competition(competitionId), enabled: !!competitionId });
  const divQ = useQuery({ queryKey: ['pub-div', competitionId], queryFn: () => publicApi.divisions(competitionId), enabled: !!competitionId });
  const stQ = useQuery({ queryKey: ['pub-standings', competitionId, division], queryFn: () => publicApi.standings(competitionId, { division: division || undefined }), enabled: !!competitionId, refetchInterval: 30000 });
  const rows = stQ.data?.rows || [];
  return (
    <div className="min-h-screen bg-[#0b1220] text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6"><div className="text-sm text-white/60 uppercase tracking-wider">Standings</div><h1 className="text-3xl font-bold">{compQ.data?.name || 'Competition'}</h1>{compQ.data?.season && <div className="text-white/60">{compQ.data.season}</div>}</div>
        <div className="mb-4"><select className="bg-white/10 border border-white/20 rounded px-3 py-2" value={division} onChange={e => setDivision(e.target.value)}><option value="">All divisions</option>{(divQ.data || []).map((d: string) => <option key={d} value={d}>{d}</option>)}</select></div>
        <div className="overflow-auto bg-white/5 rounded-xl border border-white/10"><table className="w-full text-sm"><thead><tr className="text-left text-white/60 border-b border-white/10"><th className="p-3">#</th><th className="p-3">Team</th><th className="p-3">P</th><th className="p-3">W</th><th className="p-3">L</th><th className="p-3">SF</th><th className="p-3">SA</th><th className="p-3">Pts</th><th className="p-3">Form</th></tr></thead><tbody>
          {rows.map((r: any) => <tr key={r.teamId} className="border-b border-white/5"><td className="p-3 font-semibold">{r.rank}</td><td className="p-3">{r.teamName}</td><td className="p-3">{r.played}</td><td className="p-3">{r.won}</td><td className="p-3">{r.lost}</td><td className="p-3">{r.setsFor}</td><td className="p-3">{r.setsAgainst}</td><td className="p-3 font-bold">{r.matchPoints}</td><td className="p-3">{(r.form || []).join('')}</td></tr>)}
        </tbody></table></div>
        <div className="text-xs text-white/40 mt-4">Auto-refreshes every 30s. {stQ.data?.generatedAt ? `Updated ${new Date(stQ.data.generatedAt).toLocaleTimeString()}` : ''}</div>
      </div>
    </div>
  );
};
