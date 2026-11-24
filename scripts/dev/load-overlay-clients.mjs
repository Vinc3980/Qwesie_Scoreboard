#!/usr/bin/env node
/**
 * Stage G load check: simulate N overlay (scorebug/graphics) Socket.IO clients
 * connected to a match while scoring.
 *
 * Usage:
 *   node scripts/load-overlay-clients.mjs --url http://<host>:5000 --match <matchId> --clients 10 --duration 30
 *
 * Notes:
 * - Requires socket.io-client to be resolvable (installed in client/ or root node_modules).
 * - Does NOT perform scoring; run against an active match while an operator scores, or combine
 *   with your own scoring driver. Reports connection stability and received events.
 * - Not executed automatically in CI in this repo; run manually in a staging/LAN environment.
 */
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i === -1) return def;
  const a = args[i];
  if (a.includes('=')) return a.split('=').slice(1).join('=');
  return args[i + 1] ?? def;
}

const url = getArg('url', process.env.BASE_URL || 'http://localhost:5000');
const matchId = getArg('match', process.env.BASE_MATCH_ID || '');
const count = Number(getArg('clients', '10'));
const durationSec = Number(getArg('duration', '30'));

if (!matchId) {
  console.error('Missing --match <matchId> (or BASE_MATCH_ID).');
  process.exit(2);
}

let io;
try {
  // prefer client workspace dependency
  const req = createRequire(new URL('../client/package.json', import.meta.url));
  ({ io } = req('socket.io-client'));
} catch {
  try {
    ({ io } = await import('socket.io-client'));
  } catch (e) {
    console.error('socket.io-client not found. Install dependencies (e.g. npm install in client/) and re-run.');
    console.error(String(e?.message || e));
    process.exit(2);
  }
}

const stats = { connected: 0, disconnected: 0, connectErrors: 0, matchUpdates: 0, sceneUpdates: 0 };
const sockets = [];

console.log(`[load-check] url=${url} match=${matchId} clients=${count} duration=${durationSec}s`);

for (let i = 0; i < count; i++) {
  const clientType = i % 2 === 0 ? 'scorebug' : 'graphics';
  const socket = io(url, { transports: ['websocket', 'polling'], reconnection: true, timeout: 10000, query: { clientType } });
  sockets.push(socket);

  socket.on('connect', () => {
    stats.connected++;
    socket.emit('match:join', matchId);
  });
  socket.on('disconnect', () => { stats.disconnected++; });
  socket.on('connect_error', () => { stats.connectErrors++; });
  socket.on('match:update', () => { stats.matchUpdates++; });
  socket.on('match:state', () => { stats.matchUpdates++; });
  socket.on('output:scene', () => { stats.sceneUpdates++; });
  socket.on('broadcast:scene', () => { stats.sceneUpdates++; });
}

const started = Date.now();
const interval = setInterval(() => {
  const up = sockets.filter(s => s.connected).length;
  process.stdout.write(`\r[load-check] t=${Math.floor((Date.now()-started)/1000)}s connected=${up}/${count} updates=${stats.matchUpdates} scene=${stats.sceneUpdates} errors=${stats.connectErrors}   `);
}, 1000);

setTimeout(() => {
  clearInterval(interval);
  const up = sockets.filter(s => s.connected).length;
  console.log(`\n[load-check] done. connectedNow=${up}/${count} totalConnects=${stats.connected} disconnects=${stats.disconnected} connectErrors=${stats.connectErrors} matchUpdates=${stats.matchUpdates} sceneUpdates=${stats.sceneUpdates}`);
  for (const s of sockets) { try { s.close(); } catch {} }
  const pass = up === count && stats.connectErrors === 0;
  console.log(`[load-check] RESULT: ${pass ? 'PASS (connections stable during window)' : 'CHECK (not all clients stable)'} (manual verification required while scoring)`);
  process.exit(pass ? 0 : 1);
}, durationSec * 1000);
