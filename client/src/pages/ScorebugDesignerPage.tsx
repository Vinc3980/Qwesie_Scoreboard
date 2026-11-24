import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Palette, Save, Copy, RotateCcw, RotateCw, Upload, Download, Play, AlertTriangle, Check, SlidersHorizontal, Eye, Monitor, ShieldCheck } from 'lucide-react';
import { ScorebugOverlay } from '../components/broadcast/ScorebugOverlay.js';
import { ScaledStage } from '../components/broadcast/ScaledStage.js';
import { Button } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { Input, Label, Select } from '../components/ui/Input.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useCurrentMatch } from '../contexts/CurrentMatchContext.js';
import { useNotification } from '../contexts/NotificationContext.js';
import { scorebugThemeApi } from '../services/api.js';
import { cn } from '../utils/cn.js';
import {
  BUILTIN_SCOREBUG_THEMES,
  ScorebugThemeConfig,
  SCOREBUG_FONT_OPTIONS,
  defaultScorebugThemeConfig,
  getBuiltinScorebugTheme,
  sanitizeScorebugThemeConfig,
} from '@qwesie/shared';

type ThemeRec = { id: string; name: string; description?: string | null; config: ScorebugThemeConfig; isDefault?: boolean; competitionId?: string | null; isBuiltIn?: boolean; readOnly?: boolean; version?: number };

const SCENARIOS: Record<string, any> = {
  '0-0': { current_set: 1, max_sets: 5, server: 'A', teams: { A: { name: 'HOME TEAM', shortName: 'HOME', score: 0, sets: 0, timeoutsUsed: 0, timeoutsPerSet: 2, logoUrl: null }, B: { name: 'AWAY TEAM', shortName: 'AWAY', score: 0, sets: 0, timeoutsUsed: 0, timeoutsPerSet: 2, logoUrl: null } }, setHistory: [], flags: {} },
  'mid-set': { current_set: 2, max_sets: 5, server: 'B', teams: { A: { name: 'ELWAK WINGS', shortName: 'ELW', score: 18, sets: 1, timeoutsUsed: 1, timeoutsPerSet: 2, logoUrl: '/uploads/teams/elwak-wings.svg' }, B: { name: 'GHANA NAVY', shortName: 'NAVY', score: 16, sets: 0, timeoutsUsed: 0, timeoutsPerSet: 2, logoUrl: '/uploads/teams/ghana-navy.svg' } }, setHistory: [{ number: 1, scoreA: 25, scoreB: 20, winner: 'A' }], flags: {} },
  'set-point': { current_set: 3, max_sets: 5, server: 'A', teams: { A: { name: 'ELWAK WINGS', shortName: 'ELW', score: 24, sets: 1, timeoutsUsed: 1, timeoutsPerSet: 2, logoUrl: null }, B: { name: 'GHANA NAVY', shortName: 'NAVY', score: 22, sets: 1, timeoutsUsed: 0, timeoutsPerSet: 2, logoUrl: null } }, setHistory: [{ number: 1, scoreA: 25, scoreB: 20, winner: 'A' }, { number: 2, scoreA: 22, scoreB: 25, winner: 'B' }], flags: { setPoint: 'A' } },
  'match-point': { current_set: 4, max_sets: 5, server: 'A', teams: { A: { name: 'ELWAK WINGS', shortName: 'ELW', score: 24, sets: 2, timeoutsUsed: 1, timeoutsPerSet: 2, logoUrl: null }, B: { name: 'GHANA NAVY', shortName: 'NAVY', score: 23, sets: 1, timeoutsUsed: 2, timeoutsPerSet: 2, logoUrl: null } }, setHistory: [{ number: 1, scoreA: 25, scoreB: 20, winner: 'A' }, { number: 2, scoreA: 22, scoreB: 25, winner: 'B' }, { number: 3, scoreA: 25, scoreB: 19, winner: 'A' }], flags: { matchPoint: 'A', setPoint: 'A' } },
  'timeout': { current_set: 2, max_sets: 5, server: 'B', teams: { A: { name: 'ELWAK WINGS', shortName: 'ELW', score: 18, sets: 1, timeoutsUsed: 1, timeoutsPerSet: 2, logoUrl: null }, B: { name: 'GHANA NAVY', shortName: 'NAVY', score: 16, sets: 0, timeoutsUsed: 1, timeoutsPerSet: 2, logoUrl: null } }, setHistory: [{ number: 1, scoreA: 25, scoreB: 20, winner: 'A' }], flags: {}, lastEvent: { action: 'TIMEOUT_CALLED', team: 'B', payload: { type: 'TIMEOUT_CALLED', teamSide: 'AWAY' } } },
  'serving-B': { current_set: 1, max_sets: 5, server: 'B', teams: { A: { name: 'HOME TEAM', shortName: 'HOME', score: 8, sets: 0, timeoutsUsed: 0, timeoutsPerSet: 2, logoUrl: null }, B: { name: 'AWAY TEAM', shortName: 'AWAY', score: 9, sets: 0, timeoutsUsed: 0, timeoutsPerSet: 2, logoUrl: null } }, setHistory: [], flags: {} },
  'long-names': { current_set: 1, max_sets: 5, server: 'A', teams: { A: { name: 'GREATER ACCRA METROPOLITAN VOLLEYBALL CLUB', shortName: 'GAMVC', score: 23, sets: 0, timeoutsUsed: 0, timeoutsPerSet: 2, logoUrl: null }, B: { name: 'NORTHERN REGIONAL DEFENDERS UNITED', shortName: 'NRDU', score: 23, sets: 0, timeoutsUsed: 0, timeoutsPerSet: 2, logoUrl: null } }, setHistory: [], flags: {} },
  '3-digit': { current_set: 1, max_sets: 5, server: 'A', teams: { A: { name: 'TEAM ALPHA', shortName: 'ALP', score: 132, sets: 2, timeoutsUsed: 1, timeoutsPerSet: 2, logoUrl: null }, B: { name: 'TEAM BRAVO', shortName: 'BRV', score: 130, sets: 2, timeoutsUsed: 2, timeoutsPerSet: 2, logoUrl: null } }, setHistory: [{ number: 1, scoreA: 25, scoreB: 20, winner: 'A' }, { number: 2, scoreA: 22, scoreB: 25, winner: 'B' }, { number: 3, scoreA: 25, scoreB: 19, winner: 'A' }, { number: 4, scoreA: 20, scoreB: 25, winner: 'B' }], flags: { setPoint: 'A' } },
  'no-logos': { current_set: 2, max_sets: 5, server: 'A', teams: { A: { name: 'HOME TEAM', shortName: 'HOME', score: 12, sets: 1, timeoutsUsed: 0, timeoutsPerSet: 2, logoUrl: null }, B: { name: 'AWAY TEAM', shortName: 'AWAY', score: 10, sets: 0, timeoutsUsed: 0, timeoutsPerSet: 2, logoUrl: null } }, setHistory: [{ number: 1, scoreA: 25, scoreB: 18, winner: 'A' }], flags: {} },
};

