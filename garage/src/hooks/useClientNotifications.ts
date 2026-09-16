import { useEffect, useRef, useState, useCallback } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import wandaaSoundUrl from '../../data/wandaa.wav';

export type NotificationKind = 'arrival' | 'enquiry' | 'client' | 'stock';

export interface ClientNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  isNewClient: boolean;
  receivedAt: number;
}

const MAX_STORED = 20;

/**
 * How far back each listener looks.
 *
 * Only additions after the first snapshot ever raise a notification, so this
 * window exists purely to bound what gets downloaded. Small enough to stay
 * cheap forever, large enough that a burst of arrivals cannot slip past.
 */
const WATCH_WINDOW = 30;

/** Plays the WANDAA check-in/new-client chime. Never let it break notification flow. */
function playChime() {
  try {
    const audio = new Audio(wandaaSoundUrl);
    audio.volume = 0.8;
    void audio.play().catch(() => {
      // Autoplay can be blocked before first user interaction; ignore.
    });
  } catch {
    // Sound is a nicety; never let it break the notification flow.
  }
}

/**
 * Everything that should make the boss look up.
 *
 * Two sources, one bell: a vehicle logged at the gate by the reception phone,
 * and a question sent from the public website. Both are somebody waiting on a
 * reply, which is the only thing that makes a notification worth interrupting
 * for.
 *
 * The first snapshot is skipped in both cases. Without that, opening the app
 * in the morning would chime once per arrival recorded since it was installed,
 * which trains people to ignore the sound entirely.
 *
 * Both listeners are capped and ordered. An uncapped listener on a collection
 * that only ever grows re-downloads the whole history on every launch and gets
 * slower every month - the reason the desktop app used to crawl by year end.
 */
export function useClientNotifications() {
  const { profile } = useAuth();
  const isInitialLoad = useRef(true);
  const firstEnquiryLoad = useRef(true);
  const isInitialClients = useRef(true);
  const isInitialStock = useRef(true);
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!profile?.garageId) return;

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    isInitialLoad.current = true;
    firstEnquiryLoad.current = true;
    isInitialClients.current = true;
    isInitialStock.current = true;

    const raise = (n: ClientNotification) => {
      playChime();
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(n.title, { body: n.body });
      }
      setNotifications((prev) => [n, ...prev].slice(0, MAX_STORED));
      setUnreadCount((c) => c + 1);
    };

    const arrivalsQuery = query(
      collection(db, 'garages', profile.garageId, 'arrivals'),
      orderBy('arrivedAt', 'desc'),
      limit(WATCH_WINDOW),
    );
    const unsubArrivals = onSnapshot(arrivalsQuery, (snapshot) => {
      if (isInitialLoad.current) {
        isInitialLoad.current = false;
        return;
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const a = change.doc.data() as {
          plate?: string;
          driverName?: string;
          isNewClient?: boolean;
          requestedWork?: string;
          reason?: string;
          jobId?: string;
        };
        const isNewClient = !!a.isNewClient;
        const title = isNewClient
          ? (a.driverName ? `New client: ${a.driverName}` : 'New client checked in')
          : (a.driverName ? `${a.driverName} checked in` : 'New vehicle checked in');
        // What the client actually asked for is the useful half of this
        // notification; the plate alone says a car arrived, not why.
        const work = a.requestedWork || a.reason;
        // A check-in from the phone now opens a job card with it, so say so -
        // the workshop needs to know there is already something to pick up,
        // not just that a car is at the gate.
        const body = [
          a.plate ? `Plate: ${a.plate}` : null,
          work,
          a.jobId ? 'Job card opened' : null,
        ].filter(Boolean).join(' \u00b7 ') || 'Logged by reception';
        raise({ id: change.doc.id, kind: 'arrival', title, body, isNewClient, receivedAt: Date.now() });
      });
    });

    const enquiriesQuery = query(
      collection(db, 'garages', profile.garageId, 'enquiries'),
      orderBy('createdAtLocal', 'desc'),
      limit(WATCH_WINDOW),
    );
    const unsubEnquiries = onSnapshot(enquiriesQuery, (snapshot) => {
      if (firstEnquiryLoad.current) {
        firstEnquiryLoad.current = false;
        return;
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const e = change.doc.data() as { name?: string; phone?: string; message?: string };
        raise({
          id: change.doc.id,
          kind: 'enquiry',
          title: e.name ? `Website question from ${e.name}` : 'New website question',
          body: [e.phone, e.message?.slice(0, 90)].filter(Boolean).join(' \u00b7 '),
          isNewClient: false,
          receivedAt: Date.now(),
        });
      });
    });

    const clientsQuery = collection(db, 'garages', profile.garageId, 'clients');
    const unsubClients = onSnapshot(clientsQuery, (snapshot) => {
      if (isInitialClients.current) {
        isInitialClients.current = false;
        return;
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const c = change.doc.data() as { name?: string; vehicle_plate?: string; issue?: string };
        raise({
          id: change.doc.id,
          kind: 'client',
          title: c.name ? `New client: ${c.name}` : 'New client added',
          body: [c.vehicle_plate, c.issue].filter(Boolean).join(' \u00b7 ') || 'Added at reception',
          isNewClient: true,
          receivedAt: Date.now(),
        });
      });
    });

    const stockQuery = collection(db, 'garages', profile.garageId, 'stock');
    const unsubStock = onSnapshot(stockQuery, (snapshot) => {
      if (isInitialStock.current) {
        isInitialStock.current = false;
        return;
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const s = change.doc.data() as { name?: string; qty?: number };
        raise({
          id: change.doc.id,
          kind: 'stock',
          title: s.name ? `New stock item: ${s.name}` : 'New stock item added',
          body: typeof s.qty === 'number' ? `Qty: ${s.qty}` : 'Added at stock',
          isNewClient: false,
          receivedAt: Date.now(),
        });
      });
    });

    return () => {
      unsubArrivals();
      unsubEnquiries();
      unsubClients();
      unsubStock();
    };
  }, [profile?.garageId]);

  const markAllRead = useCallback(() => setUnreadCount(0), []);
  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notifications, unreadCount, markAllRead, dismiss };
}
