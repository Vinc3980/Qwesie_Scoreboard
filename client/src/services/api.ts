import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import {
  MatchState,
  ApiResponse,
  ApiErrorResponse,
  PointMutationInput,
  ActionMutationInput,
  TimeoutMutationInput,
  SubstitutionMutationInput,
  MatchSetupInput,
  MatchInfoInput,
  MatchReadiness,
  SystemInfo,
  MatchRosterEntryInput,
} from '@qwesie/shared';
import { formatApiError, getApiIssues } from '../utils/apiErrors.js';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

type QueuedRequest = { config: AxiosRequestConfig; resolve: (v: any) => void; reject: (e: any) => void };
const authQueue: QueuedRequest[] = [];
let authRequiredHandler: (() => void) | null = null;
let isFlushing = false;

export function onAuthRequired(handler: () => void) { authRequiredHandler = handler; }
export function getAuthQueueSize() { return authQueue.length; }

function isMutating(method?: string) {
  return ['post','put','patch','delete'].includes(String(method || 'get').toLowerCase());
}

export async function flushAuthQueue() {
  if (isFlushing) return;
  isFlushing = true;
  try {
    const items = authQueue.splice(0, authQueue.length);
    for (const item of items) {
      try {
        const res = await apiClient.request({ ...item.config, headers: { ...(item.config.headers || {}), 'x-auth-replayed': '1' } });
        item.resolve(res);
      } catch (e) {
        item.reject(e);
      }
    }
  } finally {
    isFlushing = false;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    const status = error.response?.status;
    const cfg: any = error.config || {};
    const url = String(cfg.url || '');
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/bootstrap') || url.includes('/auth/me');
    if (status === 401 && !isAuthCall && !cfg.__authRetried) {
      // Queue mutating requests to never lose scorer actions; redirect to login.
      if (isMutating(cfg.method)) {
        return new Promise((resolve, reject) => {
          authQueue.push({ config: { ...cfg, __authRetried: true }, resolve, reject });
          try { authRequiredHandler?.(); } catch {}
        });
      }
      try { authRequiredHandler?.(); } catch {}
    }

    const responseBody = error.response?.data as any;
    const issues = getApiIssues({ response: { data: responseBody } });
    const formatted = formatApiError({ response: { data: responseBody }, message: error.message }, undefined);

    const err: any = new Error(formatted || responseBody?.error?.message || error.message || 'An unexpected network error occurred');
    err.status = status;
    err.code = status === 401 ? 'AUTH_REQUIRED' : (responseBody?.error?.code ?? responseBody?.code);
    err.issues = issues;
    err.details = responseBody?.error?.issues ?? responseBody?.error?.details ?? responseBody?.issues ?? responseBody?.details;
    err.responseBody = responseBody;
    err.raw = error;
    return Promise.reject(err);
  }
);

