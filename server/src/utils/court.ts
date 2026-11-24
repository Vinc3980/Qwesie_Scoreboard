export function normalizeCourt(name: string | null | undefined): string {
  const raw = String(name ?? '').trim().toLowerCase();
  if (!raw) return '';
  // Strip a leading "court" token (e.g. "court 1", "court-1")
  const stripped = raw.replace(/^court\b[\s-]*/i, '');
  // Collapse spaces and hyphens for a stable comparison key
  return stripped.replace(/[\s-]+/g, '');
}

export function courtsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeCourt(a) === normalizeCourt(b);
}
