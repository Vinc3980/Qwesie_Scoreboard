import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { MatchState, MatchStatePatch, SOCKET_EVENTS } from '@qwesie/shared';
import { logger } from '../utils/logger.js';
import { prisma } from '../config/database.js';
import { MatchService } from '../services/match.service.js';
import { getOutputPreviewState, getOutputSceneState } from '../services/broadcast.service.js';
import { normalizeCourt } from '../utils/court.js';

let io: SocketIOServer | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
const clientTypes = new Map<string, 'scorebug' | 'graphics' | 'console' | 'other' | 'all'>();
type OutputAck = { socketId: string; clientType: 'scorebug'|'graphics'|'all'|'other'; matchId: string; court?: string | null; template: string | null; version: number; ts: string };
const outputAcks = new Map<string, OutputAck>();

function roomForMatch(matchId: string) { return `match:${matchId}`; }
function roomForCourt(court: string) {
  const n = normalizeCourt(court);
  return `court:${n || String(court || '').trim().toLowerCase().replace(/[\s-]+/g, '')}`;
}

function normalizeClientType(v: any): 'scorebug' | 'graphics' | 'console' | 'other' | 'all' {
  const s = String(v || '').toLowerCase();
  if (s === 'all' || s.includes('all-in-one') || s.includes('allinone')) return 'all';
  if (s.includes('scorebug')) return 'scorebug';
  if (s.includes('graphic') || s.includes('broadcast') || s.includes('output')) return 'graphics';
  if (s.includes('console') || s.includes('live') || s.includes('control') || s.includes('operator') || s.includes('scorer')) return 'console';
  return 'other';
}

export function initSocketServer(httpServer: HttpServer, corsOrigin: string): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    // Single Render instance: websocket is preferred, long-polling is the
    // fallback for restrictive networks. No Redis adapter is required because
    // the app is intentionally one process; add @socket.io/redis-adapter before
    // scaling horizontally.
    transports: ['websocket', 'polling'],
    allowUpgrades: true,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 1_000_000,
    perMessageDeflate: { threshold: 2_048 },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60_000,
      skipMiddlewares: true,
    },
    cors: {
      origin: corsOrigin === '*' ? '*' : corsOrigin.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket: Socket) => {
    logger.info(`Socket client connected: ${socket.id}`);
    clientTypes.set(socket.id, 'other');

    socket.on(SOCKET_EVENTS.MATCH_JOIN, async (payload: any) => {
      const matchId = typeof payload === 'string' ? payload : payload?.matchId;
      const type = typeof payload === 'object' ? payload?.clientType || payload?.type : undefined;
      if (type) clientTypes.set(socket.id, normalizeClientType(type));
      if (!matchId) return;
      const room = roomForMatch(matchId);
      socket.join(room);
      try {
        const match = await prisma.match.findUnique({ where: { id: matchId }, select: { id: true, court: true } });
        if (match?.court) socket.join(roomForCourt(match.court));
        const state = await MatchService.getMatchState(matchId);
        socket.emit(SOCKET_EVENTS.MATCH_SNAPSHOT, state);
        socket.emit(SOCKET_EVENTS.MATCH_STATE, state);
        const scene = await getOutputSceneState(matchId);
        socket.emit(SOCKET_EVENTS.OUTPUT_SCENE_STATE, scene);
        socket.emit(SOCKET_EVENTS.SCOREBUG_SETTINGS, scene.scorebug);
        try {
          const t = clientTypes.get(socket.id) || 'other';
          if (t !== 'scorebug' && t !== 'graphics' && t !== 'all') {
            const preview = await getOutputPreviewState(matchId);
            socket.emit((SOCKET_EVENTS as any).OUTPUT_PREVIEW_STATE || 'output:preview:state', preview);
          }
          if (t === 'console' || t === 'other') {
            socket.emit(SOCKET_EVENTS.OUTPUT_ACK_STATE, { matchId, court: match?.court || null, acks: getOutputAcksForMatch(matchId), ts: new Date().toISOString() });
          }
        } catch {}
      } catch (e) {
        socket.emit(SOCKET_EVENTS.MATCH_ERROR, { message: 'Failed to load match snapshot' });
      }
    });

    socket.on(SOCKET_EVENTS.MATCH_LEAVE, async (payload: any) => {
      const matchId = typeof payload === 'string' ? payload : payload?.matchId;
      if (!matchId) return;
      socket.leave(roomForMatch(matchId));
      for (const r of socket.rooms) if (String(r).startsWith('court:')) socket.leave(r);
    });

    socket.on(SOCKET_EVENTS.MATCH_JOIN_COURT, (courtName: string) => {
      if (courtName) socket.join(roomForCourt(courtName));
    });

    socket.on(SOCKET_EVENTS.OUTPUT_ACK, (payload: any) => {
      const matchId = String(payload?.matchId || '').trim();
      if (!matchId) return;
      const t = clientTypes.get(socket.id) || 'other';
      if (t !== 'scorebug' && t !== 'graphics' && t !== 'all') return;
      const ack: OutputAck = {
        socketId: socket.id,
        clientType: t as any,
        matchId,
        court: payload?.court ? String(payload.court) : null,
        template: payload?.template ?? null,
        version: Number(payload?.version || 0),
        ts: new Date().toISOString(),
      };
      outputAcks.set(socket.id, ack);
      broadcastOutputAckState(matchId, ack.court || null);
    });

    socket.on('disconnect', (reason) => {
      const ack = outputAcks.get(socket.id);
      clientTypes.delete(socket.id);
      outputAcks.delete(socket.id);
      if (ack) broadcastOutputAckState(ack.matchId, ack.court || null);
      logger.debug(`Socket client disconnected: ${socket.id} (${reason})`);
    });
  });

  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      if (!io) return;
      const ts = new Date().toISOString();
      io.emit(SOCKET_EVENTS.HEARTBEAT, { ts, serverTime: ts, connected: io.engine.clientsCount });
    }, 5000);
  }

  return io;
}