export const authApi = {
  login: async (username: string, password: string, rememberMe?: boolean) => (await apiClient.post<ApiResponse<any>>('/auth/login', { username, password, rememberMe })).data.data,
  logout: async () => (await apiClient.post<ApiResponse<any>>('/auth/logout')).data.data,
  logoutAll: async () => (await apiClient.post<ApiResponse<any>>('/auth/logout-all')).data.data,
  me: async () => (await apiClient.get<ApiResponse<any>>('/auth/me')).data.data,
  bootstrapStatus: async () => (await apiClient.get<ApiResponse<any>>('/auth/bootstrap-status')).data.data,
  bootstrap: async (body: { username: string; password: string; displayName: string; email?: string }) => (await apiClient.post<ApiResponse<any>>('/auth/bootstrap', body)).data.data,
  changePassword: async (body: { currentPassword: string; newPassword: string }) => (await apiClient.post<ApiResponse<any>>('/auth/change-password', body)).data.data,
  forgotPassword: async (identifier: string) => (await apiClient.post<ApiResponse<any>>('/auth/forgot-password', { identifier })).data.data,
  resetWithRecoveryCode: async (body: { username: string; recoveryCode: string; newPassword: string }) => (await apiClient.post<ApiResponse<any>>('/auth/reset-password/recovery-code', body)).data.data,
  resetWithToken: async (body: { token: string; newPassword: string }) => (await apiClient.post<ApiResponse<any>>('/auth/reset-password/token', body)).data.data,
  resetWithTempPassword: async (body: { username: string; tempPassword: string; newPassword: string }) => (await apiClient.post<ApiResponse<any>>('/auth/reset-password/temp', body)).data.data,
  smtpStatus: async () => (await apiClient.get<ApiResponse<any>>('/auth/smtp-status')).data.data,
  listUsers: async () => (await apiClient.get<ApiResponse<any[]>>('/auth/users')).data.data,
  createUser: async (body: { username: string; password: string; displayName: string; email?: string; role: 'ADMIN'|'SCORER'|'VIEWER' }) => (await apiClient.post<ApiResponse<any>>('/auth/users', body)).data.data,
  updateUser: async (id: string, body: { displayName?: string; role?: 'ADMIN'|'SCORER'|'VIEWER'; active?: boolean }) => (await apiClient.patch<ApiResponse<any>>(`/auth/users/${id}`, body)).data.data,
  resetUserPassword: async (id: string) => (await apiClient.post<ApiResponse<any>>(`/auth/users/${id}/reset-password`)).data.data,
  deleteUser: async (id: string) => (await apiClient.delete<ApiResponse<any>>(`/auth/users/${id}`)).data.data,
  regenerateRecoveryCodes: async () => (await apiClient.post<ApiResponse<any>>('/auth/recovery-codes/regenerate')).data.data,
};

export const uploadsApi = {
  upload: async (
    file: File,
    scope: 'player-photo' | 'team-logo' | 'team-coach' | 'team-photo' | 'generic' = 'generic',
    onProgress?: (percent: number) => void,
  ): Promise<{ url: string; thumbUrl?: string | null; key?: string | null; thumbKey?: string | null; width?: number; height?: number; filename?: string }> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('scope', scope);
    const res = await apiClient.post<ApiResponse<any>>('/uploads', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        if (!onProgress) return;
        const total = evt.total || file.size || 1;
        onProgress(Math.max(0, Math.min(100, Math.round((evt.loaded / total) * 100))));
      },
    });
    return res.data.data;
  },
};

