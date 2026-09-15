import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

interface DangerConfirmProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** One sentence naming exactly what is about to happen. */
  summary: string;
  /** The things that will be affected, listed so nobody guesses at a count. */
  items?: string[];
  /**
   * When set, the confirm button stays disabled until this exact word is
   * typed. Reserve it for actions with no way back - deleting many records,
   * wiping a garage - so that a muscle-memory click cannot trigger them.
   */
  requirePhrase?: string;
  confirmLabel?: string;
  busy?: boolean;
}

const PREVIEW_LIMIT = 12;

/**
 * A confirmation that states the blast radius.
 *
 * A yes/no prompt asks someone to agree to a sentence they wrote themselves
 * thirty seconds ago. This one shows the actual count and the actual records,
 * because "delete 4 parts" and "delete 400 parts" are the same click.
 */
export function DangerConfirm({
  isOpen,
  onClose,
  onConfirm,
  title,
  summary,
  items = [],
  requirePhrase,
  confirmLabel = 'Delete',
  busy = false,
}: DangerConfirmProps) {
  const [typed, setTyped] = React.useState('');

  React.useEffect(() => {
    if (isOpen) setTyped('');
  }, [isOpen]);

  const unlocked = !requirePhrase || typed.trim() === requirePhrase;
  const shown = items.slice(0, PREVIEW_LIMIT);
  const hidden = items.length - shown.length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} className="max-w-lg">
      <div className="space-y-5">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-700 leading-relaxed">{summary}</p>
        </div>

        {items.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50">
            <div className="px-4 py-2 border-b border-gray-200 text-[11px] font-bold uppercase tracking-widest text-gray-500">
              {items.length} affected
            </div>
            <ul className="max-h-48 overflow-y-auto px-4 py-2 space-y-1">
              {shown.map((item) => (
                <li key={item} className="text-xs font-mono text-gray-700 truncate">
                  {item}
                </li>
              ))}
              {hidden > 0 && (
                <li className="text-xs text-gray-400 italic">and {hidden} more</li>
              )}
            </ul>
          </div>
        )}

        {requirePhrase && (
          <label className="block space-y-2">
            <span className="text-xs text-gray-600">
              Type <b className="font-mono">{requirePhrase}</b> to enable the button.
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:border-red-400"
              placeholder={requirePhrase}
              autoComplete="off"
            />
          </label>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={!unlocked || busy}>
            {busy ? 'Working...' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
