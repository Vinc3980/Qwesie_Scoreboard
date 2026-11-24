import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Input, Label, Select } from '../components/ui/Input.js';
import { Modal } from '../components/ui/Modal.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useNotification } from '../contexts/NotificationContext.js';
import { authApi } from '../services/api.js';
import { Shield, Server, Sliders, Palette, KeyRound, LogOut, Eye, EyeOff, Save, Tv, Image as ImageIcon } from 'lucide-react';
import { getStoredTheme, setTheme, subscribeTheme, type ThemeMode } from '../utils/theme.js';

const SETTINGS_KEY = 'qwesie.settings.defaults';

export type MatchDefaults = {
  ruleset: 'BO5_25_15' | 'BO3_25_15' | 'BO5_25_25' | 'CUSTOM';
  bestOfSets: number;
  regularSetPoints: number;
  finalSetPoints: number;
  timeoutsPerSet: number;
  substitutionsPerSet: number;
  confirmSetEnd: boolean;
  autoSequenceAfterSetEnd: boolean;
  autoSequenceResultSeconds: number;
  defaultCourt: string;
};

export type OutputDefaults = {
  scorebugVariant: 'classic' | 'compact' | 'wide';
  scorebugPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  scorebugScale: number;
};

export type BrandingDefaults = {
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
};

export type AppDefaults = { match: MatchDefaults; output: OutputDefaults; branding: BrandingDefaults };

export const defaultSettings: AppDefaults = {
  match: {
    ruleset: 'BO5_25_15',
    bestOfSets: 5,
    regularSetPoints: 25,
    finalSetPoints: 15,
    timeoutsPerSet: 2,
    substitutionsPerSet: 6,
    confirmSetEnd: true,
    autoSequenceAfterSetEnd: true,
    autoSequenceResultSeconds: 8,
    defaultCourt: '1',
  },
  output: {
    scorebugVariant: 'classic',
    scorebugPosition: 'top-left',
    scorebugScale: 1,
  },
  branding: {
    logoUrl: '',
    primaryColor: '',
    secondaryColor: '',
  },
};

export function loadSettings(): AppDefaults {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw);
    return {
      match: { ...defaultSettings.match, ...(parsed.match || {}) },
      output: { ...defaultSettings.output, ...(parsed.output || {}) },
      branding: { ...defaultSettings.branding, ...(parsed.branding || {}) },
    };
  } catch { return defaultSettings; }
}

export function saveSettings(s: AppDefaults) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

function strengthInfo(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (/^\d{6,}$/.test(pw)) score = Math.max(score, 2);
  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = ['bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500', 'bg-emerald-400'];
  return { score, label: labels[score] || labels[0], color: colors[score] || colors[0] };
}