/** Close Socket.IO (and its heartbeat) during graceful shutdown. */
export async function closeSocketServer(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  const current = io;
  io = null;
  if (!current) return;
  await new Promise<void>((resolve) => {
    current.close(() => resolve());
  });
}

export function getSocketServer(): SocketIOServer {
  if (!io) throw new Error('Socket.IO has not been initialized yet');
  return io;
}

export function getConnectedClientsInfo() {
  const byType = { scorebug: 0, graphics: 0, console: 0, other: 0 } as Record<'scorebug'|'graphics'|'console'|'other', number>;
  for (const t of clientTypes.values()) {
    if (t === 'all') { byType.scorebug++; byType.graphics++; }
    else byType[t] = (byType[t] || 0) + 1;
  }
  const total = clientTypes.size;
  return { total, byType };
}

export async function broadcastMatchState(state: MatchState): Promise<void> {
  if (!io) return;
  const payload = { ...state, perf: { ...(state.perf || {}), emittedAt: new Date().toISOString() } };
  const matchRoom = roomForMatch(state.id);
  io.to(matchRoom).emit(SOCKET_EVENTS.MATCH_STATE, payload);
  if (state.court) io.to(roomForCourt(state.court)).emit(SOCKET_EVENTS.MATCH_STATE, payload);
}

export async function broadcastMatchSnapshot(state: MatchState): Promise<void> {
  if (!io) return;
  const payload = { ...state, perf: { ...(state.perf || {}), emittedAt: new Date().toISOString() } };
  const matchRoom = roomForMatch(state.id);
  io.to(matchRoom).emit(SOCKET_EVENTS.MATCH_SNAPSHOT, payload);
  if (state.court) io.to(roomForCourt(state.court)).emit(SOCKET_EVENTS.MATCH_SNAPSHOT, payload);
}

/**
 * Emits only the changed score/revision fields. Consoles and OBS clients apply
 * it to the last full state they hold, so a point does not need a full state
 * rebuild on the wire.
 */
