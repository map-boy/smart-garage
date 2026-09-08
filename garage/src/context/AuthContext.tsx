import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { DEFAULT_SETTINGS } from '../types/settings.types';
import { settingsService } from '../services/settingsService';

export type UserRole = 'owner' | 'manager' | 'technician' | 'receptionist' | 'store_keeper' | 'cashier';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  garageId: string;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  online: boolean;
  provisioned: boolean;
  error: string | null;
  retry: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * The app never waits on the network to start.
 *
 * A garage id is minted on this computer the first time it runs and kept in
 * localStorage, so the shop floor opens straight into work with no sign-in and
 * no connection check. Firestore serves reads from its local cache and queues
 * every write. When a connection appears we quietly create an anonymous
 * Firebase session in the background and the queue drains upward on its own.
 */
const PROFILE_CACHE_KEY = 'garage.profile.v1';
const LOCAL_ID_KEY = 'garage.localId.v1';

function localGarageId(): string {
  // Every computer in this garage must use the same id: all records live
  // under garages/{garageId}/... so a differing id means an empty app.
  const fromEnv = (import.meta.env.VITE_GARAGE_ID as string | undefined)?.trim();
  try {
    const cached = localStorage.getItem(LOCAL_ID_KEY);
    if (fromEnv) {
      if (cached !== fromEnv) localStorage.setItem(LOCAL_ID_KEY, fromEnv);
      return fromEnv;
    }
    if (cached) return cached;
    const c = globalThis.crypto as Crypto | undefined;
    const id = c && typeof c.randomUUID === 'function'
      ? c.randomUUID()
      : 'g-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(LOCAL_ID_KEY, id);
    return id;
  } catch {
    return fromEnv || 'g-local';
  }
}

function readCachedProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as UserProfile;
    return p && p.uid && p.garageId ? p : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(p: UserProfile) {
  try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p)); } catch { /* private mode */ }
}

function makeLocalProfile(): UserProfile {
  const id = localGarageId();
  return {
    uid: id,
    email: null,
    displayName: null,
    role: 'owner',
    garageId: id,
    createdAt: new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(() => readCachedProfile() ?? makeLocalProfile());
  const [online, setOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const p = readCachedProfile() ?? makeLocalProfile();
    writeCachedProfile(p);
    console.info("[garage] active garageId:", p.garageId);
    settingsService.subscribe(p.garageId);
  }, []);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  // Background only. Nothing here blocks the interface.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        signInAnonymously(auth).catch(() => {
          // No network yet. The local identity carries on regardless.
        });
        return;
      }

      setUser(u);
      const local = readCachedProfile() ?? makeLocalProfile();
      const garageId = local.garageId;

      try {
        const profileRef = doc(db, 'users', u.uid);
        const snap = await getDoc(profileRef);
        if (!snap.exists()) {
          await setDoc(doc(db, 'garages', garageId), {
            ...DEFAULT_SETTINGS,
            id: garageId,
            garageName: 'My Garage',
            ownerId: u.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true }).catch(() => null);
          await setDoc(profileRef, { ...local, uid: u.uid }).catch(() => null);
        }
      } catch {
        // Offline or rules not reachable. Local work is unaffected.
      }

      const linked = { ...local, uid: u.uid };
      writeCachedProfile(linked);
      setProfile(linked);
      settingsService.subscribe(garageId);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading: false, online, provisioned: true, error: null, retry: () => {} }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
