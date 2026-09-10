import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, UserPlus, Car } from 'lucide-react';
import type { ClientNotification } from '../../hooks/useClientNotifications';

const TOAST_DURATION = 5 * 60 * 1000; // 5 minutes

export function NotificationToasts({ notifications }: { notifications: ClientNotification[] }) {
  const [visible, setVisible] = useState<ClientNotification[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      notifications.forEach((n) => seenIds.current.add(n.id));
      return;
    }
    const fresh = notifications.filter((n) => !seenIds.current.has(n.id));
    if (fresh.length === 0) return;
    fresh.forEach((n) => seenIds.current.add(n.id));
    setVisible((prev) => [...fresh, ...prev]);
  }, [notifications]);

  const dismiss = (id: string) => setVisible((prev) => prev.filter((n) => n.id !== id));

  useEffect(() => {
    const timers = visible.map((n) => setTimeout(() => dismiss(n.id), TOAST_DURATION));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.length]);

  return (
    <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 w-[340px] print:hidden">
      <AnimatePresence>
        {visible.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            className="flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border border-orange-100 bg-white"
          >
            <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
              {n.isNewClient ? (
                <UserPlus className="w-4 h-4 text-orange-500" />
              ) : (
                <Car className="w-4 h-4 text-orange-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{n.title}</p>
              <p className="text-xs text-slate-500 truncate">{n.body}</p>
            </div>
            <button onClick={() => dismiss(n.id)} className="text-slate-300 hover:text-slate-500 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}