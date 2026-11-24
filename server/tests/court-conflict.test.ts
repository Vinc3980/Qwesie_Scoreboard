import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../src/config/database.js';
import { MatchService } from '../src/services/match.service.js';

describe('Court conflict and clean state', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('findInPlayCourtConflict detects normalized in-play match on same court', async () => {
    const spy = vi.spyOn(prisma.match, 'findMany').mockResolvedValue([
      { id: 'm-old', court: 'Court 1', status: 'PAUSED', matchNumber: '10', homeTeamName: 'A', awayTeamName: 'B' } as any,
    ]);
    const conflict = await MatchService.findInPlayCourtConflict('1', 'm-new');
    expect(conflict?.id).toBe('m-old');
    expect(spy).toHaveBeenCalled();
  });

  it('findInPlayCourtConflict ignores different court', async () => {
    vi.spyOn(prisma.match, 'findMany').mockResolvedValue([
      { id: 'm-old', court: 'Court 2', status: 'LIVE', matchNumber: '10', homeTeamName: 'A', awayTeamName: 'B' } as any,
    ]);
    const conflict = await MatchService.findInPlayCourtConflict('1', 'm-new');
    expect(conflict).toBeNull();
  });
});
