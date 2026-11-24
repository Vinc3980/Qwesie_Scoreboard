// Dev probe (sanitized): create a short match, run quick scoring/actions, and inspect
// broadcast scene transitions and final state. No hard-coded credentials/paths.
//
// Usage:
//   API_BASE=http://127.0.0.1:5000/api/v1 node scripts/dev/bug3-final.mjs
// Optional:
//   MATCH_ID=<existing-live-match-id> to reuse an existing match (no DB mutation helper used).
const API = process.env.API_BASE || 'http://127.0.0.1:5000/api/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(path, opts = {}) {
  const res = await fetch(API + path, { method: opts.method || 'GET', headers: { 'content-type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text)?.data;
}
const t0 = Date.now();
const log = (...a) => console.log(`+${((Date.now() - t0) / 1000).toFixed(1)}s`, ...a);
const scene = async (id) => { const s = await call(`/broadcast/${id}/scene`); return s?.scene; };

let id = process.env.MATCH_ID;
if (!id) {
  const m = await call('/matches', { method: 'POST', body: { team_a: 'OMEGA', team_b: 'SIGMA', court: 'DEV1', bestOfSets: 3, setsToWin: 2, regularSetPoints: 5, finalSetPoints: 5, minPointDifference: 1, tournament: 'DEV PROBE', match_no: 'DEV' } });
  id = m.id;
  log('created', id);
  try { await call(`/matches/${id}/go-live`, { method: 'POST', body: {} }); } catch (e) { log('go-live skipped/failed (needs readiness):', e.message); }
} else {
  log('reusing', id);
}

await call(`/broadcast/${id}/scene`, { method: 'POST', body: { scene: 'PLAY', lock: false } }).catch(() => {});
await call(`/broadcast/${id}/scene/auto-triggers`, { method: 'POST', body: { setBreakSeconds: 2, midMatchSeconds: 1, midMatchAfterSet: 1, setBreakEnabled: true, timeoutEnabled: true, finalEnabled: true } }).catch(() => {});

await call(`/matches/${id}/action`, { method: 'POST', body: { team: 'A', action: 'KILL' } }).catch(() => {});
await call(`/matches/${id}/action`, { method: 'POST', body: { team: 'A', action: 'ACE' } }).catch(() => {});
await call(`/matches/${id}/action`, { method: 'POST', body: { team: 'B', action: 'BLOCK' } }).catch(() => {});
for (let i = 0; i < 3; i++) await call(`/matches/${id}/point`, { method: 'POST', body: { team: 'A' } }).catch(() => {});
let st = await call(`/matches/${id}`);
log('state ->', st.status, `${st.teams?.A?.sets}-${st.teams?.B?.sets}`, 'scene', await scene(id).catch(() => null));
console.log('playerStatistics:', JSON.stringify((st.playerStatistics || []).slice(0, 3)));
console.log('setHistory:', JSON.stringify(st.setHistory));
console.log('team stats A:', JSON.stringify(st.teams?.A?.stats));

for (let i = 0; i < 5; i++) await call(`/matches/${id}/point`, { method: 'POST', body: { team: 'A' } }).catch(() => {});
st = await call(`/matches/${id}`);
log('final state -> status', st.status, 'winner', st.winner, `${st.teams?.A?.sets}-${st.teams?.B?.sets}`, 'scene', await scene(id).catch(() => null));
const chain = [];
for (let i = 0; i < 4; i++) { chain.push(await scene(id).catch(() => null)); await sleep(300); }
log('final chain:', chain.join(','));
log('FINAL SHOWN:', chain.includes('FINAL'));
console.log('MATCH_ID=' + id);
