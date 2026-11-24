// Dev probe (sanitized): exercises team/roster/lineup setup and player-attributed actions,
// then prints match/analytics stats. No hard-coded credentials/paths.
//
// Usage:
//   API_BASE=http://127.0.0.1:5000/api/v1 node scripts/dev/bug3-player.mjs
// Requires a running server+DB and appropriate auth/session context if your environment enforces it.
const API = process.env.API_BASE || 'http://127.0.0.1:5000/api/v1';
async function call(path, opts = {}) {
  const res = await fetch(API + path, { method: opts.method || 'GET', headers: { 'content-type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 400)}`);
  return JSON.parse(text)?.data;
}
const log = (...a) => console.log(...a);

const tA = await call('/teams', { method: 'POST', body: { name: 'DEV ALPHA', shortName: 'DAL', primaryColor: '#0ea5e9' } });
const tB = await call('/teams', { method: 'POST', body: { name: 'DEV BRAVO', shortName: 'DBR', primaryColor: '#a855f7' } });
log('teams', tA.id, tB.id);

const m = await call('/matches', { method: 'POST', body: {
  homeTeamId: tA.id, awayTeamId: tB.id, court: 'DEV2', bestOfSets: 3, setsToWin: 2,
  regularSetPoints: 5, finalSetPoints: 5, minPointDifference: 1, tournament: 'PLAYER STATS PROBE', match_no: 'PS1',
} });
const id = m.id; log('match', id);

const names = ['One Player', 'Two Player', 'Three Player', 'Four Player', 'Five Player', 'Six Player'];
for (const side of ['A', 'B']) {
  await call(`/matches/${id}/roster/${side}`, { method: 'PUT', body: {
    players: names.map((n, i) => ({ name: `${side} ${n}`, jerseyNumber: i + 1, isCaptain: i === 0, isLibero: i === 5, position: i === 0 ? 'S' : i === 1 ? 'OH' : null })),
  } });
}
const rosterA = await call(`/matches/${id}/roster/A`);
const rosterB = await call(`/matches/${id}/roster/B`);
const pA = rosterA.players || rosterA;
const pB = rosterB.players || rosterB;
log('roster A ids', JSON.stringify(pA.map((p) => p.playerId || p.id)));
log('roster B ids', JSON.stringify(pB.map((p) => p.playerId || p.id)));

for (const side of ['A', 'B']) {
  await call(`/matches/${id}/lineup/${side}/1`, { method: 'PUT', body: { players: [1, 2, 3, 4, 5, 6].map((n) => ({ rotationPos: n, jerseyNumber: n })) } });
}
try {
  const live = await call(`/matches/${id}/go-live`, { method: 'POST', body: {} });
  log('go-live status', live.status);
} catch (e) { log('go-live failed', e.message); }

const idA1 = pA[0]?.playerId || pA[0]?.id;
const idA2 = pA[1]?.playerId || pA[1]?.id;
const idB1 = pB[0]?.playerId || pB[0]?.id;
const idA6 = pA[5]?.playerId || pA[5]?.id;

await call(`/matches/${id}/action`, { method: 'POST', body: { team: 'A', action: 'KILL', playerId: idA1 } }).catch(()=>{});
await call(`/matches/${id}/action`, { method: 'POST', body: { team: 'A', action: 'KILL', playerId: idA1 } }).catch(()=>{});
await call(`/matches/${id}/action`, { method: 'POST', body: { team: 'A', action: 'ACE', playerId: idA2 } }).catch(()=>{});
await call(`/matches/${id}/action`, { method: 'POST', body: { team: 'A', action: 'DIG', playerId: idA6 } }).catch(()=>{});
await call(`/matches/${id}/action`, { method: 'POST', body: { team: 'B', action: 'BLOCK', playerId: idB1 } }).catch(()=>{});
await call(`/matches/${id}/action`, { method: 'POST', body: { team: 'A', action: 'KILL', playerId: idA1 } }).catch(()=>{});
await call(`/matches/${id}/point`, { method: 'POST', body: { team: 'A' } }).catch(()=>{});
await call(`/matches/${id}/point`, { method: 'POST', body: { team: 'A' } }).catch(()=>{});

let st = await call(`/matches/${id}`);
log('status', st.status, 'score', st.teams?.A?.score, '-', st.teams?.B?.score);
log('playerStatistics:', JSON.stringify(st.playerStatistics || []));
const analytics = await call(`/matches/${id}/analytics`).catch(() => null);
if (analytics) {
  log('analytics players HOME:', JSON.stringify((analytics.match?.players?.HOME || []).map((p) => [p.name, p.points, p.attackKills, p.serviceAces, p.digs])));
  log('analytics players AWAY:', JSON.stringify((analytics.match?.players?.AWAY || []).map((p) => [p.name, p.points, p.blocks])));
}
console.log('MATCH_ID=' + id);
