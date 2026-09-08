import { useAuth } from '../../context/AuthContext';
import { WifiOff, Cloud } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Tells staff, plainly, that the shop floor keeps working without internet.
 *
 * Without it the app looks identical online and off, so the first thing an
 * operator does when the line drops is stop entering work - exactly the wrong
 * response, since every write is queued locally and pushed up on reconnect.
 */
export function OfflineBanner() {
  const { online } = useAuth();
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    if (!online) return;
    setJustReconnected(true);
    const t = setTimeout(() => setJustReconnected(false), 6000);
    return () => clearTimeout(t);
  }, [online]);

  if (!online) {
    return (
      <div className="print:hidden sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 text-white text-xs font-bold py-2 px-4">
        <WifiOff className="w-3.5 h-3.5" />
        Working offline &mdash; everything you enter is saved on this computer and uploads automatically when internet returns.
      </div>
    );
  }

  if (justReconnected) {
    return (
      <div className="print:hidden sticky top-0 z-50 flex items-center justify-center gap-2 bg-emerald-600 text-white text-xs font-bold py-2 px-4">
        <Cloud className="w-3.5 h-3.5" />
        Back online &mdash; syncing anything saved while you were offline.
      </div>
    );
  }
  return null;
}
