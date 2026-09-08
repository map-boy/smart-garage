import { collection, getDocs, writeBatch, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Month close: snapshot the period, then optionally clear the operational
 * collections so the new month starts empty.
 *
 * The archive is written and read back before anything is deleted. If the copy
 * is short, the delete never runs. Everything goes through Firestore's
 * persistent cache, so this works with no internet and uploads later.
 */

/** Copied into the archive. Names match the collections this app actually uses. */
export const ARCHIVE_COLLECTIONS = ['invoices', 'jobs', 'reminders'];

/** Emptied on close. Clients, vehicles and stock are never touched. */
export const CLEAR_COLLECTIONS = ['invoices', 'jobs'];

export interface PeriodResult {
  periodId: string;
  archived: Record<string, number>;
  cleared: Record<string, number>;
  total: number;
}

export function currentPeriodId(d: Date = new Date()): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

async function commitInChunks(rows: { path: string[]; data: Record<string, unknown> }[]) {
  for (let i = 0; i < rows.length; i += 400) {
    const batch = writeBatch(db);
    rows.slice(i, i + 400).forEach((r) => {
      batch.set(doc(db, r.path[0], ...r.path.slice(1)), r.data);
    });
    await batch.commit();
  }
}

async function deleteInChunks(paths: string[][]) {
  for (let i = 0; i < paths.length; i += 400) {
    const batch = writeBatch(db);
    paths.slice(i, i + 400).forEach((p) => {
      batch.delete(doc(db, p[0], ...p.slice(1)));
    });
    await batch.commit();
  }
}

export async function closePeriod(
  garageId: string,
  periodId: string,
  clear: boolean
): Promise<PeriodResult> {
  const archived: Record<string, number> = {};
  const cleared: Record<string, number> = {};
  let total = 0;

  for (const name of ARCHIVE_COLLECTIONS) {
    const snap = await getDocs(collection(db, 'garages', garageId, name));
    const rows = snap.docs.map((d) => ({
      path: ['garages', garageId, 'archives', periodId, name, d.id],
      data: { ...(d.data() as Record<string, unknown>), _archivedFrom: name, _periodId: periodId },
    }));
    if (rows.length) await commitInChunks(rows);
    archived[name] = rows.length;
    total += rows.length;
  }

  await setDoc(doc(db, 'garages', garageId, 'archives', periodId), {
    periodId,
    closedAt: serverTimestamp(),
    closedAtLocal: new Date().toISOString(),
    counts: archived,
    total,
  });

  if (!clear) return { periodId, archived, cleared, total };

  for (const name of CLEAR_COLLECTIONS) {
    const live = await getDocs(collection(db, 'garages', garageId, name));
    const copy = await getDocs(collection(db, 'garages', garageId, 'archives', periodId, name));
    if (copy.size < live.size) {
      throw new Error(
        'Archive of "' + name + '" is incomplete (' + copy.size + ' of ' + live.size + '). Nothing was deleted.'
      );
    }
  }

  for (const name of CLEAR_COLLECTIONS) {
    const live = await getDocs(collection(db, 'garages', garageId, name));
    const paths = live.docs.map((d) => ['garages', garageId, name, d.id]);
    if (paths.length) await deleteInChunks(paths);
    cleared[name] = paths.length;
  }

  return { periodId, archived, cleared, total };
}

export async function listPeriods(garageId: string): Promise<{ id: string; total: number }[]> {
  const snap = await getDocs(collection(db, 'garages', garageId, 'archives'));
  return snap.docs
    .map((d) => ({ id: d.id, total: Number((d.data() as { total?: number }).total ?? 0) }))
    .sort((a, b) => b.id.localeCompare(a.id));
}
