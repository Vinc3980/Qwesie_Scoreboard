import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    playerMatchStatistics: { findMany: vi.fn() },
    matchEvent: { findMany: vi.fn() },
  },
}));
vi.mock('../src/config/database.js', () => ({ prisma: prismaMock }));
vi.mock('../src/utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { getPlayerLeaderboard } = await import('../src/services/playerLeaderboard.service.js');

function stat(over: any = {}) {
  return {
    playerId: 'p1', teamId: 't1', matchId: 'm1', points: 0, kills: 0, blocks: 0, aces: 0, digs: 0, assists: 0, attackErrors: 0, totalAttackAttempts: 0, receptionAttempts:0, receptionErrors:0, serveAttempts:0, serveErrors:0, setsPlayed: 3,
    player: { id: over.playerId || 'p1', firstName: 'A', lastName: 'Player', displayName: over.name || 'A Player', photoUrl: null, thumbUrl: null },
    team: { id: over.teamId || 't1', name: over.teamName || 'Team 1', shortName: 'T1', logoUrl: null },
    ...over,
  };
}

describe('player leaderboard aggregation', () => {
  beforeEach(() => { vi.clearAllMocks(); prismaMock.matchEvent.findMany.mockResolvedValue([]); });

  it('ranks by category and shares tie ranks', async () => {
    prismaMock.playerMatchStatistics.findMany.mockResolvedValue([
      stat({ playerId:'p1', name:'P1', points:10, kills:5 }),
      stat({ playerId:'p2', name:'P2', points:10, kills:7 }),
      stat({ playerId:'p3', name:'P3', points:8, kills:3 }),
    ]);
    const res = await getPlayerLeaderboard({ competitionId:'c1', category:'points' });
    expect(res.rows[0].rank).toBe(1);
    expect(res.rows[1].rank).toBe(1); // tie on points
    expect(res.rows[2].rank).toBe(3);
  });

  it('applies min matches filter', async () => {
    prismaMock.playerMatchStatistics.findMany.mockResolvedValue([
      stat({ playerId:'p1', matchId:'m1', points:10 }),
      stat({ playerId:'p1', matchId:'m2', points:5 }),
      stat({ playerId:'p2', matchId:'m1', points:20 }),
    ]);
    const res = await getPlayerLeaderboard({ competitionId:'c1', category:'points', minMatches: 2 });
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].playerId).toBe('p1');
    expect(res.rows[0].matchesPlayed).toBe(2);
  });

  it('handles players who changed teams by aggregating into one row', async () => {
    prismaMock.playerMatchStatistics.findMany.mockResolvedValue([
      stat({ playerId:'p1', teamId:'t1', teamName:'Old Team', matchId:'m1', points:5 }),
      stat({ playerId:'p1', teamId:'t2', teamName:'New Team', matchId:'m2', points:7 }),
    ]);
    const res = await getPlayerLeaderboard({ competitionId:'c1', category:'points' });
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].points).toBe(12);
    expect(res.rows[0].teamChanged).toBe(true);
  });

  it('reports unattributed event coverage', async () => {
    prismaMock.playerMatchStatistics.findMany.mockResolvedValue([stat({ playerId:'p1', matchId:'m1', points:1 })]);
    prismaMock.matchEvent.findMany.mockResolvedValue([
      { payload: { playerId: 'p1' } },
      { payload: { } },
      { payload: { playerId: null } },
    ]);
    const res = await getPlayerLeaderboard({ competitionId:'c1', category:'points' });
    expect(res.coverage.total).toBe(3);
    expect(res.coverage.attributed).toBe(1);
    expect(res.coverage.pct).toBeCloseTo(33.3, 0);
  });
});