export const matchApi = {
  listMatches: async (): Promise<MatchState[]> => {
    const res = await apiClient.get<ApiResponse<MatchState[]>>('/matches');
    return res.data.data;
  },

  createMatch: async (data?: Partial<MatchSetupInput>): Promise<MatchState> => {
    const res = await apiClient.post<ApiResponse<MatchState>>('/matches', data || {});
    return res.data.data;
  },

  getCurrentMatch: async (): Promise<MatchState> => {
    const res = await apiClient.get<ApiResponse<MatchState>>('/matches/current');
    return res.data.data;
  },

  getActiveMatch: async (): Promise<{ matchId: string | null; status: string | null }> => {
    const res = await apiClient.get<ApiResponse<{ matchId: string | null; status: string | null }>>('/matches/active');
    return res.data.data;
  },

  getMatchById: async (id: string): Promise<MatchState> => {
    const res = await apiClient.get<ApiResponse<MatchState>>(`/matches/${id}`);
    return res.data.data;
  },

  point: async (data: PointMutationInput, matchId?: string): Promise<MatchState> => {
    const url = matchId ? `/matches/${matchId}/point` : '/matches/point';
    const res = await apiClient.post<ApiResponse<MatchState>>(url, data);
    return res.data.data;
  },

  action: async (data: ActionMutationInput & { playerId?: string; assistPlayerId?: string; clientEventId?: string }, matchId?: string): Promise<MatchState> => {
    const url = matchId ? `/matches/${matchId}/action` : '/matches/action';
    const res = await apiClient.post<ApiResponse<MatchState>>(url, data);
    return res.data.data;
  },
  attributeEvent: async (matchId: string, eventId: string, data: { playerId?: string | null; assistPlayerId?: string | null }): Promise<MatchState> => {
    const res = await apiClient.patch<ApiResponse<MatchState>>(`/matches/${matchId}/events/${encodeURIComponent(eventId)}/attribution`, data);
    return res.data.data;
  },

  timeout: async (data: TimeoutMutationInput & { clientEventId?: string }, matchId?: string): Promise<MatchState> => {
    const url = matchId ? `/matches/${matchId}/timeout` : '/matches/timeout';
    const res = await apiClient.post<ApiResponse<MatchState>>(url, data);
    return res.data.data;
  },

  substitution: async (data: SubstitutionMutationInput & { playerOutId?: string; playerInId?: string; clientEventId?: string }, matchId?: string): Promise<MatchState> => {
    const url = matchId ? `/matches/${matchId}/substitution` : '/matches/substitution';
    const res = await apiClient.post<ApiResponse<MatchState>>(url, data);
    return res.data.data;
  },

  undo: async (matchId?: string, clientEventId?: string): Promise<MatchState> => {
    const url = matchId ? `/matches/${matchId}/undo` : '/matches/undo';
    const res = await apiClient.post<ApiResponse<MatchState>>(url, clientEventId ? { clientEventId } : {});
    return res.data.data;
  },

  startSet: async (matchId?: string, data?: { setNumber?: number; servingSide?: 'A' | 'B' }): Promise<MatchState> => {
    const url = matchId ? `/matches/${matchId}/start-set` : '/matches/start-set';
    const res = await apiClient.post<ApiResponse<MatchState>>(url, data || {});
    return res.data.data;
  },

  endSet: async (matchId?: string, data?: { force?: boolean; reason?: string }): Promise<MatchState> => {
    const url = matchId ? `/matches/${matchId}/end-set` : '/matches/end-set';
    const res = await apiClient.post<ApiResponse<MatchState>>(url, data || {});
    return res.data.data;
  },

  setup: async (data: MatchSetupInput, matchId?: string): Promise<MatchState> => {
    const url = matchId ? `/matches/${matchId}/setup` : '/matches/setup';
    const res = await apiClient.post<ApiResponse<MatchState>>(url, data);
    return res.data.data;
  },

  info: async (data: MatchInfoInput, matchId?: string): Promise<MatchState> => {
    const url = matchId ? `/matches/${matchId}/info` : '/matches/info';
    const res = await apiClient.post<ApiResponse<MatchState>>(url, data);
    return res.data.data;
  },

  setStatus: async (status: 'LIVE' | 'PAUSED' | 'SUSPENDED' | 'READY' | 'SCHEDULED' | 'CANCELLED' | 'COMPLETED', matchId?: string, reason?: string): Promise<MatchState> => {
    const url = matchId ? `/matches/${matchId}/status` : '/matches/status';
    const res = await apiClient.post<ApiResponse<MatchState>>(url, { status, reason });
    return res.data.data;
  },

  getReadiness: async (matchId: string): Promise<MatchReadiness> => {
    const res = await apiClient.get<ApiResponse<MatchReadiness>>(`/matches/${matchId}/readiness`);
    return res.data.data;
  },
  getTeamSheet: async (matchId: string): Promise<any> => {
    const res = await apiClient.get<ApiResponse<any>>(`/matches/${matchId}/team-sheet`);
    return res.data.data;
  },
  goLive: async (matchId: string): Promise<MatchState> => {
    const res = await apiClient.post<ApiResponse<MatchState>>(`/matches/${matchId}/go-live`);
    return res.data.data;
  },

  resetMatch: async (matchId: string): Promise<MatchState> => {
    const res = await apiClient.post<ApiResponse<MatchState>>(`/matches/${matchId}/reset`);
    return res.data.data;
  },

  archiveTestMatches: async (matchIds?: string[]): Promise<{ archived: string[]; skipped: string[] }> => {
    const res = await apiClient.post<ApiResponse<{ archived: string[]; skipped: string[] }>>('/matches/archive-tests', { matchIds });
    return res.data.data;
  },

  getAnalytics: async (matchId?: string): Promise<any> => {
    const url = matchId ? `/matches/${matchId}/analytics` : '/matches/current/analytics';
    const res = await apiClient.get<ApiResponse<any>>(url);
    return res.data.data;
  },

  getMatchReport: async (matchId: string): Promise<any> => {
    const res = await apiClient.get<ApiResponse<any>>(`/matches/${matchId}/report`);
    return res.data.data;
  },

  getHistoricalAnalytics: async (filters?: { team?: string; tournament?: string; competition?: string; dateFrom?: string; dateTo?: string; player?: string }): Promise<any> => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, String(v)); });
    }
    const q = params.toString();
    const res = await apiClient.get<ApiResponse<any>>(`/matches/history/analytics${q ? `?${q}` : ''}`);
    return res.data.data;
  },
};

