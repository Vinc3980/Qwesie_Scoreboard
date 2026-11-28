import { z } from 'zod';

export const leaderboardColumnKeySchema = z.enum(['played','won','lost','setsFor','setsAgainst','setRatio','pointsFor','pointsAgainst','pointRatio','matchPoints','form']);

const hexOrCssColor = z.string().max(64);
export const leaderboardZoneSchema = z.object({
  toRank: z.number().int().min(1).max(30),
  label: z.string().max(30).default(''),
  color: hexOrCssColor.default('rgba(34,197,94,0.12)'),
});

export const leaderboardThemeConfigSchema = z.object({
  colors: z.object({
    background: hexOrCssColor.default('#0b1220'),
    headerBg: hexOrCssColor.default('#111827'),
    rowBg: hexOrCssColor.default('rgba(255,255,255,0.04)'),
    rowAltBg: hexOrCssColor.default('rgba(255,255,255,0.08)'),
    leaderHighlight: hexOrCssColor.default('rgba(255,209,102,0.12)'),
    text: hexOrCssColor.default('#ffffff'),
    mutedText: hexOrCssColor.default('#9fb0c8'),
    accent: hexOrCssColor.default('#f59e0b'),
    rankBadgeBg: hexOrCssColor.default('#1f2937'),
    rankBadgeText: hexOrCssColor.default('#ffffff'),
    zoneText: hexOrCssColor.default('#d1fae5'),
  }).default({}),
  zones: z.array(leaderboardZoneSchema).default([]),
  typography: z.object({
    fontFamily: z.string().default('Inter, system-ui, sans-serif'),
    weight: z.number().min(400).max(900).default(700),
    uppercase: z.boolean().default(false),
    titleSize: z.number().min(24).max(96).default(48),
    rowSize: z.number().min(16).max(64).default(30),
    headerSize: z.number().min(12).max(40).default(18),
  }).default({}),
  logos: z.object({
    show: z.boolean().default(true),
    size: z.number().min(20).max(120).default(44),
    shape: z.enum(['circle','rounded','square']).default('rounded'),
    placement: z.enum(['left','right']).default('left'),
  }).default({}),
  names: z.object({ mode: z.enum(['full','short','code']).default('full') }).default({}),
  columns: z.array(leaderboardColumnKeySchema).default(['played','won','lost','setsFor','setsAgainst','setRatio','pointsFor','pointsAgainst','pointRatio','matchPoints','form']),
  showRankMovement: z.boolean().default(true),
  layout: z.object({
    mode: z.enum(['full','side','strip']).default('full'),
    rowsPerPage: z.number().int().min(4).max(20).default(10),
    fitAll: z.boolean().default(false),
    rowHeight: z.number().min(32).max(120).default(56),
    backgroundMode: z.enum(['solid','transparent','image']).default('solid'),
    backgroundImage: z.string().nullable().default(null),
    showTitle: z.boolean().default(true),
    showSubtitle: z.boolean().default(true),
    showCompetitionLogo: z.boolean().default(false),
    sponsorText: z.string().nullable().default(null),
    title: z.string().max(80).default('LEADERBOARD'),
    subtitle: z.string().max(120).nullable().default(null),
    safeArea: z.boolean().default(true),
  }).default({}),
  animation: z.object({
    enabled: z.boolean().default(true),
    staggerMs: z.number().min(0).max(500).default(40),
    durationMs: z.number().min(100).max(2000).default(450),
    easing: z.enum(['linear','easeOut','easeInOut']).default('easeOut'),
    pageTransition: z.enum(['fade','slide']).default('fade'),
    pageDwellSec: z.number().min(2).max(30).default(8),
  }).default({}),
});

export type LeaderboardThemeConfig = z.infer<typeof leaderboardThemeConfigSchema>;
export const defaultLeaderboardThemeConfig = (): LeaderboardThemeConfig => leaderboardThemeConfigSchema.parse({});
export const sanitizeLeaderboardThemeConfig = (input: unknown): LeaderboardThemeConfig => leaderboardThemeConfigSchema.parse(input ?? {});

export function exportLeaderboardTheme(theme: LeaderboardThemeRecord) {
  return { version: 1, kind: theme.kind, name: theme.name, description: theme.description ?? null, config: sanitizeLeaderboardThemeConfig(theme.config) };
}

