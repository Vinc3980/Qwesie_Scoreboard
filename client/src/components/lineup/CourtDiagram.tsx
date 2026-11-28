import React, { useMemo, useRef, useState } from 'react';
import { Search, X, ArrowLeftRight } from 'lucide-react';
import { COURT_LAYOUT, assignmentsFromArray, assignmentsToArray, validateLineupAssignments, type LineupAssignments, type RotationPos } from '@qwesie/shared';
import { Avatar } from '../ui/Avatar.js';

export type CourtPlayer = {
  id: string;
  name: string;
  jerseyNumber?: number | string | null;
  photoUrl?: string | null;
  thumbUrl?: string | null;
  isLibero?: boolean;
  position?: string | null;
};

export { assignmentsFromArray, assignmentsToArray, validateLineupAssignments, type LineupAssignments };

type Props = {
  value: LineupAssignments;
  roster: CourtPlayer[];
  onChange: (next: LineupAssignments) => void;
  teamColor?: string | null;
  teamTextColor?: string | null;
  serverPosition?: number | null;
  readOnly?: boolean;
  showLiberoSlot?: boolean;
  liberoId?: string | null;
  onLiberoChange?: (id: string | null) => void;
  title?: string;
};

export const CourtDiagram: React.FC<Props> = ({
  value, roster, onChange, teamColor, teamTextColor, serverPosition, readOnly, showLiberoSlot, liberoId, onLiberoChange, title,
}) => {
  const [selectedPos, setSelectedPos] = useState<RotationPos | null>(null);
  const [query, setQuery] = useState('');
  const [dragPos, setDragPos] = useState<RotationPos | null>(null);
  const byId = useMemo(() => new Map(roster.map(p => [p.id, p])), [roster]);

  const assignedIds = useMemo(() => new Set(Object.values(value).filter(Boolean) as string[]), [value]);
  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return roster.filter(p => {
      if (!q) return true;
      return `${p.name} ${p.jerseyNumber ?? ''} ${p.position ?? ''}`.toLowerCase().includes(q);
    });
  }, [roster, query]);

  const assign = (pos: RotationPos, playerId: string | null) => {
    if (readOnly) return;
    const next = { ...value };
    if (playerId) {
      // If player already assigned elsewhere, clear previous slot first (or swap if selected)
      for (const p of [1,2,3,4,5,6] as RotationPos[]) {
        if (p !== pos && next[p] === playerId) next[p] = null;
      }
    }
    next[pos] = playerId;
    onChange(next);
  };

  const swap = (a: RotationPos, b: RotationPos) => {
    if (readOnly || a === b) return;
    const next = { ...value, [a]: value[b], [b]: value[a] };
    onChange(next);
  };

  const onDrop = (target: RotationPos) => {
    if (dragPos == null) return;
    swap(dragPos, target);
    setDragPos(null);
  };

  const validation = useMemo(() => validateLineupAssignments(value, roster), [value, roster]);

  const selectedPlayer = selectedPos ? (value[selectedPos] ? byId.get(value[selectedPos]!) : null) : null;

  return (
    <div className="space-y-3">
      {title && <div className="text-sm font-semibold text-fg">{title}</div>}
      <div className={readOnly ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4'}>
        <div>
          <div className="rounded-xl border border-border bg-surface-sunken p-3">
            <div className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-fg-muted mb-2 py-1 border-b border-border">Net</div>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Volleyball court starting lineup diagram">
              {COURT_LAYOUT.map((slot) => {
                const playerId = value[slot.pos];
                const player = playerId ? byId.get(playerId) : null;
                const selected = selectedPos === slot.pos;
                const serving = serverPosition === slot.pos;
                return (
                  <button
                    key={slot.pos}
                    type="button"
                    draggable={!readOnly && !!player}
                    onDragStart={() => setDragPos(slot.pos)}
                    onDragOver={(e) => { if (!readOnly) e.preventDefault(); }}
                    onDrop={() => onDrop(slot.pos)}
                    onDragEnd={() => setDragPos(null)}
                    onClick={() => !readOnly && setSelectedPos(slot.pos)}
                    className={`relative min-h-[112px] rounded-lg border p-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${!readOnly && selected ? 'border-accent ring-1 ring-accent/40' : 'border-border-strong'} ${serving ? 'bg-accent/10' : 'bg-surface-raised'} ${readOnly ? 'cursor-default' : ''}`}
                    aria-label={`${slot.label} ${slot.row} ${slot.col}${player ? `, ${player.name}` : ', empty'}`}
                    aria-pressed={selected}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-bold text-fg-muted">{slot.label}</span>
                      {serving && <span className="text-[10px] font-bold text-accent">SERVE</span>}
                    </div>
                    {player ? (
                      <div className="mt-1 flex items-center gap-2 min-w-0">
                        <Avatar src={player.thumbUrl || player.photoUrl} name={player.name} size={36} color={teamColor} textColor={teamTextColor} />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-fg">#{player.jerseyNumber ?? '-'}</div>
                          <div className="text-xs text-fg truncate">{player.name}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 text-xs text-fg-muted">{readOnly ? 'Empty' : 'Tap to assign'}</div>
                    )}
                    {!readOnly && player && <div className="absolute top-1 right-1 text-fg-subtle"><ArrowLeftRight className="w-3 h-3" /></div>}
                  </button>
                );
              })}
            </div>
            {showLiberoSlot && (
              <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                <span className="text-xs font-semibold text-fg-muted">Libero</span>
                <select
                  className="flex-1 rounded border border-border-strong px-2 py-1.5 bg-surface-raised text-fg text-sm"
                  value={liberoId || ''}
                  onChange={e => onLiberoChange?.(e.target.value || null)}
                  disabled={readOnly}
                  aria-label="Libero"
                >
                  <option value="">None</option>
                  {roster.filter(p => p.isLibero).map(p => <option key={p.id} value={p.id}>#{p.jerseyNumber ?? '-'} {p.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {!validation.ok && <div className="mt-2 text-xs text-warning space-y-1">{validation.issues.map((i, idx) => <div key={idx}>{i}</div>)}</div>}
        </div>

        {!readOnly && (
          <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
            <div className="text-xs font-semibold text-fg">{selectedPos ? `Assign ${`P${selectedPos}`}` : 'Select a position'}</div>
            {selectedPos ? (
              <>
                <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-fg-subtle" /><input className="w-full rounded border border-border-strong bg-surface-sunken pl-7 pr-2 py-1.5 text-sm text-fg" placeholder="Search roster" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search roster" /></div>
                <div className="max-h-72 overflow-auto space-y-1">
                  <button type="button" className="w-full text-left px-2 py-1.5 rounded border border-border hover:bg-surface-alt text-sm text-fg-muted" onClick={() => { assign(selectedPos, null); setSelectedPos(null); setQuery(''); }}>Clear slot</button>
                  {available.map(p => {
                    const inSlot = Object.entries(value).find(([, id]) => id === p.id)?.[0];
                    const isHere = value[selectedPos] === p.id;
                    return (
                      <button
                        type="button"
                        key={p.id}
                        className={`w-full text-left px-2 py-1.5 rounded border text-sm flex items-center gap-2 ${isHere ? 'border-accent bg-accent-subtle' : 'border-border hover:bg-surface-alt'} text-fg`}
                        onClick={() => { assign(selectedPos, p.id); setQuery(''); }}
                      >
                        <Avatar src={p.thumbUrl || p.photoUrl} name={p.name} size={28} color={teamColor} textColor={teamTextColor} />
                        <span className="font-bold">#{p.jerseyNumber ?? '-'}</span>
                        <span className="truncate flex-1">{p.name}</span>
                        {p.isLibero ? <span className="text-[10px] text-warning">L</span> : null}
                        {inSlot && !isHere ? <span className="text-[10px] text-fg-muted">P{inSlot}</span> : null}
                      </button>
                    );
                  })}
                </div>
                {selectedPlayer && <div className="text-xs text-fg-muted">Current: #{selectedPlayer.jerseyNumber ?? '-'} {selectedPlayer.name}</div>}
                <button type="button" className="text-xs text-fg-muted hover:text-fg inline-flex items-center gap-1" onClick={() => { setSelectedPos(null); setQuery(''); }}><X className="w-3 h-3" />Close</button>
              </>
            ) : (
              <div className="text-xs text-fg-muted">Click a court position to assign a player. Drag a filled position onto another to swap.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
