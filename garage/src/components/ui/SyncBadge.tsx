import { CloudOff } from 'lucide-react';

interface SyncBadgeProps {
  /** True while the record exists only in this machine's local cache. */
  pending?: boolean;
  className?: string;
}

/**
 * The mark that says "the rest of the business cannot see this yet".
 *
 * Offline-first means a record looks saved the instant it is typed, which is
 * the whole point - but it also means a saved-looking record and a synced
 * record are indistinguishable without something like this. Staff need to be
 * able to tell, because "it's in the system" is a promise someone makes to a
 * customer standing in front of them.
 */
export function SyncBadge({ pending, className = '' }: SyncBadgeProps) {
  if (!pending) return null;
  return (
    <span
      title="Saved on this computer. Not confirmed by the server yet - it uploads by itself when the connection is back."
      className={
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 ' +
        'text-amber-700 text-[10px] font-bold uppercase tracking-wider align-middle ' +
        className
      }
    >
      <CloudOff className="w-3 h-3" />
      Syncing
    </span>
  );
}
