import { prisma } from '../config/database.js';
import {
  BUILTIN_SCOREBUG_THEMES,
  ScorebugThemeRecord,
  defaultScorebugThemeConfig,
  getBuiltinScorebugTheme,
  sanitizeScorebugThemeConfig,
  scorebugThemeConfigSchema,
} from '@qwesie/shared';
import { broadcastOutputSceneState } from '../sockets/socketManager.js';

type ThemeRow = {
  id: string;
  name: string;
  description: string | null;
  config: any;
  isDefault: boolean;
  competitionId: string | null;
  isBuiltIn: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

function rowToTheme(row: ThemeRow): ScorebugThemeRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    config: sanitizeScorebugThemeConfig(row.config),
    isDefault: !!row.isDefault,
    competitionId: row.competitionId ?? null,
    isBuiltIn: !!row.isBuiltIn,
    readOnly: !!row.isBuiltIn,
    version: row.version || 1,
  };
}

function builtInById(id: string | null | undefined): ScorebugThemeRecord | null {
  if (!id) return null;
  return BUILTIN_SCOREBUG_THEMES.find(t => t.id === id) || null;
}

export async function listScorebugThemes(opts?: { competitionId?: string | null; includeBuiltIns?: boolean }) {
  const where: any = {};
  if (opts?.competitionId) where.competitionId = opts.competitionId;
  const rows = await prisma.scorebugTheme.findMany({
    where,
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });
  const dbThemes = rows.map(r => rowToTheme(r as any));
  const includeBuiltIns = opts?.includeBuiltIns !== false;
  return includeBuiltIns ? [...BUILTIN_SCOREBUG_THEMES, ...dbThemes] : dbThemes;
}

export async function getScorebugThemeById(id: string): Promise<ScorebugThemeRecord | null> {
  const builtin = builtInById(id);
  if (builtin) return builtin;
  const row = await prisma.scorebugTheme.findUnique({ where: { id } });
  return row ? rowToTheme(row as any) : null;
}

export async function createScorebugTheme(input: {
  name: string;
  description?: string | null;
  config: unknown;
  competitionId?: string | null;
  isDefault?: boolean;
}) {
  const config = scorebugThemeConfigSchema.parse(input.config ?? defaultScorebugThemeConfig());
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Theme name is required');
  const data: any = {
    name,
    description: input.description ?? null,
    config: config as any,
    competitionId: input.competitionId ?? null,
    isBuiltIn: false,
    version: 1,
    isDefault: !!input.isDefault,
  };
  const row = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.scorebugTheme.updateMany({ where: { isDefault: true, competitionId: data.competitionId ?? null }, data: { isDefault: false } });
    }
    return tx.scorebugTheme.create({ data });
  });
  return rowToTheme(row as any);
}

export async function updateScorebugTheme(id: string, input: {
  name?: string;
  description?: string | null;
  config?: unknown;
  isDefault?: boolean;
}) {
  const existing = await prisma.scorebugTheme.findUnique({ where: { id } });
  if (!existing) throw new Error('Theme not found');
  if ((existing as any).isBuiltIn) throw new Error('Built-in themes are read-only');
  const data: any = {};
  if (input.name !== undefined) {
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Theme name is required');
    data.name = name;
  }
  if (input.description !== undefined) data.description = input.description ?? null;
  if (input.config !== undefined) data.config = scorebugThemeConfigSchema.parse(input.config) as any;
  if (input.isDefault !== undefined) data.isDefault = !!input.isDefault;
  if (Object.keys(data).length === 0) return rowToTheme(existing as any);
  data.version = { increment: 1 };

  const row = await prisma.$transaction(async (tx) => {
    if (data.isDefault === true) {
      await tx.scorebugTheme.updateMany({ where: { isDefault: true, competitionId: (existing as any).competitionId ?? null, NOT: { id } }, data: { isDefault: false } });
    }
    return tx.scorebugTheme.update({ where: { id }, data });
  });
  await emitThemeChangeForTheme(id);
  return rowToTheme(row as any);
}

export async function deleteScorebugTheme(id: string) {
  const existing = await prisma.scorebugTheme.findUnique({ where: { id } });
  if (!existing) throw new Error('Theme not found');
  if ((existing as any).isBuiltIn) throw new Error('Built-in themes cannot be deleted');
  // Detach references before delete to guarantee fallback
  await prisma.$transaction(async (tx) => {
    await tx.match.updateMany({ where: { scorebugThemeId: id }, data: { scorebugThemeId: null } });
    await tx.competition.updateMany({ where: { scorebugThemeId: id }, data: { scorebugThemeId: null } });
    await tx.scorebugTheme.delete({ where: { id } });
  });
  await emitThemeChangeForTheme(id);
  return { id, deleted: true };
}

export async function duplicateScorebugTheme(id: string, input?: { name?: string }) {
  const src = await getScorebugThemeById(id);
  if (!src) throw new Error('Theme not found');
  const name = String(input?.name || `${src.name} Copy`).trim();
  const row = await prisma.scorebugTheme.create({
    data: {
      name,
      description: src.description ?? null,
      config: sanitizeScorebugThemeConfig(src.config) as any,
      competitionId: src.competitionId ?? null,
      isBuiltIn: false,
      isDefault: false,
      version: 1,
    } as any,
  });
  return rowToTheme(row as any);
}

