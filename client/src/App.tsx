import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationProvider } from './contexts/NotificationContext.js';
import { AuthProvider, useAuth } from './contexts/AuthContext.js';
import { CurrentMatchProvider, useCurrentMatch } from './contexts/CurrentMatchContext.js';
import { RouteErrorBoundary } from './components/RouteErrorBoundary.js';

// Public/overlay routes (kept free of console layout/code)
import { ScorebugPage } from './pages/ScorebugPage.js';
import { BroadcastGraphicsPage } from './pages/BroadcastGraphicsPage.js';
import { OverlayPreviewPage } from './pages/OverlayPreviewPage.js';
import { BroadcastKitPage } from './pages/dev/BroadcastKitPage.js';
import IdentityPage from './pages/dev/IdentityPage.js';
import { CourtOutputPage } from './pages/CourtOutputPage.js';
import { LoginPage } from './pages/LoginPage.js';

// Console routes (code-split)
const RootLayout = lazy(() => import('./layouts/RootLayout.js').then(m => ({ default: m.RootLayout })));
const OverviewPage = lazy(() => import('./pages/OverviewPage.js').then(m => ({ default: m.OverviewPage })));
const MatchesPage = lazy(() => import('./pages/MatchesPage.js').then(m => ({ default: m.MatchesPage })));
const MatchSetupWizardPage = lazy(() => import('./pages/MatchSetupWizardPage.js').then(m => ({ default: m.MatchSetupWizardPage })));
const LiveControlPage = lazy(() => import('./pages/LiveControlPage.js').then(m => ({ default: m.LiveControlPage })));
const LiveControlClassicPage = lazy(() => import('./pages/LiveControlClassicPage.js').then(m => ({ default: m.LiveControlClassicPage })));
const ScorebugDesignerPage = lazy(() => import('./pages/ScorebugDesignerPage.js').then(m => ({ default: m.ScorebugDesignerPage })));
const TeamsPage = lazy(() => import('./pages/TeamsPage.js').then(m => ({ default: m.TeamsPage })));
const PlayersPage = lazy(() => import('./pages/PlayersPage.js').then(m => ({ default: m.PlayersPage })));
const CompetitionsPage = lazy(() => import('./pages/CompetitionsPage.js').then(m => ({ default: m.CompetitionsPage })));
const StatisticsPage = lazy(() => import('./pages/StatisticsPage.js').then(m => ({ default: m.StatisticsPage })));
const MatchArchivePage = lazy(() => import('./pages/MatchArchivePage.js').then(m => ({ default: m.MatchArchivePage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage.js').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage.js').then(m => ({ default: m.SettingsPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.js').then(m => ({ default: m.NotFoundPage })));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage.js').then(m => ({ default: m.UserManagementPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage.js').then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.js').then(m => ({ default: m.ResetPasswordPage })));
const ForceChangePasswordPage = lazy(() => import('./pages/ForceChangePasswordPage.js').then(m => ({ default: m.ForceChangePasswordPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RouteFallback() {
  return (
    <div className="min-h-screen bg-background text-fg p-6">
      <div className="max-w-[1200px] mx-auto space-y-4 animate-pulse">
        <div className="h-8 w-56 bg-surface-raised rounded-[10px] border border-border" />
        <div className="h-4 w-96 max-w-full bg-surface rounded border border-border" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="h-28 bg-surface rounded-[14px] border border-border" />
          <div className="h-28 bg-surface rounded-[14px] border border-border" />
          <div className="h-28 bg-surface rounded-[14px] border border-border" />
        </div>
        <div className="h-64 bg-surface rounded-[14px] border border-border" />
      </div>
    </div>
  );
}

function RequireAuth({ children, roles }: { children: React.ReactNode; roles?: Array<'ADMIN'|'SCORER'|'VIEWER'> }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <RouteFallback />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (user.mustChangePassword && location.pathname !== '/force-change-password') {
    return <Navigate to="/force-change-password" replace state={{ from: location.pathname + location.search }} />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to="/overview" replace />;
  return <>{children}</>;
}

function AuthRedirector() {
  const { authRequired, clearAuthRequired, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const isPublic = location.pathname.startsWith('/out/') || location.pathname.startsWith('/overlay') || location.pathname.startsWith('/broadcast/') || location.pathname.startsWith('/dev') || location.pathname === '/login' || location.pathname === '/forgot-password' || location.pathname === '/reset-password';
    if (authRequired && !isPublic && !user) {
      try { sessionStorage.setItem('qwesie.auth.toast401', '1'); } catch {}
      clearAuthRequired();
      navigate('/login', { replace: true, state: { from: location.pathname + location.search } });
    }
  }, [authRequired, user, location, navigate, clearAuthRequired]);
  return null;
}

function BroadcastConsoleRedirect() {
  const { currentMatchId } = useCurrentMatch();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const match = params.get('match') || currentMatchId;
  const target = match ? `/live/${match}?tab=graphics` : '/live?tab=graphics';
  return <Navigate to={target} replace />;
}

function RoutedApp() {
  const location = useLocation();
  return (
    <RouteErrorBoundary resetKey={location.key}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/force-change-password" element={<ForceChangePasswordPage />} />

          {/* Public outputs / broadcast / dev (no auth, no console chrome, free of console code) */}
          <Route path="/overlay/preview" element={<OverlayPreviewPage />} />
          <Route path="/overlay/scorebug" element={<ScorebugPage />} />
          <Route path="/broadcast/:matchId/scorebug" element={<ScorebugPage />} />
          <Route path="/broadcast/:matchId/graphics" element={<BroadcastGraphicsPage />} />
          <Route path="/broadcast/:matchId/match-introduction" element={<BroadcastGraphicsPage />} />
          <Route path="/broadcast/:matchId/starting-lineup" element={<BroadcastGraphicsPage />} />
          <Route path="/broadcast/:matchId/player-spotlight" element={<BroadcastGraphicsPage />} />
          <Route path="/broadcast/:matchId/team-comparison" element={<BroadcastGraphicsPage />} />
          <Route path="/broadcast/:matchId/match-statistics" element={<BroadcastGraphicsPage />} />
          <Route path="/broadcast/:matchId/set-results" element={<BroadcastGraphicsPage />} />
          <Route path="/broadcast/:matchId/match-results" element={<BroadcastGraphicsPage />} />
          <Route path="/broadcast/:matchId/graphic/:templateSlug" element={<BroadcastGraphicsPage />} />
          <Route path="/dev/broadcast-kit" element={<BroadcastKitPage />} />
          <Route path="/dev/identity" element={<IdentityPage />} />
          <Route path="/out/court/:court" element={<CourtOutputPage />} />
          <Route path="/out/court/:court/:mode" element={<CourtOutputPage />} />

          <Route path="/" element={<RequireAuth><RootLayout /></RequireAuth>}>
            <Route index element={<Navigate to="/overview" replace />} />
            <Route path="overview" element={<OverviewPage />} />
            <Route path="matches" element={<MatchesPage />} />
            <Route path="matches/new" element={<MatchSetupWizardPage />} />
            <Route path="matches/:id/setup" element={<MatchSetupWizardPage />} />
            <Route path="live" element={<LiveControlPage />} />
            <Route path="live/:id" element={<LiveControlPage />} />
            <Route path="live-classic" element={<LiveControlClassicPage />} />
            <Route path="live-classic/:id" element={<LiveControlClassicPage />} />
            <Route path="design/scorebug" element={<ScorebugDesignerPage />} />
            <Route path="teams" element={<TeamsPage />} />
            <Route path="players" element={<PlayersPage />} />
            <Route path="competitions" element={<CompetitionsPage />} />
            <Route path="statistics" element={<StatisticsPage />} />
            <Route path="broadcast" element={<BroadcastConsoleRedirect />} />
            <Route path="archive" element={<MatchArchivePage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="users" element={<RequireAuth roles={['ADMIN']}><UserManagementPage /></RequireAuth>} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NotificationProvider>
          <BrowserRouter>
            <CurrentMatchProvider>
              <AuthRedirector />
              <RoutedApp />
            </CurrentMatchProvider>
          </BrowserRouter>
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};
