import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TeamLogo, TimeoutPips } from './index.js';
import {
  ScorebugThemeConfig,
  defaultScorebugThemeConfig,
  scorebugThemeConfigFromLegacy,
  sanitizeScorebugThemeConfig,
} from '@qwesie/shared';

type TeamKey = 'A' | 'B';

function asText(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

function useFitText(text: string, opts: { max: number; min: number; boxWidth: number; weight?: number; family?: string; letterSpacingEm?: number }) {
  const [size, setSize] = useState(opts.max);
  useLayoutEffect(() => {
    const t = String(text || '');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) { setSize(opts.max); return; }
    let s = opts.max;
    const weight = opts.weight ?? 800;
    const family = opts.family ?? '"Barlow Condensed", Inter, sans-serif';
    while (s > opts.min) {
      ctx.font = `${weight} ${s}px ${family}`;
      if (ctx.measureText(t).width <= opts.boxWidth) break;
      s -= 1;
    }
    setSize(Math.max(opts.min, s));
  }, [text, opts.max, opts.min, opts.boxWidth, opts.weight, opts.family, opts.letterSpacingEm]);
  return size;
}

function shadowFor(preset: string) {
  if (preset === 'none') return 'none';
  if (preset === 'soft') return '0 8px 20px rgba(0,0,0,0.25)';
  if (preset === 'medium') return '0 12px 30px rgba(0,0,0,0.35)';
  return '0 16px 40px rgba(0,0,0,0.45)';
}

function formatName(name: string, mode: 'upper' | 'lower' | 'title' | 'as-is') {
  if (mode === 'upper') return name.toUpperCase();
  if (mode === 'lower') return name.toLowerCase();
  if (mode === 'title') return name.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return name;
}

