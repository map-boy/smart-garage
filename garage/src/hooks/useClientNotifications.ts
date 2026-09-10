import { useEffect, useRef, useState, useCallback } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import wandaaSoundUrl from '../../data/wandaa.wav';

export interface ClientNotification {
  id: string;
  title: string;
  body: string;
  isNewClient: boolean;
  receivedAt: number;
}

const MAX_STORED = 20;

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
 * Listens for new arrivals written by the reception Android app
 * (garages/{garageId}/arrivals), plays a chime + OS notification for each,
 * and keeps a short in-memory list for the bell dropdown / toast stack.
 * Skips the initial snapshot so existing arrivals don't fire on startup.
 */
export function useClientNotifications() {
  const { profile } = useAuth();
  const isInitialLoad = useRef(true);
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!profile?.garageId) return;

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    isInitialLoad.current = true;
    const colRef = collection(db, 'garages', profile.garageId, 'arrivals');

    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      if (isInitialLoad.current) {
        isInitialLoad.current = false;
        return;
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return;

        const arrival = change.doc.data() as {
          plate?: string;
          driverName?: string;
          loggedByName?: string;
          isNewClient?: boolean;
        };
        const isNewClient = !!arrival.isNewClient;
        const title = isNewClient
          ? (arrival.driverName ? `New client: ${arrival.driverName}` : 'New client checked in')
          : (arrival.driverName ? `${arrival.driverName} checked in` : 'New vehicle checked in');
        const body = arrival.plate ? `Plate: ${arrival.plate}` : 'Logged by reception';

        playChime();

        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(title, { body });
        }

        setNotifications((prev) =>
          [{ id: change.doc.id, title, body, isNewClient, receivedAt: Date.now() }, ...prev].slice(0, MAX_STORED)
        );
        setUnreadCount((n) => n + 1);
      });
    });

    return () => unsubscribe();
  }, [profile?.garageId]);

  const markAllRead = useCallback(() => setUnreadCount(0), []);
  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notifications, unreadCount, markAllRead, dismiss };
}