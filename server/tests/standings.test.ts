import { describe, expect, it } from 'vitest';
import { computeStandings, normalizePointsRule } from '../src/services/standings.service.js';

function m(id: string, home: string, away: string, sh: number, sa: number, sets: Array<[number,number]>, opts: any = {}) {
  return {
    id, status: 'COMPLETED', homeTeamId: home, awayTeamId: away, homeTeamName: home, awayTeamName: away,
    setsWonHome: sh, setsWonAway: sa, winnerSide: sh>sa?'HOME':'AWAY', forfeitWinnerSide: opts.forfeitWinnerSide || null,
    scheduledAt: new Date(opts.date || '2026-01-01T10:00:00Z'), division: opts.division || null, group: null,
    homeTeam: { id: home, name: home, shortName: home, logoUrl: null },
    awayTeam: { id: away, name: away, shortName: away, logoUrl: null },
    sets: sets.map(([h,a]) => ({ homePoints:h, awayPoints:a, winnerSide: h>a?'HOME':'AWAY', status:'COMPLETED' })),
  } as any;
}

describe('standings', () => {
  it('computes FIVB points and basic table', () => {
    const matches = [
      m('1','A','B',3,0,[[25,20],[25,20],[25,20]]),
      m('2','A','C',3,2,[[25,20],[20,25],[25,20],[20,25],[15,10]]),
      m('3','B','C',1,3,[[20,25],[25,20],[20,25],[18,25]]),
    ];
    const { rows } = computeStandings(matches, { preset:'fivb' }, {});
    expect(rows[0].teamName).toBe('A');
    expect(rows[0].matchPoints).toBe(5); // 3 for 3-0, 2 for 3-2
    const c = rows.find(r=>r.teamName==='C')!;
    expect(c.matchPoints).toBe(4); // lost 2-3 to A (1pt) + won 3-1 vs B (3pts)
  });

  it('applies simple 2/0 rule', () => {
    const matches = [m('1','A','B',3,2,[[25,20],[20,25],[25,20],[20,25],[15,10]])];
    const rule = normalizePointsRule({ preset:'simple2' });
    expect(rule.win3_2).toBe(2);
    const { rows } = computeStandings(matches, rule, {});
    expect(rows.find(r=>r.teamName==='A')!.matchPoints).toBe(2);
    expect(rows.find(r=>r.teamName==='B')!.matchPoints).toBe(0);
  });

  it('handles tie-break by set ratio then point ratio', () => {
    const matches = [
      m('1','A','B',3,0,[[25,10],[25,10],[25,10]]),
      m('2','C','D',3,1,[[25,20],[25,20],[20,25],[25,20]]),
    ];
    // A and C both 3 pts, 1 win. A has better set ratio 3.0 vs 3.0? A 3/0 inf, C 3/1=3.0
    const { rows } = computeStandings(matches, { preset:'fivb' }, { tieBreakOrder:['points','wins','setRatio','pointRatio','headToHead'] });
    expect(rows[0].teamName).toBe('A');
  });

  it('handles forfeits', () => {
    const matches = [m('1','A','B',0,0,[], { forfeitWinnerSide:'HOME' })];
    const { rows } = computeStandings(matches, { preset:'fivb' }, {});
    expect(rows.find(r=>r.teamName==='A')!.matchPoints).toBe(3);
    expect(rows.find(r=>r.teamName==='B')!.matchPoints).toBe(0);
    expect(rows.find(r=>r.teamName==='A')!.setsFor).toBe(3);
  });
});
