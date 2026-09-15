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
  /**
   * True while this profile is still only a local placeholder that no
   * Firestore users/{uid} document has confirmed. A provisional garage id was
   * invented on this computer and nothing has been filed under it yet, so it
   * is safe to trade for one the security rules will accept. Once a real
   * profile exists the flag is gone and the id is never reassigned - that id
   * is where all of this garage's records live.
   */
  provisional?: boolean;
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
    provisional: true,
  };
}

/**
 * Makes sure this signed-in user really has a users/{uid} document.
 *
 * This is the document firestore.rules reads for isManagerOf() and
 * isStaffOf(). Without it every rule that asks who you are answers "nobody",
 * which is what produced "Missing or insufficient permissions" the moment the
 * desktop app tried to mint a pairing code: the app was running on a
 * local-only profile that had never been written anywhere.
 *
 * Three cases, in order:
 *   - a profile exists on the server: it wins, always. The local copy is a
 *     cache, and a cache that disagrees with the rules is exactly the bug.
 *   - no profile, and the local one is still provisional: adopt the uid as
 *     the garage id. The garages/{id} create rule requires id == uid, so any
 *     invented id could never have been created there anyway.
 *   - no profile, but a real local garage id (set by VITE_GARAGE_ID or
 *     carried over from an earlier run): keep it. Records already point at
 *     it, and changing it would hide them.
 */
async function provisionProfile(u: User): Promise<UserProfile> {
  const profileRef = doc(db, 'users', u.uid);
  const snap = await getDoc(profileRef);

  if (snap.exists()) {
    const d = snap.data() as Partial<UserProfile>;
    return {
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      role: (d.role as UserRole) || 'owner',
      garageId: d.garageId || u.uid,
      createdAt: d.createdAt || new Date().toISOString(),
    };
  }

  const cached = readCachedProfile();
  const envId = (import.meta.env.VITE_GARAGE_ID as string | undefined)?.trim();
  const garageId = envId || (cached && !cached.provisional ? cached.garageId : u.uid);

  const created: UserProfile = {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    role: cached?.role || 'owner',
    garageId,
    createdAt: new Date().toISOString(),
  };

  // Only the owner of an id may create the garage under it. When the id came
  // from elsewhere the garage is someone else's to create, and the write
  // below would be refused - so do not attempt it and mistake the refusal for
  // a real fault.
  if (garageId === u.uid) {
    await setDoc(doc(db, 'garages', garageId), {
      ...DEFAULT_SETTINGS,
      id: garageId,
      garageName: 'My Garage',
      ownerId: u.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  await setDoc(profileRef, created);
  return created;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(() => readCachedProfile() ?? makeLocalProfile());
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [error, setError] = useState<string | null>(null);

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

      try {
        const linked = await provisionProfile(u);
        writeCachedProfile(linked);
        setProfile(linked);
        settingsService.subscribe(linked.garageId);
        setError(null);
      } catch (e) {
        // Being offline is normal and not worth reporting - the local profile
        // keeps working and this retries on the next auth event. A rules
        // rejection is different: the app will look like it is running fine
        // while every privileged write silently fails, so say so.
        const code = (e as { code?: string })?.code ?? '';
        if (code === 'permission-denied') {
          setError(
            'Signed in, but this account has no profile the database will accept. ' +
            'Pairing codes and other owner actions will be refused until that is fixed.'
          );
        } else if (code !== 'unavailable') {
          setError((e as Error)?.message ?? 'Could not confirm this account.');
        }
        const local = readCachedProfile() ?? makeLocalProfile();
        setProfile(local);
        settingsService.subscribe(local.garageId);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading: false, online, provisioned: !profile?.provisional, error, retry: () => {} }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
