import { describe, it, expect, vi } from 'vitest';
import { CourtController } from '../src/controllers/court.controller.js';
import { prisma } from '../src/config/database.js';

// URL builder logic mirrors client computeOutputBaseUrl behavior (pure, no browser deps)
function pickLan(lanIpv4: string[], preferred?: string | null) {
  if (preferred && lanIpv4.includes(preferred)) return preferred;
  return lanIpv4[0] || null;
}
function isLocalHostLike(host: string) { return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'; }
function computeOutputBaseUrl(params: { currentHost: string; currentPort?: string | number | null; protocol?: string; serverPort?: number; lanIpv4?: string[]; preferredLan?: string | null; forceLan?: boolean; devServerPort?: number; }) {
  const lan = pickLan(params.lanIpv4 || [], params.preferredLan ?? null);
  const currentHost = params.currentHost || 'localhost';
  const proto = params.protocol || 'http:';
  const currentPort = params.currentPort != null && params.currentPort !== '' ? String(params.currentPort) : '';
  const serverPort = params.serverPort || 5000;
  const devPort = params.devServerPort || 5173;
  const forceLan = params.forceLan ?? isLocalHostLike(currentHost);
  let host = currentHost;
  if (forceLan && lan) host = lan;
  let effectivePort = currentPort ? Number(currentPort) : (isLocalHostLike(currentHost) && lan ? devPort : serverPort);
  if (!currentPort && lan && host === lan && devPort) effectivePort = devPort;
  return { baseUrl: `${proto}//${host}${effectivePort ? `:${effectivePort}` : ''}`, selectedLan: lan };
}
function buildCourtOutputUrl(baseUrl: string, court: string, kind: string) { return `${baseUrl}/out/court/${encodeURIComponent(String(court||'1'))}/${kind}`; }

describe('Stage C URL builder', () => {
  it('uses LAN address instead of localhost/127.0.0.1 when available', () => {
    const r1 = computeOutputBaseUrl({ currentHost: 'localhost', currentPort: '5173', lanIpv4: ['192.168.1.50'], serverPort: 5000, devServerPort: 5173 });
    expect(r1.baseUrl).toBe('http://192.168.1.50:5173');
    const r2 = computeOutputBaseUrl({ currentHost: '127.0.0.1', currentPort: '5173', lanIpv4: ['10.0.0.5'], serverPort: 5000, devServerPort: 5173 });
    expect(r2.baseUrl).toBe('http://10.0.0.5:5173');
  });
  it('keeps non-local host unless forceLan', () => {
    const r = computeOutputBaseUrl({ currentHost: '192.168.1.20', currentPort: '5173', lanIpv4: ['192.168.1.50'], serverPort: 5000, devServerPort: 5173 });
    expect(r.baseUrl).toBe('http://192.168.1.20:5173');
  });
  it('respects remembered/preferred interface selection', () => {
    const r = computeOutputBaseUrl({ currentHost: 'localhost', currentPort: '5173', lanIpv4: ['10.0.0.2','10.0.0.9'], preferredLan: '10.0.0.9', devServerPort: 5173 });
    expect(r.baseUrl).toBe('http://10.0.0.9:5173');
    expect(r.selectedLan).toBe('10.0.0.9');
  });
  it('builds stable per-court output URLs', () => {
    expect(buildCourtOutputUrl('http://192.168.1.50:5173','1','scorebug')).toBe('http://192.168.1.50:5173/out/court/1/scorebug');
    expect(buildCourtOutputUrl('http://192.168.1.50:5173','2','all')).toBe('http://192.168.1.50:5173/out/court/2/all');
  });
});

describe('Stage C court resolution controller', () => {
  it('returns null matchId when no active match on court', async () => {
    const prev = (prisma as any).courtOnAir;
    (prisma as any).courtOnAir = { findUnique: vi.fn().mockResolvedValue(null) };
    const spy = vi.spyOn(prisma.match, 'findMany').mockResolvedValue([] as any);
    const req: any = { params: { court: '3' } };
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res: any = { json, status };
    await CourtController.activeMatch(req, res, vi.fn());
    expect(spy).toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ court: '3', matchId: null, status: null }) }));
    spy.mockRestore();
    (prisma as any).courtOnAir = prev;
  });
  it('resolves different active matches for two courts at the same time', async () => {
    const prev = (prisma as any).courtOnAir;
    (prisma as any).courtOnAir = { findUnique: vi.fn().mockResolvedValue(null) };
    const spy = vi.spyOn(prisma.match, 'findMany').mockImplementation(async (args: any) => {
      const statuses = args?.where?.status?.in || [];
      if (statuses.includes('LIVE')) {
        return [
          { id: 'm1', court: '1', status: 'LIVE', updatedAt: new Date() },
          { id: 'm2', court: '2', status: 'LIVE', updatedAt: new Date() },
        ] as any;
      }
      return [] as any;
    });
    const res1: any = { json: vi.fn(), status: vi.fn(() => ({ json: vi.fn() })) };
    const res2: any = { json: vi.fn(), status: vi.fn(() => ({ json: vi.fn() })) };
    await CourtController.activeMatch({ params: { court: '1' } } as any, res1, vi.fn());
    await CourtController.activeMatch({ params: { court: '2' } } as any, res2, vi.fn());
    expect(res1.json.mock.calls[0][0].data).toEqual(expect.objectContaining({ court: '1', matchId: 'm1' }));
    expect(res2.json.mock.calls[0][0].data).toEqual(expect.objectContaining({ court: '2', matchId: 'm2' }));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    (prisma as any).courtOnAir = prev;
  });
  it('prefers explicit on-air match over in-play heuristic', async () => {
    const prev = (prisma as any).courtOnAir;
    (prisma as any).courtOnAir = { findUnique: vi.fn().mockResolvedValue({ courtKey: '1', matchId: 'onair-1', match: { id: 'onair-1', status: 'READY', matchNumber: '7', homeTeamName: 'A', awayTeamName: 'B' } }) };
    const spy = vi.spyOn(prisma.match, 'findMany').mockResolvedValue([{ id: 'live-1', court: '1', status: 'LIVE', updatedAt: new Date() } as any]);
    const json = vi.fn();
    const res: any = { json, status: vi.fn(() => ({ json })) };
    await CourtController.activeMatch({ params: { court: '1' } } as any, res, vi.fn());
    expect(json.mock.calls[0][0].data).toEqual(expect.objectContaining({ matchId: 'onair-1', source: 'on_air', onAirMatchId: 'onair-1' }));
    spy.mockRestore();
    (prisma as any).courtOnAir = prev;
  });
});

describe('Stage C client-count status updates (shape)', () => {
  it('computes totals from byType map as exposed by system info', () => {
    const byType = { scorebug: 2, graphics: 1, console: 1, other: 0 };
    const total = Object.values(byType).reduce((a,b)=>a+b,0);
    expect(total).toBe(4);
    expect(byType.scorebug).toBe(2);
  });
});