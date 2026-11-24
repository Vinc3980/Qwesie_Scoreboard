import React, { useLayoutEffect, useMemo, useState } from 'react';
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
  variant: 'classic' | 'compact' | 'wide';
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

export const ScorebugOverlay: React.FC<{
  match: any;
  settings: ScorebugSettings;
  status?: string | null;
  scoreFlash?: TeamKey | null;
  banner?: { text: string; color?: string; textColor?: string } | null;
  forceShow?: boolean;
}> = ({ match: m, settings, status, scoreFlash, banner, forceShow }) => {
  if (!m) return null;
  const theme = useMemo(() => resolveTheme(settings), [settings]);
  const st = String(status || m.status || '').toUpperCase();
  const isPreMatch = st === 'SCHEDULED' || st === 'READY';
  const isTerminal = st === 'COMPLETED' || st === 'FINISHED' || st === 'CANCELLED';
  const showPreMatch = settings.showPreMatch ?? (theme as any).content?.showPreMatch ?? true;
  const shouldShow = forceShow ? settings.visible : (settings.visible && !isTerminal && (!isPreMatch || !!showPreMatch));
  if (!shouldShow) return null;

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

  const scale = clamp(Number(theme.layout.scale ?? settings.scale ?? 1) || 1, 0.5, 2);
  const anchor = theme.layout.anchor || settings.position || 'top-left';
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

  const rowHeight = 74;
  const setsBoxW = 72;
  const pointsBoxW = 124;
  const setBadgeW = 132;
  const logoBlockW = tournament ? 220 : 0;
  const nameMaxW = variant === 'compact' ? 170 : variant === 'wide' ? 320 : 200;
  const nameFontA = useFitText(nameA, { max: theme.typography.nameMax || (variant === 'compact' ? 38 : 40), min: theme.typography.nameMin || 22, boxWidth: nameMaxW, weight: theme.typography.weight, family: theme.typography.fontFamily, letterSpacingEm: theme.typography.letterSpacing });
  const nameFontB = useFitText(nameB, { max: theme.typography.nameMax || (variant === 'compact' ? 38 : 40), min: theme.typography.nameMin || 22, boxWidth: nameMaxW, weight: theme.typography.weight, family: theme.typography.fontFamily, letterSpacingEm: theme.typography.letterSpacing });
  const teamBlockW = variant === 'compact' ? 370 : variant === 'wide' ? 500 : 400;
  const completedSets = (m.setHistory || []).filter((s: any) => s && (s.scoreA > 0 || s.scoreB > 0 || s.winner != null || s.number < (m.current_set || 1)));
  const showSetRow = (variant === 'wide' || showSetHistory) && completedSets.length > 0;
  const setLabel = m.current_set != null ? `SET ${m.current_set}` : '';

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
    const nm = side === 'A' ? nameA : nameB;
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
          {showLogos ? (
            <div style={{ flex: '0 0 auto' }}>
              <TeamLogo src={asText(t.logoUrl)} name={asText(t.name) || nm} shortName={asText(t.shortName) || nm} color="rgba(255,255,255,0.18)" textColor={fg} size={40} />
            </div>
          ) : null}
          <div title={asText(t.name) || nm} style={{ fontSize: fz, fontWeight: theme.typography.weight, lineHeight: 1, letterSpacing: `${theme.typography.letterSpacing}em`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '1 1 auto', textTransform: theme.typography.case === 'upper' ? 'uppercase' : undefined, fontFamily: theme.typography.fontFamily }}>{nm}</div>
          {showPips ? <div style={{ marginLeft: 'auto', flex: '0 0 auto' }}><TimeoutPips total={pipsTotal || 2} used={pipsUsed} color={fg} size={11} /></div> : null}
        </div>
        <div style={{ width: setsBoxW, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme.colors.setsBackground, color: theme.colors.setsText, borderLeft: `1px solid ${theme.shape.borderColor}` }}>
          <div style={{ fontSize: theme.typography.setsSize, fontWeight: theme.typography.weight, lineHeight: 1, fontFamily: theme.typography.fontFamily }} className="tabular-score">{sets}</div>
        </div>
        <div style={{ width: pointsBoxW, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: flashBg, color: theme.colors.scoreText, borderLeft: `1px solid ${theme.shape.borderColor}`, transition: 'background-color 220ms ease' }}>
          <ScoreFlip value={score} mode={theme.animation.scoreChange} ease={ease} duration={Math.min(0.35, animDur * 0.7)} style={{ fontSize: String(score).length >= 3 ? Math.max(24, theme.typography.scoreSize - 6) : theme.typography.scoreSize, fontWeight: theme.typography.weight, lineHeight: 1, minWidth: pointsBoxW - 16, textAlign: 'center', fontFamily: theme.typography.fontFamily }} />
        </div>
      </div>
    );
  };

  const sponsor = theme.content.sponsorLogoUrl && theme.content.sponsorSlot !== 'none';

  return (
    <motion.div
      initial={enter}
      animate={entered}
      exit={exitAnim}
      transition={{ duration: animDur, ease }}
      style={{ ...anchorStyle, willChange: 'transform, opacity' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: anchor.includes('right') ? 'flex-end' : anchor.includes('center') ? 'center' : 'flex-start', gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'stretch', height: rowHeight, background: theme.colors.background, border: `${theme.shape.borderWidth}px solid ${theme.shape.borderColor}`, boxShadow: shadowFor(theme.shape.shadow), overflow: 'hidden', maxWidth: '100%', borderRadius: shape.preset !== 'slanted' ? radius : 0, gap: shape.blockGap }}>
          {sponsor && theme.content.sponsorSlot === 'left' ? (
            <div style={{ width: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.12)', borderRight: `1px solid ${theme.shape.borderColor}` }}><img src={theme.content.sponsorLogoUrl!} alt="Sponsor" style={{ maxWidth: 74, maxHeight: 52, objectFit: 'contain' }} /></div>
          ) : null}
          {tournament ? (
            <div style={{ width: logoBlockW, flex: '0 0 auto', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 10, background: 'rgba(0,0,0,0.18)', borderRight: `1px solid ${theme.shape.borderColor}`, overflow: 'hidden', minWidth: 0 }}>
              <div style={{ width: 40, height: 40, flex: '0 0 40px', borderRadius: 6, background: 'linear-gradient(135deg,#1f2937,#0b1220)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: theme.typography.weight, color: '#fff', fontFamily: theme.typography.fontFamily }}>QT</div>
              <div style={{ fontSize: Math.max(18, theme.typography.labelSize - 6), fontWeight: 700, letterSpacing: '0.06em', color: '#dbe4f5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'uppercase', minWidth: 0, fontFamily: theme.typography.fontFamily }}>{tournament}</div>
            </div>
          ) : null}
          {renderTeamBlock('A')}
          {renderTeamBlock('B')}
          {setLabel ? (
            <div style={{ width: setBadgeW, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme.colors.setBadgeBackground, color: theme.colors.setBadgeText, fontSize: theme.typography.labelSize, fontWeight: theme.typography.weight, letterSpacing: '0.08em', borderLeft: `1px solid ${theme.shape.borderColor}`, fontFamily: theme.typography.fontFamily }}>{setLabel}</div>
          ) : null}
          {sponsor && theme.content.sponsorSlot === 'right' ? (
            <div style={{ width: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.12)', borderLeft: `1px solid ${theme.shape.borderColor}` }}><img src={theme.content.sponsorLogoUrl!} alt="Sponsor" style={{ maxWidth: 74, maxHeight: 52, objectFit: 'contain' }} /></div>
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

export default ScorebugOverlay;