export async function setDefaultScorebugTheme(id: string) {
  const theme = await getScorebugThemeById(id);
  if (!theme) throw new Error('Theme not found');
  if (theme.isBuiltIn) {
    // Setting a built-in as global default means clear DB defaults.
    await prisma.scorebugTheme.updateMany({ where: { isDefault: true, competitionId: null }, data: { isDefault: false } });
    await emitAllOutputScenes();
    return { ...theme, isDefault: true };
  }
  const row = await prisma.$transaction(async (tx) => {
    const existing = await tx.scorebugTheme.findUnique({ where: { id } });
    if (!existing) throw new Error('Theme not found');
    await tx.scorebugTheme.updateMany({ where: { isDefault: true, competitionId: (existing as any).competitionId ?? null }, data: { isDefault: false } });
    return tx.scorebugTheme.update({ where: { id }, data: { isDefault: true } });
  });
  await emitAllOutputScenes();
  return rowToTheme(row as any);
}

export async function applyScorebugThemeToMatch(matchId: string, themeId: string | null) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { id: true } });
  if (!match) throw new Error('Match not found');
  if (themeId) {
    const theme = await getScorebugThemeById(themeId);
    if (!theme) throw new Error('Theme not found');
  }
  await prisma.match.update({ where: { id: matchId }, data: { scorebugThemeId: themeId || null } as any });
  await markScorebugThemeExplicit(matchId, !!themeId);
  await emitOutputSceneForMatch(matchId);
  return getResolvedScorebugThemeForMatch(matchId);
}

export async function applyScorebugThemeToCompetition(competitionId: string, themeId: string | null) {
  const comp = await prisma.competition.findUnique({ where: { id: competitionId }, select: { id: true } });
  if (!comp) throw new Error('Competition not found');
  if (themeId) {
    const theme = await getScorebugThemeById(themeId);
    if (!theme) throw new Error('Theme not found');
  }
  await prisma.competition.update({ where: { id: competitionId }, data: { scorebugThemeId: themeId || null } as any });
  const matches = await prisma.match.findMany({ where: { competitionId }, select: { id: true } });
  for (const m of matches) await emitOutputSceneForMatch(m.id);
  return { competitionId, themeId: themeId || null };
}

export async function getResolvedScorebugThemeForMatch(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, scorebugThemeId: true, competitionId: true, competition: { select: { scorebugThemeId: true } } },
  });
  if (!match) throw new Error('Match not found');

  const tryIds = [
    (match as any).scorebugThemeId,
    (match as any).competition?.scorebugThemeId,
  ].filter(Boolean) as string[];

  for (const id of tryIds) {
    const t = await getScorebugThemeById(id);
    if (t) return { ...t, source: (match as any).scorebugThemeId === id ? 'match' : 'competition' };
  }

  const globalDefault = await prisma.scorebugTheme.findFirst({ where: { isDefault: true, competitionId: null } as any, orderBy: { updatedAt: 'desc' } });
  if (globalDefault) return { ...rowToTheme(globalDefault as any), source: 'global' };

  return { ...getBuiltinScorebugTheme('Classic'), source: 'builtin' };
}

async function emitOutputSceneForMatch(matchId: string) {
  try {
    const { getOutputSceneState } = await import('./broadcast.service.js');
    const state = await getOutputSceneState(matchId);
    const match = await prisma.match.findUnique({ where: { id: matchId }, select: { court: true } });
    broadcastOutputSceneState(matchId, state, match?.court);
  } catch {
    // best-effort; never block CRUD
  }
}

async function emitThemeChangeForTheme(themeId: string) {
  try {
    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { scorebugThemeId: themeId },
          { competition: { scorebugThemeId: themeId } },
        ],
      } as any,
      select: { id: true },
    });
    const globalDefault = await prisma.scorebugTheme.findFirst({ where: { id: themeId, isDefault: true, competitionId: null } as any, select: { id: true } });
    if (globalDefault) {
      await emitAllOutputScenes();
      return;
    }
    const seen = new Set<string>();
    for (const m of matches) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      await emitOutputSceneForMatch(m.id);
    }
  } catch {
    // ignore
  }
}

async function markScorebugThemeExplicit(matchId: string, explicit: boolean) {
  try {
    const row = await prisma.broadcastGraphicState.findFirst({ where: { matchId, graphicType: 'SCENE' as any } as any });
    if (!row) return;
    const payload = { ...((row.payload as any) || {}), scorebugThemeExplicit: explicit };
    await prisma.broadcastGraphicState.update({ where: { id: row.id }, data: { payload, version: { increment: 1 } } as any });
  } catch {
    // ignore
  }
}

async function emitAllOutputScenes() {
  try {
    const rows = await prisma.broadcastGraphicState.findMany({ where: { graphicType: 'SCENE' as any }, select: { matchId: true } });
    for (const r of rows) await emitOutputSceneForMatch(r.matchId);
  } catch {
    // ignore
  }
}
