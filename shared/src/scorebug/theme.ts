import { z } from 'zod';

export const SCOREBUG_THEME_SCHEMA_VERSION = 1;

export const scorebugAnchorSchema = z.enum([
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]);

export const scorebugShapePresetSchema = z.enum(['rectangular', 'slanted', 'rounded', 'pill']);
export const scorebugColorSourceSchema = z.enum(['team', 'custom']);
export const scorebugNameCaseSchema = z.enum(['upper', 'lower', 'title', 'as-is']);
export const scorebugInOutAnimationSchema = z.enum(['slide', 'fade', 'scale']);
export const scorebugScoreChangeAnimationSchema = z.enum(['flip', 'slide', 'pulse', 'none']);
export const scorebugShadowPresetSchema = z.enum(['none', 'soft', 'medium', 'strong']);

export const scorebugLayoutSchema = z.object({
  variant: z.enum(['classic', 'compact', 'wide', 'stacked', 'mini', 'pill', 'set-table', 'bottom-bar', 'top-bar', 'side-panel']).default('classic'),
  anchor: scorebugAnchorSchema.default('top-left'),
  offsetX: z.number().finite().min(-400).max(400).default(0),
  offsetY: z.number().finite().min(-400).max(400).default(0),
  scale: z.number().finite().min(0.5).max(2).default(1),
  safeAreaGuides: z.boolean().default(false),
});

export const scorebugShapeSchema = z.object({
  preset: scorebugShapePresetSchema.default('slanted'),
  cornerRadius: z.number().finite().min(0).max(48).default(0),
  slantLeft: z.number().finite().min(0).max(40).default(14),
  slantRight: z.number().finite().min(0).max(40).default(0),
  borderWidth: z.number().finite().min(0).max(8).default(1),
  borderColor: z.string().default('rgba(255,255,255,0.08)'),
  shadow: scorebugShadowPresetSchema.default('strong'),
  blockGap: z.number().finite().min(0).max(24).default(0),
});

const hexOrCssColor = z.string().min(1).max(64);

export const scorebugTeamColorSchema = z.object({
  source: scorebugColorSourceSchema.default('team'),
  customBackground: hexOrCssColor.default('#0ea5e9'),
  customText: hexOrCssColor.default('#ffffff'),
});

export const scorebugColorsSchema = z.object({
  background: hexOrCssColor.default('#0b101a'),
  teamA: scorebugTeamColorSchema.default({ source: 'team', customBackground: '#0ea5e9', customText: '#ffffff' }),
  teamB: scorebugTeamColorSchema.default({ source: 'team', customBackground: '#1d4ed8', customText: '#ffffff' }),
  scoreBackground: hexOrCssColor.default('#0f1625'),
  scoreText: hexOrCssColor.default('#ffffff'),
  setsBackground: hexOrCssColor.default('#1a2233'),
  setsText: hexOrCssColor.default('#ffffff'),
  setBadgeBackground: hexOrCssColor.default('#e5e7eb'),
  setBadgeText: hexOrCssColor.default('#0b101a'),
  servingIndicator: hexOrCssColor.default('currentColor'),
  accent: hexOrCssColor.default('#38bdf8'),
  pointFlashA: hexOrCssColor.default('rgba(56,189,248,0.22)'),
  pointFlashB: hexOrCssColor.default('rgba(192,132,252,0.22)'),
  setPointAccent: hexOrCssColor.default('#f59e0b'),
  matchPointAccent: hexOrCssColor.default('#ef4444'),
  opacity: z.number().finite().min(0.2).max(1).default(1),
});

export const scorebugTypographySchema = z.object({
  fontFamily: z.string().min(1).max(120).default('"Barlow Condensed", Inter, sans-serif'),
  weight: z.number().int().min(400).max(900).default(800),
  case: scorebugNameCaseSchema.default('upper'),
  letterSpacing: z.number().finite().min(-0.05).max(0.3).default(0.03),
  nameMax: z.number().int().min(18).max(72).default(40),
  nameMin: z.number().int().min(12).max(48).default(22),
  scoreSize: z.number().int().min(24).max(96).default(56),
  setsSize: z.number().int().min(20).max(80).default(46),
  labelSize: z.number().int().min(12).max(48).default(32),
});

