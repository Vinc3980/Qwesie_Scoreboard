import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import {
  LayoutDashboard, CalendarDays, RadioTower, Users, UserSquare2, Trophy, BarChart3,
  Archive, FileText, Settings, ChevronRight, Shield, Tv, Moon, Sun, ExternalLink, HelpCircle, Command, Palette
} from 'lucide-react';
import { getSocket } from '../services/socket.js';
import { cn } from '../utils/cn.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useCurrentMatch } from '../contexts/CurrentMatchContext.js';
import { getStoredTheme, subscribeTheme, toggleTheme, type ThemeMode } from '../utils/theme.js';
import OutputsPanel from '../components/outputs/OutputsPanel.js';
import { systemApi } from '../services/api.js';

type NavItem = { to: string; label: string; icon: any; section: string };
type NavGroup = { id: string; label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  { id: 'today', label: 'Today', items: [
    { to: '/overview', label: 'Overview', icon: LayoutDashboard, section: 'overview' },
  ]},
  { id: 'prepare', label: 'Prepare', items: [
    { to: '/matches', label: 'Matches', icon: CalendarDays, section: 'matches' },
    { to: '/teams', label: 'Teams', icon: Users, section: 'teams' },
    { to: '/players', label: 'Players', icon: UserSquare2, section: 'players' },
    { to: '/competitions', label: 'Competitions', icon: Trophy, section: 'competitions' },
  ]},
  { id: 'golive', label: 'Go Live', items: [
    { to: '/live', label: 'Live Control', icon: RadioTower, section: 'live' },
    { to: '/design/scorebug', label: 'Scorebug Designer', icon: Palette, section: 'design' },
  ]},
  { id: 'review', label: 'Review', items: [
    { to: '/statistics', label: 'Statistics', icon: BarChart3, section: 'statistics' },
    { to: '/archive', label: 'Match Archive', icon: Archive, section: 'archive' },
    { to: '/reports', label: 'Reports', icon: FileText, section: 'reports' },
  ]},
  { id: 'admin', label: 'Admin', items: [
    { to: '/settings', label: 'Settings', icon: Settings, section: 'settings' },
    { to: '/users', label: 'Users', icon: Shield, section: 'users' },
  ]},
];

const allItems = navGroups.flatMap(g => g.items);

const Tally: React.FC<{ label: string; state: 'on-air' | 'ready' | 'off' | 'error'; title?: string }> = ({ label, state, title }) => {
  const dot = state === 'on-air' ? 'bg-live' : state === 'ready' ? 'bg-success' : state === 'error' ? 'bg-danger' : 'bg-fg-subtle';
  const text = state === 'on-air' ? 'text-danger' : state === 'ready' ? 'text-success' : state === 'error' ? 'text-danger' : 'text-fg-muted';
  const statusLabel = state === 'on-air' ? 'On air' : state === 'ready' ? 'Ready' : state === 'error' ? 'Error' : 'Off';
  return (
    <div className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-[10px] border border-border bg-surface', text)} title={title || `${label}: ${statusLabel}`}>
      <span className={cn('w-2.5 h-2.5 rounded-full', dot)} aria-hidden="true" />
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] font-display leading-none">{label}</span>
      <span className="sr-only">{statusLabel}</span>
    </div>
  );
};

