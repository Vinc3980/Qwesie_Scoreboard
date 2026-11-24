import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal.js';
import { Button } from '../ui/Button.js';
import { Input, Label } from '../ui/Input.js';
import { matchApi } from '../../services/api.js';
import { useNotification } from '../../contexts/NotificationContext.js';

export type CourtConflict = {
  id: string;
  court?: string | null;
  status?: string | null;
  matchNumber?: string | null;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
};

export const CourtConflictDialog: React.FC<{
  open: boolean;
  court: string;
  conflict: CourtConflict | null;
  onClose: () => void;
  onResolved: () => Promise<void> | void;
}> = ({ open, court, conflict, onClose, onResolved }) => {
  const notify = useNotification();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const label = conflict
    ? `#${conflict.matchNumber || '?'} ${conflict.homeTeamName || 'Home'} vs ${conflict.awayTeamName || 'Away'} (${conflict.status || 'IN PLAY'})`
    : 'Another match';

  const run = async (kind: string, fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
      await onResolved();
      setReason('');
      onClose();
    } catch (e: any) {
      notify.error(e?.message || 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal isOpen={open} onClose={() => { if (!busy) onClose(); }} title="Court already in use">
      <div className="space-y-4">
        <div className="rounded-lg border border-warning/40 bg-warning-subtle p-3 text-sm text-warning flex gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Court {court} already has an in-play match.</div>
            <div className="text-fg mt-1">{label}</div>
            <div className="text-fg-muted mt-1">Resolve the conflict before going live with this match.</div>
          </div>
        </div>

        <div>
          <Label>Reason (required for end/abandon)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong match started, test match, duplicate" />
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            disabled={!!busy || !reason.trim() || !conflict?.id}
            isLoading={busy === 'abandon'}
            onClick={() => run('abandon', async () => {
              await matchApi.setStatus('CANCELLED', conflict!.id, reason.trim());
              notify.info('Conflicting match abandoned');
            })}
          >
            End/abandon conflicting match
          </Button>
          <Button
            variant="secondary"
            disabled={!!busy || !conflict?.id}
            isLoading={busy === 'pause'}
            onClick={() => run('pause', async () => {
              await matchApi.setStatus('PAUSED', conflict!.id, reason.trim() || 'Paused to switch court on-air match');
              notify.info('Conflicting match paused');
            })}
          >
            Pause it and switch
          </Button>
          <Button variant="outline" disabled={!!busy} onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
};

export function getCourtConflict(error: any): CourtConflict | null {
  const details = error?.responseBody?.error?.details || error?.response?.data?.error?.details || error?.details;
  if (details?.code === 'COURT_CONFLICT') return details.conflict || null;
  return null;
}