export const scorebugContentSchema = z.object({
  showLogos: z.boolean().default(true),
  showTournament: z.boolean().default(true),
  tournamentLabel: z.string().max(120).nullable().default(null),
  showSetHistory: z.boolean().default(false),
  showTimeoutPips: z.boolean().default(true),
  showServeIndicator: z.boolean().default(true),
  nameDisplay: z.enum(['short', 'full', 'auto']).default('auto'),
  sponsorLogoUrl: z.string().max(500).nullable().default(null),
  sponsorSlot: z.enum(['left', 'right', 'none']).default('none'),
});

export const scorebugAnimationSchema = z.object({
  inOut: scorebugInOutAnimationSchema.default('slide'),
  durationMs: z.number().int().min(100).max(2000).default(320),
  easing: z.string().min(1).max(64).default('cubic-bezier(0.22, 1, 0.36, 1)'),
  scoreChange: scorebugScoreChangeAnimationSchema.default('flip'),
  pointFlash: z.boolean().default(true),
});

export const scorebugSizingSchema = z.object({
  widthMode: z.enum(['auto', 'fixed', 'maxPercent']).default('auto'),
  widthPx: z.number().int().min(220).max(1920).default(1100),
  maxWidthPercent: z.number().int().min(20).max(100).default(45),
  rowHeight: z.number().int().min(36).max(120).default(74),
  teamBlockWidth: z.number().int().min(0).max(700).default(400),
  nameWidth: z.number().int().min(0).max(420).default(200),
  logoSize: z.number().int().min(0).max(96).default(40),
  setsBoxWidth: z.number().int().min(0).max(140).default(72),
  pointsBoxWidth: z.number().int().min(0).max(220).default(124),
  setBadgeWidth: z.number().int().min(0).max(220).default(132),
  competitionWidth: z.number().int().min(0).max(420).default(220),
  fontScale: z.number().finite().min(0.7).max(1.6).default(1),
  padding: z.number().int().min(0).max(32).default(12),
  gap: z.number().int().min(0).max(24).default(0),
});

export const scorebugStackedSchema = z.object({
  rowHeight: z.number().int().min(36).max(64).default(52),
  width: z.number().int().min(280).max(560).default(380),
  infoStripPosition: z.enum(['below', 'above']).default('below'),
  showCompetitionLogo: z.boolean().default(true),
  showCompetitionName: z.boolean().default(true),
  showSetLabel: z.boolean().default(true),
  showRound: z.boolean().default(false),
  showMatchNumber: z.boolean().default(false),
  showCourt: z.boolean().default(false),
  previousSets: z.enum(['pips', 'columns', 'none']).default('pips'),
  serveIndicator: z.enum(['dot', 'ball', 'bar']).default('dot'),
  teamNameStyle: z.enum(['short', 'full', 'code']).default('short'),
  logoSize: z.number().int().min(20).max(56).default(34),
  logoShape: z.enum(['circle', 'rounded', 'square']).default('rounded'),
  teamAccent: z.enum(['bar', 'tint']).default('bar'),
  textAlign: z.enum(['left', 'center']).default('left'),
  anchorCorner: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).default('top-left'),
  compactness: z.enum(['ultra', 'standard', 'large']).default('standard'),
  expandStripOnSetBreak: z.boolean().default(true),
});

export const scorebugThemeConfigSchema = z.object({
  schemaVersion: z.literal(SCOREBUG_THEME_SCHEMA_VERSION).default(SCOREBUG_THEME_SCHEMA_VERSION),
  layout: scorebugLayoutSchema.default({}),
  shape: scorebugShapeSchema.default({}),
  colors: scorebugColorsSchema.default({}),
  typography: scorebugTypographySchema.default({}),
  content: scorebugContentSchema.default({}),
  animation: scorebugAnimationSchema.default({}),
  sizing: scorebugSizingSchema.default({}),
  stacked: scorebugStackedSchema.default({}),
});

