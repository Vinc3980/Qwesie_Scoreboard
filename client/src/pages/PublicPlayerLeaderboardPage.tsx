import React, { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { publicApi } from '../services/api.js';

const CATS: Array<{ id: string; label: string }> = [
  { id: 'points', label: 'Top Scorers' },
  { id: 'kills', label: 'Kills' },
  { id: 'aces', label: 'Aces' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'digs', label: 'Digs' },
  { id: 'assists', label: 'Assists' },
  { id: 'attackErrors', label: 'Attack Errors' },
  { id: 'pointsPerSet', label: 'Points / Set' },
  { id: 'killEfficiency', label: 'Kill Efficiency' },
];

export const PublicPlayerLeaderboardPage: React.FC = () => {
  const { competitionId = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const embed = sp.get('embed') === '1';
  const [division, setDivision] = useState(sp.get('division') || '');
  const category = sp.get('category') || 'points';
  const themeId = sp.get('theme') || '';
  const compQ = useQuery({ queryKey: ['pub-comp', competitionId], queryFn: () => publicApi.competition(competitionId), enabled: !!competitionId });
  const divQ = useQuery({ queryKey: ['pub-div', competitionId], queryFn: () => publicApi.divisions(competitionId), enabled: !!competitionId });
  const themeQ = useQuery({ queryKey: ['pub-lb-theme', themeId, competitionId], queryFn: () => themeId ? publicApi.leaderboardTheme(themeId) : publicApi.resolveLeaderboardTheme({ competitionId }), enabled: !!competitionId });
  const lbQ = useQuery({ queryKey: ['pub-player-lb', competitionId, category, division], queryFn: () => publicApi.playerLeaderboard(competitionId, { category, division: division || undefined, limit: 20 }), enabled: !!competitionId, refetchInterval: 30000 });
  const rows = lbQ.data?.rows || [];
  const title = CATS.find(c => c.id === category)?.label || 'Player Leaders';
  const tcfg = themeQ.data?.config;
  const bg = tcfg?.colors?.background || '#0b1220';
  const text = tcfg?.colors?.text || '#ffffff';
  const muted = tcfg?.colors?.mutedText || 'rgba(255,255,255,0.6)';

  const setCat = (c: string) => { sp.set('category', c); setSp(sp, { replace: true }); };

  return (
    <div className={embed ? 'p-3' : 'min-h-screen p-4 md:p-8'} style={{ background: bg, color: text }}>
      <div className={embed ? '' : 'max-w-5xl mx-auto'}>
        {!embed && <div className="mb-6"><div className="text-sm text-white/60 uppercase tracking-wider">Player Leaderboard</div><h1 className="text-3xl font-bold">{compQ.data?.name || 'Competition'}</h1><div className="text-white/60">{title}</div></div>}
        <div className="flex flex-wrap gap-2 mb-4">
          {CATS.map(c => <button key={c.id} onClick={() => setCat(c.id)} className={`px-3 py-1.5 rounded text-sm border ${category===c.id ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-white/5 border-white/15 text-white/80'}`}>{c.label}</button>)}
          <select className="bg-white/10 border border-white/20 rounded px-3 py-2 text-sm" value={division} onChange={e => setDivision(e.target.value)}><option value="">All divisions</option>{(divQ.data || []).map((d: string) => <option key={d} value={d}>{d}</option>)}</select>
        </div>
        <div className="overflow-auto bg-white/5 rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-white/60 border-b border-white/10"><th className="p-3">#</th><th className="p-3">Player</th><th className="p-3">Team</th><th className="p-3">MP</th><th className="p-3">Value</th><th className="p-3">/Set</th></tr></thead>
            <tbody>{rows.map((r: any) => (
              <tr key={r.playerId} className="border-b border-white/5">
                <td className="p-3 font-semibold">{r.rank}</td>
                <td className="p-3"><div className="flex items-center gap-2">{r.photoUrl ? <img src={r.photoUrl} alt="" className="w-8 h-8 rounded object-cover" /> : <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center text-xs">{String(r.name||'?').slice(0,1)}</div>}<span>{r.name}</span></div></td>
                <td className="p-3 text-white/80">{r.teamShortName || r.teamName}</td>
                <td className="p-3">{r.matchesPlayed}</td>
                <td className="p-3 font-bold text-amber-300">{Math.round((r.value||0)*100)/100}</td>
                <td className="p-3 text-white/70">{Math.round((r.perSet||0)*100)/100}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="text-xs text-white/40 mt-4">Auto-refreshes every 30s. {lbQ.data?.coverage?.pct != null ? `Data coverage: ${lbQ.data.coverage.pct}% (${lbQ.data.coverage.attributed}/${lbQ.data.coverage.total}).` : ''} {lbQ.data?.generatedAt ? `Updated ${new Date(lbQ.data.generatedAt).toLocaleTimeString()}` : ''}</div>
        {!embed && <div className="text-xs text-white/40 mt-2">Embed: <code className="bg-white/10 px-1 rounded">{`/p/${competitionId}/leaderboard/players?embed=1&category=${category}`}</code></div>}
      </div>
    </div>
  );
};