export const teamsApi = {
  list: async () => (await apiClient.get<ApiResponse<any[]>>('/teams')).data.data,
  get: async (id: string) => (await apiClient.get<ApiResponse<any>>(`/teams/${id}`)).data.data,
  players: async (id: string) => {
    const res = await apiClient.get<ApiResponse<any[]>>(`/teams/${id}/players`);
    const data = (res.data as any)?.data ?? res.data;
    return Array.isArray(data) ? data : [];
  },
  create: async (body: any) => (await apiClient.post<ApiResponse<any>>('/teams', body)).data.data,
  update: async (id: string, body: any) => (await apiClient.put<ApiResponse<any>>(`/teams/${id}`, body)).data.data,
  remove: async (id: string) => (await apiClient.delete<ApiResponse<any>>(`/teams/${id}`)).data.data,
  bulkPlayers: async (id: string, body: { text: string; dryRun?: boolean }) => (await apiClient.post<ApiResponse<any>>(`/teams/${id}/players/bulk`, body)).data.data,
};

export const playersApi = {
  list: async (teamId?: string) => (await apiClient.get<ApiResponse<any[]>>(`/players${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''}`)).data.data,
  get: async (id: string) => (await apiClient.get<ApiResponse<any>>(`/players/${id}`)).data.data,
  create: async (body: any) => (await apiClient.post<ApiResponse<any>>('/players', body)).data.data,
  update: async (id: string, body: any) => (await apiClient.put<ApiResponse<any>>(`/players/${id}`, body)).data.data,
  remove: async (id: string) => (await apiClient.delete<ApiResponse<any>>(`/players/${id}`)).data.data,
};

export const competitionsApi = {
  list: async () => (await apiClient.get<ApiResponse<any[]>>('/competitions')).data.data,
  get: async (id: string) => (await apiClient.get<ApiResponse<any>>(`/competitions/${id}`)).data.data,
  create: async (body: any) => (await apiClient.post<ApiResponse<any>>('/competitions', body)).data.data,
  update: async (id: string, body: any) => (await apiClient.put<ApiResponse<any>>(`/competitions/${id}`, body)).data.data,
  remove: async (id: string) => (await apiClient.delete<ApiResponse<any>>(`/competitions/${id}`)).data.data,
  standings: async (id: string, params: any = {}) => (await apiClient.get<ApiResponse<any>>(`/competitions/${id}/standings`, { params })).data.data,
  fixtures: async (id: string, params: any = {}) => (await apiClient.get<ApiResponse<any>>(`/competitions/${id}/fixtures`, { params })).data.data,
  divisions: async (id: string) => (await apiClient.get<ApiResponse<string[]>>(`/competitions/${id}/divisions`)).data.data,
  generateFixturesPreview: async (id: string, body: any) => (await apiClient.post<ApiResponse<any>>(`/competitions/${id}/fixtures/generate-preview`, body)).data.data,
  commitFixtures: async (id: string, body: any) => (await apiClient.post<ApiResponse<any>>(`/competitions/${id}/fixtures/generate-commit`, body)).data.data,
};

