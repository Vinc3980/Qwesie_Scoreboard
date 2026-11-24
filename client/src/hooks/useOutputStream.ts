import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_EVENTS, MatchState } from '@qwesie/shared';
import { matchApi, broadcastApi } from '../services/api.js';

type SceneState = any;
type ClientType = 'scorebug' | 'graphics' | 'console' | 'other' | 'all';

function isNewerRevision(incoming?: number, current?: number) {
  if (incoming == null) return true;
  if (current == null) return true;
  return incoming >= current; // accept equal to allow scene-only refreshes; match state protected by revision checks below
}

export function useOutputStream(opts: { matchId?: string; court?: string; debug?: boolean; clientType?: ClientType; resolveCurrent?: boolean }) {
  const { matchId, court, debug, clientType = 'other', resolveCurrent = false } = opts;
  const [match, setMatch] = useState<MatchState | null>(null);
  const [scene, setScene] = useState<SceneState | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<number>(0);
  const [lastGoodAt, setLastGoodAt] = useState<number>(0);
  const [lastSnapshotAt, setLastSnapshotAt] = useState<number>(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{ id: string | null; status: string | null }>({ id: null, status: null });
  const revRef = useRef<number>(-1);
  const socketRef = useRef<Socket | null>(null);
  const pollRef = useRef<number | null>(null);
  const backoffRef = useRef(1000);
  const heartbeatRef = useRef(0);

  // No explicit match (e.g. /overlay/scorebug): resolve the live match, else the
  // next scheduled match, else the latest finished match.
  useEffect(() => {
    if (matchId || !resolveCurrent) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await matchApi.getActiveMatch();
        if (alive) setResolved({ id: r?.matchId || null, status: r?.status || null });
      } catch (e: any) {
        if (alive) setLastError(e?.message || 'Could not resolve active match');
      }
    };
    load();
    const t = window.setInterval(load, 4000);
    return () => { alive = false; window.clearInterval(t); };
  }, [matchId, resolveCurrent, court]);

  const activeMatchId = matchId || (resolveCurrent ? resolved.id || undefined : undefined);

  const live = useMemo(() => {
    if (!connected) return false;
    if (!lastHeartbeatAt) return false;
    return Date.now() - lastHeartbeatAt < 12000; // heartbeat every 5s
  }, [connected, lastHeartbeatAt]);

  useEffect(() => {
    let cancelled = false;
    const socket = io({ autoConnect: false, reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000, reconnectionDelayMax: 8000, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    const applyMatch = (next: MatchState) => {
      if (!next) return;
      const nextRev = (next as any).revision ?? 0;
      if (revRef.current > nextRev && activeMatchId && next.id === activeMatchId) return;
      revRef.current = Math.max(revRef.current, nextRev);
      setMatch(next);
      setLastGoodAt(Date.now());
      setLastSnapshotAt(Date.now());
      setLastError(null);
    };
    const applyScene = (next: any) => {
      if (!next) return;
      setScene((prev: any) => {
        if (prev && next.version != null && prev.version != null && next.version < prev.version) return prev;
        return next;
      });
      setLastGoodAt(Date.now());
      try {
        if (!cancelled && activeMatchId && (clientType === 'scorebug' || clientType === 'graphics' || clientType === 'all')) {
          socket.emit(SOCKET_EVENTS.OUTPUT_ACK as any, { matchId: activeMatchId, court: court || null, template: next?.template ?? (next?.scene === 'PLAY' ? null : next?.scene) ?? null, version: next?.version ?? 0 });
        }
      } catch {}
    };

    const fetchFallback = async () => {
      if (!activeMatchId) return;
      try {
        const [m, s] = await Promise.all([matchApi.getMatchById(activeMatchId), broadcastApi.getGraphicState(activeMatchId).catch(() => null)]);
        if (cancelled) return;
        applyMatch(m);
        // scene endpoint preferred
        try {
          const res = await fetch(`/api/v1/broadcast/${activeMatchId}/scene`, { credentials: 'include' });
          if (res.ok) { const j = await res.json(); if (j?.data) applyScene(j.data); else if (s) applyScene(s); }
          else if (s) applyScene(s);
        } catch { if (s) applyScene(s); }
      } catch (e: any) {
        if (!cancelled) setLastError(e?.message || 'Snapshot fetch failed');
      }
    };

    const onConnect = async () => {
      if (cancelled) return;
      setConnected(true);
      setLastHeartbeatAt(Date.now());
      heartbeatRef.current = Date.now();
      backoffRef.current = 1000;
      // Join with an explicit client type so the Outputs panel can count us.
      if (activeMatchId) socket.emit(SOCKET_EVENTS.MATCH_JOIN, { matchId: activeMatchId, clientType });
      await fetchFallback(); // authoritative snapshot on (re)connect
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', (e: any) => { if (!cancelled) { setLastError(e?.message || 'Socket connection failed'); setConnected(false); } });
    socket.on('disconnect', () => { if (!cancelled) setConnected(false); });
    socket.io.on('reconnect_attempt', (n) => { backoffRef.current = Math.min(8000, 1000 * Math.max(1, n)); });
    socket.on(SOCKET_EVENTS.HEARTBEAT as any, () => { if (!cancelled) { heartbeatRef.current = Date.now(); setLastHeartbeatAt(Date.now()); } });
    socket.on(SOCKET_EVENTS.MATCH_SNAPSHOT as any, (s: MatchState) => { if (!cancelled && (!activeMatchId || s.id === activeMatchId)) applyMatch(s); });
    socket.on(SOCKET_EVENTS.MATCH_STATE as any, (s: MatchState) => { if (!cancelled && (!activeMatchId || s.id === activeMatchId)) applyMatch(s); });
    socket.on(SOCKET_EVENTS.OUTPUT_SCENE_STATE as any, (s: any) => {
      if (cancelled) return;
      if (s?.matchId && activeMatchId && s.matchId !== activeMatchId) return;
      applyScene(s);
      try {
        if (activeMatchId && (clientType === 'scorebug' || clientType === 'graphics' || clientType === 'all')) {
          socket.emit(SOCKET_EVENTS.OUTPUT_ACK as any, { matchId: activeMatchId, court: court || null, template: s?.template ?? (s?.scene === 'PLAY' ? null : s?.scene) ?? null, version: s?.version ?? 0 });
        }
      } catch {}
    });
    socket.on(SOCKET_EVENTS.SCOREBUG_SETTINGS as any, (s: any) => { if (!cancelled) setScene((prev: any) => ({ ...(prev || {}), scorebug: s?.scorebug || s })); });

    socket.connect();
    fetchFallback();

    pollRef.current = window.setInterval(() => {
      // polling fallback when socket unhealthy or heartbeat stale
      const heartbeatFresh = Date.now() - heartbeatRef.current < 12000;
      if (!socket.connected || !heartbeatFresh) fetchFallback();
    }, 5000);

    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
      try { if (activeMatchId) socket.emit(SOCKET_EVENTS.MATCH_LEAVE, activeMatchId); } catch {}
      socket.removeAllListeners();
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatchId, court, clientType]);

  // update liveness view over time
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick(x => x + 1), 1000); return () => window.clearInterval(t); }, []);

  return {
    match, // last good authoritative match state (never cleared on disconnect)
    scene, // output scene / scorebug settings
    matchId: activeMatchId,
    resolvedStatus: resolved.status,
    connected,
    live,
    lastGoodAt,
    lastSnapshotAt,
    lastError,
    showDebugIndicator: !!debug,
    revision: Math.max(revRef.current, 0),
  };
}
