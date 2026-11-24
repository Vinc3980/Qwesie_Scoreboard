import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GRAPHIC_TEMPLATES, toState } from '../src/services/broadcast.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('broadcast.service toState', () => {
  it('includes template and payload from stored active template/graphic payload', () => {
    const row = {
      matchId: 'm1',
      scene: 'MATCH_STATS',
      isVisible: true,
      scorebugVisible: true,
      scorebugVariant: 'classic',
      scorebugPosition: 'top-left',
      scorebugScale: 1,
      lockScene: false,
      timerEndsAt: new Date('2026-11-19T12:00:10.000Z'),
      version: 3,
      updatedAt: new Date('2026-11-19T12:00:00.000Z'),
      payload: {
        activeTemplate: 'TEAM_COMPARISON',
        graphicPayload: { side: 'A', focus: 'blocks' },
        graphicStartedAt: '2026-11-19T12:00:00.000Z',
        autoTriggers: { setBreakSeconds: 20, timeoutSeconds: 30, setBreakEnabled: true, timeoutEnabled: true, finalEnabled: true },
        scorebug: { showSetHistory: true, showPreMatch: true, showLogos: false, showTournament: true, tournamentLabel: 'Finals' },
      },
    } as any;

    const state = toState(row, 42);
    expect(state.matchId).toBe('m1');
    expect(state.scene).toBe('MATCH_STATS');
    expect(state.template).toBe('TEAM_COMPARISON');
    expect(state.payload).toEqual({ side: 'A', focus: 'blocks' });
    expect(state.startedAt).toBe('2026-11-19T12:00:00.000Z');
    expect(state.revision).toBe(42);
    expect(state.timerEndsAt).toBe('2026-11-19T12:00:10.000Z');
    expect(state.scorebug.showSetHistory).toBe(true);
    expect(state.scorebug.showLogos).toBe(false);
    expect(state.scorebug.tournamentLabel).toBe('Finals');
  });

  it('emits null template/payload for PLAY/scorebug state', () => {
    const row = {
      matchId: 'm2',
      scene: 'PLAY',
      isVisible: false,
      scorebugVisible: true,
      lockScene: false,
      timerEndsAt: null,
      version: 1,
      payload: { activeTemplate: 'SCOREBUG', graphicPayload: {}, graphicStartedAt: null, autoTriggers: {} },
    } as any;
    const state = toState(row, 1);
    expect(state.template).toBeNull();
    expect(state.payload).toEqual({});
    expect(state.startedAt).toBeNull();
  });
});

describe('template-to-component coverage', () => {
  it('every GRAPHIC_TEMPLATES id has a component in client TEMPLATE_COMPONENTS', () => {
    const templatesPath = path.resolve(__dirname, '../../client/src/features/broadcast/templates.tsx');
    const src = fs.readFileSync(templatesPath, 'utf8');
    const marker = 'export const TEMPLATE_COMPONENTS';
    const idx = src.indexOf(marker);
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx);

    const missing = GRAPHIC_TEMPLATES
      .map(t => t.id)
      .filter(id => !new RegExp(`(^|\\n)\\s*${id}\\s*:`, 'm').test(block));

    expect(missing, `Missing TEMPLATE_COMPONENTS entries for: ${missing.join(', ')}`).toEqual([]);
  });
});
