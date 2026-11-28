export type RosterRow = {
  _key: string;
  playerId?: string;
  jerseyNumber: string;
  name: string;
  position: string;
  isCaptain: boolean;
  isLibero: boolean;
  included: boolean;
  photoUrl?: string | null;
  thumbUrl?: string | null;
  photoKey?: string | null;
  thumbKey?: string | null;
};

export const POSITIONS = ['OH', 'MB', 'S', 'OPP', 'L', 'DS'];
export const sideLabel = (side: 'A' | 'B') => (side === 'A' ? 'Home' : 'Away');

export const emptyRow = (): RosterRow => ({
  _key: Math.random().toString(36).slice(2),
  jerseyNumber: '',
  name: '',
  position: '',
  isCaptain: false,
  isLibero: false,
  included: true,
  photoUrl: null,
  thumbUrl: null,
  photoKey: null,
  thumbKey: null,
});

export function hasRowContent(r: RosterRow) {
  return !!(r.playerId || String(r.jerseyNumber || '').trim() || String(r.name || '').trim() || String(r.position || '').trim() || r.isCaptain || r.isLibero);
}

export function meaningfulRowCount(rows: RosterRow[]) {
  return rows.filter(hasRowContent).length;
}

export function parseJersey(value: string): number | undefined {
  const s = String(value ?? '').trim();
  if (s === '') return undefined;
  if (!/^\d+$/.test(s)) return undefined;
  const n = Number(s);
  if (!Number.isInteger(n)) return undefined;
  return n;
}

export function isValidJersey(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 99;
}

export function mapTeamPlayerToRow(p: any): RosterRow {
  const name = (p?.displayName || `${p?.firstName || ''} ${p?.lastName || ''}`).trim();
  const jersey = p?.jerseyNumber;
  return {
    _key: p?.id || Math.random().toString(36).slice(2),
    playerId: p?.id || undefined,
    jerseyNumber: jersey === null || jersey === undefined || jersey === '' ? '' : String(jersey),
    name,
    position: p?.position || '',
    isCaptain: !!p?.isCaptain,
    isLibero: !!p?.isLibero,
    included: true,
    photoUrl: p?.photoUrl || null,
    thumbUrl: p?.thumbUrl || p?.photoUrl || null,
    photoKey: p?.photoKey || null,
    thumbKey: p?.thumbKey || null,
  };
}

export function mapSavedRosterToRow(r: any): RosterRow {
  const p = r?.player || r;
  return {
    _key: r?.playerId || Math.random().toString(36).slice(2),
    playerId: r?.playerId || undefined,
    jerseyNumber: r?.jerseyNumber === null || r?.jerseyNumber === undefined ? '' : String(r.jerseyNumber),
    name: r?.name || p?.displayName || `${p?.firstName || ''} ${p?.lastName || ''}`.trim() || '',
    position: r?.position || p?.position || '',
    isCaptain: !!r?.isCaptain,
    isLibero: !!r?.isLibero,
    included: true,
    photoUrl: r?.photoUrl || p?.photoUrl || null,
    thumbUrl: r?.thumbUrl || p?.thumbUrl || r?.photoUrl || p?.photoUrl || null,
    photoKey: r?.photoKey || p?.photoKey || null,
    thumbKey: r?.thumbKey || p?.thumbKey || null,
  };
}

export type RowIssueMap = Record<string, string[]>;

