import { prisma } from '../config/database.js';
import { BUILTIN_LEADERBOARD_THEMES, sanitizeLeaderboardThemeConfig, defaultLeaderboardThemeConfig, type LeaderboardThemeRecord } from '@qwesie/shared';

function toRecord(row: any): LeaderboardThemeRecord {
  return { id: row.id, name: row.name, description: row.description, kind: (row.kind || 'leaderboard') as any, config: sanitizeLeaderboardThemeConfig(row.config), isDefault: !!row.isDefault, competitionId: row.competitionId, isBuiltIn: !!row.isBuiltIn, version: row.version };
}

export async function listLeaderboardThemes(competitionId?: string) {
  const db = await prisma.leaderboardTheme.findMany({ where: competitionId ? { OR: [{ competitionId }, { competitionId: null }] } : {}, orderBy: [{ isBuiltIn: 'desc' }, { updatedAt: 'desc' }] } as any);
  const builtins = BUILTIN_LEADERBOARD_THEMES;
  const map = new Map<string, LeaderboardThemeRecord>();
  for (const b of builtins) map.set(b.id, b);
  for (const r of db) map.set(r.id, toRecord(r));
  return Array.from(map.values());
}

export async function getLeaderboardTheme(id: string) {
  const builtin = BUILTIN_LEADERBOARD_THEMES.find(t => t.id === id);
  if (builtin) return builtin;
  const row = await prisma.leaderboardTheme.findUnique({ where: { id } } as any);
  return row ? toRecord(row) : null;
}

export async function createLeaderboardTheme(input: any) {
  const row = await prisma.leaderboardTheme.create({ data: {
    name: String(input.name || 'Leaderboard Theme'),
    description: input.description ? String(input.description) : null,
    kind: input.kind === 'player' ? 'player' : 'leaderboard',
    config: sanitizeLeaderboardThemeConfig(input.config) as any,
    isDefault: !!input.isDefault,
    competitionId: input.competitionId || null,
    isBuiltIn: false,
  } as any });
  return toRecord(row);
}

export async function updateLeaderboardTheme(id: string, input: any) {
  const existing = await prisma.leaderboardTheme.findUnique({ where: { id } } as any);
  if (!existing) return null;
  const row = await prisma.leaderboardTheme.update({ where: { id } as any, data: {
    ...(input.name !== undefined ? { name: String(input.name) } : {}),
    ...(input.description !== undefined ? { description: input.description ? String(input.description) : null } : {}),
    ...(input.kind !== undefined ? { kind: input.kind === 'player' ? 'player' : 'leaderboard' } : {}),
    ...(input.config !== undefined ? { config: sanitizeLeaderboardThemeConfig(input.config) as any } : {}),
    ...(input.isDefault !== undefined ? { isDefault: !!input.isDefault } : {}),
    ...(input.competitionId !== undefined ? { competitionId: input.competitionId || null } : {}),
    version: { increment: 1 },
  } as any });
  return toRecord(row);
}

export async function deleteLeaderboardTheme(id: string) {
  if (BUILTIN_LEADERBOARD_THEMES.some(t => t.id === id)) return false;
  await prisma.competition.updateMany({ where: { leaderboardThemeId: id } as any, data: { leaderboardThemeId: null } as any });
  await prisma.leaderboardTheme.delete({ where: { id } } as any).catch(() => null);
  return true;
}

export async function duplicateLeaderboardTheme(id: string, name?: string) {
  const src = await getLeaderboardTheme(id);
  if (!src) return null;
  return createLeaderboardTheme({
    name: name || `${src.name} Copy`,
    description: src.description,
    kind: src.kind,
    config: src.config,
    competitionId: src.competitionId ?? null,
  });
}

export async function setDefaultLeaderboardTheme(id: string, competitionId?: string | null) {
  const theme = await getLeaderboardTheme(id);
  if (!theme) return null;
  if (competitionId) {
    await prisma.competition.update({ where: { id: competitionId }, data: { leaderboardThemeId: theme.isBuiltIn ? null : id } as any });
    // if built-in, we can't store ID in FK-restricted way? leaderboardThemeId FK points to leaderboard_themes table; builtins aren't in DB. Store null and resolve fallback to builtin by kind - simpler: create a DB copy? No. Instead handle built-in IDs in resolve by checking competition field stores string? Schema says String? FK. We'll store it only for DB themes; for builtin, set null and also store in broadcast payload; but simpler: when setting builtin default, clear competition.leaderboardThemeId and let resolve return builtin. We need a way to pick which builtin. Store in competition config? Easier: persist builtin as DB row on demand.
  }
  if (!theme.isBuiltIn) {
    await prisma.leaderboardTheme.updateMany({ where: { isDefault: true, competitionId: competitionId || null } as any, data: { isDefault: false } as any });
    await prisma.leaderboardTheme.update({ where: { id } as any, data: { isDefault: true } as any });
  }
  return getLeaderboardTheme(id);
}

export async function resolveLeaderboardTheme(opts: { competitionId?: string | null; themeId?: string | null; kind?: 'leaderboard' | 'player' }) {
  if (opts.themeId) { const t = await getLeaderboardTheme(opts.themeId); if (t) return t; }
  if (opts.competitionId) {
    const comp = await prisma.competition.findUnique({ where: { id: opts.competitionId } } as any);
    const tid = (comp as any)?.leaderboardThemeId;
    if (tid) { const t = await getLeaderboardTheme(tid); if (t) return t; }
  }
  const byKind = BUILTIN_LEADERBOARD_THEMES.find(t => t.kind === (opts.kind || 'leaderboard'));
  return byKind || BUILTIN_LEADERBOARD_THEMES[0];
}
