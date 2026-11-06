import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, Query } from 'firebase/firestore';
import { db } from './firebase';

export type Row = { id: string; _pending?: boolean; [k: string]: any };

export const STATUS: Record<string, string> = { waiting: 'Waiting', in_progress: 'In progress', done: 'Done' };

export const dayStr = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function greet(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// Live collection. Works offline from the device cache; _pending = written here, not yet on the server.
export function useCol(make: () => Query | null, deps: any[]): Row[] {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    const q = make();
    if (!q) { setRows([]); return undefined; }
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (s) => setRows(s.docs.map((x) => ({ ...(x.data() as any), id: x.id, _pending: x.metadata.hasPendingWrites }))),
      (e) => console.error(e)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return rows;
}

export function useOnline(): boolean {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

// How many of today's visits are saved on this device but not yet uploaded.
export function usePending(o: string): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const q = query(collection(db, `hubOrgs/${o}/visits`), where('day', '==', dayStr()));
    return onSnapshot(q, { includeMetadataChanges: true }, (s) => setN(s.docs.filter((x) => x.metadata.hasPendingWrites).length), () => {});
  }, [o]);
  return n;
}