export const leaderboardApi = {
  listThemes: async (competitionId?: string) => (await apiClient.get<ApiResponse<any[]>>('/leaderboards/themes', { params: competitionId ? { competitionId } : undefined })).data.data,
  getTheme: async (id: string) => (await apiClient.get<ApiResponse<any>>(`/leaderboards/themes/${id}`)).data.data,
  createTheme: async (body: any) => (await apiClient.post<ApiResponse<any>>('/leaderboards/themes', body)).data.data,
  updateTheme: async (id: string, body: any) => (await apiClient.put<ApiResponse<any>>(`/leaderboards/themes/${id}`, body)).data.data,
  deleteTheme: async (id: string) => (await apiClient.delete<ApiResponse<any>>(`/leaderboards/themes/${id}`)).data.data,
  duplicateTheme: async (id: string, body: any = {}) => (await apiClient.post<ApiResponse<any>>(`/leaderboards/themes/${id}/duplicate`, body)).data.data,
  setDefault: async (id: string, body: any = {}) => (await apiClient.post<ApiResponse<any>>(`/leaderboards/themes/${id}/default`, body)).data.data,
  applyToCompetition: async (id: string, competitionId: string) => (await apiClient.post<ApiResponse<any>>(`/leaderboards/themes/${id}/apply-competition/${competitionId}`, {})).data.data,
  applyToOnAir: async (id: string, body: any) => (await apiClient.post<ApiResponse<any>>(`/leaderboards/themes/${id}/apply-on-air`, body)).data.data,
  exportTheme: async (id: string) => (await apiClient.get<ApiResponse<any>>(`/leaderboards/themes/${id}/export`)).data.data,
  importTheme: async (body: any) => (await apiClient.post<ApiResponse<any>>('/leaderboards/themes/import', body)).data.data,
  resolveTheme: async (params: any = {}) => (await apiClient.get<ApiResponse<any>>('/leaderboards/themes/resolve', { params })).data.data,
  playerLeaderboard: async (competitionId: string, params: any = {}) => (await apiClient.get<ApiResponse<any>>(`/leaderboards/competition/${competitionId}/players`, { params })).data.data,
  combined: async (competitionId: string, params: any = {}) => (await apiClient.get<ApiResponse<any>>(`/leaderboards/competition/${competitionId}/combined`, { params })).data.data,
};

export const publicApi = {
  competition: async (id: string) => (await axios.get(`/api/v1/public/competitions/${id}`)).data.data,
  standings: async (id: string, params: any = {}) => (await axios.get(`/api/v1/public/competitions/${id}/standings`, { params })).data.data,
  fixtures: async (id: string, params: any = {}) => (await axios.get(`/api/v1/public/competitions/${id}/fixtures`, { params })).data.data,
  divisions: async (id: string) => (await axios.get(`/api/v1/public/competitions/${id}/divisions`)).data.data,
  playerLeaderboard: async (competitionId: string, params: any = {}) => (await axios.get(`/api/v1/public/leaderboards/competition/${competitionId}/players`, { params })).data.data,
  combined: async (competitionId: string, params: any = {}) => (await axios.get(`/api/v1/public/leaderboards/competition/${competitionId}/combined`, { params })).data.data,
  leaderboardTheme: async (id: string) => (await axios.get(`/api/v1/public/leaderboards/themes/${id}`)).data.data,
  leaderboardThemes: async (competitionId?: string) => (await axios.get(`/api/v1/public/leaderboards/themes`, { params: competitionId ? { competitionId } : undefined })).data.data,
  resolveLeaderboardTheme: async (params: any = {}) => (await axios.get(`/api/v1/public/leaderboards/themes/resolve`, { params })).data.data,
};