const ScoreFlip: React.FC<{ value: number | string; style?: React.CSSProperties; mode: 'flip' | 'slide' | 'pulse' | 'none'; ease: any; duration: number }> = ({ value, style, mode, ease, duration }) => {
  if (mode === 'none') return <div className="tabular-score" style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{value}</div>;
  const initial = mode === 'slide' ? { x: -10, opacity: 0 } : mode === 'pulse' ? { scale: 0.92, opacity: 0.5 } : { y: '-40%', opacity: 0 };
  const animate = mode === 'pulse' ? { scale: 1, opacity: 1 } : { x: 0, y: 0, opacity: 1 };
  const exit = mode === 'slide' ? { x: 10, opacity: 0 } : mode === 'pulse' ? { scale: 1.04, opacity: 0 } : { y: '40%', opacity: 0 };
  return (
    <div className="relative overflow-hidden tabular-score" style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={String(value)} initial={initial} animate={animate} exit={exit} transition={{ duration, ease }} style={{ display: 'inline-block' }}>
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
};

export type ScorebugSettings = {
  visible: boolean;
  variant: 'classic' | 'compact' | 'wide' | 'stacked' | 'mini' | 'pill' | 'set-table' | 'bottom-bar' | 'top-bar' | 'side-panel';
  position: string;
  scale: number;
  showSetHistory: boolean;
  showPreMatch?: boolean;
  showLogos?: boolean;
  showTournament?: boolean;
  tournamentLabel?: string | null;
  theme?: ScorebugThemeConfig | any;
  themeId?: string | null;
  themeVersion?: number | null;
  themeName?: string | null;
};

function resolveTheme(settings: ScorebugSettings): ScorebugThemeConfig {
  if (settings?.theme) {
    try { return sanitizeScorebugThemeConfig(settings.theme); } catch { /* fall through */ }
  }
  return scorebugThemeConfigFromLegacy(settings);
}

function useCountdown(timerEndsAt?: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!timerEndsAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [timerEndsAt]);
  if (!timerEndsAt) return null;
  const end = Date.parse(String(timerEndsAt));
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

const StackedScorebug: React.FC<{
  m: any;
  theme: ScorebugThemeConfig;
  settings: ScorebugSettings;
  status?: string | null;
  scoreFlash?: TeamKey | null;
  banner?: { text: string; color?: string; textColor?: string; kind?: string } | null;
  timerEndsAt?: string | null;
}> = ({ m, theme, settings, status, scoreFlash, banner, timerEndsAt }) => {
  const stCfg = (theme as any).stacked || {};
  const compactness = stCfg.compactness || 'standard';
  const cMul = compactness === 'ultra' ? 0.88 : compactness === 'large' ? 1.12 : 1;
  const rowH = clamp(Math.round((Number(stCfg.rowHeight) || 52) * cMul), 36, 64);
  const width = clamp(Math.round((Number(stCfg.width) || 380) * cMul), 280, 560);
  const stripH = Math.max(28, Math.round(rowH * 0.56));
  const logoSize = clamp(Math.round((Number(stCfg.logoSize) || 34) * cMul), 20, 56);
  const anchor = theme.layout.anchor || settings.position || 'top-left';
  const anchorCorner = stCfg.anchorCorner || (anchor.includes('right') ? (anchor.includes('bottom') ? 'bottom-right' : 'top-right') : (anchor.includes('bottom') ? 'bottom-left' : 'top-left'));
  const mirror = String(anchorCorner).includes('right');
  const scale = clamp(Number(theme.layout.scale ?? settings.scale ?? 1) || 1, 0.5, 2);
  const safe = 48;
  const offsetX = Number(theme.layout.offsetX || 0);
  const offsetY = Number(theme.layout.offsetY || 0);
  const anchorStyle: React.CSSProperties = {
    position: 'absolute',
    top: anchor.includes('bottom') ? undefined : anchor.includes('middle') ? '50%' : safe + offsetY,
    bottom: anchor.includes('bottom') ? safe - offsetY : undefined,
    left: anchor.includes('right') ? undefined : anchor.includes('center') ? '50%' : safe + offsetX,
    right: anchor.includes('right') ? safe - offsetX : undefined,
    transform: `${anchor.includes('middle') ? 'translateY(-50%) ' : ''}${anchor.includes('center') ? 'translateX(-50%) ' : ''}scale(${scale})`,
    transformOrigin: `${anchor.includes('right') ? 'right' : anchor.includes('center') ? 'center' : 'left'} ${anchor.includes('bottom') ? 'bottom' : anchor.includes('middle') ? 'center' : 'top'}`,
    maxWidth: 1920 - safe * 2,
    opacity: theme.colors.opacity ?? 1,
  };
  const animDur = clamp((theme.animation.durationMs || 320) / 1000, 0.1, 2);
  const ease = (theme.animation.easing || 'cubic-bezier(0.22, 1, 0.36, 1)') as any;
  const enter = theme.animation.inOut === 'fade' ? { opacity: 0 } : theme.animation.inOut === 'scale' ? { opacity: 0, scale: 0.96 } : { opacity: 0, x: mirror ? 40 : -40 };
  const exitAnim = theme.animation.inOut === 'fade' ? { opacity: 0 } : theme.animation.inOut === 'scale' ? { opacity: 0, scale: 0.96 } : { opacity: 0, x: mirror ? 30 : -30 };

  const teamData = (side: TeamKey) => {
    const t = m.teams?.[side] || {};
    const nameStyle = stCfg.teamNameStyle || 'short';
    const raw = nameStyle === 'full' ? (asText(t.name) || asText(t.shortName) || side) : nameStyle === 'code' ? (asText(t.shortName) || asText(t.name) || side).slice(0, 4) : (asText(t.shortName) || asText(t.name) || side);
    const name = formatName(raw, theme.typography.case);
    const score = Number.isFinite(Number(t.score)) ? Number(t.score) : 0;
    const sets = Number.isFinite(Number(t.sets)) ? Number(t.sets) : 0;
    const colorCfg = side === 'A' ? theme.colors.teamA : theme.colors.teamB;
    const bg = colorCfg.source === 'custom' ? colorCfg.customBackground : (asText(t.primaryColor) || colorCfg.customBackground);
    const fg = colorCfg.source === 'custom' ? colorCfg.customText : (asText(t.textColor) || '#fff');
    const serving = m.server === side;
    return { t, name, score, sets, bg, fg, serving };
  };
  const A = teamData('A');
  const B = teamData('B');
  const countdown = useCountdown(timerEndsAt);
  const showServe = theme.content.showServeIndicator;
  const serveStyle = stCfg.serveIndicator || 'dot';
  const accentBarW = stCfg.teamAccent === 'bar' ? Math.max(4, Math.round(rowH * 0.1)) : 0;
  const logoShapeR = stCfg.logoShape === 'circle' ? 999 : stCfg.logoShape === 'square' ? 2 : 8;
  const setsBoxW = Math.max(44, Math.round(rowH * 0.95)); // fixed for 1-2 digits
  const pointsBoxW = Math.max(56, Math.round(rowH * 1.18)); // fixed for 3 digits
  const prevMode = stCfg.previousSets || 'pips';
  const completedSets = (Array.isArray(m.setHistory) ? m.setHistory : []).filter((s: any) => s && (s.scoreA > 0 || s.scoreB > 0 || s.winner != null || Number(s.number) < Number(m.current_set || 1)));
  const prevCount = Math.max(0, (Number(m.max_sets || 5) - 1));
  const prevW = prevMode === 'none' ? 0 : prevMode === 'columns' ? Math.min(96, prevCount * 28) : Math.min(72, prevCount * 14);

  const competitionName = asText((m as any).competitionName) || asText((m as any).tournament) || '';
  const competitionLogo = asText((m as any).competitionLogoUrl) || '';
  const round = asText((m as any).round) || asText((m as any).division) || '';
  const matchNo = asText((m as any).match_no) || asText((m as any).matchNumber) || '';
  const court = asText((m as any).court) || '';
  const currentSet = Number(m.current_set || 1);
  const isDecidingSet = !!(m.flags?.isDecidingSet) || (Number(m.max_sets || 5) > 1 && currentSet === Number(m.max_sets || 5));
  const setLabel = isDecidingSet ? 'DECIDING SET' : `SET ${currentSet}`;

  const stripParts: string[] = [];
  if (stCfg.showSetLabel !== false) stripParts.push(setLabel);
  if (stCfg.showRound && round) stripParts.push(round);
  if (stCfg.showMatchNumber && matchNo) stripParts.push(`M${matchNo}`);
  if (stCfg.showCourt && court) stripParts.push(court);

  const context = useMemo(() => {
    if (banner?.text) {
      if (banner.kind === 'set-summary' && stCfg.expandStripOnSetBreak === false) return null;
      return { text: banner.text, color: banner.color, textColor: banner.textColor || '#fff', kind: banner.kind || 'context' };
    }
    return null;
  }, [banner?.text, banner?.color, banner?.textColor, banner?.kind, stCfg.expandStripOnSetBreak]);

  const contextText = context ? (context.kind === 'timeout' || context.kind === 'technical-timeout' ? context.text.replace(/\s\d+s$/, '') + (countdown != null ? ` ${countdown}s` : '') : context.text) : '';
  const showStrip = stCfg.showCompetitionLogo || stCfg.showCompetitionName || stripParts.length > 0 || !!context;
  const infoAbove = stCfg.infoStripPosition === 'above';
  const radius = theme.shape.preset === 'rounded' ? Math.max(0, theme.shape.cornerRadius) : theme.shape.preset === 'pill' ? 18 : theme.shape.preset === 'rectangular' ? 0 : Math.max(0, theme.shape.cornerRadius || 10);
  const border = `${theme.shape.borderWidth}px solid ${theme.shape.borderColor}`;
  const shadow = shadowFor(theme.shape.shadow);

  const nameBoxW = width - accentBarW - (theme.content.showLogos ? logoSize + 10 : 0) - prevW - setsBoxW - pointsBoxW - 20 - (showServe ? 16 : 0);
  const nameFontA = useFitText(A.name, { max: Math.max(16, Math.round(rowH * 0.42)), min: 13, boxWidth: Math.max(60, nameBoxW), weight: theme.typography.weight, family: theme.typography.fontFamily, letterSpacingEm: theme.typography.letterSpacing });
  const nameFontB = useFitText(B.name, { max: Math.max(16, Math.round(rowH * 0.42)), min: 13, boxWidth: Math.max(60, nameBoxW), weight: theme.typography.weight, family: theme.typography.fontFamily, letterSpacingEm: theme.typography.letterSpacing });

  const renderServe = (serving: boolean, fg: string) => {
    if (!showServe) return <div style={{ width: 0 }} />;
    const visible = !!serving;
    const common: React.CSSProperties = { width: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 14px' };
    if (serveStyle === 'bar') return <div style={common}>{visible ? <motion.div layoutId="stacked-serve" style={{ width: 4, height: Math.max(18, rowH - 18), borderRadius: 2, background: fg, opacity: 0.95 }} transition={{ duration: animDur * 0.6, ease }} /> : null}</div>;
    if (serveStyle === 'ball') return <div style={common}>{visible ? <motion.div layoutId="stacked-serve" style={{ width: 10, height: 10, borderRadius: 999, border: `2px solid ${fg}`, boxShadow: `inset 0 -2px 0 ${fg}` }} transition={{ duration: animDur * 0.6, ease }} /> : null}</div>;
    return <div style={common}>{visible ? <motion.div layoutId="stacked-serve" style={{ width: 8, height: 8, borderRadius: 999, background: fg }} transition={{ duration: animDur * 0.6, ease }} /> : null}</div>;
  };

  const renderPrev = (side: TeamKey) => {
    if (prevMode === 'none') return null;
    if (prevMode === 'columns') {
      return (
        <div style={{ width: prevW, flex: `0 0 ${prevW}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, borderLeft: `1px solid ${theme.shape.borderColor}`, color: theme.colors.setsText, background: 'rgba(255,255,255,0.02)' }}>
          {completedSets.slice(0, 5).map((s: any) => {
            const val = side === 'A' ? s.scoreA : s.scoreB;
            const won = s.winner === side;
            return <div key={`${side}-${s.number}`} style={{ width: 24, textAlign: 'center', fontSize: 13, fontWeight: won ? 800 : 600, opacity: won ? 1 : 0.72, fontFamily: theme.typography.fontFamily }} className="tabular-score">{val}</div>;
          })}
        </div>
      );
    }
    return (
      <div style={{ width: prevW, flex: `0 0 ${prevW}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, borderLeft: `1px solid ${theme.shape.borderColor}` }}>
        {Array.from({ length: Math.min(5, prevCount) }, (_, i) => {
          const set = completedSets[i];
          const won = set?.winner === side;
          const played = !!set;
          return <div key={`${side}-pip-${i}`} style={{ width: 8, height: 8, borderRadius: 999, background: won ? theme.colors.accent : 'transparent', border: `1px solid ${played ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)'}`, opacity: played ? 1 : 0.45 }} />;
        })}
      </div>
    );
  };

  const renderRow = (side: TeamKey) => {
    const td = side === 'A' ? A : B;
    const nameSize = side === 'A' ? nameFontA : nameFontB;
    const rowFlash = scoreFlash === side && theme.animation.pointFlash;
    const flashBg = rowFlash ? (side === 'A' ? theme.colors.pointFlashA : theme.colors.pointFlashB) : theme.colors.scoreBackground;
    const rowBg = stCfg.teamAccent === 'tint' ? `linear-gradient(${mirror ? '270deg' : '90deg'}, ${td.bg}22, ${theme.colors.background} 35%)` : theme.colors.background;
    return (
      <div style={{ display: 'flex', alignItems: 'stretch', height: rowH, background: rowBg, borderBottom: side === 'A' ? `1px solid ${theme.shape.borderColor}` : undefined, overflow: 'hidden' }}>
        {!mirror && accentBarW ? <div style={{ width: accentBarW, flex: `0 0 ${accentBarW}px`, background: td.bg }} /> : null}
        <div style={{ width: 16, flex: '0 0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{renderServe(td.serving, td.fg)}</div>
        {theme.content.showLogos ? (
          <div style={{ width: logoSize, flex: `0 0 ${logoSize}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 6, borderRadius: logoShapeR, overflow: 'hidden' }}>
            <TeamLogo src={asText(td.t.logoUrl)} name={asText(td.t.name) || td.name} shortName={asText(td.t.shortName) || td.name} color="rgba(255,255,255,0.14)" textColor={td.fg} size={logoSize} />
          </div>
        ) : null}
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', paddingRight: 8, justifyContent: stCfg.textAlign === 'center' ? 'center' : 'flex-start' }}>
          <div title={asText(td.t.name) || td.name} style={{ fontSize: nameSize, fontWeight: theme.typography.weight, lineHeight: 1, letterSpacing: `${theme.typography.letterSpacing}em`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, maxWidth: '100%', color: theme.colors.scoreText, textTransform: theme.typography.case === 'upper' ? 'uppercase' : undefined, fontFamily: theme.typography.fontFamily }}>{td.name}</div>
        </div>
        {renderPrev(side)}
        <div style={{ width: setsBoxW, flex: `0 0 ${setsBoxW}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme.colors.setsBackground, color: theme.colors.setsText, borderLeft: `1px solid ${theme.shape.borderColor}` }}>
          <div style={{ fontSize: Math.max(18, Math.round(rowH * 0.52)), fontWeight: theme.typography.weight, lineHeight: 1, fontFamily: theme.typography.fontFamily }} className="tabular-score">{td.sets}</div>
        </div>
        <div style={{ width: pointsBoxW, flex: `0 0 ${pointsBoxW}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: flashBg, color: theme.colors.scoreText, borderLeft: `1px solid ${theme.shape.borderColor}`, transition: 'background-color 220ms ease' }}>
          <ScoreFlip value={td.score} mode={theme.animation.scoreChange} ease={ease} duration={Math.min(0.35, animDur * 0.7)} style={{ fontSize: String(td.score).length >= 3 ? Math.max(20, Math.round(rowH * 0.58)) : Math.max(22, Math.round(rowH * 0.66)), fontWeight: theme.typography.weight, lineHeight: 1, minWidth: pointsBoxW - 10, textAlign: 'center', fontFamily: theme.typography.fontFamily }} />
        </div>
        {mirror && accentBarW ? <div style={{ width: accentBarW, flex: `0 0 ${accentBarW}px`, background: td.bg }} /> : null}
      </div>
    );
  };

  const normalStrip = (
    <div style={{ height: stripH, minHeight: stripH, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', overflow: 'hidden', background: theme.colors.setsBackground, color: theme.colors.setsText }}>
      {stCfg.showCompetitionLogo !== false && competitionLogo ? <img src={competitionLogo} alt="" loading="lazy" decoding="async" style={{ width: Math.max(18, stripH - 10), height: Math.max(18, stripH - 10), objectFit: 'contain', flex: '0 0 auto' }} /> : null}
      {stCfg.showCompetitionName !== false && competitionName ? <div title={competitionName} style={{ fontSize: Math.max(12, Math.round(stripH * 0.38)), fontWeight: 700, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '1 1 auto', fontFamily: theme.typography.fontFamily, textTransform: 'uppercase' }}>{competitionName}</div> : null}
      {stripParts.length > 0 ? <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto', fontSize: Math.max(11, Math.round(stripH * 0.34)), fontWeight: 700, letterSpacing: '0.05em', fontFamily: theme.typography.fontFamily, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{stripParts.join(' • ')}</div> : null}
    </div>
  );

  const contextStrip = (
    <div style={{ height: stripH, minHeight: stripH, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px', overflow: 'hidden', background: context?.color || theme.colors.accent, color: context?.textColor || '#fff', fontSize: Math.max(12, Math.round(stripH * 0.4)), fontWeight: 800, letterSpacing: '0.08em', fontFamily: theme.typography.fontFamily, textTransform: 'uppercase', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{contextText}</span>
    </div>
  );

  const strip = showStrip ? (
    <div style={{ borderTop: infoAbove ? undefined : `1px solid ${theme.shape.borderColor}`, borderBottom: infoAbove ? `1px solid ${theme.shape.borderColor}` : undefined, overflow: 'hidden' }}>
      <AnimatePresence initial={false} mode="wait">
        <motion.div key={context ? `ctx-${context.kind}-${contextText}` : 'normal'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: Math.min(0.22, animDur), ease }}>
          {context ? contextStrip : normalStrip}
        </motion.div>
      </AnimatePresence>
    </div>
  ) : null;

  return (
    <motion.div data-testid="scorebug-stacked" initial={enter} animate={{ opacity: 1, x: 0, y: 0, scale: 1 }} exit={exitAnim} transition={{ duration: animDur, ease }} style={{ ...anchorStyle, willChange: 'transform, opacity' }}>
      <div style={{ width, border, boxShadow: shadow, borderRadius: radius, overflow: 'hidden', background: theme.colors.background, fontFamily: theme.typography.fontFamily }}>
        {infoAbove ? strip : null}
        {renderRow('A')}
        {renderRow('B')}
        {!infoAbove ? strip : null}
      </div>
    </motion.div>
  );
};

const VariantFrame: React.FC<{ theme: ScorebugThemeConfig; settings: ScorebugSettings; width: number; testId: string; banner?: { text: string; color?: string; textColor?: string } | null; children: React.ReactNode }> = ({ theme, settings, width, testId, banner, children }) => {
  const anchor = theme.layout.anchor || settings.position || 'top-left';
  const safe = 48;
  const rawScale = clamp(Number(theme.layout.scale ?? settings.scale ?? 1) || 1, 0.5, 2);
  const isBar = theme.layout.variant === 'bottom-bar' || theme.layout.variant === 'top-bar';
  const capPct = isBar ? 100 : clamp(Number((theme as any).sizing?.maxWidthPercent ?? 45) || 45, 20, 100);
  const capPx = Math.round(1920 * (capPct / 100)) - (isBar ? safe * 2 : 0);
  const scale = Math.min(rawScale, capPx / Math.max(1, width));
  const offsetX = Number(theme.layout.offsetX || 0);
  const offsetY = Number(theme.layout.offsetY || 0);
  const animDur = clamp((theme.animation.durationMs || 320) / 1000, 0.1, 2);
  const ease = (theme.animation.easing || 'cubic-bezier(0.22, 1, 0.36, 1)') as any;
  const enter = theme.animation.inOut === 'fade' ? { opacity: 0 } : theme.animation.inOut === 'scale' ? { opacity: 0, scale: 0.96 } : { opacity: 0, y: anchor.includes('bottom') ? 14 : -14 };
  const exitAnim = theme.animation.inOut === 'fade' ? { opacity: 0 } : theme.animation.inOut === 'scale' ? { opacity: 0, scale: 0.98 } : { opacity: 0, y: (anchor.includes('bottom') ? 14 : -14) * 0.6 };
  const anchorStyle: React.CSSProperties = {
    position: 'absolute', top: anchor.includes('bottom') ? undefined : anchor.includes('middle') ? '50%' : safe + offsetY,
    bottom: anchor.includes('bottom') ? safe - offsetY : undefined,
    left: anchor.includes('right') ? undefined : anchor.includes('center') ? '50%' : safe + offsetX,
    right: anchor.includes('right') ? safe - offsetX : undefined,
    transform: `${anchor.includes('middle') ? 'translateY(-50%) ' : ''}${anchor.includes('center') ? 'translateX(-50%) ' : ''}scale(${scale})`,
    transformOrigin: `${anchor.includes('right') ? 'right' : anchor.includes('center') ? 'center' : 'left'} ${anchor.includes('bottom') ? 'bottom' : anchor.includes('middle') ? 'center' : 'top'}`,
    maxWidth: 1920 - safe * 2, opacity: theme.colors.opacity ?? 1,
  };
  return <motion.div data-testid={testId} initial={enter} animate={{ opacity: 1, x: 0, y: 0, scale: 1 }} exit={exitAnim} transition={{ duration: animDur, ease }} style={anchorStyle}><div style={{ display:'flex', flexDirection:'column', gap:6, alignItems: anchor.includes('right') ? 'flex-end' : anchor.includes('center') ? 'center' : 'flex-start' }}>{children}{banner ? <div style={{ background: banner.color || '#334155', color: banner.textColor || '#fff', padding:'8px 14px', fontWeight:800, fontSize: Math.round(18 * ((theme as any).sizing?.fontScale || 1)), letterSpacing:'0.06em', border:`1px solid ${theme.shape.borderColor}`, boxShadow:'0 8px 20px rgba(0,0,0,0.3)', textTransform:'uppercase', whiteSpace:'nowrap', fontFamily:theme.typography.fontFamily }}>{banner.text}</div> : null}</div></motion.div>;
};

const MiniVariant: React.FC<{ m: any; theme: ScorebugThemeConfig; settings: ScorebugSettings; scoreFlash: TeamKey | null; banner?: any }> = ({ m, theme, settings, scoreFlash, banner }) => {
  const A = m.teams?.A || {}, B = m.teams?.B || {};
  const s = (theme as any).sizing || {}; const rowH = clamp(Number(s.rowHeight||52),44,90); const pW = clamp(Number(s.pointsBoxWidth||52),40,90); const logo = clamp(Number(s.logoSize||28),20,56);
  const width = logo*2 + pW*2 + 24;
  const cell = (side: TeamKey) => { const t=side==='A'?A:B; const fg = (side==='A'?theme.colors.teamA:theme.colors.teamB).source==='custom' ? (side==='A'?theme.colors.teamA.customText:theme.colors.teamB.customText) : `var(--team-${side.toLowerCase()}-text)`; const bg=(side==='A'?theme.colors.teamA:theme.colors.teamB).source==='custom'?(side==='A'?theme.colors.teamA.customBackground:theme.colors.teamB.customBackground):`var(--team-${side.toLowerCase()})`; const flash=scoreFlash===side&&theme.animation.pointFlash; return (
    <div style={{ display:'flex', alignItems:'center', gap:6, background:bg, color:fg, padding:'0 8px', height:rowH }}>
      <TeamLogo src={asText(t.logoUrl)} name={asText(t.name)||side} shortName={asText(t.shortName)||side} size={logo} color="rgba(255,255,255,0.18)" textColor={fg} />
      <div style={{ width:pW, textAlign:'center', fontWeight:theme.typography.weight, fontSize:Math.round(28*((theme as any).sizing?.fontScale||1)), background: flash ? (side==='A'?theme.colors.pointFlashA:theme.colors.pointFlashB):'rgba(0,0,0,0.12)', borderRadius:6, padding:'4px 0' }} className="tabular-score">{Number(t.score||0)}</div>
    </div>); };
  return <VariantFrame theme={theme} settings={settings} width={width} testId="scorebug-variant-mini" banner={banner}><div style={{ display:'flex', border:`${theme.shape.borderWidth}px solid ${theme.shape.borderColor}`, borderRadius:theme.shape.cornerRadius||10, overflow:'hidden', boxShadow:shadowFor(theme.shape.shadow), fontFamily:theme.typography.fontFamily }}>{cell('A')}<div style={{ width:24, display:'flex', alignItems:'center', justifyContent:'center', background:theme.colors.setBadgeBackground, color:theme.colors.setBadgeText, fontWeight:800, fontSize:14 }}>{Number(A.sets||0)}-{Number(B.sets||0)}</div>{cell('B')}</div></VariantFrame>;
};

const PillVariant: React.FC<{ m: any; theme: ScorebugThemeConfig; settings: ScorebugSettings; banner?: any }> = ({ m, theme, settings, banner }) => {
  const A=m.teams?.A||{}, B=m.teams?.B||{}; const s=(theme as any).sizing||{}; const rowH=clamp(Number(s.rowHeight||52),44,80);
  const name = (t:any, side:string)=>formatName(asText(t.shortName)||asText(t.name)||side, theme.typography.case);
  const width = clamp(Number(s.teamBlockWidth||220)*2 + Number(s.setBadgeWidth||90), 320, 860);
  return <VariantFrame theme={theme} settings={settings} width={width} testId="scorebug-variant-pill" banner={banner}><div style={{ display:'flex', alignItems:'center', height:rowH, borderRadius:999, overflow:'hidden', border:`${theme.shape.borderWidth}px solid ${theme.shape.borderColor}`, boxShadow:shadowFor(theme.shape.shadow), fontFamily:theme.typography.fontFamily, background:theme.colors.background, color:theme.colors.scoreText }}>
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 14px', background:'var(--team-a)', color:'var(--team-a-text)' }}><span style={{ fontWeight:800, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name(A,'A')}</span><span className="tabular-score" style={{ fontWeight:900, fontSize:24 }}>{Number(A.sets||0)}</span></div>
    <div style={{ padding:'0 14px', fontWeight:900, fontSize:14, background:theme.colors.setBadgeBackground, color:theme.colors.setBadgeText, whiteSpace:'nowrap' }}>SET {m.current_set||1}</div>
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 14px', background:'var(--team-b)', color:'var(--team-b-text)' }}><span className="tabular-score" style={{ fontWeight:900, fontSize:24 }}>{Number(B.sets||0)}</span><span style={{ fontWeight:800, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name(B,'B')}</span></div>
  </div></VariantFrame>;
};

const SetTableVariant: React.FC<{ m: any; theme: ScorebugThemeConfig; settings: ScorebugSettings; banner?: any }> = ({ m, theme, settings, banner }) => {
  const A=m.teams?.A||{}, B=m.teams?.B||{}; const s=(theme as any).sizing||{}; const rowH=clamp(Number(s.rowHeight||44),36,64); const nameW=clamp(Number(s.nameWidth||120),80,220); const colW=clamp(Number(s.pointsBoxWidth||52),36,72);
  const setsCount=Number(m.max_sets||5); const width=nameW + colW*setsCount + clamp(Number(s.setsBoxWidth||44),36,72) + 16;
  const setScores = Array.isArray(m.set_scores?.A) ? m.set_scores : { A: [], B: [] };
  const row = (side:TeamKey) => { const t=side==='A'?A:B; const fg=(side==='A'?theme.colors.teamA:theme.colors.teamB).source==='custom'?(side==='A'?theme.colors.teamA.customText:theme.colors.teamB.customText):`var(--team-${side.toLowerCase()}-text)`; const bg=(side==='A'?theme.colors.teamA:theme.colors.teamB).source==='custom'?(side==='A'?theme.colors.teamA.customBackground:theme.colors.teamB.customBackground):`var(--team-${side.toLowerCase()})`;
    return <div style={{ display:'flex', alignItems:'stretch', height:rowH, borderBottom: side==='A'?`1px solid ${theme.shape.borderColor}`:undefined }}>
      <div style={{ width:nameW, display:'flex', alignItems:'center', gap:8, padding:'0 10px', background:bg, color:fg, fontWeight:800, overflow:'hidden' }}><TeamLogo src={asText(t.logoUrl)} name={asText(t.name)||side} shortName={asText(t.shortName)||side} size={clamp(Number(s.logoSize||28),20,40)} color="rgba(255,255,255,0.18)" textColor={fg} /><span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{formatName(asText(t.shortName)||asText(t.name)||side, theme.typography.case)}</span></div>
      {Array.from({length:setsCount},(_,i)=>{ const cur=i+1===Number(m.current_set||1); const v=(setScores?.[side]||[])[i]; return <div key={i} style={{ width:colW, display:'flex', alignItems:'center', justifyContent:'center', background:cur?'rgba(255,255,255,0.08)':'transparent', color:theme.colors.scoreText, fontWeight:cur?900:700, borderLeft:`1px solid ${theme.shape.borderColor}` }} className="tabular-score">{Number(v||0)|| (cur?Number(t.score||0):'')}</div>; })}
      <div style={{ width:clamp(Number(s.setsBoxWidth||44),36,72), display:'flex', alignItems:'center', justifyContent:'center', background:theme.colors.setsBackground, color:theme.colors.setsText, fontWeight:900, borderLeft:`1px solid ${theme.shape.borderColor}` }} className="tabular-score">{Number(t.sets||0)}</div>
    </div>; };
  return <VariantFrame theme={theme} settings={settings} width={width} testId="scorebug-variant-set-table" banner={banner}><div style={{ border:`${theme.shape.borderWidth}px solid ${theme.shape.borderColor}`, borderRadius:theme.shape.cornerRadius||8, overflow:'hidden', background:theme.colors.background, boxShadow:shadowFor(theme.shape.shadow), fontFamily:theme.typography.fontFamily }}>{row('A')}{row('B')}</div></VariantFrame>;
};

const BarVariant: React.FC<{ m: any; theme: ScorebugThemeConfig; settings: ScorebugSettings; top: boolean; scoreFlash: TeamKey | null; banner?: any }> = ({ m, theme, settings, top, scoreFlash, banner }) => {
  const A=m.teams?.A||{}, B=m.teams?.B||{}; const s=(theme as any).sizing||{}; const rowH=clamp(Number(s.rowHeight||(top?48:64)),44,96);
  const width = 1920 - 96;
  const sideBlock = (side:TeamKey, right?:boolean) => { const t=side==='A'?A:B; const fg=(side==='A'?theme.colors.teamA:theme.colors.teamB).source==='custom'?(side==='A'?theme.colors.teamA.customText:theme.colors.teamB.customText):`var(--team-${side.toLowerCase()}-text)`; const bg=(side==='A'?theme.colors.teamA:theme.colors.teamB).source==='custom'?(side==='A'?theme.colors.teamA.customBackground:theme.colors.teamB.customBackground):`var(--team-${side.toLowerCase()})`; const flash=scoreFlash===side&&theme.animation.pointFlash; return (
    <div style={{ display:'flex', alignItems:'stretch', flexDirection:right?'row-reverse':'row', minWidth:0 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'0 16px', background:bg, color:fg, minWidth:0 }}>
        <TeamLogo src={asText(t.logoUrl)} name={asText(t.name)||side} shortName={asText(t.shortName)||side} size={clamp(Number(s.logoSize||34),24,56)} color="rgba(255,255,255,0.18)" textColor={fg} />
        <div style={{ fontWeight:800, fontSize:Math.round(24*((s.fontScale)||1)), whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:clamp(Number(s.nameWidth||200),120,320) }}>{formatName(asText(t.shortName)||asText(t.name)||side, theme.typography.case)}</div>
      </div>
      <div style={{ width:clamp(Number(s.setsBoxWidth||72),40,100), display:'flex', alignItems:'center', justifyContent:'center', background:theme.colors.setsBackground, color:theme.colors.setsText, fontWeight:900, fontSize:Math.round(30*(s.fontScale||1)) }} className="tabular-score">{Number(t.sets||0)}</div>
      <div style={{ width:clamp(Number(s.pointsBoxWidth||96),56,140), display:'flex', alignItems:'center', justifyContent:'center', background:flash?(side==='A'?theme.colors.pointFlashA:theme.colors.pointFlashB):theme.colors.scoreBackground, color:theme.colors.scoreText, fontWeight:900, fontSize:Math.round(38*(s.fontScale||1)) }} className="tabular-score">{Number(t.score||0)}</div>
    </div>); };
  return <VariantFrame theme={theme} settings={settings} width={width} testId={top?'scorebug-variant-top-bar':'scorebug-variant-bottom-bar'} banner={banner}><div style={{ width, height:rowH, display:'flex', alignItems:'stretch', justifyContent:'space-between', background:theme.colors.background, border:`${theme.shape.borderWidth}px solid ${theme.shape.borderColor}`, boxShadow:shadowFor(theme.shape.shadow), overflow:'hidden', fontFamily:theme.typography.fontFamily }}>
    {sideBlock('A', false)}
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:16, color:'#dbe4f5', fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', overflow:'hidden' }}><span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{asText(m.competitionName)||asText(m.tournament)||''}</span><span style={{ color:theme.colors.setBadgeText, background:theme.colors.setBadgeBackground, padding:'4px 10px', fontWeight:900 }}>SET {m.current_set||1}</span></div>
    {sideBlock('B', true)}
  </div></VariantFrame>;
};

const SidePanelVariant: React.FC<{ m: any; theme: ScorebugThemeConfig; settings: ScorebugSettings; scoreFlash: TeamKey | null; banner?: any }> = ({ m, theme, settings, scoreFlash, banner }) => {
  const A=m.teams?.A||{}, B=m.teams?.B||{}; const s=(theme as any).sizing||{}; const width=clamp(Math.round(320*(s.fontScale||1)),220,520); const rowH=clamp(Number(s.rowHeight||56),44,80);
  const row = (side:TeamKey) => { const t=side==='A'?A:B; const fg=(side==='A'?theme.colors.teamA:theme.colors.teamB).source==='custom'?(side==='A'?theme.colors.teamA.customText:theme.colors.teamB.customText):`var(--team-${side.toLowerCase()}-text)`; const bg=(side==='A'?theme.colors.teamA:theme.colors.teamB).source==='custom'?(side==='A'?theme.colors.teamA.customBackground:theme.colors.teamB.customBackground):`var(--team-${side.toLowerCase()})`; const flash=scoreFlash===side&&theme.animation.pointFlash; return (
    <div style={{ display:'flex', alignItems:'stretch', height:rowH, borderBottom:side==='A'?`1px solid ${theme.shape.borderColor}`:undefined }}>
      <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, padding:'0 10px', background:bg, color:fg, minWidth:0 }}><TeamLogo src={asText(t.logoUrl)} name={asText(t.name)||side} shortName={asText(t.shortName)||side} size={clamp(Number(s.logoSize||32),20,48)} color="rgba(255,255,255,0.18)" textColor={fg} /><span style={{ fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{formatName(asText(t.shortName)||asText(t.name)||side, theme.typography.case)}</span></div>
      <div style={{ width:clamp(Number(s.setsBoxWidth||48),36,72), display:'flex', alignItems:'center', justifyContent:'center', background:theme.colors.setsBackground, color:theme.colors.setsText, fontWeight:900 }} className="tabular-score">{Number(t.sets||0)}</div>
      <div style={{ width:clamp(Number(s.pointsBoxWidth||64),48,96), display:'flex', alignItems:'center', justifyContent:'center', background:flash?(side==='A'?theme.colors.pointFlashA:theme.colors.pointFlashB):theme.colors.scoreBackground, color:theme.colors.scoreText, fontWeight:900, fontSize:28 }} className="tabular-score">{Number(t.score||0)}</div>
    </div>); };
  return <VariantFrame theme={theme} settings={settings} width={width} testId="scorebug-variant-side-panel" banner={banner}><div style={{ width, border:`${theme.shape.borderWidth}px solid ${theme.shape.borderColor}`, borderRadius:theme.shape.cornerRadius||12, overflow:'hidden', background:theme.colors.background, boxShadow:shadowFor(theme.shape.shadow), fontFamily:theme.typography.fontFamily }}>
    <div style={{ padding:'8px 10px', fontSize:12, fontWeight:800, letterSpacing:'0.08em', color:'#dbe4f5', background:'rgba(255,255,255,0.04)', borderBottom:`1px solid ${theme.shape.borderColor}` }}>{asText(m.competitionName)||asText(m.tournament)||'MATCH'} • SET {m.current_set||1}</div>
    {row('A')}{row('B')}
  </div></VariantFrame>;
};

const ScorebugOverlayInner: React.FC<{
  match: any;
  settings: ScorebugSettings;
  status?: string | null;
  scoreFlash?: TeamKey | null;
  banner?: { text: string; color?: string; textColor?: string; kind?: string } | null;
  timerEndsAt?: string | null;
  forceShow?: boolean;
}> = ({ match: m, settings, status, scoreFlash, banner, timerEndsAt, forceShow }) => {
  if (!m) return null;
  const theme = useMemo(() => resolveTheme(settings), [settings]);
  const st = String(status || m.status || '').toUpperCase();
  const isPreMatch = st === 'SCHEDULED' || st === 'READY';
  const isTerminal = st === 'COMPLETED' || st === 'FINISHED' || st === 'CANCELLED';
  const showPreMatch = settings.showPreMatch ?? (theme as any).content?.showPreMatch ?? true;
  const shouldShow = forceShow ? settings.visible : (settings.visible && !isTerminal && (!isPreMatch || !!showPreMatch));
  if (!shouldShow) return null;
  if (theme.layout.variant === 'stacked') {
    return <StackedScorebug m={m} theme={theme} settings={settings} status={status} scoreFlash={scoreFlash} banner={banner} timerEndsAt={timerEndsAt} />;
  }
  if (theme.layout.variant === 'mini') return <MiniVariant m={m} theme={theme} settings={settings} scoreFlash={scoreFlash ?? null} banner={banner} />;
  if (theme.layout.variant === 'pill') return <PillVariant m={m} theme={theme} settings={settings} banner={banner} />;
  if (theme.layout.variant === 'set-table') return <SetTableVariant m={m} theme={theme} settings={settings} banner={banner} />;
  if (theme.layout.variant === 'bottom-bar') return <BarVariant m={m} theme={theme} settings={settings} top={false} scoreFlash={scoreFlash ?? null} banner={banner} />;
  if (theme.layout.variant === 'top-bar') return <BarVariant m={m} theme={theme} settings={settings} top={true} scoreFlash={scoreFlash ?? null} banner={banner} />;
  if (theme.layout.variant === 'side-panel') return <SidePanelVariant m={m} theme={theme} settings={settings} scoreFlash={scoreFlash ?? null} banner={banner} />;

  const A = m.teams?.A || {}; const B = m.teams?.B || {};
  const variant = theme.layout.variant || settings.variant || 'classic';
  const nameDisplay = theme.content.nameDisplay || 'auto';
  const nameAraw = (nameDisplay === 'full' || (nameDisplay === 'auto' && variant === 'wide')) ? (asText(A.name) || asText(A.shortName) || 'A') : (asText(A.shortName) || asText(A.name) || 'A');
  const nameBraw = (nameDisplay === 'full' || (nameDisplay === 'auto' && variant === 'wide')) ? (asText(B.name) || asText(B.shortName) || 'B') : (asText(B.shortName) || asText(B.name) || 'B');
  const nameA = formatName(nameAraw, theme.typography.case);
  const nameB = formatName(nameBraw, theme.typography.case);

  const matchTournament = asText((m as any).tournamentShortName) || asText(m.tournament) || '';
  const showLogos = settings.showLogos ?? theme.content.showLogos;
  const showTournament = settings.showTournament ?? theme.content.showTournament;
  const tournament = showTournament ? (asText(settings.tournamentLabel) || asText(theme.content.tournamentLabel) || matchTournament) : '';
  const showSetHistory = settings.showSetHistory ?? theme.content.showSetHistory;
  const showPips = variant !== 'compact' && theme.content.showTimeoutPips;
  const showServe = theme.content.showServeIndicator;

  const rawScale = clamp(Number(theme.layout.scale ?? settings.scale ?? 1) || 1, 0.5, 2);
  const anchor = theme.layout.anchor || settings.position || 'top-left';
  const safe = 48;
  const offsetX = Number(theme.layout.offsetX || 0);
  const offsetY = Number(theme.layout.offsetY || 0);
  const sizing = (theme as any).sizing || {};
  const fontScale = clamp(Number(sizing.fontScale ?? 1) || 1, 0.7, 1.6);
  const isBarVariant = ['bottom-bar', 'top-bar'].includes(variant as string);
  const capPct = isBarVariant ? 100 : clamp(Number(sizing.maxWidthPercent ?? 60) || 60, 20, 100);
  const capPx = Math.round(1920 * (capPct / 100)) - (isBarVariant ? safe * 2 : 0);

  let effShowSetHistory = !!(settings.showSetHistory ?? theme.content.showSetHistory);
  let effShowPips = variant !== 'compact' && theme.content.showTimeoutPips;
  let effShowTournament = !!(settings.showTournament ?? theme.content.showTournament);
  let effShowLogos = !!(settings.showLogos ?? theme.content.showLogos);
  let effNameDisplay = theme.content.nameDisplay || 'auto';
  let effFontScale = fontScale;
  const rowHeight = clamp(Math.round(Number(sizing.rowHeight ?? 74) || 74), 44, 120);
  let setsBoxW = clamp(Math.round(Number(sizing.setsBoxWidth ?? 72) || 72), 40, 140);
  let pointsBoxW = clamp(Math.round(Number(sizing.pointsBoxWidth ?? 124) || 124), 56, 220);
  let setBadgeW = clamp(Math.round(Number(sizing.setBadgeWidth ?? 132) || 132), 60, 220);
  let logoBlockW = effShowTournament ? clamp(Math.round(Number(sizing.competitionWidth ?? 220) || 220), 120, 420) : 0;
  let nameMaxW = clamp(Math.round(Number(sizing.nameWidth ?? (variant === 'compact' ? 170 : variant === 'wide' ? 320 : 200)) || 200), 80, 420);
  let teamBlockW = clamp(Math.round(Number(sizing.teamBlockWidth ?? (variant === 'compact' ? 370 : variant === 'wide' ? 500 : 400)) || 400), 160, 700);
  const logoSize = clamp(Math.round(Number(sizing.logoSize ?? 40) || 40), 20, 96);

  const baseWidth = () => (logoBlockW) + teamBlockW * 2 + setBadgeW + ((theme.content.sponsorLogoUrl && theme.content.sponsorSlot !== 'none') ? 90 : 0) + ((theme.content.sponsorLogoUrl && theme.content.sponsorSlot !== 'none' && theme.content.sponsorSlot !== 'left' ? 0 : 0));

  const computeBaseWidth = () => (logoBlockW) + teamBlockW * 2 + setBadgeW + ((theme.content.sponsorLogoUrl && theme.content.sponsorSlot !== 'none') ? 90 : 0);
  const collapse = () => {
    const maxBase = capPx / Math.max(0.5, rawScale);
    let guard = 0;
    while (computeBaseWidth() > maxBase && guard++ < 12) {
      if (effShowSetHistory) { effShowSetHistory = false; continue; }
      if (effShowPips) { effShowPips = false; continue; }
      if (effShowTournament && logoBlockW > 0) { effShowTournament = false; logoBlockW = 0; continue; }
      if (effShowLogos) { effShowLogos = false; continue; }
      if (effNameDisplay !== 'short') { effNameDisplay = 'short'; nameMaxW = Math.max(80, Math.round(nameMaxW * 0.75)); teamBlockW = Math.max(160, Math.round(teamBlockW * 0.9)); continue; }
      if (effFontScale > 0.7) { effFontScale = Math.max(0.7, effFontScale - 0.05); nameMaxW = Math.max(80, Math.round(nameMaxW * 0.97)); teamBlockW = Math.max(160, Math.round(teamBlockW * 0.97)); setsBoxW = Math.max(40, Math.round(setsBoxW * 0.97)); pointsBoxW = Math.max(56, Math.round(pointsBoxW * 0.97)); setBadgeW = Math.max(60, Math.round(setBadgeW * 0.97)); continue; }
      teamBlockW = Math.max(160, teamBlockW - 8);
      nameMaxW = Math.max(80, nameMaxW - 6);
    }
  };
  collapse();
  let scale = rawScale;
  const bw = computeBaseWidth();
  if (bw * scale > capPx) scale = clamp(capPx / Math.max(1, bw), 0.5, 2);

  const anchorStyle: React.CSSProperties = {
    position: 'absolute',
    top: anchor.includes('bottom') ? undefined : anchor.includes('middle') ? '50%' : safe + offsetY,
    bottom: anchor.includes('bottom') ? safe - offsetY : undefined,
    left: anchor.includes('right') ? undefined : anchor.includes('center') ? '50%' : safe + offsetX,
    right: anchor.includes('right') ? safe - offsetX : undefined,
    transform: `${anchor.includes('middle') ? 'translateY(-50%) ' : ''}${anchor.includes('center') ? 'translateX(-50%) ' : ''}scale(${scale})`,
    transformOrigin: `${anchor.includes('right') ? 'right' : anchor.includes('center') ? 'center' : 'left'} ${anchor.includes('bottom') ? 'bottom' : anchor.includes('middle') ? 'center' : 'top'}`,
    maxWidth: 1920 - safe * 2,
    opacity: theme.colors.opacity ?? 1,
  };

  const nameMaxFont = Math.round((theme.typography.nameMax || (variant === 'compact' ? 38 : 40)) * effFontScale);
  const nameMinFont = Math.round((theme.typography.nameMin || 22) * Math.max(0.7, effFontScale));
  const displayNameAraw = (effNameDisplay === 'full' || (effNameDisplay === 'auto' && variant === 'wide')) ? (asText(A.name) || asText(A.shortName) || 'A') : (asText(A.shortName) || asText(A.name) || 'A');
  const displayNameBraw = (effNameDisplay === 'full' || (effNameDisplay === 'auto' && variant === 'wide')) ? (asText(B.name) || asText(B.shortName) || 'B') : (asText(B.shortName) || asText(B.name) || 'B');
  const displayNameA = formatName(displayNameAraw, theme.typography.case);
  const displayNameB = formatName(displayNameBraw, theme.typography.case);
  const nameFontA = useFitText(displayNameA, { max: nameMaxFont, min: nameMinFont, boxWidth: nameMaxW, weight: theme.typography.weight, family: theme.typography.fontFamily, letterSpacingEm: theme.typography.letterSpacing });
  const nameFontB = useFitText(displayNameB, { max: nameMaxFont, min: nameMinFont, boxWidth: nameMaxW, weight: theme.typography.weight, family: theme.typography.fontFamily, letterSpacingEm: theme.typography.letterSpacing });
  const completedSets = (m.setHistory || []).filter((s: any) => s && (s.scoreA > 0 || s.scoreB > 0 || s.winner != null || s.number < (m.current_set || 1)));
  const showSetRow = (variant === 'wide' || effShowSetHistory) && completedSets.length > 0;
  const setLabel = m.current_set != null ? `SET ${m.current_set}` : '';
  const effTournament = effShowTournament ? (asText(settings.tournamentLabel) || asText(theme.content.tournamentLabel) || matchTournament) : '';

  const shape = theme.shape;
  const slantL = shape.preset === 'slanted' ? shape.slantLeft : 0;
  const slantR = shape.preset === 'slanted' ? shape.slantRight : 0;
  const radius = shape.preset === 'rounded' ? shape.cornerRadius : shape.preset === 'pill' ? 999 : 0;
  const teamClip = `polygon(0 0, calc(100% - ${slantL}px) 0, 100% 100%, ${slantR}px 100%)`;
  const ease = [0.22, 1, 0.36, 1] as const;
  const animDur = (theme.animation.durationMs || 320) / 1000;
  const inOut = theme.animation.inOut;
  const enter = inOut === 'fade' ? { opacity: 0 } : inOut === 'scale' ? { opacity: 0, scale: 0.96 } : { opacity: 0, y: anchor.includes('bottom') ? 14 : -14 };
  const entered = inOut === 'fade' ? { opacity: 1 } : inOut === 'scale' ? { opacity: 1, scale: 1 } : { opacity: 1, y: 0 };
  const exitAnim = inOut === 'fade' ? { opacity: 0 } : inOut === 'scale' ? { opacity: 0, scale: 0.98 } : { opacity: 0, y: (anchor.includes('bottom') ? 14 : -14) * 0.6 };

  const teamBg = (side: TeamKey) => {
    const cfg = side === 'A' ? theme.colors.teamA : theme.colors.teamB;
    if (cfg.source === 'custom') return cfg.customBackground;
    return side === 'A' ? 'var(--team-a)' : 'var(--team-b)';
  };
  const teamText = (side: TeamKey) => {
    const cfg = side === 'A' ? theme.colors.teamA : theme.colors.teamB;
    if (cfg.source === 'custom') return cfg.customText;
    return side === 'A' ? 'var(--team-a-text)' : 'var(--team-b-text)';
  };

  const renderTeamBlock = (side: TeamKey) => {
    const t = side === 'A' ? A : B;
    const nm = side === 'A' ? displayNameA : displayNameB;
    const fz = side === 'A' ? nameFontA : nameFontB;
    const serving = m.server === side;
    const pipsTotal = Number(t.timeoutsPerSet ?? m.rules?.timeoutsPerSet ?? 2);
    const pipsUsed = Number(t.timeoutsUsed ?? 0);
    const score = t.score ?? 0;
    const sets = t.sets ?? 0;
    const flash = scoreFlash === side && theme.animation.pointFlash;
    const flashBg = flash ? (side === 'A' ? theme.colors.pointFlashA : theme.colors.pointFlashB) : theme.colors.scoreBackground;
    const fg = teamText(side);
    return (
      <div style={{ display: 'flex', alignItems: 'stretch', height: rowHeight, minWidth: 0 }}>
        <div style={{ width: teamBlockW, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, background: teamBg(side), color: fg, padding: '0 12px 0 10px', overflow: 'hidden', clipPath: shape.preset === 'slanted' ? teamClip : undefined, borderRadius: shape.preset !== 'slanted' ? radius : undefined }}>
          <div style={{ width: 20, flex: '0 0 20px', display: 'flex', justifyContent: 'center' }}>
            {showServe ? <motion.div animate={{ opacity: serving ? 1 : 0 }} style={{ width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: `12px solid ${theme.colors.servingIndicator === 'currentColor' ? fg : theme.colors.servingIndicator}` }} /> : null}
          </div>
          {effShowLogos ? (
            <div style={{ flex: '0 0 auto' }}>
              <TeamLogo src={asText(t.logoUrl)} name={asText(t.name) || nm} shortName={asText(t.shortName) || nm} color="rgba(255,255,255,0.18)" textColor={fg} size={logoSize} />
            </div>
          ) : null}
          <div title={asText(t.name) || nm} style={{ fontSize: fz, fontWeight: theme.typography.weight, lineHeight: 1, letterSpacing: `${theme.typography.letterSpacing}em`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '1 1 auto', textTransform: theme.typography.case === 'upper' ? 'uppercase' : undefined, fontFamily: theme.typography.fontFamily }}>{nm}</div>
          {effShowPips ? <div style={{ marginLeft: 'auto', flex: '0 0 auto' }}><TimeoutPips total={pipsTotal || 2} used={pipsUsed} color={fg} size={11} /></div> : null}
        </div>
        <div style={{ width: setsBoxW, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme.colors.setsBackground, color: theme.colors.setsText, borderLeft: `1px solid ${theme.shape.borderColor}` }}>
          <div style={{ fontSize: Math.round(theme.typography.setsSize * effFontScale), fontWeight: theme.typography.weight, lineHeight: 1, fontFamily: theme.typography.fontFamily }} className="tabular-score">{sets}</div>
        </div>
        <div style={{ width: pointsBoxW, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: flashBg, color: theme.colors.scoreText, borderLeft: `1px solid ${theme.shape.borderColor}`, transition: 'background-color 220ms ease' }}>
          <ScoreFlip value={score} mode={theme.animation.scoreChange} ease={ease} duration={Math.min(0.35, animDur * 0.7)} style={{ fontSize: Math.round((String(score).length >= 3 ? Math.max(24, theme.typography.scoreSize - 6) : theme.typography.scoreSize) * effFontScale), fontWeight: theme.typography.weight, lineHeight: 1, minWidth: pointsBoxW - 16, textAlign: 'center', fontFamily: theme.typography.fontFamily }} />
        </div>
      </div>
    );
  };

  const sponsor = theme.content.sponsorLogoUrl && theme.content.sponsorSlot !== 'none';

  return (
    <motion.div
      data-testid={`scorebug-variant-${variant}`}
      initial={enter}
      animate={entered}
      exit={exitAnim}
      transition={{ duration: animDur, ease }}
      style={{ ...anchorStyle, willChange: 'transform, opacity' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: anchor.includes('right') ? 'flex-end' : anchor.includes('center') ? 'center' : 'flex-start', gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'stretch', height: rowHeight, background: theme.colors.background, border: `${theme.shape.borderWidth}px solid ${theme.shape.borderColor}`, boxShadow: shadowFor(theme.shape.shadow), overflow: 'hidden', maxWidth: '100%', borderRadius: shape.preset !== 'slanted' ? radius : 0, gap: shape.blockGap }}>
          {sponsor && theme.content.sponsorSlot === 'left' ? (
            <div style={{ width: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.12)', borderRight: `1px solid ${theme.shape.borderColor}` }}><img src={theme.content.sponsorLogoUrl!} alt="Sponsor" loading="lazy" decoding="async" style={{ maxWidth: 74, maxHeight: 52, objectFit: 'contain' }} /></div>
          ) : null}
          {effTournament ? (
            <div style={{ width: logoBlockW, flex: '0 0 auto', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 10, background: 'rgba(0,0,0,0.18)', borderRight: `1px solid ${theme.shape.borderColor}`, overflow: 'hidden', minWidth: 0 }}>
              <div style={{ width: 40, height: 40, flex: '0 0 40px', borderRadius: 6, background: 'linear-gradient(135deg,#1f2937,#0b1220)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: theme.typography.weight, color: '#fff', fontFamily: theme.typography.fontFamily }}>QT</div>
              <div style={{ fontSize: Math.max(18, theme.typography.labelSize - 6), fontWeight: 700, letterSpacing: '0.06em', color: '#dbe4f5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'uppercase', minWidth: 0, fontFamily: theme.typography.fontFamily }}>{effTournament}</div>
            </div>
          ) : null}
          {renderTeamBlock('A')}
          {renderTeamBlock('B')}
          {setLabel ? (
            <div style={{ width: setBadgeW, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme.colors.setBadgeBackground, color: theme.colors.setBadgeText, fontSize: Math.round(theme.typography.labelSize * effFontScale), fontWeight: theme.typography.weight, letterSpacing: '0.08em', borderLeft: `1px solid ${theme.shape.borderColor}`, fontFamily: theme.typography.fontFamily }}>{setLabel}</div>
          ) : null}
          {sponsor && theme.content.sponsorSlot === 'right' ? (
            <div style={{ width: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.12)', borderLeft: `1px solid ${theme.shape.borderColor}` }}><img src={theme.content.sponsorLogoUrl!} alt="Sponsor" loading="lazy" decoding="async" style={{ maxWidth: 74, maxHeight: 52, objectFit: 'contain' }} /></div>
          ) : null}
        </div>

        <AnimatePresence initial={false}>
          {showSetRow ? (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: Math.min(0.24, animDur), ease }} style={{ overflow: 'hidden', alignSelf: anchor.includes('right') ? 'flex-end' : anchor.includes('center') ? 'center' : 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'stretch', background: theme.colors.background, border: `${theme.shape.borderWidth}px solid ${theme.shape.borderColor}`, borderTop: 'none', padding: '10px 14px', gap: 12 }}>
                {completedSets.slice(0, 5).map((s: any) => (
                  <div key={s.number} style={{ minWidth: 108, padding: '6px 12px', background: 'rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontSize: 22, color: 'var(--broadcast-muted)', letterSpacing: '0.08em', fontFamily: theme.typography.fontFamily }}>S{s.number}</div>
                    <div style={{ fontSize: 34, fontWeight: theme.typography.weight, color: theme.colors.scoreText, fontFamily: theme.typography.fontFamily }} className="tabular-score">{s.scoreA}-{s.scoreB}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div style={{ minHeight: banner ? undefined : 0, marginTop: banner ? 8 : 0, alignSelf: anchor.includes('right') ? 'flex-end' : anchor.includes('center') ? 'center' : 'flex-start' }}>
          <AnimatePresence initial={false} mode="wait">
            {banner ? (
              <motion.div key={banner.text} initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -6, opacity: 0 }} transition={{ duration: Math.min(0.22, animDur), ease }}>
                <div style={{ background: banner.color || '#334155', color: banner.textColor || '#fff', padding: '10px 18px', fontSize: theme.typography.labelSize, fontWeight: theme.typography.weight, letterSpacing: '0.08em', border: `1px solid ${theme.shape.borderColor}`, boxShadow: '0 10px 24px rgba(0,0,0,0.35)', textTransform: 'uppercase', whiteSpace: 'nowrap', fontFamily: theme.typography.fontFamily }}>{banner.text}</div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};

// The scorebug re-renders on every match state push; memoizing keeps it from
// redrawing when unrelated console state changes.
export const ScorebugOverlay = React.memo(ScorebugOverlayInner);
export default ScorebugOverlay;
