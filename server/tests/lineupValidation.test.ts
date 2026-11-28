import { describe, expect, it } from 'vitest';
import { assignmentsFromArray, emptyLineupAssignments, validateLineupAssignments } from '@qwesie/shared';

describe('lineup validation', () => {
  const roster = [
    { id: 'p1', isLibero: false },
    { id: 'p2', isLibero: false },
    { id: 'p3', isLibero: false },
    { id: 'p4', isLibero: false },
    { id: 'p5', isLibero: false },
    { id: 'p6', isLibero: false },
    { id: 'lib', isLibero: true },
    { id: 'lib2', isLibero: true },
  ];

  it('accepts six distinct players', () => {
    const a = assignmentsFromArray(['p1','p2','p3','p4','p5','p6']);
    expect(validateLineupAssignments(a, roster)).toEqual({ ok: true, issues: [] });
  });

  it('rejects incomplete lineup', () => {
    const a = emptyLineupAssignments();
    a[1] = 'p1';
    const res = validateLineupAssignments(a, roster);
    expect(res.ok).toBe(false);
    expect(res.issues).toContain('Assign all 6 court positions.');
  });

  it('rejects duplicates', () => {
    const a = assignmentsFromArray(['p1','p1','p3','p4','p5','p6']);
    const res = validateLineupAssignments(a, roster);
    expect(res.ok).toBe(false);
    expect(res.issues).toContain('Each player can only appear once.');
  });

  it('rejects more than one libero in starting six', () => {
    const a = assignmentsFromArray(['lib','lib2','p3','p4','p5','p6']);
    const res = validateLineupAssignments(a, roster);
    expect(res.ok).toBe(false);
    expect(res.issues).toContain('At most 1 libero may be in the starting six.');
  });
});
