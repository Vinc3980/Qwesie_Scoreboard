import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { authApi, flushAuthQueue, onAuthRequired } from '../services/api.js';

export type UserRole = 'ADMIN' | 'SCORER' | 'VIEWER';

export interface AppUser {
  id: string;
  username?: string;
  displayName?: string;
  name: string;
  role: UserRole;
  mustChangePassword?: boolean;
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  needsBootstrap: boolean | null;
  bootstrapInfo: { needsBootstrap: boolean; setupTokenRequired?: boolean } | null;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<any>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  bootstrap: (body: { username: string; password: string; displayName: string; email?: string }) => Promise<any>;
  refresh: () => Promise<void>;
  setUser: (u: AppUser | null) => void;
  canAccess: (section: string) => boolean;
  hasRole: (...roles: UserRole[]) => boolean;
  authRequired: boolean;
  clearAuthRequired: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const roleAccess: Record<UserRole, string[]> = {
  ADMIN: ['overview','matches','live','design','teams','players','competitions','statistics','broadcast','archive','reports','settings','users'],
  SCORER: ['overview','matches','live','design','teams','players','competitions','statistics','broadcast','archive'],
  VIEWER: ['overview','matches','statistics','broadcast','archive','reports'],
};

function toAppUser(u: any): AppUser {
  return { id: String(u.id), username: u.username, displayName: u.displayName, name: u.displayName || u.username || u.id, role: (u.role || 'VIEWER') as UserRole, mustChangePassword: !!u.mustChangePassword };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);
  const [bootstrapInfo, setBootstrapInfo] = useState<{ needsBootstrap: boolean; setupTokenRequired?: boolean } | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const setUser = useCallback((u: AppUser | null) => setUserState(u), []);

  const refresh = useCallback(async () => {
    try {
      const [meRes, bsRes] = await Promise.allSettled([authApi.me(), authApi.bootstrapStatus()]);
      if (bsRes.status === 'fulfilled') {
        setNeedsBootstrap(!!bsRes.value?.needsBootstrap);
        setBootstrapInfo(bsRes.value || null);
      }
      if (meRes.status === 'fulfilled' && meRes.value?.user) {
        setUserState(toAppUser(meRes.value.user));
      } else {
        setUserState(null);
      }
    } catch {
      setUserState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    onAuthRequired(() => {
      setAuthRequired(true);
      setUserState(null);
    });
  }, []);

  const login = useCallback(async (username: string, password: string, rememberMe?: boolean) => {
    const res = await authApi.login(username, password, rememberMe);
    if (res?.user) setUserState(toAppUser(res.user));
    setAuthRequired(false);
    await flushAuthQueue();
    return res;
  }, []);

  const bootstrap = useCallback(async (body: { username: string; password: string; displayName: string; email?: string }) => {
    const res = await authApi.bootstrap(body);
    if (res?.user) setUserState(toAppUser(res.user));
    setNeedsBootstrap(false);
    setBootstrapInfo({ needsBootstrap: false, setupTokenRequired: false });
    setAuthRequired(false);
    await flushAuthQueue();
    return res;
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch {}
    setUserState(null);
    setAuthRequired(false);
  }, []);

  const logoutAll = useCallback(async () => {
    try { await authApi.logoutAll(); } catch {}
    setUserState(null);
    setAuthRequired(false);
  }, []);

  const canAccess = useCallback((section: string) => {
    if (!user) return false;
    return (roleAccess[user.role] || []).includes(section);
  }, [user]);

  const hasRole = useCallback((...roles: UserRole[]) => !!user && roles.includes(user.role), [user]);

  const value = useMemo<AuthContextValue>(() => ({
    user, loading, needsBootstrap, bootstrapInfo, login, logout, logoutAll, bootstrap, refresh, setUser, canAccess, hasRole,
    authRequired, clearAuthRequired: () => setAuthRequired(false),
  }), [user, loading, needsBootstrap, bootstrapInfo, login, logout, logoutAll, bootstrap, refresh, setUser, canAccess, hasRole, authRequired]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
