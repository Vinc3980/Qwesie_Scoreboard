import { describe, expect, it } from 'vitest';
import {
  autoNumberRows,
  buildRosterPayload,
  mapTeamPlayerToRow,
  parseJersey,
  rosterSaveBlockMessage,
  validateRosterRows,
  type RosterRow,
} from './matchSetupRoster.js';

function row(partial: Partial<RosterRow> & { _key: string }): RosterRow {
  return {
    playerId: undefined,
    jerseyNumber: '',
    name: '',
    position: '',
    isCaptain: false,
    isLibero: false,
    included: true,
    ...partial,
  };
}

describe('matchSetupRoster mapping', () => {
  it('maps team player with jersey, displayName and flags', () => {
    const mapped = mapTeamPlayerToRow({
      id: 'p1',
      displayName: 'Jane Setter',
      jerseyNumber: 7,
      position: 'S',
      isCaptain: true,
      isLibero: false,
    });
    expect(mapped.playerId).toBe('p1');
    expect(mapped.name).toBe('Jane Setter');
    expect(mapped.jerseyNumber).toBe('7');
    expect(mapped.position).toBe('S');
    expect(mapped.isCaptain).toBe(true);
    expect(mapped.isLibero).toBe(false);
  });

  it('keeps blank jersey for players without a number (never coerces to 0)', () => {
    expect(mapTeamPlayerToRow({ id: 'p2', firstName: 'No', lastName: 'Number', jerseyNumber: null }).jerseyNumber).toBe('');
    expect(mapTeamPlayerToRow({ id: 'p3', firstName: 'Empty', lastName: 'String', jerseyNumber: '' }).jerseyNumber).toBe('');
    expect(parseJersey('')).toBeUndefined();
  });
});

describe('matchSetupRoster validation and payload', () => {
  it('blocks save when a row is missing jersey number and reports row-specific message', () => {
    const rows = [
      row({ _key: 'r1', jerseyNumber: '', name: 'Player A' }),
      row({ _key: 'r2', jerseyNumber: '2', name: 'Player B' }),
      row({ _key: 'r3', jerseyNumber: '3', name: 'Player C' }),
      row({ _key: 'r4', jerseyNumber: '4', name: 'Player D' }),
      row({ _key: 'r5', jerseyNumber: '5', name: 'Player E' }),
      row({ _key: 'r6', jerseyNumber: '6', name: 'Player F' }),
    ];
    const v = validateRosterRows(rows, 'A', { forSave: true });
    expect(v.ok).toBe(false);
    expect(v.issuesByRow.r1?.some(m => /jersey number/i.test(m))).toBe(true);
    expect(rosterSaveBlockMessage(rows, 'A')).toMatch(/row 1/i);
    expect(rosterSaveBlockMessage(rows, 'A')).toMatch(/jersey number/i);
  });

  it('auto-numbers missing jerseys with unused 1-99 values', () => {
    const rows = [
      row({ _key: 'r1', jerseyNumber: '1', name: 'A' }),
      row({ _key: 'r2', jerseyNumber: '', name: 'B' }),
      row({ _key: 'r3', jerseyNumber: '2', name: 'C' }),
    ];
    const out = autoNumberRows(rows);
    expect(out[1].jerseyNumber).toBe('3');
    expect(out[0].jerseyNumber).toBe('1');
    expect(out[2].jerseyNumber).toBe('2');
  });

  it('buildRosterPayload never sends blank jersey as 0', () => {
    const rows = [
      row({ _key: 'r1', jerseyNumber: '7', name: 'A' }),
      row({ _key: 'r2', jerseyNumber: '12', name: 'B' }),
    ];
    const payload = buildRosterPayload(rows);
    expect(payload.every(p => p.jerseyNumber >= 1 && p.jerseyNumber <= 99)).toBe(true);
  });
});