function buildBreadcrumbs(pathname: string) {
  const crumbs: Array<{ label: string; to?: string }> = [];
  if (pathname === '/' || pathname.startsWith('/overview')) {
    crumbs.push({ label: 'Today' }, { label: 'Overview' });
    return crumbs;
  }
  if (pathname.startsWith('/matches/new')) { crumbs.push({ label: 'Prepare' }, { label: 'Matches', to: '/matches' }, { label: 'New Match' }); return crumbs; }
  if (/^\/matches\/[^/]+\/setup/.test(pathname)) { crumbs.push({ label: 'Prepare' }, { label: 'Matches', to: '/matches' }, { label: 'Match Setup' }); return crumbs; }
  if (pathname.startsWith('/matches')) { crumbs.push({ label: 'Prepare' }, { label: 'Matches' }); return crumbs; }
  if (pathname.startsWith('/teams')) { crumbs.push({ label: 'Prepare' }, { label: 'Teams' }); return crumbs; }
  if (pathname.startsWith('/players')) { crumbs.push({ label: 'Prepare' }, { label: 'Players' }); return crumbs; }
  if (pathname.startsWith('/competitions')) { crumbs.push({ label: 'Prepare' }, { label: 'Competitions' }); return crumbs; }
  if (pathname.startsWith('/live-classic')) { crumbs.push({ label: 'Go Live' }, { label: 'Live Control (Classic)' }); return crumbs; }
  if (pathname.startsWith('/live')) {
    const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const tab = sp.get('tab');
    crumbs.push({ label: 'Go Live' }, { label: 'Live Control', to: pathname.replace(/\?.*$/, '') || '/live' });
    if (tab === 'graphics') crumbs.push({ label: 'Graphics' });
    else if (tab === 'outputs') crumbs.push({ label: 'Outputs' });
    else crumbs.push({ label: 'Score' });
    return crumbs;
  }
  if (pathname.startsWith('/design/scorebug')) { crumbs.push({ label: 'Go Live' }, { label: 'Scorebug Designer' }); return crumbs; }
  if (pathname.startsWith('/broadcast')) { crumbs.push({ label: 'Go Live' }, { label: 'Graphics' }); return crumbs; }
  if (pathname.startsWith('/statistics')) { crumbs.push({ label: 'Review' }, { label: 'Statistics' }); return crumbs; }
  if (pathname.startsWith('/archive')) { crumbs.push({ label: 'Review' }, { label: 'Match Archive' }); return crumbs; }
  if (pathname.startsWith('/reports')) { crumbs.push({ label: 'Review' }, { label: 'Reports' }); return crumbs; }
  if (pathname.startsWith('/settings')) { crumbs.push({ label: 'Admin' }, { label: 'Settings' }); return crumbs; }
  if (pathname.startsWith('/users')) { crumbs.push({ label: 'Admin' }, { label: 'Users' }); return crumbs; }
  const active = allItems.find(i => pathname.startsWith(i.to));
  if (active) { crumbs.push({ label: active.label }); return crumbs; }
  crumbs.push({ label: 'Console' });
  return crumbs;
}

