import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';

export type Profile = { uid: string; name: string; role: 'technician' | 'boss' | 'secretary' | 'worker'; orgId: string; username: string; active?: boolean };
type Ctx = { user: User | null; profile: Profile | null; loading: boolean };
const C = createContext<Ctx>({ user: null, profile: null, loading: true });
export const useAuth = () => useContext(C);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile = () => {};
    const unsub = onAuthStateChanged(auth, (u) => {
      unsubProfile();
      setUser(u);
      if (!u) { setProfile(null); setLoading(false); return; }
      unsubProfile = onSnapshot(doc(db, 'hubUsers', u.uid), (s) => {
        setProfile(s.exists() ? ({ uid: u.uid, ...(s.data() as any) } as Profile) : null);
        setLoading(false);
      }, () => setLoading(false));
    });
    return () => { unsub(); unsubProfile(); };
  }, []);

  return <C.Provider value={{ user, profile, loading }}>{children}</C.Provider>;
}