export type ScorebugThemeConfig = z.infer<typeof scorebugThemeConfigSchema>;
export type ScorebugAnchor = z.infer<typeof scorebugAnchorSchema>;

export const scorebugThemeRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  config: scorebugThemeConfigSchema,
  isDefault: z.boolean().optional().default(false),
  competitionId: z.string().nullable().optional(),
  isBuiltIn: z.boolean().optional().default(false),
  readOnly: z.boolean().optional().default(false),
  version: z.number().int().min(1).optional().default(1),
});

export type ScorebugThemeRecord = z.infer<typeof scorebugThemeRecordSchema>;

export const SCOREBUG_FONT_OPTIONS = [
  { id: 'barlow-condensed', label: 'Barlow Condensed', family: '"Barlow Condensed", Inter, sans-serif', file: '/fonts/BarlowCondensed-ExtraBold.woff2' },
  { id: 'inter', label: 'Inter', family: 'Inter, system-ui, sans-serif', file: '/fonts/Inter-Bold.woff2' },
] as const;

export function defaultScorebugThemeConfig(): ScorebugThemeConfig {
  return scorebugThemeConfigSchema.parse({});
}

export function cloneScorebugThemeConfig(config: ScorebugThemeConfig): ScorebugThemeConfig {
  return scorebugThemeConfigSchema.parse(JSON.parse(JSON.stringify(config)));
}