export function broadcastMatchStatePatch(patch: MatchStatePatch, court?: string | null): void {
  if (!io) return;
  io.to(roomForMatch(patch.id)).emit(SOCKET_EVENTS.MATCH_STATE_PATCH, patch);
  if (court) io.to(roomForCourt(court)).emit(SOCKET_EVENTS.MATCH_STATE_PATCH, patch);
}

export function broadcastMatchError(matchId: string, error: string): void {
  if (!io) return;
  io.to(roomForMatch(matchId)).emit(SOCKET_EVENTS.MATCH_ERROR, { message: error });
}

export function broadcastOutputSceneState(matchId: string, scene: any, court?: string | null): void {
  if (!io) return;
  io.to(roomForMatch(matchId)).emit(SOCKET_EVENTS.OUTPUT_SCENE_STATE, scene);
  io.to(roomForMatch(matchId)).emit(SOCKET_EVENTS.SCOREBUG_SETTINGS, scene?.scorebug || scene);
  if (court) {
    io.to(roomForCourt(court)).emit(SOCKET_EVENTS.OUTPUT_SCENE_STATE, scene);
    io.to(roomForCourt(court)).emit(SOCKET_EVENTS.SCOREBUG_SETTINGS, scene?.scorebug || scene);
  }
}

export function broadcastActiveGraphicState(matchId: string, graphic: any, court?: string | null): void {
  if (!io) return;
  io.to(roomForMatch(matchId)).emit(SOCKET_EVENTS.BROADCAST_GRAPHIC_STATE, graphic);
  if (court) io.to(roomForCourt(court)).emit(SOCKET_EVENTS.BROADCAST_GRAPHIC_STATE, graphic);
}

export function broadcastOutputPreviewState(matchId: string, preview: any): void {
  if (!io) return;
  const event = (SOCKET_EVENTS as any).OUTPUT_PREVIEW_STATE || 'output:preview:state';
  // Preview is console-only state: never emit to OBS output clients (scorebug/graphics/all).
  const room = io.sockets.adapter.rooms.get(roomForMatch(matchId));
  if (!room) return;
  for (const sid of room) {
    const t = clientTypes.get(sid) || 'other';
    if (t === 'scorebug' || t === 'graphics' || t === 'all') continue;
    io.to(sid).emit(event, preview);
  }
}

export function broadcastGraphicState(matchId: string, state: any): void {
  broadcastOutputSceneState(matchId, state, state?.court);
}

export function getOutputAcksForMatch(matchId: string) {
  const acks = Array.from(outputAcks.values()).filter(a => a.matchId === matchId);
  // Also include connected output sockets in the match room with no ack yet
  if (!io) return acks;
  const room = io.sockets.adapter.rooms.get(roomForMatch(matchId));
  if (!room) return acks;
  for (const sid of room) {
    if (outputAcks.has(sid)) continue;
    const t = clientTypes.get(sid) || 'other';
    if (t !== 'scorebug' && t !== 'graphics' && t !== 'all') continue;
    acks.push({ socketId: sid, clientType: t as any, matchId, court: null, template: null, version: 0, ts: new Date().toISOString() });
  }
  return acks;
}

export function broadcastOutputAckState(matchId: string, court?: string | null): void {
  if (!io) return;
  const payload = { matchId, court: court || null, acks: getOutputAcksForMatch(matchId), ts: new Date().toISOString() };
  io.to(roomForMatch(matchId)).emit(SOCKET_EVENTS.OUTPUT_ACK_STATE, payload);
  if (court) io.to(roomForCourt(court)).emit(SOCKET_EVENTS.OUTPUT_ACK_STATE, payload);
}

export function broadcastCourtActiveChanged(court: string, payload: any): void {
  if (!io) return;
  const room = roomForCourt(court);
  io.to(room).emit(SOCKET_EVENTS.COURT_ACTIVE_CHANGED, payload);
  // Also emit to all sockets to be safe? No, court room is enough; outputs should join court room.
  io.emit(SOCKET_EVENTS.COURT_ACTIVE_CHANGED, payload); // lightweight global notify for consoles not in court room
}