export const SettingsPage: React.FC = () => {
  const { user, logout, logoutAll } = useAuth();
  const notify = useNotification();
  const navigate = useNavigate();
  const [theme, setThemeState] = useState<ThemeMode>(() => getStoredTheme());
  const [settings, setSettings] = useState<AppDefaults>(loadSettings);
  const [dirty, setDirty] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const strength = useMemo(() => strengthInfo(newPassword), [newPassword]);

  useEffect(() => subscribeTheme(setThemeState), []);
  const onThemeChange = (value: ThemeMode) => { setThemeState(value); setTheme(value); };

  const update = <K extends keyof AppDefaults>(section: K, patch: Partial<AppDefaults[K]>) => {
    setSettings(prev => ({ ...prev, [section]: { ...prev[section], ...patch } }));
    setDirty(true);
  };

  const applyRuleset = (ruleset: MatchDefaults['ruleset']) => {
    if (ruleset === 'BO5_25_15') update('match', { ruleset, bestOfSets: 5, regularSetPoints: 25, finalSetPoints: 15 });
    else if (ruleset === 'BO3_25_15') update('match', { ruleset, bestOfSets: 3, regularSetPoints: 25, finalSetPoints: 15 });
    else if (ruleset === 'BO5_25_25') update('match', { ruleset, bestOfSets: 5, regularSetPoints: 25, finalSetPoints: 25 });
    else update('match', { ruleset });
  };

  const saveAll = () => {
    saveSettings(settings);
    setDirty(false);
    notify.success('Settings saved');
  };

  const submitChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (!currentPassword || !newPassword) return setPwError('All fields are required');
    if (newPassword !== confirm) return setPwError('New passwords do not match');
    setPwBusy(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      notify.success('Password changed');
      setPwOpen(false);
      setCurrentPassword(''); setNewPassword(''); setConfirm('');
    } catch (err: any) {
      setPwError(err?.message || 'Failed to change password');
    } finally { setPwBusy(false); }
  };

  const doLogout = async () => { await logout(); navigate('/login', { replace: true }); };
  const doLogoutAll = async () => {
    try { await logoutAll(); notify.success('Signed out everywhere'); navigate('/login', { replace: true }); }
    catch (e: any) { notify.error(e?.message || 'Failed'); }
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin" title="Settings" description="Appearance, account, match defaults, output defaults, and branding." actions={<Button variant="primary" onClick={saveAll} disabled={!dirty}><Save className="w-4 h-4" />Save settings</Button>} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Appearance</CardTitle><Palette className="w-4 h-4 text-fg-muted" /></CardHeader>
          <div className="space-y-3 text-sm">
            <div><Label>Theme</Label>
              <Select value={theme} onChange={(e)=>onThemeChange(e.target.value as ThemeMode)}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </Select>
              <p className="text-xs text-fg-subtle mt-1">Saved on this device. Default is dark.</p>
            </div>
            <div className="flex gap-2">
              <Button variant={theme === 'dark' ? 'primary' : 'outline'} onClick={() => onThemeChange('dark')} className="flex-1">Dark</Button>
              <Button variant={theme === 'light' ? 'primary' : 'outline'} onClick={() => onThemeChange('light')} className="flex-1">Light</Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Account</CardTitle><Shield className="w-4 h-4 text-fg-muted" /></CardHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-[10px] border border-border p-3 bg-surface-sunken">
              <div className="text-xs text-fg-subtle">Signed in as</div>
              <div className="font-semibold text-fg">{user?.displayName || user?.name} <span className="text-fg-subtle font-normal">({user?.role})</span></div>
              {user?.username && <div className="text-xs text-fg-subtle">@{user.username}</div>}
            </div>
            <Button variant="secondary" className="w-full justify-start" onClick={() => { setPwError(null); setPwOpen(true); }}><KeyRound className="w-4 h-4" />Change password</Button>
            <Button variant="outline" className="w-full justify-start" onClick={doLogout}><LogOut className="w-4 h-4" />Sign out</Button>
            <Button variant="outline" className="w-full justify-start" onClick={doLogoutAll}><LogOut className="w-4 h-4" />Sign out everywhere</Button>
            <p className="text-xs text-fg-subtle">"Sign out everywhere" invalidates all sessions for your account on all devices.</p>
            {user?.role === 'ADMIN' && <Link to="/users"><Button variant="secondary" className="w-full">Manage users</Button></Link>}
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>System</CardTitle><Server className="w-4 h-4 text-fg-muted" /></CardHeader>
          <div className="space-y-3">
            <div><Label>API base</Label><Input value="/api/v1" readOnly /></div>
            <div><Label>Socket.IO</Label><Input value="Same origin" readOnly /></div>
            <div><Label>Database</Label><Input value="PostgreSQL via Prisma (server/.env)" readOnly /></div>
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Match defaults</CardTitle><Sliders className="w-4 h-4 text-fg-muted" /></CardHeader>
          <div className="space-y-3">
            <div>
              <Label>Ruleset</Label>
              <Select value={settings.match.ruleset} onChange={(e)=>applyRuleset(e.target.value as MatchDefaults['ruleset'])}>
                <option value="BO5_25_15">Best of 5 · 25 pts (Set 5: 15) · Win by 2</option>
                <option value="BO3_25_15">Best of 3 · 25 pts (Set 3: 15) · Win by 2</option>
                <option value="BO5_25_25">Best of 5 · 25 pts (all sets) · Win by 2</option>
                <option value="CUSTOM">Custom</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Best of sets</Label><Input type="number" min={1} max={7} value={settings.match.bestOfSets} onChange={e=>update('match', { bestOfSets: Number(e.target.value)||5, ruleset: 'CUSTOM' })} className="num-tabular tabular-nums" /></div>
              <div><Label>Default court</Label><Input value={settings.match.defaultCourt} onChange={e=>update('match', { defaultCourt: e.target.value })} placeholder="1" /></div>
              <div><Label>Regular set points</Label><Input type="number" min={1} value={settings.match.regularSetPoints} onChange={e=>update('match', { regularSetPoints: Number(e.target.value)||25, ruleset: 'CUSTOM' })} className="num-tabular tabular-nums" /></div>
              <div><Label>Final set points</Label><Input type="number" min={1} value={settings.match.finalSetPoints} onChange={e=>update('match', { finalSetPoints: Number(e.target.value)||15, ruleset: 'CUSTOM' })} className="num-tabular tabular-nums" /></div>
              <div><Label>Timeouts / set</Label><Input type="number" min={0} value={settings.match.timeoutsPerSet} onChange={e=>update('match', { timeoutsPerSet: Number(e.target.value)||0 })} className="num-tabular tabular-nums" /></div>
              <div><Label>Substitutions / set</Label><Input type="number" min={0} value={settings.match.substitutionsPerSet} onChange={e=>update('match', { substitutionsPerSet: Number(e.target.value)||0 })} className="num-tabular tabular-nums" /></div>
              <div><Label>End set confirmation</Label><Select value={String(settings.match.confirmSetEnd !== false)} onChange={e=>update('match', { confirmSetEnd: e.target.value === 'true' })}><option value="true">Confirm before ending set</option><option value="false">Auto-end at winning score</option></Select></div>
              <div><Label>Auto-sequence after set end</Label><Select value={String(settings.match.autoSequenceAfterSetEnd !== false)} onChange={e=>update('match', { autoSequenceAfterSetEnd: e.target.value === 'true' })}><option value="true">On: show Set Result, then break slate</option><option value="false">Off: operator controls graphics manually</option></Select></div>
              <div><Label>Set result hold (seconds)</Label><Input type="number" min={3} max={30} value={settings.match.autoSequenceResultSeconds ?? 8} onChange={e=>update('match', { autoSequenceResultSeconds: Math.max(3, Math.min(30, Number(e.target.value)||8)) })} className="num-tabular tabular-nums" /></div>
            </div>
            <p className="text-xs text-fg-subtle">Applied as defaults for new matches (where supported) and operator reference. Auto-sequence shows Set Result, then break slate countdown. Win by 2.</p>
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Output defaults</CardTitle><Tv className="w-4 h-4 text-fg-muted" /></CardHeader>
          <div className="space-y-3">
            <div><Label>Scorebug variant</Label>
              <Select value={settings.output.scorebugVariant} onChange={e=>update('output', { scorebugVariant: e.target.value as any })}>
                <option value="classic">Classic</option><option value="compact">Compact</option><option value="wide">Wide</option>
              </Select>
            </div>
            <div><Label>Scorebug position</Label>
              <Select value={settings.output.scorebugPosition} onChange={e=>update('output', { scorebugPosition: e.target.value as any })}>
                <option value="top-left">Top left</option><option value="top-right">Top right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option>
              </Select>
            </div>
            <div><Label>Scorebug scale</Label>
              <Select value={String(settings.output.scorebugScale)} onChange={e=>update('output', { scorebugScale: Number(e.target.value) })}>
                <option value="0.75">75%</option><option value="0.85">85%</option><option value="1">100%</option><option value="1.1">110%</option><option value="1.25">125%</option><option value="1.5">150%</option>
              </Select>
            </div>
            <p className="text-xs text-fg-subtle">Default output preferences for operators (saved on this device).</p>
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Branding</CardTitle><ImageIcon className="w-4 h-4 text-fg-muted" /></CardHeader>
          <div className="space-y-3">
            <div><Label>Logo URL</Label><Input value={settings.branding.logoUrl} onChange={e=>update('branding', { logoUrl: e.target.value })} placeholder="https://... or /uploads/..." /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Primary color</Label><div className="flex gap-2 items-center"><input type="color" value={settings.branding.primaryColor || 'rgb(245,158,11)'} onChange={e=>update('branding', { primaryColor: e.target.value })} className="h-10 w-12 rounded border border-border bg-transparent" /><Input value={settings.branding.primaryColor} onChange={e=>update('branding', { primaryColor: e.target.value })} placeholder="e.g. rgb(245,158,11)" /></div></div>
              <div><Label>Secondary color</Label><div className="flex gap-2 items-center"><input type="color" value={settings.branding.secondaryColor || 'rgb(17,24,39)'} onChange={e=>update('branding', { secondaryColor: e.target.value })} className="h-10 w-12 rounded border border-border bg-transparent" /><Input value={settings.branding.secondaryColor} onChange={e=>update('branding', { secondaryColor: e.target.value })} placeholder="e.g. rgb(17,24,39)" /></div></div>
            </div>
            <p className="text-xs text-fg-subtle">Branding defaults for graphics/outputs where supported. Saved on this device.</p>
            {dirty && <div className="text-xs text-warning">Unsaved changes</div>}
          </div>
        </Card>
      </div>

      <Modal isOpen={pwOpen} onClose={() => !pwBusy && setPwOpen(false)} title="Change password">
        <form onSubmit={submitChangePassword} className="space-y-3">
          <div>
            <Label>Current password</Label>
            <div className="relative">
              <Input type={showPw ? 'text' : 'password'} value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} autoComplete="current-password" className="pr-10" />
              <button type="button" onClick={()=>setShowPw(v=>!v)} aria-label={showPw?'Hide password':'Show password'} aria-pressed={showPw} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-fg-subtle hover:text-fg dark:hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label>New password</Label>
            <Input type={showPw ? 'text' : 'password'} value={newPassword} onChange={e=>setNewPassword(e.target.value)} autoComplete="new-password" />
            {newPassword && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-fg-subtle mb-1"><span>Strength</span><span>{strength.label}</span></div>
                <div className="h-1.5 rounded bg-surface-alt overflow-hidden flex gap-0.5">{Array.from({length:5}).map((_,i)=> <div key={i} className={`flex-1 ${i < strength.score ? strength.color : 'bg-transparent'}`} />)}</div>
              </div>
            )}
          </div>
          <div>
            <Label>Confirm new password</Label>
            <Input type={showPw ? 'text' : 'password'} value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          {pwError && <div className="text-sm text-danger">{pwError}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={()=>setPwOpen(false)} disabled={pwBusy}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={pwBusy}>Change password</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SettingsPage;