function preset(name: string, description: string, patch: Partial<ScorebugThemeConfig>): ScorebugThemeRecord {
  const base = defaultScorebugThemeConfig();
  const config = scorebugThemeConfigSchema.parse({
    ...base,
    ...patch,
    layout: { ...base.layout, ...(patch.layout || {}) },
    shape: { ...base.shape, ...(patch.shape || {}) },
    colors: {
      ...base.colors,
      ...(patch.colors || {}),
      teamA: { ...base.colors.teamA, ...((patch.colors as any)?.teamA || {}) },
      teamB: { ...base.colors.teamB, ...((patch.colors as any)?.teamB || {}) },
    },
    typography: { ...base.typography, ...(patch.typography || {}) },
    content: { ...base.content, ...(patch.content || {}) },
    animation: { ...base.animation, ...(patch.animation || {}) },
    sizing: { ...base.sizing, ...((patch as any).sizing || {}) },
    stacked: { ...base.stacked, ...((patch as any).stacked || {}) },
  });
  return {
    id: `builtin-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    description,
    config,
    isDefault: name === 'Classic',
    competitionId: null,
    isBuiltIn: true,
    readOnly: true,
    version: 1,
  };
}

export const BUILTIN_SCOREBUG_THEMES: ScorebugThemeRecord[] = [
  preset('Classic', 'Current Qwesie scorebug look.', { sizing: { ...defaultScorebugThemeConfig().sizing, maxWidthPercent: 100 } }),
  preset('Compact', 'Smaller footprint for dense broadcasts.', {
    layout: { ...defaultScorebugThemeConfig().layout, variant: 'compact', scale: 0.95 },
    shape: { ...defaultScorebugThemeConfig().shape, slantLeft: 10 },
    typography: { ...defaultScorebugThemeConfig().typography, nameMax: 38, scoreSize: 50, setsSize: 42 },
    content: { ...defaultScorebugThemeConfig().content, showTimeoutPips: false },
    sizing: { ...defaultScorebugThemeConfig().sizing, maxWidthPercent: 100, rowHeight: 74, teamBlockWidth: 370, nameWidth: 170, setsBoxWidth: 72, pointsBoxWidth: 124, setBadgeWidth: 132, competitionWidth: 220, logoSize: 40, fontScale: 1 },
  }),
  preset('Wide', 'Full team names and wider blocks.', {
    layout: { ...defaultScorebugThemeConfig().layout, variant: 'wide' },
    content: { ...defaultScorebugThemeConfig().content, nameDisplay: 'full' },
    sizing: { ...defaultScorebugThemeConfig().sizing, maxWidthPercent: 100, rowHeight: 74, teamBlockWidth: 500, nameWidth: 320, setsBoxWidth: 72, pointsBoxWidth: 124, setBadgeWidth: 132, competitionWidth: 220, logoSize: 40, fontScale: 1 },
  }),
  preset('Minimal', 'Clean rectangular scorebug with reduced chrome.', {
    shape: { ...defaultScorebugThemeConfig().shape, preset: 'rectangular', slantLeft: 0, slantRight: 0, borderWidth: 0, shadow: 'soft' },
    colors: { ...defaultScorebugThemeConfig().colors, background: '#111827', setsBackground: '#1f2937', scoreBackground: '#111827', setBadgeBackground: '#374151', setBadgeText: '#f9fafb' },
    content: { ...defaultScorebugThemeConfig().content, showTournament: false, showSetHistory: false },
  }),
  preset('Glass', 'Translucent, rounded broadcast glass.', {
    shape: { ...defaultScorebugThemeConfig().shape, preset: 'rounded', cornerRadius: 18, slantLeft: 0, slantRight: 0, borderColor: 'rgba(255,255,255,0.16)', shadow: 'medium' },
    colors: { ...defaultScorebugThemeConfig().colors, background: 'rgba(15,23,42,0.62)', scoreBackground: 'rgba(15,23,42,0.38)', setsBackground: 'rgba(30,41,59,0.55)', setBadgeBackground: 'rgba(226,232,240,0.9)', opacity: 0.98 },
  }),
  preset('High-contrast', 'Maximum legibility for difficult viewing conditions.', {
    shape: { ...defaultScorebugThemeConfig().shape, preset: 'rectangular', slantLeft: 0, slantRight: 0, borderWidth: 2, borderColor: '#ffffff', shadow: 'none' },
    colors: {
      ...defaultScorebugThemeConfig().colors,
      background: '#000000', scoreBackground: '#000000', setsBackground: '#111111', scoreText: '#ffffff', setsText: '#ffffff',
      setBadgeBackground: '#ffffff', setBadgeText: '#000000', accent: '#facc15', pointFlashA: 'rgba(250,204,21,0.35)', pointFlashB: 'rgba(250,204,21,0.35)',
      setPointAccent: '#facc15', matchPointAccent: '#ff3b30', opacity: 1,
    },
    typography: { ...defaultScorebugThemeConfig().typography, weight: 900, letterSpacing: 0.04 },
  }),
  preset('Stacked Classic', 'Compact stacked corner scorebug with competition strip.', {
    layout: { ...defaultScorebugThemeConfig().layout, variant: 'stacked', anchor: 'top-left' },
    shape: { ...defaultScorebugThemeConfig().shape, preset: 'rounded', cornerRadius: 10, slantLeft: 0, slantRight: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    stacked: { ...defaultScorebugThemeConfig().stacked, compactness: 'standard' },
  }),
  preset('Stacked Minimal', 'Clean stacked scorebug with minimal chrome.', {
    layout: { ...defaultScorebugThemeConfig().layout, variant: 'stacked', anchor: 'top-left' },
    shape: { ...defaultScorebugThemeConfig().shape, preset: 'rectangular', cornerRadius: 0, slantLeft: 0, slantRight: 0, borderWidth: 0, shadow: 'soft' },
    colors: { ...defaultScorebugThemeConfig().colors, background: '#111827', scoreBackground: '#111827', setsBackground: '#1f2937', setBadgeBackground: '#374151', setBadgeText: '#f9fafb' },
    stacked: { ...defaultScorebugThemeConfig().stacked, compactness: 'standard', showCompetitionLogo: false, showRound: false },
  }),
  preset('Stacked Glass', 'Translucent stacked scorebug.', {
    layout: { ...defaultScorebugThemeConfig().layout, variant: 'stacked', anchor: 'top-left' },
    shape: { ...defaultScorebugThemeConfig().shape, preset: 'rounded', cornerRadius: 14, slantLeft: 0, slantRight: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', shadow: 'medium' },
    colors: { ...defaultScorebugThemeConfig().colors, background: 'rgba(15,23,42,0.62)', scoreBackground: 'rgba(15,23,42,0.38)', setsBackground: 'rgba(30,41,59,0.55)', setBadgeBackground: 'rgba(226,232,240,0.9)', opacity: 0.98 },
    stacked: { ...defaultScorebugThemeConfig().stacked, compactness: 'standard' },
  }),
  preset('Mini', 'Two logos and two scores only.', {
    layout: { ...defaultScorebugThemeConfig().layout, variant: 'mini', anchor: 'top-left' },
    shape: { ...defaultScorebugThemeConfig().shape, preset: 'rounded', cornerRadius: 10, slantLeft: 0, slantRight: 0 },
    sizing: { ...defaultScorebugThemeConfig().sizing, maxWidthPercent: 45, rowHeight: 52, teamBlockWidth: 110, nameWidth: 0, logoSize: 28, setsBoxWidth: 0, pointsBoxWidth: 52, setBadgeWidth: 0, competitionWidth: 0, fontScale: 1 },
  }),
  preset('Pill', 'Single rounded row with score and set label.', {
    layout: { ...defaultScorebugThemeConfig().layout, variant: 'pill', anchor: 'top-center' },
    shape: { ...defaultScorebugThemeConfig().shape, preset: 'pill', cornerRadius: 48, slantLeft: 0, slantRight: 0 },
    sizing: { ...defaultScorebugThemeConfig().sizing, maxWidthPercent: 45, rowHeight: 52, teamBlockWidth: 220, nameWidth: 120, logoSize: 28, setsBoxWidth: 44, pointsBoxWidth: 0, setBadgeWidth: 90, competitionWidth: 0, fontScale: 1 },
  }),
  preset('Set Table', 'Mini box score with set columns.', {
    layout: { ...defaultScorebugThemeConfig().layout, variant: 'set-table', anchor: 'top-left' },
    shape: { ...defaultScorebugThemeConfig().shape, preset: 'rounded', cornerRadius: 8, slantLeft: 0, slantRight: 0 },
    content: { ...defaultScorebugThemeConfig().content, showSetHistory: true },
    sizing: { ...defaultScorebugThemeConfig().sizing, maxWidthPercent: 45, rowHeight: 44, teamBlockWidth: 180, nameWidth: 120, logoSize: 28, setsBoxWidth: 44, pointsBoxWidth: 52, setBadgeWidth: 0, competitionWidth: 0, fontScale: 1 },
  }),
  preset('Bottom Bar', 'Full-width lower broadcast bar.', {
    layout: { ...defaultScorebugThemeConfig().layout, variant: 'bottom-bar', anchor: 'bottom-left' },
    shape: { ...defaultScorebugThemeConfig().shape, preset: 'rectangular', cornerRadius: 0, slantLeft: 0, slantRight: 0 },
    sizing: { ...defaultScorebugThemeConfig().sizing, maxWidthPercent: 100, rowHeight: 64, teamBlockWidth: 360, nameWidth: 200, logoSize: 36, setsBoxWidth: 72, pointsBoxWidth: 96, setBadgeWidth: 120, competitionWidth: 260, fontScale: 1 },
  }),
  preset('Top Bar', 'Thin full-width top ticker strip.', {
    layout: { ...defaultScorebugThemeConfig().layout, variant: 'top-bar', anchor: 'top-left' },
    shape: { ...defaultScorebugThemeConfig().shape, preset: 'rectangular', cornerRadius: 0, slantLeft: 0, slantRight: 0 },
    sizing: { ...defaultScorebugThemeConfig().sizing, maxWidthPercent: 100, rowHeight: 48, teamBlockWidth: 320, nameWidth: 180, logoSize: 30, setsBoxWidth: 60, pointsBoxWidth: 80, setBadgeWidth: 100, competitionWidth: 220, fontScale: 0.95 },
  }),
  preset('Side Panel', 'Vertical column for tall/side layouts.', {
    layout: { ...defaultScorebugThemeConfig().layout, variant: 'side-panel', anchor: 'middle-left' },
    shape: { ...defaultScorebugThemeConfig().shape, preset: 'rounded', cornerRadius: 12, slantLeft: 0, slantRight: 0 },
    sizing: { ...defaultScorebugThemeConfig().sizing, maxWidthPercent: 30, rowHeight: 56, teamBlockWidth: 220, nameWidth: 120, logoSize: 32, setsBoxWidth: 48, pointsBoxWidth: 64, setBadgeWidth: 0, competitionWidth: 0, fontScale: 1 },
  }),
];

export function getBuiltinScorebugTheme(idOrName?: string | null): ScorebugThemeRecord {
  if (!idOrName) return BUILTIN_SCOREBUG_THEMES[0];
  const key = String(idOrName).toLowerCase();
  return BUILTIN_SCOREBUG_THEMES.find(t => t.id === key || t.name.toLowerCase() === key) || BUILTIN_SCOREBUG_THEMES[0];
}

export type ScorebugThemeResolutionInput = {
  matchOverrideTheme?: ScorebugThemeRecord | null;
  competitionTheme?: ScorebugThemeRecord | null;
  globalDefaultTheme?: ScorebugThemeRecord | null;
};

export function resolveScorebugTheme(input: ScorebugThemeResolutionInput): ScorebugThemeRecord {
  return input.matchOverrideTheme || input.competitionTheme || input.globalDefaultTheme || getBuiltinScorebugTheme('Classic');
}

export function migrateLegacyScorebugSettings(settings: any): Partial<ScorebugThemeConfig> {
  const s = settings || {};
  const variant = String(s.variant || 'classic').toLowerCase();
  const normalizedVariant = variant === 'compact' ? 'compact' : variant === 'wide' ? 'wide' : variant === 'stacked' ? 'stacked' : 'classic';
  const position = String(s.position || 'top-left').toLowerCase();
  const anchor = (['top-left','top-center','top-right','middle-left','middle-center','middle-right','bottom-left','bottom-center','bottom-right'].includes(position) ? position : 'top-left') as ScorebugAnchor;
  const scaleRaw = Number(s.scale ?? 1);
  const scale = Number.isFinite(scaleRaw) ? Math.min(2, Math.max(0.5, scaleRaw)) : 1;
  return {
    layout: { variant: normalizedVariant, anchor, offsetX: 0, offsetY: 0, scale, safeAreaGuides: false },
    content: {
      showLogos: s.showLogos !== false,
      showTournament: s.showTournament !== false,
      tournamentLabel: s.tournamentLabel ?? null,
      showSetHistory: !!s.showSetHistory,
      showTimeoutPips: normalizedVariant !== 'compact',
      showServeIndicator: true,
      nameDisplay: normalizedVariant === 'wide' ? 'full' : 'auto',
      sponsorLogoUrl: null,
      sponsorSlot: 'none',
    },
  };
}

export function scorebugThemeConfigFromLegacy(settings: any): ScorebugThemeConfig {
  const base = defaultScorebugThemeConfig();
  const patch = migrateLegacyScorebugSettings(settings);
  return scorebugThemeConfigSchema.parse({
    ...base,
    layout: { ...base.layout, ...(patch.layout || {}) },
    content: { ...base.content, ...(patch.content || {}) },
  });
}

export function legacyScorebugSettingsFromTheme(config: ScorebugThemeConfig, visible = true, showPreMatch = true) {
  return {
    visible,
    variant: config.layout.variant,
    position: config.layout.anchor,
    scale: config.layout.scale,
    showSetHistory: config.content.showSetHistory,
    showPreMatch,
    showLogos: config.content.showLogos,
    showTournament: config.content.showTournament,
    tournamentLabel: config.content.tournamentLabel ?? null,
  };
}

export function sanitizeScorebugThemeConfig(input: unknown): ScorebugThemeConfig {
  return scorebugThemeConfigSchema.parse(input ?? {});
}