export const rosterApi = {
  get: async (matchId: string, side: 'A'|'B'|'HOME'|'AWAY') => {
    const res = await apiClient.get<ApiResponse<any[]>>(`/matches/${matchId}/roster/${side}`);
    const data = (res.data as any)?.data ?? res.data;
    return Array.isArray(data) ? data : [];
  },
  replace: async (matchId: string, side: 'A'|'B'|'HOME'|'AWAY', players: MatchRosterEntryInput[] | any[]) => (await apiClient.put<ApiResponse<MatchState>>(`/matches/${matchId}/roster/${side}`, { players })).data.data,
  copyFrom: async (matchId: string, side: 'A'|'B'|'HOME'|'AWAY', otherMatchId: string) => (await apiClient.post<ApiResponse<MatchState>>(`/matches/${matchId}/roster/${side}/copy-from/${otherMatchId}`)).data.data,
};

export const lineupApi = {
  set: async (matchId: string, side: 'A'|'B'|'HOME'|'AWAY', setNumber: number, body: { players: Array<{ rotationPos: number; playerId?: string; jerseyNumber?: number }>; liberoId?: string | null }) => (await apiClient.put<ApiResponse<MatchState>>(`/matches/${matchId}/lineup/${side}/${setNumber}`, body)).data.data,
};

export const systemApi = {
  info: async (): Promise<SystemInfo> => (await apiClient.get<ApiResponse<SystemInfo>>('/system/info')).data.data,
  activeCourtMatch: async (court: string): Promise<{ court: string; courtKey?: string | null; matchId: string | null; status: string | null; source?: string; onAirMatchId?: string | null; match?: any }> => (await apiClient.get<ApiResponse<any>>(`/system/courts/${encodeURIComponent(court)}/active`)).data.data,
  setActiveCourtMatch: async (court: string, matchId: string | null): Promise<any> => (await apiClient.post<ApiResponse<any>>(`/system/courts/${encodeURIComponent(court)}/active`, { matchId })).data.data,
};

export const broadcastApi = {
  getTemplates: async (): Promise<any[]> => {
    const res = await apiClient.get<ApiResponse<any[]>>('/broadcast/templates');
    return res.data.data;
  },
  getGraphicState: async (matchId: string): Promise<any> => {
    const res = await apiClient.get<ApiResponse<any>>(`/broadcast/${matchId}/graphic`);
    return res.data.data;
  },
  getSceneState: async (matchId: string): Promise<any> => {
    const res = await apiClient.get<ApiResponse<any>>(`/broadcast/${matchId}/scene`);
    return res.data.data;
  },
  setGraphicState: async (matchId: string, body: { template: string; visible?: boolean; payload?: any; durationSeconds?: number | null }): Promise<any> => {
    const res = await apiClient.post<ApiResponse<any>>(`/broadcast/${matchId}/graphic`, body);
    return res.data.data;
  },
  dismissGraphic: async (matchId: string): Promise<any> => {
    const res = await apiClient.post<ApiResponse<any>>(`/broadcast/${matchId}/graphic/dismiss`);
    return res.data.data;
  },
  startBreak: async (matchId: string, body: { type: string; durationSeconds?: number | null }): Promise<any> => {
    const res = await apiClient.post<ApiResponse<any>>(`/broadcast/${matchId}/break/start`, body);
    return res.data.data;
  },
  endBreak: async (matchId: string): Promise<any> => {
    const res = await apiClient.post<ApiResponse<any>>(`/broadcast/${matchId}/break/end`);
    return res.data.data;
  },
  resumeMatch: async (matchId: string): Promise<any> => {
    const res = await apiClient.post<ApiResponse<any>>(`/broadcast/${matchId}/resume`);
    return res.data.data;
  },
  setScene: async (matchId: string, body: { scene?: string; lock?: boolean; timerEndsAt?: string | null; template?: string | null; payload?: any; startedAt?: string | null; scorebug?: { visible?: boolean; variant?: string; position?: string; scale?: number; showSetHistory?: boolean; showPreMatch?: boolean; showLogos?: boolean; showTournament?: boolean; tournamentLabel?: string | null } }): Promise<any> => {
    const res = await apiClient.post<ApiResponse<any>>(`/broadcast/${matchId}/scene`, body);
    return res.data.data;
  },
  setAutoTriggers: async (matchId: string, body: { setBreakSeconds?: number; timeoutSeconds?: number; setBreakEnabled?: boolean; timeoutEnabled?: boolean; finalEnabled?: boolean; midMatchAfterSet?: number | null; midMatchSeconds?: number; attributionOnAir?: 'off' | 'auto' | 'one-click' }): Promise<any> => {
    const res = await apiClient.post<ApiResponse<any>>(`/broadcast/${matchId}/scene/auto-triggers`, body);
    return res.data.data;
  },
  getPreview: async (matchId: string): Promise<any> => {
    const res = await apiClient.get<ApiResponse<any>>(`/broadcast/${matchId}/preview`);
    return res.data.data;
  },
  setPreview: async (matchId: string, cue: { template: string | null; payload?: any; duration?: number | null; autoReturn?: boolean }): Promise<any> => {
    const res = await apiClient.post<ApiResponse<any>>(`/broadcast/${matchId}/preview`, { cue });
    return res.data.data;
  },
  take: async (matchId: string, body?: { transition?: string; duration?: number | null }): Promise<any> => {
    const res = await apiClient.post<ApiResponse<any>>(`/broadcast/${matchId}/take`, body || {});
    return res.data.data;
  },
  clear: async (matchId: string): Promise<any> => {
    const res = await apiClient.post<ApiResponse<any>>(`/broadcast/${matchId}/clear`);
    return res.data.data;
  },
  getIntroSequence: async (matchId: string): Promise<any> => (await apiClient.get<ApiResponse<any>>(`/broadcast/${matchId}/sequence`)).data.data,
  updateIntroSequence: async (matchId: string, body: any): Promise<any> => (await apiClient.put<ApiResponse<any>>(`/broadcast/${matchId}/sequence`, body)).data.data,
  startIntroSequence: async (matchId: string, body: any = {}): Promise<any> => (await apiClient.post<ApiResponse<any>>(`/broadcast/${matchId}/sequence/start`, body)).data.data,
  controlIntroSequence: async (matchId: string, body: any): Promise<any> => (await apiClient.post<ApiResponse<any>>(`/broadcast/${matchId}/sequence/control`, body)).data.data,
};

