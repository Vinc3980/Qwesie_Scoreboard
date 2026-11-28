import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { publicApi } from '../services/api.js';

export const PublicCombinedLeaderboardPage: React.FC = () => {
  const { competitionId = '' } = useParams();
  const [sp] = useSearchParams();
  const embed = sp.get('embed') === '1';
  const [division, setDivision] = useState(sp.get('division') || '');
  const compQ = useQuery({ queryKey: ['pub-comp', competitionId], queryFn: () => publicApi.competition(competitionId), enabled: !!competitionId });
  const divQ = useQuery({ queryKey: ['pub-div', competitionId], queryFn: () => publicApi.divisions(competitionId), enabled: !!competitionId });
  const dataQ = useQuery({ queryKey: ['pub-combined', competitionId, division], queryFn: () => publicApi.combined(competitionId, { division: division || undefined }), enabled: !!competitionId, refetchInterval: 30000 });
  const standings = dataQ.data?.standings?.rows || [];
  const leaders = dataQ.data?.leaders || {};
  const labels: any = { points: 'Top Scorers', aces: 'Aces', blocks: 'Blocks', kills: 'Kills' };

  return (
    <div className={embed ? 'bg-[#0b1220] text-white p-3' : 'min-h-screen bg-[#0b1220] text-white p-4 md:p-8'}>
      <div className={embed ? '' : 'max-w-7xl mx-auto'}>
        {!embed && <div className="mb-6"><div className="text-sm text-white/60 uppercase tracking-wider">Season Summary</div><h1 className="text-3xl font-bold">{compQ.data?.name || 'Competition'}</h1></div>}
        <div className="mb-4"><select className="bg-white/10 border border-white/20 rounded px-3 py-2" value={division} onChange={e => setDivision(e.target.value)}><option value="">All divisions</option>{(divQ.data || []).map((d: string) => <option key={d} value={d}>{d}</option>)}</select></div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white/5 rounded-xl border border-white/10 overflow-auto">
            <div className="px-4 py-3 font-semibold border-b border-white/10">Standings</div>
            <table className="w-full text-sm"><thead><tr className="text-left text-white/60 border-b border-white/10"><th className="p-3">#</th><th className="p-3">Team</th><th className="p-3">P</th><th className="p-3">W</th><th className="p-3">Pts</th></tr></thead>
              <tbody>{standings.slice(0, 12).map((r: any) => <tr key={r.teamId} className="border-b border-white/5"><td className="p-3">{r.rank}</td><td className="p-3">{r.teamName}</td><td className="p-3">{r.played}</td><td className="p-3">{r.won}</td><td className="p-3 font-bold">{r.matchPoints}</td></tr>)}</tbody></table>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {['points','aces','blocks','kills'].map(cat => (
              <div key={cat} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                <div className="px-4 py-3 font-semibold border-b border-white/10 text-amber-300">{labels[cat]}</div>
                <div className="p-3 space-y-2">{(leaders[cat]?.rows || []).slice(0,5).map((r: any) => (
                  <div key={r.playerId} className="flex items-center justify-between text-sm gap-2"><div className="flex items-center gap-2 min-w-0"><span className="text-white/50 w-4">{r.rank}</span>{r.photoUrl ? <img src={r.photoUrl} alt="" className="w-6 h-6 rounded object-cover" /> : <div className="w-6 h-6 rounded bg-white/10" />}<span className="truncate">{r.name}</span></div><span className="font-bold text-amber-200">{Math.round((r.value||0)*10)/10}</span></div>
                ))}{!(leaders[cat]?.rows||[]).length && <div className="text-white/40 text-sm">No data</div>}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs text-white/40 mt-4">Auto-refreshes every 30s. {dataQ.data?.generatedAt ? `Updated ${new Date(dataQ.data.generatedAt).toLocaleTimeString()}` : ''}</div>
        {!embed && <div className="text-xs text-white/40 mt-2">Embed: <code className="bg-white/10 px-1 rounded">{`/p/${competitionId}/leaderboard/combined?embed=1`}</code></div>}
      </div>
    </div>
  );
};