function normalizeHex(color: string): string | null {
  const c = color.trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].split('').map(x => x + x).join('') : m[1];
  return `#${hex.toLowerCase()}`;
}
function luminance(hex: string): number | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  const rgb = [1,3,5].map(i => parseInt(n.slice(i, i+2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126*rgb[0] + 0.7152*rgb[1] + 0.0722*rgb[2];
}
export function contrastRatio(fg: string, bg: string): number | null {
  const a = luminance(fg), b = luminance(bg);
  if (a == null || b == null) return null;
  const l1 = Math.max(a,b), l2 = Math.min(a,b);
  return (l1 + 0.05) / (l2 + 0.05);
}
export function leaderboardContrastWarnings(config: LeaderboardThemeConfig): string[] {
  const warnings: string[] = [];
  const checks: Array<[string,string,string,number]> = [
    ['Text on row background', config.colors.text, config.colors.rowBg, 4.5],
    ['Text on header', config.colors.text, config.colors.headerBg, 4.5],
    ['Accent on background', config.colors.accent, config.colors.background, 3],
  ];
  for (const [label, fg, bg, min] of checks) {
    const r = contrastRatio(fg, bg);
    if (r != null && r < min) warnings.push(`${label} contrast is low (${r.toFixed(2)}:1, need ${min}:1).`);
  }
  return warnings;
}

export function computeLeaderboardFit(totalRows: number, opts: { frameHeight?: number; headerHeight?: number; rowHeight: number; gap?: number; minScale?: number }) {
  const frame = opts.frameHeight ?? 1080;
  const header = opts.headerHeight ?? 140;
  const gap = opts.gap ?? 8;
  const available = Math.max(120, frame - header - 40);
  const needed = totalRows * opts.rowHeight + Math.max(0, totalRows - 1) * gap;
  const scale = needed <= 0 ? 1 : Math.min(1, available / needed);
  const minScale = opts.minScale ?? 0.45;
  if (scale < minScale) return { scale: minScale, fits: false, rowsPerPage: Math.max(4, Math.floor((available / minScale - gap) / (opts.rowHeight + gap))) };
  return { scale, fits: true, rowsPerPage: totalRows };
}

export type LeaderboardThemeRecord = { id: string; name: string; description?: string | null; kind: 'leaderboard'|'player'; config: LeaderboardThemeConfig; isDefault?: boolean; competitionId?: string | null; isBuiltIn?: boolean; version?: number };

export const BUILTIN_LEADERBOARD_THEMES: LeaderboardThemeRecord[] = [
  { id: 'builtin-lb-classic', name: 'Classic', kind: 'leaderboard', isBuiltIn: true, config: defaultLeaderboardThemeConfig(), description: 'Classic dark broadcast table.' },
  { id: 'builtin-lb-minimal', name: 'Minimal', kind: 'leaderboard', isBuiltIn: true, config: leaderboardThemeConfigSchema.parse({ colors: { background:'#ffffff', headerBg:'#f3f4f6', rowBg:'#ffffff', rowAltBg:'#f9fafb', text:'#111827', mutedText:'#6b7280', accent:'#2563eb', rankBadgeBg:'#e5e7eb', rankBadgeText:'#111827', leaderHighlight:'rgba(37,99,235,0.08)' }, layout:{ backgroundMode:'solid' } }), description: 'Light minimal table.' },
  { id: 'builtin-lb-dark-glass', name: 'Dark glass', kind: 'leaderboard', isBuiltIn: true, config: leaderboardThemeConfigSchema.parse({ colors: { background:'rgba(15,23,42,0.55)', headerBg:'rgba(15,23,42,0.7)', rowBg:'rgba(255,255,255,0.04)', rowAltBg:'rgba(255,255,255,0.08)', leaderHighlight:'rgba(245,158,11,0.15)' }, layout:{ backgroundMode:'transparent' } }), description: 'Glass overlay style.' },
  { id: 'builtin-lb-high-contrast', name: 'High contrast', kind: 'leaderboard', isBuiltIn: true, config: leaderboardThemeConfigSchema.parse({ colors:{ background:'#000000', headerBg:'#000000', rowBg:'#111111', rowAltBg:'#1a1a1a', text:'#ffffff', mutedText:'#e5e7eb', accent:'#facc15', leaderHighlight:'#333300', rankBadgeBg:'#facc15', rankBadgeText:'#000000' }, typography:{ weight:800 } }), description: 'High contrast for readability.' },
  { id: 'builtin-lb-compact-strip', name: 'Compact strip', kind: 'leaderboard', isBuiltIn: true, config: leaderboardThemeConfigSchema.parse({ layout:{ mode:'strip', rowsPerPage:5, rowHeight:44 }, typography:{ rowSize:24, titleSize:34 } }), description: 'Bottom strip / compact layout.' },
];