export const RootLayout: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [now, setNow] = useState(new Date());
  const [theme, setThemeState] = useState<ThemeMode>(() => (typeof window !== 'undefined' ? getStoredTheme() : 'dark'));
  const [outputsOpen, setOutputsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [clients, setClients] = useState<{ scorebug: number; graphics: number }>({ scorebug: 0, graphics: 0 });
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, canAccess } = useAuth();
  const { currentMatch, currentMatchId, setCurrentMatchId, matches } = useCurrentMatch();

  const visibleGroups = useMemo(() => navGroups
    .map(g => ({ ...g, items: g.items.filter(i => canAccess(i.section)) }))
    .filter(g => g.items.length > 0), [canAccess]);

  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setIsConnected(socket.connected);
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      clearInterval(t);
    };
  }, []);

  // Keep the header toggle in sync with theme changes made elsewhere (Settings).
  useEffect(() => subscribeTheme(setThemeState), []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const info = await systemApi.info();
        if (!alive) return;
        setClients({ scorebug: info?.connectedClients?.byType?.scorebug || 0, graphics: info?.connectedClients?.byType?.graphics || 0 });
      } catch {
        // ignore
      }
    };
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    const onOpenOutputs = () => setOutputsOpen(true);
    window.addEventListener('qwesie:open-outputs', onOpenOutputs as any);
    return () => window.removeEventListener('qwesie:open-outputs', onOpenOutputs as any);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || (target as any).isContentEditable);
      if (typing) return;
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setShortcutsOpen(v => !v);
      }
      if (e.key === 'Escape') setShortcutsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isOverlay = location.pathname.startsWith('/overlay') || location.pathname.startsWith('/broadcast/') || location.pathname.startsWith('/out/');
  if (isOverlay) return <Outlet />;

  const breadcrumbs = buildBreadcrumbs(location.pathname);
  const onToggleTheme = () => setThemeState(toggleTheme());

  const socketState: 'ready' | 'error' = isConnected ? 'ready' : 'error';
  const sbState: 'on-air' | 'off' = clients.scorebug > 0 ? 'on-air' : 'off';
  const gfxState: 'ready' | 'off' = clients.graphics > 0 ? 'ready' : 'off';
  const matchLabel = (m: any) => m ? `#${m.match_no || ''} ${m.teams?.A?.shortName || m.teams?.A?.name || 'A'} vs ${m.teams?.B?.shortName || m.teams?.B?.name || 'B'}${m.court ? ` · ${m.court}` : ''}` : 'No match';
  const scorebugPreviewUrl = '/overlay/scorebug';

  return (
    <div className="min-h-screen flex bg-background text-fg">
      <aside className="hidden xl:flex w-[248px] shrink-0 flex-col border-r border-border bg-surface sticky top-0 h-screen">
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-[10px] bg-accent flex items-center justify-center text-accent-fg font-black font-display text-lg">Q</div>
            <div>
              <div className="font-extrabold tracking-tight text-2xl leading-none text-fg font-display">QWESIE TV</div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-fg-muted font-display font-bold">Control</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {visibleGroups.map((group) => (
            <div key={group.id}>
              <div className="px-2 mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-fg-muted font-display">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.to || (item.to !== '/overview' && location.pathname.startsWith(item.to));
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={cn(
                        'group flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-semibold transition-colors border focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                        active
                          ? 'bg-accent-subtle text-fg border-accent/40'
                          : 'text-fg-muted border-transparent hover:text-fg hover:bg-surface-alt hover:border-border'
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate font-display text-[15px] tracking-wide">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-border space-y-2">
          <button
            onClick={() => setOutputsOpen(true)}
            className="w-full flex items-center gap-2 rounded-[10px] px-3 py-2 text-xs font-semibold text-fg bg-surface-alt border border-border hover:bg-surface-raised transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            title="Outputs"
          >
            <Tv className="w-4 h-4" /> Outputs <ChevronRight className="w-3.5 h-3.5 ml-auto" />
          </button>
          <a
            href={scorebugPreviewUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-2 rounded-[10px] px-3 py-2 text-xs font-semibold text-fg-muted bg-transparent border border-border hover:bg-surface-alt hover:text-fg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            title="Open scorebug in new tab"
          >
            <ExternalLink className="w-4 h-4" /> Open scorebug (new tab)
          </a>
          <div className="rounded-[10px] bg-surface-raised border border-border p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-fg"><Shield className="w-3.5 h-3.5" /> {user?.name || 'User'}</div>
            <div className="text-[11px] text-fg-muted mt-0.5">Role: {user?.role}</div>
            <button onClick={async () => { await logout(); navigate('/login'); }} className="mt-2 w-full rounded-[10px] border border-border px-2 py-1.5 text-xs font-semibold text-fg hover:bg-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">Sign out</button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-surface">
          <div className="px-4 md:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="xl:hidden h-8 w-8 rounded-[10px] bg-accent flex items-center justify-center text-accent-fg font-black font-display">Q</div>
              <div className="min-w-0 flex flex-col gap-0.5">
                <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-fg-muted min-w-0">
                  {breadcrumbs.map((c, i) => (
                    <React.Fragment key={`${c.label}-${i}`}>
                      {i > 0 && <ChevronRight className="w-3 h-3 shrink-0 text-fg-subtle" />}
                      {c.to ? <Link to={c.to} className="hover:text-fg truncate focus:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded">{c.label}</Link> : <span className={cn('truncate', i === breadcrumbs.length - 1 && 'text-fg font-semibold')}>{c.label}</span>}
                    </React.Fragment>
                  ))}
                </nav>
                <div className="flex items-center gap-2 min-w-0">
                  <label className="text-[10px] uppercase tracking-[0.1em] text-fg-muted font-display font-bold shrink-0" htmlFor="current-match-select">Current match</label>
                  <select
                    id="current-match-select"
                    value={currentMatchId || ''}
                    onChange={(e) => setCurrentMatchId(e.target.value || null, { navigate: /^\/live/.test(location.pathname) })}
                    className="max-w-[180px] sm:max-w-[360px] truncate rounded-[8px] border border-border-strong bg-surface-sunken px-2 py-1 text-xs font-semibold text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    title={matchLabel(currentMatch)}
                  >
                    {matches.length === 0 && <option value="">No matches</option>}
                    {matches.map((m: any) => (
                      <option key={m.id} value={m.id}>{matchLabel(m)} ({m.status})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <div className="hidden md:flex items-center gap-1.5">
                <Tally label="Scorebug" state={sbState} title={sbState === 'on-air' ? `Scorebug on air (${clients.scorebug})` : 'Scorebug off air'} />
                <Tally label="Graphics" state={gfxState} title={gfxState === 'ready' ? `Graphics connected (${clients.graphics})` : 'Graphics not connected'} />
                <Tally label="Socket" state={socketState} title={isConnected ? 'Socket connected' : 'Socket disconnected'} />
              </div>

              <button onClick={() => setOutputsOpen(true)} className="inline-flex items-center gap-2 rounded-[10px] px-3 py-1.5 text-xs font-semibold border border-border-strong bg-surface-sunken text-fg hover:bg-surface-alt transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus" title="Outputs">
                <Tv className="w-3.5 h-3.5" /><span className="hidden sm:inline font-display tracking-wide">Outputs</span>
              </button>
              <button onClick={() => setShortcutsOpen(true)} className="inline-flex items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-xs font-semibold border border-border-strong bg-surface-sunken text-fg hover:bg-surface-alt transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus" title="Shortcuts (?)">
                <HelpCircle className="w-3.5 h-3.5" /><span className="hidden sm:inline font-display tracking-wide">?</span>
              </button>
              <button onClick={onToggleTheme} className="inline-flex items-center gap-2 rounded-[10px] px-3 py-1.5 text-xs font-semibold border border-border-strong bg-surface-sunken text-fg hover:bg-surface-alt transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline font-display tracking-wide">{theme === 'dark' ? 'Light' : 'Dark'}</span>
              </button>
              <div className="hidden lg:block text-right">
                <div className="text-xs font-semibold text-fg font-mono num-tabular tabular-nums">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                <div className="text-[10px] uppercase tracking-wide text-fg-muted font-display">{now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</div>
              </div>
            </div>
          </div>

          <div className="xl:hidden border-t border-border px-3 py-2 space-y-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <Tally label="SB" state={sbState} title={sbState === 'on-air' ? 'Scorebug on air' : 'Scorebug off air'} />
              <Tally label="GFX" state={gfxState} title={gfxState === 'ready' ? 'Graphics connected' : 'Graphics not connected'} />
              <Tally label="Socket" state={socketState} title={isConnected ? 'Socket connected' : 'Socket disconnected'} />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto">
              {visibleGroups.map((group) => (
                <div key={group.id} className="flex items-center gap-1 pr-2 mr-1 border-r border-border last:border-r-0 last:mr-0">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = location.pathname === item.to || (item.to !== '/overview' && location.pathname.startsWith(item.to));
                    return (
                      <NavLink key={item.to} to={item.to} className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-[10px] text-xs font-semibold whitespace-nowrap border font-display tracking-wide focus:outline-none focus-visible:ring-2 focus-visible:ring-focus', active ? 'bg-accent-subtle text-fg border-accent/40' : 'text-fg-muted border-transparent hover:bg-surface-alt hover:text-fg')}>
                        <Icon className="w-3.5 h-3.5" /> {item.label}
                      </NavLink>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </header>

        <MotionConfig reducedMotion="user">
          <main className="flex-1 px-4 md:px-6 lg:px-8 py-5 bg-background">
            <div className="mx-auto w-full max-w-[1500px]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </MotionConfig>
      </div>

      <OutputsPanel open={outputsOpen} onClose={() => setOutputsOpen(false)} matchId={currentMatchId || undefined} court={currentMatch?.court || undefined} />

      {shortcutsOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShortcutsOpen(false)}>
          <div className="w-full max-w-xl rounded-2xl border border-border-strong bg-surface-raised text-fg p-5 shadow-xl" onClick={e => e.stopPropagation()} role="dialog" aria-label="Shortcuts">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-lg font-bold"><Command className="w-4 h-4 text-accent" />Keyboard shortcuts</div>
              <button onClick={() => setShortcutsOpen(false)} className="text-fg-muted hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded px-2">Esc</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="rounded border border-border p-2 bg-surface"><div className="text-fg-muted text-xs mb-1">Global</div><div><kbd className="px-1.5 py-0.5 rounded bg-surface-sunken border border-border text-fg">?</kbd> Shortcut cheat sheet</div></div>
              <div className="rounded border border-border p-2 bg-surface"><div className="text-fg-muted text-xs mb-1">Live Control</div><div><kbd className="px-1.5 py-0.5 rounded bg-surface-sunken border border-border text-fg">Q</kbd>/<kbd className="px-1.5 py-0.5 rounded bg-surface-sunken border border-border text-fg">W</kbd> +1 A/B, <kbd className="px-1.5 py-0.5 rounded bg-surface-sunken border border-border text-fg">Z</kbd> Undo</div><div><kbd className="px-1.5 py-0.5 rounded bg-surface-sunken border border-border text-fg">1</kbd>-<kbd className="px-1.5 py-0.5 rounded bg-surface-sunken border border-border text-fg">7</kbd> Preview, <kbd className="px-1.5 py-0.5 rounded bg-surface-sunken border border-border text-fg">Enter</kbd> Take, <kbd className="px-1.5 py-0.5 rounded bg-surface-sunken border border-border text-fg">Esc</kbd> Clear</div></div>
              <div className="rounded border border-border p-2 sm:col-span-2 text-fg-muted bg-surface">Use the <b className="text-fg">Outputs</b> drawer/header button to copy URLs, send a test graphic, and verify OBS connections without leaving your workspace.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
