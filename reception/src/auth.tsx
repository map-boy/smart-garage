import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

interface Profile { uid: string; role: string; garageId: string; displayName?: string }
interface Ctx {
  user: User | null; profile: Profile | null; loading: boolean; online: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<Ctx | undefined>(undefined);
const CACHE = "reception.profile.v1";

export function AuthProvider({ children }: { children: ReactNode }) {
  const cached = (() => { try { const r = localStorage.getItem(CACHE); return r ? JSON.parse(r) as Profile : null; } catch { return null; } })();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true); const down = () => setOnline(false);
    addEventListener("online", up); addEventListener("offline", down);
    return () => { removeEventListener("online", up); removeEventListener("offline", down); };
  }, []);

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setUser(u);
    if (!u) { setProfile(null); localStorage.removeItem(CACHE); setLoading(false); return; }
    try {
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) {
        const p = { uid: u.uid, ...(snap.data() as Omit<Profile, "uid">) };
        setProfile(p);
        try { localStorage.setItem(CACHE, JSON.stringify(p)); } catch { /* full or private */ }
      }
    } catch {
      // Offline: the cached profile from the last successful sign-in stands.
    } finally { setLoading(false); }
  }), []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };
  const logout = async () => { localStorage.removeItem(CACHE); await signOut(auth); };

  return <AuthCtx.Provider value={{ user, profile, loading, online, signIn, logout }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}