export const scorebugThemeApi = {
  list: async (competitionId?: string): Promise<any[]> => (await apiClient.get<ApiResponse<any[]>>(`/scorebug-themes${competitionId ? `?competitionId=${encodeURIComponent(competitionId)}` : ''}`)).data.data,
  get: async (id: string): Promise<any> => (await apiClient.get<ApiResponse<any>>(`/scorebug-themes/${id}`)).data.data,
  resolveForMatch: async (matchId: string): Promise<any> => (await apiClient.get<ApiResponse<any>>(`/scorebug-themes/match/${matchId}/resolved`)).data.data,
  create: async (body: any): Promise<any> => (await apiClient.post<ApiResponse<any>>('/scorebug-themes', body)).data.data,
  update: async (id: string, body: any): Promise<any> => (await apiClient.put<ApiResponse<any>>(`/scorebug-themes/${id}`, body)).data.data,
  remove: async (id: string): Promise<any> => (await apiClient.delete<ApiResponse<any>>(`/scorebug-themes/${id}`)).data.data,
  duplicate: async (id: string, name?: string): Promise<any> => (await apiClient.post<ApiResponse<any>>(`/scorebug-themes/${id}/duplicate`, { name })).data.data,
  setDefault: async (id: string): Promise<any> => (await apiClient.post<ApiResponse<any>>(`/scorebug-themes/${id}/default`)).data.data,
  applyToMatch: async (matchId: string, themeId: string | null): Promise<any> => (await apiClient.post<ApiResponse<any>>(`/scorebug-themes/match/${matchId}/apply`, { themeId })).data.data,
  applyToCompetition: async (competitionId: string, themeId: string | null): Promise<any> => (await apiClient.post<ApiResponse<any>>(`/scorebug-themes/competition/${competitionId}/apply`, { themeId })).data.data,
};
