import { MatchState } from '@qwesie/shared';

/**
 * Per-match in-memory state cache.
 *
 * Reads (socket join, GET /matches/:id, OBS snapshot) are served from here when
 * fresh. Scoring writes update the cached object with a compact patch and then
 * schedule a debounced authoritative rebuild, so the request path never waits
 * for the heavy state query.
 *
 * The app is a single Render instance by design; a horizontal scale-out would
 * need Redis (Socket.IO adapter + shared cache).
 */

type Entry = { state: MatchState; at: number };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<MatchState>>();
const refreshTimers = new Map<string, NodeJS.Timeout>();
// Bumped on every invalidation so a read that started before a write cannot
// repopulate the cache with pre-commit data when it finally resolves.
const versions = new Map<string, number>();

const FRESH_MS = 30_000;
const PATCHABLE_MS = 10 * 60_000;

function versionOf(matchId: string): number {
  return versions.get(matchId) || 0;
}

export function getCachedMatchState(matchId: string): MatchState | null {
  const hit = cache.get(matchId);
  if (!hit) return null;
  if (Date.now() - hit.at > FRESH_MS) return null;
  return hit.state;
}

/** Returns a cached state even if older than the fresh window (used for patches). */
export function peekCachedMatchState(matchId: string): MatchState | null {
  const hit = cache.get(matchId);
  if (!hit) return null;
  if (Date.now() - hit.at > PATCHABLE_MS) return null;
  return hit.state;
}

export function setCachedMatchState(state: MatchState): void {
  if (!state?.id) return;
  const prev = cache.get(state.id);
  // Never let an older snapshot overwrite a newer one (e.g. a slow read that
  // resolves after a scoring patch already bumped the revision).
  if (prev && Number(prev.state.revision || 0) > Number(state.revision || 0)) return;
  cache.set(state.id, { state, at: Date.now() });
}

export function invalidateMatchState(matchId: string): void {
  cache.delete(matchId);
  inflight.delete(matchId);
  versions.set(matchId, versionOf(matchId) + 1);
}

export function updateCachedMatchState(
  matchId: string,
  updater: (state: MatchState) => MatchState | null,
): MatchState | null {
  const current = peekCachedMatchState(matchId);
  if (!current) return null;
  const next = updater(current);
  if (next) setCachedMatchState(next);
  return next;
}

/**
 * Loads through the cache with in-flight de-duplication: a burst of socket
 * joins or console refreshes for one match produces a single DB read.
 */
export async function getOrLoadMatchState(
  matchId: string,
  loader: () => Promise<MatchState>,
  opts?: { maxAgeMs?: number },
): Promise<MatchState> {
  const maxAge = opts?.maxAgeMs ?? FRESH_MS;
  const hit = cache.get(matchId);
  if (hit && Date.now() - hit.at <= maxAge) return hit.state;

  const existing = inflight.get(matchId);
  if (existing) return existing;

  const version = versionOf(matchId);
  const promise = loader()
    .then((state) => {
      // Drop the result if the match was written to while we were reading.
      if (versionOf(matchId) === version) setCachedMatchState(state);
      return state;
    })
    .finally(() => {
      if (inflight.get(matchId) === promise) inflight.delete(matchId);
    });
  inflight.set(matchId, promise);
  return promise;
}

/**
 * Debounced authoritative rebuild after a write. Multiple points in a row
 * collapse into one full-state query and one full-state broadcast.
 */
export function scheduleMatchStateRefresh(
  matchId: string,
  loader: () => Promise<MatchState>,
  onFresh: (state: MatchState) => void,
  delayMs = 750,
): void {
  const existing = refreshTimers.get(matchId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    refreshTimers.delete(matchId);
    const version = versionOf(matchId);
    void loader()
      .then((state) => {
        if (versionOf(matchId) !== version) return;
        setCachedMatchState(state);
        onFresh(state);
      })
      .catch(() => {
        /* keep the patched cache; next read will retry */
      });
  }, delayMs);
  timer.unref?.();
  refreshTimers.set(matchId, timer);
}

export function clearMatchStateCache(): void {
  for (const timer of refreshTimers.values()) clearTimeout(timer);
  refreshTimers.clear();
  inflight.clear();
  cache.clear();
  versions.clear();
}

export function matchStateCacheStats() {
  return { entries: cache.size, inflight: inflight.size, pendingRefreshes: refreshTimers.size };
}
