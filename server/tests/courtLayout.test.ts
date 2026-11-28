import { describe, it, expect } from 'vitest';
import { COURT_LAYOUT, COURT_LAYOUT_BY_POS } from '@qwesie/shared';

describe('court layout mapping', () => {
  it('maps rotation positions to the visual volleyball court diagram (net at top, viewed from behind own end line)', () => {
    expect(COURT_LAYOUT.map(s => s.label)).toEqual(['P4', 'P3', 'P2', 'P5', 'P6', 'P1']);

    expect(COURT_LAYOUT_BY_POS[1]).toMatchObject({ pos: 1, row: 'back', col: 'right', gridRow: 2, gridCol: 3 });
    expect(COURT_LAYOUT_BY_POS[2]).toMatchObject({ pos: 2, row: 'front', col: 'right', gridRow: 1, gridCol: 3 });
    expect(COURT_LAYOUT_BY_POS[3]).toMatchObject({ pos: 3, row: 'front', col: 'middle', gridRow: 1, gridCol: 2 });
    expect(COURT_LAYOUT_BY_POS[4]).toMatchObject({ pos: 4, row: 'front', col: 'left', gridRow: 1, gridCol: 1 });
    expect(COURT_LAYOUT_BY_POS[5]).toMatchObject({ pos: 5, row: 'back', col: 'left', gridRow: 2, gridCol: 1 });
    expect(COURT_LAYOUT_BY_POS[6]).toMatchObject({ pos: 6, row: 'back', col: 'middle', gridRow: 2, gridCol: 2 });
  });

  it('keeps P1 as serving back-right position', () => {
    const p1 = COURT_LAYOUT_BY_POS[1];
    expect(p1.row).toBe('back');
    expect(p1.col).toBe('right');
  });
});
