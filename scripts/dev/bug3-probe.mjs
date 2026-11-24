// Dev probe (sanitized): observes broadcast scene auto-transition behavior over time.
// No hard-coded credentials/paths and does NOT mutate the database directly.
//
// Usage:
//   API_BASE=http://127.0.0.1:5000/api/v1 node scripts/dev/bug3-probe.mjs
//   API_BASE=... MATCH_ID=<id> node scripts/dev/bug3-probe.mjs
// Notes: if creating a new match, going LIVE and some transitions may require
// readiness/permissions depending on server configuration.
const API = process.env.API_BASE || 'http://127.0.0.1:5000/api/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, opts = {}) {
  const res = await fetch(API + path, {
    method: opts.method || 'GET',
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 300)}`);
  return json?.data;
}

const t0 = Date.now();
const log = (...a) => console.log(`+${((Date.now() - t0) / 1000).toFixed(1)}s`, ...a);
const scene = async (id) => {
  const s = await call(`/broadcast/${id}/scene`);
  return { scene: s?.scene, timerEndsAt: s?.timerEndsAt, lock: s?.lock, version: s?.version };
};

let id = process.env.MATCH_ID;
let match;
if (id) {
  match = await call(`/matches/${id}`);
  log('reusing match', id, 'status', match.status, 'bestOf', match.max_sets);
} else {
  match = await call('/matches', {
    method: 'POST',
    body: {
      team_a: 'GAMMA', team_b: 'DELTA', court: 'DEV3',
      bestOfSets: 3, setsToWin: 2, regularSetPoints: 5, finalSetPoints: 5, minPointDifference: 1,
      tournament: 'AUTO-TRANSITION PROBE', match_no: 'DEV3',
    },
  });
  id = match.id;
  log('created match', id, 'status', match.status, 'bestOf', match.max_sets);
  try { await call(`/matches/${id}/go-live`, { method: 'POST', body: {} }); log('go-live ok'); }
  catch (e) { log('go-live skipped/failed:', e.message); }
}

await call(`/broadcast/${id}/scene`, { method: 'POST', body: { scene: 'PLAY', lock: false } }).catch(() => {});
await call(`/broadcast/${id}/scene/auto-triggers`, {
  method: 'POST',
  body: { setBreakSeconds: 2, midMatchSeconds: 1, midMatchAfterSet: 1, setBreakEnabled: true, timeoutEnabled: true, finalEnabled: true },
}).catch(() => {});
log('auto triggers set; scene now', JSON.stringify(await scene(id).catch(() => null)));

for (let i = 0; i < 5; i++) await call(`/matches/${id}/point`, { method: 'POST', body: { team: 'A' } }).catch(() => {});
let state = await call(`/matches/${id}`);
log('after points: status', state.status, 'sets', state.teams?.A?.sets, '-', state.teams?.B?.sets, 'scene', JSON.stringify(await scene(id).catch(() => null)));

const observed = [];
for (let i = 0; i < 12; i++) {
  const s = await scene(id).catch(() => ({ scene: null }));
  observed.push(`${((Date.now() - t0) / 1000).toFixed(1)}s:${s.scene}`);
  await sleep(400);
}
log('scene chain:', observed.join(' -> '));
console.log('MATCH_ID=' + id);
