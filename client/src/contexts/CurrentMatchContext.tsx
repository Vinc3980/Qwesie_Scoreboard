import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { matchApi } from '../services/api.js';

const STORAGE_KEY = 'qwesie.currentMatchId';
const EXPLICIT_KEY = 'qwesie.currentMatchId.explicit';
const LIVE_SET = new Set(['LIVE']);
const PRE_MATCH = new Set(['SCHEDULED', 'READY']);
const IN_PLAY_FALLBACK = new Set(['PAUSED', 'BETWEEN_SETS', 'SUSPENDED']);

export type CurrentMatch = any;

function loadStored(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function loadExplicit(): boolean {
  try { return localStorage.getItem(EXPLICIT_KEY) === '1'; } catch { return false; }
}
function storeId(id: string | null, explicit = false) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id); else localStorage.removeItem(STORAGE_KEY);
    if (explicit) localStorage.setItem(EXPLICIT_KEY, '1'); else localStorage.removeItem(EXPLICIT_KEY);
  } catch {}
}

function pickDefaultMatch(matches: any[]): any | null {
  if (!Array.isArray(matches) || matches.length === 0) return null;
  const byStatus = (set: Set<string>) => matches.filter(m => set.has(String(m.status || '').toUpperCase()));
  const live = byStatus(LIVE_SET);
  const liveOnCourt = live.find(m => m.court);
  if (liveOnCourt) return liveOnCourt;
  if (live[0]) return live[0];
  const pre = byStatus(PRE_MATCH);
  pre.sort((a, b) => {
    const sa = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
    const sb = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ca - cb;
  });
  if (pre[0]) return pre[0];
  const fallback = byStatus(IN_PLAY_FALLBACK);
  if (fallback[0]) return fallback[0];
  return matches[0] || null;
}

function getIdFromLocation(pathname: string, search: string): string | null {
  const live = pathname.match(/^\/live(?:-classic)?\/([^/]+)/);
  if (live?.[1]) return live[1];
  const setup = pathname.match(/^\/matches\/([^/]+)\/setup/);
  if (setup?.[1]) return setup[1];
  try {
    const sp = new URLSearchParams(search);
    const q = sp.get('match');
    if (q) return q;
  } catch {}
  return null;
}

interface CurrentMatchContextValue {
  currentMatchId: string | null;
  currentMatch: any | null;
  setCurrentMatchId: (id: string | null, opts?: { navigate?: boolean; explicit?: boolean }) => void;
  matches: any[];
  isLoading: boolean;
}

const Ctx = createContext<CurrentMatchContextValue | null>(null);

const MATCH_SCOPED_KEYS = new Set(['match','broadcast-graphic','broadcast-scene','readiness','roster','lineup','analytics','report','match-analytics','match-report']);

export const CurrentMatchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: matches = [], isLoading } = useQuery({ queryKey: ['matches'], queryFn: matchApi.listMatches, refetchInterval: 5000 });
  const initialFromUrl = getIdFromLocation(window.location.pathname, window.location.search);
  const [currentMatchId, setIdState] = useState<string | null>(() => initialFromUrl || loadStored());
  const explicitRef = useRef<boolean>(!!initialFromUrl || loadExplicit());
  const prevIdRef = useRef<string | null>(currentMatchId);

  useEffect(() => {
    const fromUrl = getIdFromLocation(location.pathname, location.search);
    if (fromUrl && fromUrl !== currentMatchId) {
      explicitRef.current = true;
      setIdState(fromUrl);
      storeId(fromUrl, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  useEffect(() => {
    const prev = prevIdRef.current;
    if (prev && prev !== currentMatchId) {
      qc.removeQueries({
        predicate: (q) => {
          const k = q.queryKey;
          if (!Array.isArray(k) || k.length < 2) return false;
          const head = String(k[0]);
          if (!MATCH_SCOPED_KEYS.has(head)) return false;
          const id = k[1];
          return typeof id === 'string' && id !== 'current' && id !== currentMatchId;
        },
      });
    }
    prevIdRef.current = currentMatchId;
  }, [currentMatchId, qc]);

  useEffect(() => {
    if (isLoading) return;
    const list = Array.isArray(matches) ? matches : [];
    if (list.length === 0) return;
    const exists = currentMatchId && list.some((m: any) => m.id === currentMatchId);
    if (exists) return;
    // Explicit selection is sticky while the match exists; if missing, fall back.
    explicitRef.current = false;
    const def = pickDefaultMatch(list);
    if (def?.id) {
      setIdState(def.id);
      storeId(def.id, false);
    }
  }, [matches, isLoading, currentMatchId]);

  const setCurrentMatchId = useCallback((id: string | null, opts?: { navigate?: boolean; explicit?: boolean }) => {
    const explicit = opts?.explicit !== false; // user-initiated selection is explicit by default
    explicitRef.current = !!id && explicit;
    setIdState(id);
    storeId(id, !!id && explicit);
    if (opts?.navigate) {
      if (/^\/live(?:-classic)?(\/|$)/.test(location.pathname)) {
        const classic = location.pathname.startsWith('/live-classic');
        if (id) navigate(`${classic ? '/live-classic' : '/live'}/${id}`, { replace: false });
        else navigate(classic ? '/live-classic' : '/live', { replace: false });
        return;
      }
    }
  }, [location.pathname, navigate]);

  const currentMatch = useMemo(() => {
    const list = Array.isArray(matches) ? matches : [];
    return list.find((m: any) => m.id === currentMatchId) || null;
  }, [matches, currentMatchId]);

  const value = useMemo(() => ({ currentMatchId, currentMatch, setCurrentMatchId, matches: Array.isArray(matches) ? matches : [], isLoading }), [currentMatchId, currentMatch, setCurrentMatchId, matches, isLoading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useCurrentMatch() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCurrentMatch must be used within CurrentMatchProvider');
  return v;
}
