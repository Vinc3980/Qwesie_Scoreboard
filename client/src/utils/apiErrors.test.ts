import { describe, expect, it } from 'vitest';
import { formatApiError, getApiIssues } from './apiErrors.js';

describe('apiErrors formatter', () => {
  it('formats zod issue array for roster row into readable message (no raw JSON)', () => {
    const zodIssues = [
      { code: 'too_small', minimum: 1, type: 'number', inclusive: true, exact: false, message: 'Number must be greater than or equal to 1', path: ['players', 0, 'jerseyNumber'] },
    ];
    const msg = formatApiError(zodIssues, { sideLabel: 'Home' });
    expect(msg).toMatch(/Home roster, row 1/i);
    expect(msg).toMatch(/jersey number/i);
    expect(msg).not.toMatch(/^\s*\[/);
    expect(msg).not.toContain('too_small');
  });

  it('formats server error body with nested issues consistently', () => {
    const err = {
      responseBody: {
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          issues: [{ path: 'players.2.name', message: 'Required' }],
        },
      },
    };
    const msg = formatApiError(err, { sideLabel: 'Away' });
    expect(msg).toMatch(/Away roster, row 3/i);
    expect(msg.toLowerCase()).toContain('name');
  });

  it('extracts issues via getApiIssues from wrapped shapes', () => {
    const issues = getApiIssues({ issues: [{ path: 'players.0.jerseyNumber', message: 'Number must be greater than or equal to 1' }] });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].path).toBe('players.0.jerseyNumber');
  });
});
