export type RotationPos = 1 | 2 | 3 | 4 | 5 | 6;

export interface CourtSlot {
  pos: RotationPos;
  label: `P${RotationPos}`;
  row: 'front' | 'back';
  col: 'left' | 'middle' | 'right';
  /** Grid area for a 3x2 court viewed from behind own end line, net at top. */
  gridRow: 1 | 2;
  gridCol: 1 | 2 | 3;
}

/**
 * Canonical volleyball court layout (team viewed from behind its own end line, net at top):
 *  Front: P4 (left)  P3 (middle)  P2 (right)
 *  Back:  P5 (left)  P6 (middle)  P1 (right, server)
 */
export const COURT_LAYOUT: CourtSlot[] = [
  { pos: 4, label: 'P4', row: 'front', col: 'left', gridRow: 1, gridCol: 1 },
  { pos: 3, label: 'P3', row: 'front', col: 'middle', gridRow: 1, gridCol: 2 },
  { pos: 2, label: 'P2', row: 'front', col: 'right', gridRow: 1, gridCol: 3 },
  { pos: 5, label: 'P5', row: 'back', col: 'left', gridRow: 2, gridCol: 1 },
  { pos: 6, label: 'P6', row: 'back', col: 'middle', gridRow: 2, gridCol: 2 },
  { pos: 1, label: 'P1', row: 'back', col: 'right', gridRow: 2, gridCol: 3 },
];

export const COURT_LAYOUT_BY_POS: Record<RotationPos, CourtSlot> = COURT_LAYOUT.reduce((acc, slot) => {
  acc[slot.pos] = slot;
  return acc;
}, {} as Record<RotationPos, CourtSlot>);

export function isValidRotationPos(value: unknown): value is RotationPos {
  return [1, 2, 3, 4, 5, 6].includes(Number(value) as RotationPos);
}

export type LineupAssignments = Record<RotationPos, string | null>;

export function emptyLineupAssignments(): LineupAssignments {
  return { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
}

export function assignmentsFromArray(arr: Array<string | null | undefined>): LineupAssignments {
  return { 1: arr[0] || null, 2: arr[1] || null, 3: arr[2] || null, 4: arr[3] || null, 5: arr[4] || null, 6: arr[5] || null };
}

export function assignmentsToArray(a: LineupAssignments): Array<string | null> {
  return [a[1], a[2], a[3], a[4], a[5], a[6]];
}

export function validateLineupAssignments(
  assignments: LineupAssignments,
  players: Array<{ id: string; isLibero?: boolean }> = [],
) {
  const byId = new Map(players.map(p => [p.id, p]));
  const issues: string[] = [];
  const values = ([1, 2, 3, 4, 5, 6] as RotationPos[]).map(p => assignments[p]).filter(Boolean) as string[];
  if (values.length !== 6) issues.push('Assign all 6 court positions.');
  const seen = new Set<string>();
  for (const id of values) {
    if (seen.has(id)) issues.push('Each player can only appear once.');
    seen.add(id);
  }
  const liberos = values.map(id => byId.get(id)).filter(p => p?.isLibero);
  if (liberos.length > 1) issues.push('At most 1 libero may be in the starting six.');
  return { ok: issues.length === 0, issues: Array.from(new Set(issues)) };
}