function hexToRgb(hex?: string | null) {
  if (!hex) return null;
  const h = String(hex).replace('#', '').trim();
  if (![3, 4, 6, 8].includes(h.length)) return null;
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function relLum(rgb: {r:number;g:number;b:number}) {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
}
function contrastRatio(a?: string | null, b?: string | null) {
  const A = hexToRgb(a); const B = hexToRgb(b);
  if (!A || !B) return null;
  const L1 = relLum(A), L2 = relLum(B);
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

function deepClone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

function Section({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg bg-surface overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-fg hover:bg-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">
        <span>{title}</span><span className="text-fg-muted">{open ? '−' : '+'}</span>
      </button>
      {open ? <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border">{children}</div> : null}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const safe = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : '#ffffff';
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input aria-label={`${label} color`} type="color" value={safe} onChange={e => onChange(e.target.value)} className="h-9 w-12 rounded border border-border bg-surface-sunken" />
        <Input value={value} onChange={e => onChange(e.target.value)} />
      </div>
    </div>
  );
}

export const ScorebugDesignerPage: React.FC = () => {
  const nav = useNavigate();
  const [search] = useSearchParams();
  const notify = useNotification();
  const { user } = useAuth();
  const { currentMatchId, currentMatch } = useCurrentMatch();
  const isAdmin = user?.role === 'ADMIN';

  const [themes, setThemes] = useState<ThemeRec[]>(BUILTIN_SCOREBUG_THEMES as any);
  const [selectedId, setSelectedId] = useState<string>('builtin-classic');
  const [draft, setDraft] = useState<ScorebugThemeConfig>(defaultScorebugThemeConfig());
  const [savedConfig, setSavedConfig] = useState<ScorebugThemeConfig>(defaultScorebugThemeConfig());
  const [draftName, setDraftName] = useState('Classic');
  const [draftDesc, setDraftDesc] = useState('');
  const [scenario, setScenario] = useState('mid-set');
  const [bg, setBg] = useState<'checker' | 'green' | 'video' | 'white'>('checker');
  const [open, setOpen] = useState<Record<string, boolean>>({ Layout: true, Shape: true, Colors: false, Typography: false, Content: false, Animation: false, Sponsor: false });
  const [liveEdit, setLiveEdit] = useState(false);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [matchId, setMatchId] = useState(search.get('matchId') || currentMatchId || '');
  const [history, setHistory] = useState<ScorebugThemeConfig[]>([]);
  const [future, setFuture] = useState<ScorebugThemeConfig[]>([]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(savedConfig) || draftName !== (themes.find(t => t.id === selectedId)?.name || draftName), [draft, savedConfig, draftName, themes, selectedId]);

  const loadThemes = useCallback(async () => {
    try {
      const rows = await scorebugThemeApi.list();
      setThemes(rows?.length ? rows : (BUILTIN_SCOREBUG_THEMES as any));
    } catch {
      setThemes(BUILTIN_SCOREBUG_THEMES as any);
    }
  }, []);

  useEffect(() => { void loadThemes(); }, [loadThemes]);
  useEffect(() => { if (currentMatchId && !matchId) setMatchId(currentMatchId); }, [currentMatchId, matchId]);

  const selected = themes.find(t => t.id === selectedId) || themes[0] || (BUILTIN_SCOREBUG_THEMES[0] as any);

  const selectTheme = useCallback((t: ThemeRec) => {
    const cfg = sanitizeScorebugThemeConfig(t.config);
    setSelectedId(t.id);
    setDraft(cfg);
    setSavedConfig(deepClone(cfg));
    setDraftName(t.name);
    setDraftDesc(t.description || '');
    setHistory([]);
    setFuture([]);
  }, []);

  useEffect(() => {
    if (themes.length && !themes.find(t => t.id === selectedId)) selectTheme(themes[0] as any);
  }, [themes, selectedId, selectTheme]);

  const pushDraft = useCallback((next: ScorebugThemeConfig) => {
    setHistory(h => [...h.slice(-49), deepClone(draft)]);
    setFuture([]);
    setDraft(next);
  }, [draft]);

  const updateDraft = useCallback((path: string[], value: any) => {
    const next = deepClone(draft);
    let cur: any = next;
    for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
    cur[path[path.length - 1]] = value;
    pushDraft(sanitizeScorebugThemeConfig(next));
  }, [draft, pushDraft]);

  const undo = () => {
    setHistory(h => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setFuture(f => [deepClone(draft), ...f].slice(0, 50));
      setDraft(prev);
      return h.slice(0, -1);
    });
  };
  const redo = () => {
    setFuture(f => {
      if (!f.length) return f;
      const next = f[0];
      setHistory(h => [...h, deepClone(draft)].slice(-50));
      setDraft(next);
      return f.slice(1);
    });
  };

  const scenarioMatch = useMemo(() => {
    const s = SCENARIOS[scenario] || SCENARIOS['mid-set'];
    return { id: 'preview', status: 'LIVE', tournament: 'Preview Tournament', court: 'Court 1', ...s, rules: { timeoutsPerSet: 2 } };
  }, [scenario]);

  const previewSettings = useMemo(() => ({
    visible: true,
    variant: draft.layout.variant,
    position: draft.layout.anchor,
    scale: draft.layout.scale,
    showSetHistory: draft.content.showSetHistory,
    showPreMatch: true,
    showLogos: draft.content.showLogos,
    showTournament: draft.content.showTournament,
    tournamentLabel: draft.content.tournamentLabel,
    theme: draft,
  }), [draft]);

  const contrastWarnings = useMemo(() => {
    const warnings: string[] = [];
    const checks: Array<[string, string, string]> = [
      ['Score text', draft.colors.scoreText, draft.colors.scoreBackground],
      ['Sets text', draft.colors.setsText, draft.colors.setsBackground],
      ['Set badge', draft.colors.setBadgeText, draft.colors.setBadgeBackground],
    ];
    for (const [label, fg, bgc] of checks) {
      const r = contrastRatio(fg, bgc);
      if (r != null && r < 4.5) warnings.push(`${label} contrast ${r.toFixed(2)}:1 is below WCAG AA (4.5:1).`);
    }
    return warnings;
  }, [draft]);

  const saveAsNew = async () => {
    if (!isAdmin) return notify.error('Only admins can create themes');
    setSaving(true);
    try {
      const created = await scorebugThemeApi.create({ name: `${draftName || 'Theme'} Copy`, description: draftDesc, config: draft, competitionId: currentMatch?.competitionId || null });
      await loadThemes();
      selectTheme(created);
      notify.success('Theme saved as new');
    } catch (e: any) { notify.error(e?.message || 'Failed to save theme'); }
    finally { setSaving(false); }
  };

  const save = async () => {
    if (!isAdmin) return notify.error('Only admins can edit themes');
    if (selected?.isBuiltIn) return saveAsNew();
    setSaving(true);
    try {
      const updated = await scorebugThemeApi.update(selectedId, { name: draftName, description: draftDesc, config: draft });
      await loadThemes();
      selectTheme(updated);
      notify.success('Theme saved');
    } catch (e: any) { notify.error(e?.message || 'Failed to save theme'); }
    finally { setSaving(false); }
  };

  const duplicate = async () => {
    if (!isAdmin) return notify.error('Only admins can duplicate themes');
    try {
      const created = await scorebugThemeApi.duplicate(selectedId, `${draftName} Copy`);
      await loadThemes();
      selectTheme(created);
      notify.success('Theme duplicated');
    } catch (e: any) { notify.error(e?.message || 'Failed to duplicate'); }
  };

  const remove = async () => {
    if (!isAdmin) return notify.error('Only admins can delete themes');
    if (selected?.isBuiltIn) return;
    if (!confirm(`Delete theme "${selected?.name}"? Outputs using it will fall back to default.`)) return;
    try {
      await scorebugThemeApi.remove(selectedId);
      await loadThemes();
      selectTheme(BUILTIN_SCOREBUG_THEMES[0] as any);
      notify.success('Theme deleted');
    } catch (e: any) { notify.error(e?.message || 'Failed to delete'); }
  };

  const setDefault = async () => {
    if (!isAdmin) return notify.error('Only admins can set default');
    try {
      await scorebugThemeApi.setDefault(selectedId);
      await loadThemes();
      notify.success('Default theme updated');
    } catch (e: any) { notify.error(e?.message || 'Failed to set default'); }
  };

  const applyToOnAir = async () => {
    if (!matchId) return notify.error('Select a match first');
    setApplying(true);
    try {
      let themeId = selectedId;
      if (dirty || selected?.isBuiltIn) {
        // Save draft as new theme before applying if it's a draft/builtin edit
        if (isAdmin) {
          const created = await scorebugThemeApi.create({ name: dirty ? `${draftName || 'Custom'} (Applied)` : draftName, description: draftDesc, config: draft, competitionId: currentMatch?.competitionId || null });
          themeId = created.id;
          await loadThemes();
          selectTheme(created);
        } else {
          // SCORER cannot create; apply selected saved theme
          themeId = selectedId;
        }
      }
      await scorebugThemeApi.applyToMatch(matchId, themeId);
      notify.success('Theme applied to match output');
    } catch (e: any) { notify.error(e?.message || 'Failed to apply theme'); }
    finally { setApplying(false); }
  };

  const applyToCompetition = async () => {
    if (!isAdmin) return notify.error('Only admins can apply to competition');
    const compId = currentMatch?.competitionId;
    if (!compId) return notify.error('Current match has no competition');
    try {
      await scorebugThemeApi.applyToCompetition(compId, selectedId);
      notify.success('Theme applied to competition');
    } catch (e: any) { notify.error(e?.message || 'Failed to apply to competition'); }
  };

  const exportJson = () => {
    const payload = { name: draftName, description: draftDesc, config: draft, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(draftName || 'scorebug-theme').replace(/[^a-z0-9-_]+/gi, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const cfg = sanitizeScorebugThemeConfig(parsed.config || parsed);
      setDraftName(parsed.name || 'Imported Theme');
      setDraftDesc(parsed.description || '');
      pushDraft(cfg);
      notify.success('Theme JSON imported as draft');
    } catch (e: any) { notify.error(e?.message || 'Invalid theme JSON'); }
  };

  useEffect(() => {
    if (!liveEdit || !dirty || !matchId) return;
    const t = setTimeout(() => { void applyToOnAir(); }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEdit, draft, matchId]);

  const bgStyle = bg === 'checker'
    ? { backgroundImage: 'linear-gradient(45deg, #334155 25%, transparent 25%), linear-gradient(-45deg, #334155 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #334155 75%), linear-gradient(-45deg, transparent 75%, #334155 75%)', backgroundSize: '40px 40px', backgroundPosition: '0 0, 0 20px, 20px -20px, -20px 0px', backgroundColor: '#1e293b' }
    : bg === 'green' ? { background: '#00b140' }
    : bg === 'white' ? { background: '#f8fafc' }
    : { background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)' };

  return (
    <div className="space-y-4" data-testid="scorebug-designer-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-2xl font-bold text-fg font-display"><Palette className="w-6 h-6 text-accent" /> Scorebug Designer</div>
          <div className="text-sm text-fg-muted">Design, test, and apply scorebug themes. Draft changes do not affect OBS until you apply.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? <span className="text-xs px-2 py-1 rounded-full border border-warning/40 bg-warning-subtle text-warning font-semibold">Unsaved changes</span> : <span className="text-xs px-2 py-1 rounded-full border border-border text-fg-muted">Saved</span>}
          <Button size="sm" variant="outline" onClick={undo} disabled={!history.length}><RotateCcw className="w-4 h-4" />Undo</Button>
          <Button size="sm" variant="outline" onClick={redo} disabled={!future.length}><RotateCw className="w-4 h-4" />Redo</Button>
          <label className="inline-flex items-center gap-2 text-xs text-fg-muted border border-border rounded-[10px] px-2 py-1.5 bg-surface">
            <input type="checkbox" checked={liveEdit} onChange={e => setLiveEdit(e.target.checked)} /> Live edit
          </label>
          <Button size="sm" variant="primary" onClick={applyToOnAir} disabled={applying || !matchId}><Play className="w-4 h-4" />{applying ? 'Applying...' : 'Apply to on-air'}</Button>
        </div>
      </div>

      {contrastWarnings.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning-subtle p-3 text-sm text-warning">
          <div className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Contrast warnings</div>
          <ul className="list-disc pl-5 mt-1">{contrastWarnings.map(w => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)_320px] gap-4">
        {/* Left: controls */}
        <div className="space-y-3 min-w-0">
          <Card className="!p-3 space-y-3">
            <div className="text-sm font-semibold text-fg">Theme</div>
            <div><Label>Name</Label><Input value={draftName} onChange={e => setDraftName(e.target.value)} /></div>
            <div><Label>Description</Label><Input value={draftDesc} onChange={e => setDraftDesc(e.target.value)} /></div>
          </Card>

          <Section title="Layout" open={!!open.Layout} onToggle={() => setOpen(o => ({ ...o, Layout: !o.Layout }))}>
            <div><Label>Variant</Label><Select value={draft.layout.variant} onChange={e => updateDraft(['layout','variant'], e.target.value)}><option value="classic">Classic</option><option value="compact">Compact</option><option value="wide">Wide</option></Select></div>
            <div><Label>Anchor</Label><Select value={draft.layout.anchor} onChange={e => updateDraft(['layout','anchor'], e.target.value)}>{['top-left','top-center','top-right','middle-left','middle-center','middle-right','bottom-left','bottom-center','bottom-right'].map(a => <option key={a} value={a}>{a}</option>)}</Select></div>
            <div><Label>Scale ({Math.round(draft.layout.scale*100)}%)</Label><input type="range" min={50} max={200} value={Math.round(draft.layout.scale*100)} onChange={e => updateDraft(['layout','scale'], Number(e.target.value)/100)} className="w-full" /></div>
            <div className="grid grid-cols-2 gap-2"><div><Label>Offset X</Label><Input type="number" value={draft.layout.offsetX} onChange={e => updateDraft(['layout','offsetX'], Number(e.target.value))} /></div><div><Label>Offset Y</Label><Input type="number" value={draft.layout.offsetY} onChange={e => updateDraft(['layout','offsetY'], Number(e.target.value))} /></div></div>
            <label className="inline-flex items-center gap-2 text-sm text-fg"><input type="checkbox" checked={draft.layout.safeAreaGuides} onChange={e => updateDraft(['layout','safeAreaGuides'], e.target.checked)} /> Safe-area guides</label>
          </Section>

          <Section title="Shape" open={!!open.Shape} onToggle={() => setOpen(o => ({ ...o, Shape: !o.Shape }))}>
            <div><Label>Preset</Label><Select value={draft.shape.preset} onChange={e => updateDraft(['shape','preset'], e.target.value)}><option value="rectangular">Rectangular</option><option value="slanted">Slanted</option><option value="rounded">Rounded</option><option value="pill">Pill</option></Select></div>
            <div><Label>Corner radius</Label><Input type="number" min={0} max={48} value={draft.shape.cornerRadius} onChange={e => updateDraft(['shape','cornerRadius'], Number(e.target.value))} /></div>
            <div className="grid grid-cols-2 gap-2"><div><Label>Slant left</Label><Input type="number" min={0} max={40} value={draft.shape.slantLeft} onChange={e => updateDraft(['shape','slantLeft'], Number(e.target.value))} /></div><div><Label>Slant right</Label><Input type="number" min={0} max={40} value={draft.shape.slantRight} onChange={e => updateDraft(['shape','slantRight'], Number(e.target.value))} /></div></div>
            <div className="grid grid-cols-2 gap-2"><div><Label>Border width</Label><Input type="number" min={0} max={8} value={draft.shape.borderWidth} onChange={e => updateDraft(['shape','borderWidth'], Number(e.target.value))} /></div><div><Label>Block gap</Label><Input type="number" min={0} max={24} value={draft.shape.blockGap} onChange={e => updateDraft(['shape','blockGap'], Number(e.target.value))} /></div></div>
            <ColorField label="Border color" value={draft.shape.borderColor} onChange={v => updateDraft(['shape','borderColor'], v)} />
            <div><Label>Shadow</Label><Select value={draft.shape.shadow} onChange={e => updateDraft(['shape','shadow'], e.target.value)}><option value="none">None</option><option value="soft">Soft</option><option value="medium">Medium</option><option value="strong">Strong</option></Select></div>
          </Section>

          <Section title="Colors" open={!!open.Colors} onToggle={() => setOpen(o => ({ ...o, Colors: !o.Colors }))}>
            <ColorField label="Background" value={draft.colors.background} onChange={v => updateDraft(['colors','background'], v)} />
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Team A source</Label><Select value={draft.colors.teamA.source} onChange={e => updateDraft(['colors','teamA','source'], e.target.value)}><option value="team">Team color</option><option value="custom">Custom</option></Select></div>
              <div><Label>Team B source</Label><Select value={draft.colors.teamB.source} onChange={e => updateDraft(['colors','teamB','source'], e.target.value)}><option value="team">Team color</option><option value="custom">Custom</option></Select></div>
            </div>
            {draft.colors.teamA.source === 'custom' && <><ColorField label="Team A bg" value={draft.colors.teamA.customBackground} onChange={v => updateDraft(['colors','teamA','customBackground'], v)} /><ColorField label="Team A text" value={draft.colors.teamA.customText} onChange={v => updateDraft(['colors','teamA','customText'], v)} /></>}
            {draft.colors.teamB.source === 'custom' && <><ColorField label="Team B bg" value={draft.colors.teamB.customBackground} onChange={v => updateDraft(['colors','teamB','customBackground'], v)} /><ColorField label="Team B text" value={draft.colors.teamB.customText} onChange={v => updateDraft(['colors','teamB','customText'], v)} /></>}
            <ColorField label="Score background" value={draft.colors.scoreBackground} onChange={v => updateDraft(['colors','scoreBackground'], v)} />
            <ColorField label="Score text" value={draft.colors.scoreText} onChange={v => updateDraft(['colors','scoreText'], v)} />
            <ColorField label="Sets background" value={draft.colors.setsBackground} onChange={v => updateDraft(['colors','setsBackground'], v)} />
            <ColorField label="Sets text" value={draft.colors.setsText} onChange={v => updateDraft(['colors','setsText'], v)} />
            <ColorField label="Set badge bg" value={draft.colors.setBadgeBackground} onChange={v => updateDraft(['colors','setBadgeBackground'], v)} />
            <ColorField label="Set badge text" value={draft.colors.setBadgeText} onChange={v => updateDraft(['colors','setBadgeText'], v)} />
            <ColorField label="Point flash A" value={draft.colors.pointFlashA} onChange={v => updateDraft(['colors','pointFlashA'], v)} />
            <ColorField label="Point flash B" value={draft.colors.pointFlashB} onChange={v => updateDraft(['colors','pointFlashB'], v)} />
            <div><Label>Opacity ({Math.round(draft.colors.opacity*100)}%)</Label><input type="range" min={20} max={100} value={Math.round(draft.colors.opacity*100)} onChange={e => updateDraft(['colors','opacity'], Number(e.target.value)/100)} className="w-full" /></div>
          </Section>

          <Section title="Typography" open={!!open.Typography} onToggle={() => setOpen(o => ({ ...o, Typography: !o.Typography }))}>
            <div><Label>Font</Label><Select value={draft.typography.fontFamily} onChange={e => updateDraft(['typography','fontFamily'], e.target.value)}>{SCOREBUG_FONT_OPTIONS.map(f => <option key={f.id} value={f.family}>{f.label}</option>)}</Select></div>
            <div><Label>Weight</Label><Input type="number" min={400} max={900} step={100} value={draft.typography.weight} onChange={e => updateDraft(['typography','weight'], Number(e.target.value))} /></div>
            <div><Label>Case</Label><Select value={draft.typography.case} onChange={e => updateDraft(['typography','case'], e.target.value)}><option value="upper">UPPER</option><option value="lower">lower</option><option value="title">Title</option><option value="as-is">As is</option></Select></div>
            <div><Label>Letter spacing (em)</Label><Input type="number" step={0.01} min={-0.05} max={0.3} value={draft.typography.letterSpacing} onChange={e => updateDraft(['typography','letterSpacing'], Number(e.target.value))} /></div>
            <div className="grid grid-cols-2 gap-2"><div><Label>Name min</Label><Input type="number" value={draft.typography.nameMin} onChange={e => updateDraft(['typography','nameMin'], Number(e.target.value))} /></div><div><Label>Name max</Label><Input type="number" value={draft.typography.nameMax} onChange={e => updateDraft(['typography','nameMax'], Number(e.target.value))} /></div></div>
          </Section>

          <Section title="Content" open={!!open.Content} onToggle={() => setOpen(o => ({ ...o, Content: !o.Content }))}>
            {([['showLogos','Logos'],['showTournament','Tournament label'],['showSetHistory','Set history'],['showTimeoutPips','Timeout pips'],['showServeIndicator','Serve indicator']] as const).map(([k,label]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" checked={(draft.content as any)[k]} onChange={e => updateDraft(['content',k], e.target.checked)} /> {label}</label>
            ))}
            <div><Label>Name display</Label><Select value={draft.content.nameDisplay} onChange={e => updateDraft(['content','nameDisplay'], e.target.value)}><option value="auto">Auto</option><option value="short">Short names</option><option value="full">Full names</option></Select></div>
            <div><Label>Tournament label override</Label><Input value={draft.content.tournamentLabel || ''} onChange={e => updateDraft(['content','tournamentLabel'], e.target.value || null)} /></div>
          </Section>

          <Section title="Animation" open={!!open.Animation} onToggle={() => setOpen(o => ({ ...o, Animation: !o.Animation }))}>
            <div><Label>In/Out</Label><Select value={draft.animation.inOut} onChange={e => updateDraft(['animation','inOut'], e.target.value)}><option value="slide">Slide</option><option value="fade">Fade</option><option value="scale">Scale</option></Select></div>
            <div><Label>Duration (ms)</Label><Input type="number" min={100} max={2000} value={draft.animation.durationMs} onChange={e => updateDraft(['animation','durationMs'], Number(e.target.value))} /></div>
            <div><Label>Score change</Label><Select value={draft.animation.scoreChange} onChange={e => updateDraft(['animation','scoreChange'], e.target.value)}><option value="flip">Flip</option><option value="slide">Slide</option><option value="pulse">Pulse</option><option value="none">None</option></Select></div>
            <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" checked={draft.animation.pointFlash} onChange={e => updateDraft(['animation','pointFlash'], e.target.checked)} /> Point flash</label>
          </Section>

          <Section title="Sponsor" open={!!open.Sponsor} onToggle={() => setOpen(o => ({ ...o, Sponsor: !o.Sponsor }))}>
            <div><Label>Sponsor logo URL</Label><Input value={draft.content.sponsorLogoUrl || ''} onChange={e => updateDraft(['content','sponsorLogoUrl'], e.target.value || null)} placeholder="https://... or /uploads/..." /></div>
            <div><Label>Sponsor slot</Label><Select value={draft.content.sponsorSlot} onChange={e => updateDraft(['content','sponsorSlot'], e.target.value)}><option value="none">None</option><option value="left">Left</option><option value="right">Right</option></Select></div>
          </Section>
        </div>

        {/* Center: preview */}
        <div className="space-y-3 min-w-0">
          <Card className="!p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-fg"><Eye className="w-4 h-4" /> Live preview (1920×1080)</div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={scenario} onChange={e => setScenario(e.target.value)} className="!w-auto">
                  {Object.keys(SCENARIOS).map(k => <option key={k} value={k}>{k}</option>)}
                </Select>
                <Select value={bg} onChange={e => setBg(e.target.value as any)} className="!w-auto">
                  <option value="checker">Checkerboard</option>
                  <option value="green">Green</option>
                  <option value="video">Sample video still</option>
                  <option value="white">White</option>
                </Select>
              </div>
            </div>
            <div className="rounded-lg border border-border overflow-hidden" style={{ aspectRatio: '16/9', ...bgStyle }}>
              <div className="w-full h-full relative">
                <ScaledStage fit="container" hideCursor={false} bg="transparent">
                  <div style={{ width: 1920, height: 1080, position: 'relative' }}>
                    {draft.layout.safeAreaGuides && (
                      <div style={{ position: 'absolute', inset: 54, border: '1px dashed rgba(255,255,255,0.35)', pointerEvents: 'none', zIndex: 5 }}>
                        <div style={{ position: 'absolute', inset: 42, border: '1px dashed rgba(56,189,248,0.35)' }} />
                      </div>
                    )}
                    <ScorebugOverlay match={scenarioMatch} settings={previewSettings as any} status="LIVE" forceShow scoreFlash={scenario === 'set-point' || scenario === 'match-point' ? 'A' : null} banner={scenario === 'timeout' ? { text: 'TIMEOUT - NAVY', color: '#1d4ed8', textColor: '#fff' } : scenario === 'set-point' ? { text: 'SET POINT - ELW', color: '#0ea5e9', textColor: '#fff' } : scenario === 'match-point' ? { text: 'MATCH POINT - ELW', color: '#0ea5e9', textColor: '#fff' } : null} />
                  </div>
                </ScaledStage>
              </div>
            </div>
            <div className="text-xs text-fg-muted">Preview uses the real ScorebugOverlay. Extreme scenarios: long names, 3-digit scores, no logos, set point/match point, timeout.</div>
          </Card>
        </div>

        {/* Right: theme list/actions */}
        <div className="space-y-3 min-w-0">
          <Card className="!p-3 space-y-2">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold text-fg">Themes</div><Button size="sm" variant="outline" onClick={loadThemes}>Refresh</Button></div>
            <div className="space-y-1 max-h-[320px] overflow-auto pr-1">
              {themes.map(t => (
                <button key={t.id} onClick={() => selectTheme(t as any)} className={cn('w-full text-left px-3 py-2 rounded-lg border text-sm', selectedId === t.id ? 'border-accent bg-accent-subtle text-fg' : 'border-border bg-surface-sunken text-fg hover:bg-surface-alt')}>
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold truncate">{t.name}</span>{t.isDefault ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-success-subtle text-success border border-success/30">DEFAULT</span> : null}</div>
                  <div className="text-[11px] text-fg-muted truncate">{t.isBuiltIn ? 'Built-in' : (t.description || 'Custom theme')}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="!p-3 space-y-2">
            <div className="text-sm font-semibold text-fg">Actions</div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="primary" onClick={save} disabled={saving || !isAdmin}><Save className="w-4 h-4" />Save</Button>
              <Button size="sm" variant="outline" onClick={saveAsNew} disabled={saving || !isAdmin}><Copy className="w-4 h-4" />Save as new</Button>
              <Button size="sm" variant="outline" onClick={duplicate} disabled={!isAdmin}>Duplicate</Button>
              <Button size="sm" variant="outline" onClick={() => selectTheme(selected as any)}>Revert</Button>
              <Button size="sm" variant="outline" onClick={setDefault} disabled={!isAdmin}>Set default</Button>
              <Button size="sm" variant="danger" onClick={remove} disabled={!isAdmin || !!selected?.isBuiltIn}>Delete</Button>
            </div>
            <div className="pt-1 border-t border-border space-y-2">
              <div><Label>Match ID</Label><Input value={matchId} onChange={e => setMatchId(e.target.value)} placeholder="Match id" /></div>
              <Button size="sm" variant="secondary" className="w-full" onClick={applyToOnAir} disabled={applying || !matchId}><Monitor className="w-4 h-4" />Apply to this match</Button>
              <Button size="sm" variant="outline" className="w-full" onClick={applyToCompetition} disabled={!isAdmin}>Apply to competition</Button>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={exportJson}><Download className="w-4 h-4" />Export</Button>
                <label className="flex-1 inline-flex items-center justify-center gap-2 rounded-[10px] px-3 py-1.5 text-xs font-semibold border border-border-strong bg-surface-sunken text-fg hover:bg-surface-alt cursor-pointer">
                  <Upload className="w-4 h-4" />Import
                  <input type="file" accept="application/json" className="hidden" onChange={e => void importJson(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
          </Card>

          <Card className="!p-3 space-y-2">
            <div className="text-sm font-semibold text-fg flex items-center gap-2"><ShieldCheck className="w-4 h-4" />Safety</div>
            <div className="text-xs text-fg-muted">Draft edits are local until you click <b>Apply to on-air</b>. Live edit is off by default. Outputs fall back to default if a theme is deleted.</div>
            <div className="text-xs text-fg-muted">Selected: <span className="font-semibold text-fg">{selected?.name}</span> {selected?.isBuiltIn ? '(built-in, read-only)' : ''}</div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ScorebugDesignerPage;
