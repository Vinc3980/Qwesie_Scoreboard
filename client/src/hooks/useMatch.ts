import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { matchApi } from '../services/api.js';
import { getSocket } from '../services/socket.js';
import {
  MatchState,
  MatchStatePatch,
  SOCKET_EVENTS,
  applyMatchStatePatch,
  PointMutationInput,
  ActionMutationInput,
  TimeoutMutationInput,
  SubstitutionMutationInput,
  MatchSetupInput,
  MatchInfoInput,
} from '@qwesie/shared';
import { useNotification } from '../contexts/NotificationContext.js';

export function useMatch(matchId?: string) {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const socket = getSocket();

  // Fetch current or specific match
  const query = useQuery({
    queryKey: ['match', matchId || 'current'],
    queryFn: () => (matchId ? matchApi.getMatchById(matchId) : matchApi.getCurrentMatch()),
    refetchInterval: false, // We rely on real-time Socket.IO push
  });

  // Socket.IO synchronization
  useEffect(() => {
    const activeId = query.data?.id || matchId;
    if (activeId) socket.emit(SOCKET_EVENTS.MATCH_JOIN, activeId);

    const handleState = (state: MatchState) => {
      if (!state?.id) return;
      queryClient.setQueryData(['match', matchId || 'current'], state);
      queryClient.setQueryData(['match', state.id], state);
    };
    const handlePatch = (patch: MatchStatePatch) => {
      if (!patch?.id) return;
      const keys = [['match', matchId || 'current'], ['match', patch.id]];
      for (const key of keys) {
        queryClient.setQueryData<MatchState>(key as any, (prev) => (prev ? applyMatchStatePatch(prev, patch) : prev));
      }
    };
    const handleError = (data: { message: string }) => notify.error(data.message);

    socket.on(SOCKET_EVENTS.MATCH_STATE, handleState);
    socket.on(SOCKET_EVENTS.MATCH_STATE_PATCH as any, handlePatch);
    socket.on(SOCKET_EVENTS.MATCH_ERROR, handleError);
    return () => {
      if (activeId) socket.emit(SOCKET_EVENTS.MATCH_LEAVE, activeId);
      socket.off(SOCKET_EVENTS.MATCH_STATE, handleState);
      socket.off(SOCKET_EVENTS.MATCH_STATE_PATCH as any, handlePatch);
      socket.off(SOCKET_EVENTS.MATCH_ERROR, handleError);
    };
  }, [matchId, query.data?.id, queryClient, notify, socket]);

  const activeKey = ['match', matchId || 'current'] as const;
  const snapshot = () => queryClient.getQueryData<MatchState>(activeKey as any);
  const restore = (prev?: MatchState) => { if (prev) { queryClient.setQueryData(activeKey as any, prev); queryClient.setQueryData(['match', prev.id], prev); } };

  // Mutations - hot path is optimistic for instant console feedback.
  const pointMutation = useMutation({
    mutationFn: (data: PointMutationInput) => matchApi.point(data, query.data?.id),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: activeKey as any });
      const prev = snapshot();
      if (prev) {
        const team = data.team;
        const delta = data.delta ?? 1;
        const cur = prev.current_set;
        const idx = Math.max(0, Math.min(4, cur - 1));
        const nextScores = { A: [...prev.set_scores.A], B: [...prev.set_scores.B] } as any;
        nextScores[team][idx] = Math.max(0, (nextScores[team][idx] || 0) + delta);
        const optimistic: MatchState = {
          ...prev,
          teams: {
            ...prev.teams,
            [team]: { ...prev.teams[team], score: Math.max(0, (prev.teams[team].score || 0) + delta) },
          } as any,
          set_scores: nextScores,
          server: delta > 0 ? team : prev.server,
          perf: { ...(prev.perf || {}), source: 'cache' },
        };
        queryClient.setQueryData(activeKey as any, optimistic);
      }
      return { prev };
    },
    onSuccess: (state) => { queryClient.setQueryData(activeKey as any, state); queryClient.setQueryData(['match', state.id], state); },
    onError: (err: Error, _v, ctx) => { restore(ctx?.prev); notify.error(err.message); },
  });

  const actionMutation = useMutation({
    mutationFn: (data: ActionMutationInput) => matchApi.action(data, query.data?.id),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: activeKey as any });
      const prev = snapshot();
      if (prev) {
        const scoring = ['KILL','ACE','BLOCK'].includes(String(data.action || '').toUpperCase());
        const attackErr = String(data.action || '').toUpperCase() === 'ATTACK_ERROR';
        const team = scoring ? data.team : attackErr ? (data.team === 'A' ? 'B' : 'A') : null;
        if (team) {
          const cur = prev.current_set; const idx = Math.max(0, Math.min(4, cur - 1));
          const nextScores = { A: [...prev.set_scores.A], B: [...prev.set_scores.B] } as any;
          nextScores[team][idx] = Math.max(0, (nextScores[team][idx] || 0) + 1);
          const optimistic: MatchState = { ...prev, teams: { ...prev.teams, [team]: { ...prev.teams[team], score: Math.max(0, (prev.teams[team].score || 0) + 1) } } as any, set_scores: nextScores, server: team, perf: { ...(prev.perf || {}), source: 'cache' } };
          queryClient.setQueryData(activeKey as any, optimistic);
        }
      }
      return { prev };
    },
    onSuccess: (state) => { queryClient.setQueryData(activeKey as any, state); queryClient.setQueryData(['match', state.id], state); },
    onError: (err: Error, _v, ctx) => { restore(ctx?.prev); notify.error(err.message); },
  });

  const timeoutMutation = useMutation({
    mutationFn: (data: TimeoutMutationInput) => matchApi.timeout(data, query.data?.id),
    onSuccess: (state) => {
      queryClient.setQueryData(['match', matchId || 'current'], state);
      notify.info(`Timeout called for Team ${state.server}`);
    },
    onError: (err: Error) => {
      notify.error(err.message);
    },
  });

  const subMutation = useMutation({
    mutationFn: (data: SubstitutionMutationInput) => matchApi.substitution(data, query.data?.id),
    onSuccess: (state) => {
      queryClient.setQueryData(['match', matchId || 'current'], state);
      notify.success('Substitution recorded');
    },
    onError: (err: Error) => {
      notify.error(err.message);
    },
  });

  const startSetMutation = useMutation({
    mutationFn: (data?: { setNumber?: number; servingSide?: 'A' | 'B' }) => matchApi.startSet(query.data?.id, data),
    onSuccess: (state) => {
      queryClient.setQueryData(['match', matchId || 'current'], state);
      notify.success(`Set ${state.current_set} started`);
    },
    onError: (err: Error) => {
      notify.error(err.message);
    },
  });

  const endSetMutation = useMutation({
    mutationFn: () => matchApi.endSet(query.data?.id),
    onSuccess: (state) => {
      queryClient.setQueryData(['match', matchId || 'current'], state);
      if (state.status === 'FINISHED') {
        const winnerName = state.winner ? state.teams[state.winner].name : 'Winner';
        notify.success(`Match Finished! ${winnerName} won the match!`);
      } else {
        notify.success(`Set ${state.current_set - 1} completed! Set ${state.current_set} starting.`);
      }
    },
    onError: (err: Error) => {
      notify.error(err.message);
    },
  });

  const setupMutation = useMutation({
    mutationFn: (data: MatchSetupInput) => matchApi.setup(data, query.data?.id),
    onSuccess: (state) => {
      queryClient.setQueryData(['match', matchId || 'current'], state);
      notify.success('Match setup saved');
    },
    onError: (err: Error) => {
      notify.error(err.message);
    },
  });

  const infoMutation = useMutation({
    mutationFn: (data: MatchInfoInput) => matchApi.info(data, query.data?.id),
    onSuccess: (state) => {
      queryClient.setQueryData(['match', matchId || 'current'], state);
      notify.success('Match information updated');
    },
    onError: (err: Error) => {
      notify.error(err.message);
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: 'LIVE' | 'PAUSED' | 'SUSPENDED' | 'READY' | 'SCHEDULED') => matchApi.setStatus(status, query.data?.id),
    onSuccess: (state) => {
      queryClient.setQueryData(['match', matchId || 'current'], state);
      notify.success(`Match status updated: ${statusMutation.variables || 'updated'}`);
    },
    onError: (err: Error) => {
      notify.error(err.message);
    },
  });

  return {
    match: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    mutations: {
      point: pointMutation.mutate,
      action: actionMutation.mutate,
      timeout: timeoutMutation.mutate,
      substitution: subMutation.mutate,
      startSet: startSetMutation.mutate,
      endSet: endSetMutation.mutate,
      setup: setupMutation.mutate,
      info: infoMutation.mutate,
      setStatus: statusMutation.mutate,
      isPending:
        pointMutation.isPending ||
        actionMutation.isPending ||
        timeoutMutation.isPending ||
        subMutation.isPending ||
        startSetMutation.isPending ||
        endSetMutation.isPending ||
        setupMutation.isPending ||
        infoMutation.isPending ||
        statusMutation.isPending,
    },
  };
}
