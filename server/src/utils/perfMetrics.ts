/**
 * Lightweight in-process performance metrics.
 *
 * Keeps a bounded reservoir of request durations per normalised route so the
 * p50/p95 can be read from /api/v1/health/metrics without an external APM.
 * Intended for diagnostics and for the docs/perf benchmarks; it is not a
 * substitute for a real observability stack.
 */

export type RouteMetric = {
  route: string;
  method: string;
  count: number;
  errors: number;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  max: number;
};

type Bucket = {
  durations: number[];
  count: number;
  errors: number;
  max: number;
  total: number;
};

const MAX_SAMPLES_PER_ROUTE = 2000;
const buckets = new Map<string, Bucket>();
let startedAt = Date.now();

function bucketFor(key: string): Bucket {
  let b = buckets.get(key);
  if (!b) {
    b = { durations: [], count: 0, errors: 0, max: 0, total: 0 };
    buckets.set(key, b);
  }
  return b;
}

/** Collapse ids/uuids so `/matches/abc123/point` and `/matches/def456/point` share a bucket. */
export function normalizeRouteLabel(method: string, route: string, url: string): string {
  let label = route && route !== '/' ? route : url.split('?')[0];
  label = label
    .replace(/\/[a-z0-9]{20,}(?=\/|$)/gi, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/:id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
  return `${method.toUpperCase()} ${label}`;
}

export function recordRequest(method: string, route: string, url: string, durationMs: number, statusCode: number): void {
  const key = normalizeRouteLabel(method, route, url);
  const b = bucketFor(key);
  b.count += 1;
  b.total += durationMs;
  if (statusCode >= 500) b.errors += 1;
  if (durationMs > b.max) b.max = durationMs;
  if (b.durations.length >= MAX_SAMPLES_PER_ROUTE) {
    // Reservoir-style replacement keeps the sample recent without unbounded memory.
    b.durations[(b.count - 1) % MAX_SAMPLES_PER_ROUTE] = durationMs;
  } else {
    b.durations.push(durationMs);
  }
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function snapshotMetrics(): {
  startedAt: string;
  uptimeSeconds: number;
  routes: RouteMetric[];
} {
  const routes: RouteMetric[] = [];
  for (const [key, b] of buckets.entries()) {
    const sorted = [...b.durations].sort((a, b2) => a - b2);
    const [method, ...rest] = key.split(' ');
    routes.push({
      route: rest.join(' '),
      method,
      count: b.count,
      errors: b.errors,
      p50: round(percentile(sorted, 50)),
      p95: round(percentile(sorted, 95)),
      p99: round(percentile(sorted, 99)),
      mean: round(b.count ? b.total / b.count : 0),
      max: round(b.max),
    });
  }
  routes.sort((a, b) => b.p95 - a.p95 || b.count - a.count);
  return {
    startedAt: new Date(startedAt).toISOString(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    routes,
  };
}

export function resetMetrics(): void {
  buckets.clear();
  startedAt = Date.now();
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
