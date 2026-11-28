export * from './constants/volleyball.js';
export * from './constants/socketEvents.js';
export * from './types/match.types.js';
export * from './types/api.types.js';
export * from './validation/match.schemas.js';
export * from './scorebug/theme.js';
export * from './leaderboard/theme.js';
export * from './utils/courtLayout.js';

export function parseBulkPlayerRows(text: string) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows = lines.map((raw) => {
    const errors: string[] = [];
    // "7, K. Mensah, OH" per line, tab/comma/space tolerant
    const parts = raw.split(/\t+|,/).map(p => p.trim()).filter(Boolean);
    let jerseyStr = parts[0] || '';
    let name = parts[1] || '';
    let position = parts[2] || '';
    if (parts.length === 1) {
      // try space-tolerant: "7 K. Mensah OH" or "7 Mensah OH"
      const m = raw.match(/^\s*(\d{1,2})\s+(.+?)\s+([A-Za-z]{1,4})\s*$/);
      if (m) { jerseyStr = m[1]; name = m[2].trim(); position = m[3].toUpperCase(); }
      else {
        const m2 = raw.match(/^\s*(\d{1,2})\s+(.+)$/);
        if (m2) { jerseyStr = m2[1]; name = m2[2].trim(); }
      }
    } else if (parts.length >= 3) {
      jerseyStr = parts[0];
      position = /^[A-Za-z]{1,4}$/.test(parts[parts.length - 1]) ? parts[parts.length - 1].toUpperCase() : '';
      name = position ? parts.slice(1, -1).join(' ').trim() : parts.slice(1).join(' ').trim();
    } else if (parts.length === 2) {
      const maybe = parts[1].match(/^(.+?)\s+([A-Za-z]{1,4})$/);
      if (maybe) { name = maybe[1].trim(); position = maybe[2].toUpperCase(); }
      else { name = parts[1]; }
    }
    const jerseyNumber = Number(jerseyStr);
    if (!Number.isInteger(jerseyNumber) || jerseyNumber < 1 || jerseyNumber > 99) errors.push('jerseyNumber must be 1-99');
    if (!name) errors.push('name is required');
    if (position && !/^[A-Z]{1,4}$/.test(position)) errors.push('invalid position');
    return { raw, jerseyNumber: Number.isFinite(jerseyNumber) ? jerseyNumber : undefined, name: name || undefined, position: position || null, valid: errors.length === 0, errors };
  });
  return { rows, validCount: rows.filter(r => r.valid).length, errorCount: rows.filter(r => !r.valid).length };
}