export function validateRosterRows(rows: RosterRow[], side: 'A' | 'B', opts?: { forSave?: boolean }) {
  const included = rows
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => r.included && (opts?.forSave ? true : hasRowContent(r) || r.included));
  const includedForSave = rows.map((r, idx) => ({ r, idx })).filter(({ r }) => r.included);
  const target = opts?.forSave ? includedForSave : included;
  const issuesByRow: RowIssueMap = {};
  const add = (key: string, msg: string) => {
    if (!issuesByRow[key]) issuesByRow[key] = [];
    if (!issuesByRow[key].includes(msg)) issuesByRow[key].push(msg);
  };

  const jerseyOwners = new Map<number, string[]>();
  for (const { r } of target) {
    const n = parseJersey(r.jerseyNumber);
    const hasName = String(r.name || '').trim().length > 0 || !!r.playerId;
    const hasJerseyText = String(r.jerseyNumber || '').trim() !== '';

    if (opts?.forSave) {
      if (!isValidJersey(n)) add(r._key, 'Jersey number must be between 1 and 99.');
      if (!hasName) add(r._key, 'Name is required.');
    } else {
      if (hasJerseyText && !isValidJersey(n)) add(r._key, 'Jersey number must be between 1 and 99.');
      if (r.included && hasRowContent(r) && !hasJerseyText) add(r._key, 'Jersey number is required.');
      if (r.included && hasRowContent(r) && !hasName) add(r._key, 'Name is required.');
    }

    if (isValidJersey(n)) {
      const arr = jerseyOwners.get(n) || [];
      arr.push(r._key);
      jerseyOwners.set(n, arr);
    }
  }

  for (const [num, keys] of jerseyOwners.entries()) {
    if (keys.length > 1) keys.forEach(k => add(k, `Duplicate jersey number ${num}.`));
  }

  const captains = target.filter(({ r }) => r.isCaptain).length;
  const liberos = target.filter(({ r }) => r.isLibero).length;
  if (captains > 1) target.filter(({ r }) => r.isCaptain).forEach(({ r }) => add(r._key, 'Only one captain is allowed per side.'));
  if (liberos > 1) target.filter(({ r }) => r.isLibero).forEach(({ r }) => add(r._key, 'Only one libero designation is allowed per side.'));

  const count = target.length;
  if (opts?.forSave) {
    if (count < 6) target.forEach(({ r }) => add(r._key, 'Roster must include at least 6 players.'));
    if (count > 16) target.forEach(({ r }) => add(r._key, 'Roster can include at most 16 players.'));
  }

  const allIssues = Object.entries(issuesByRow).flatMap(([key, msgs]) => msgs.map(m => ({ key, message: m })));
  return {
    ok: allIssues.length === 0 && (!opts?.forSave || (count >= 6 && count <= 16)),
    issuesByRow,
    includedCount: target.length,
    missingJerseyCount: target.filter(({ r }) => !isValidJersey(parseJersey(r.jerseyNumber))).length,
    captains,
    liberos,
  };
}

export function rosterSaveBlockMessage(rows: RosterRow[], side: 'A' | 'B') {
  const label = sideLabel(side);
  const included = rows.map((r, idx) => ({ r, idx: idx + 1 })).filter(({ r }) => r.included);

  // Report specific, actionable row issues first
  for (const { r, idx } of included) {
    const jersey = parseJersey(r.jerseyNumber);
    if (!isValidJersey(jersey)) return `${label} roster, row ${idx}: jersey number must be between 1 and 99.`;
    if (!String(r.name || '').trim() && !r.playerId) return `${label} roster, row ${idx}: name is required.`;
  }

  const dup = new Map<number, number[]>();
  included.forEach(({ r, idx }) => {
    const j = parseJersey(r.jerseyNumber);
    if (isValidJersey(j)) {
      const arr = dup.get(j) || []; arr.push(idx); dup.set(j, arr);
    }
  });
  for (const [j, idxs] of dup.entries()) {
    if (idxs.length > 1) return `${label} roster, rows ${idxs.join(', ')}: duplicate jersey number ${j}.`;
  }
  if (included.filter(({ r }) => r.isCaptain).length > 1) return `${label} roster: only one captain is allowed.`;
  if (included.filter(({ r }) => r.isLibero).length > 1) return `${label} roster: only one libero designation is allowed.`;

  if (included.length < 6) return `${label} roster: include at least 6 players before saving.`;
  if (included.length > 16) return `${label} roster: include at most 16 players before saving.`;

  const v = validateRosterRows(rows, side, { forSave: true });
  const first = Object.values(v.issuesByRow)[0]?.[0];
  return first ? `${label} roster: ${first}` : `${label} roster: please fix the highlighted rows before saving.`;
}

export function buildRosterPayload(rows: RosterRow[]) {
  // Assumes rows already validated for save; never coerces blank jersey to 0.
  return rows
    .filter(r => r.included)
    .map(r => {
      const jersey = parseJersey(r.jerseyNumber) as number;
      return {
        ...(r.playerId ? { playerId: r.playerId } : {}),
        jerseyNumber: jersey,
        name: r.name.trim() || undefined,
        position: r.position || null,
        isCaptain: !!r.isCaptain,
        isLibero: !!r.isLibero,
      };
    });
}

export function autoNumberRows(rows: RosterRow[]) {
  const used = new Set<number>();
  for (const r of rows) {
    if (!r.included) continue;
    const n = parseJersey(r.jerseyNumber);
    if (isValidJersey(n)) used.add(n);
  }
  let next = 1;
  const takeNext = () => {
    while (next <= 99 && used.has(next)) next++;
    if (next > 99) return undefined;
    used.add(next);
    return next++;
  };
  return rows.map(r => {
    if (!r.included) return r;
    const n = parseJersey(r.jerseyNumber);
    if (isValidJersey(n)) return r;
    const assigned = takeNext();
    return assigned ? { ...r, jerseyNumber: String(assigned) } : r;
  });
}
